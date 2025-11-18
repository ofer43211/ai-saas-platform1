import {
  SubscriptionPlan,
  SubscriptionStatus,
  PaymentStatus,
  Subscription,
  Payment,
  CreateSubscriptionDTO,
  UpdateSubscriptionDTO,
  PlanConfig,
  UsageRecord,
} from '../types/payment.types';

export class PaymentError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export interface ISubscriptionRepository {
  findById(id: string): Promise<Subscription | null>;
  findByUserId(userId: string): Promise<Subscription | null>;
  create(subscription: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription>;
  update(id: string, data: Partial<Subscription>): Promise<Subscription>;
}

export interface IPaymentRepository {
  create(payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment>;
  findById(id: string): Promise<Payment | null>;
  findBySubscriptionId(subscriptionId: string): Promise<Payment[]>;
}

export interface IStripeClient {
  createCustomer(email: string, userId: string): Promise<string>;
  createSubscription(customerId: string, priceId: string, paymentMethodId: string): Promise<{ id: string; status: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  updateSubscription(subscriptionId: string, priceId: string): Promise<void>;
  createPaymentIntent(amount: number, currency: string, customerId: string): Promise<string>;
  refundPayment(paymentIntentId: string): Promise<void>;
  verifyWebhookSignature(payload: string, signature: string): boolean;
}

export class PaymentService {
  private readonly PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
    [SubscriptionPlan.FREE]: {
      id: SubscriptionPlan.FREE,
      name: 'Free',
      priceMonthly: 0,
      priceYearly: 0,
      features: ['Basic AI access', '100 API calls/month', '10K tokens/month'],
      apiCallLimit: 100,
      tokenLimit: 10000,
    },
    [SubscriptionPlan.BASIC]: {
      id: SubscriptionPlan.BASIC,
      name: 'Basic',
      priceMonthly: 29,
      priceYearly: 290,
      features: ['Standard AI access', '1K API calls/month', '100K tokens/month'],
      apiCallLimit: 1000,
      tokenLimit: 100000,
    },
    [SubscriptionPlan.PRO]: {
      id: SubscriptionPlan.PRO,
      name: 'Pro',
      priceMonthly: 99,
      priceYearly: 990,
      features: ['Premium AI access', '10K API calls/month', '1M tokens/month', 'Priority support'],
      apiCallLimit: 10000,
      tokenLimit: 1000000,
    },
    [SubscriptionPlan.ENTERPRISE]: {
      id: SubscriptionPlan.ENTERPRISE,
      name: 'Enterprise',
      priceMonthly: 499,
      priceYearly: 4990,
      features: ['Unlimited AI access', 'Unlimited API calls', 'Unlimited tokens', '24/7 support', 'Custom models'],
      apiCallLimit: Infinity,
      tokenLimit: Infinity,
    },
  };

  constructor(
    private subscriptionRepository: ISubscriptionRepository,
    private paymentRepository: IPaymentRepository,
    private stripeClient: IStripeClient
  ) {}

  /**
   * Create a new subscription
   */
  async createSubscription(dto: CreateSubscriptionDTO): Promise<Subscription> {
    // Validate plan
    if (!this.PLAN_CONFIGS[dto.plan]) {
      throw new PaymentError('Invalid subscription plan', 'invalid_plan', 400);
    }

    // Free plan doesn't require payment
    if (dto.plan === SubscriptionPlan.FREE) {
      return this.createFreeSubscription(dto.userId);
    }

    // Check if user already has a subscription
    const existingSubscription = await this.subscriptionRepository.findByUserId(dto.userId);
    if (existingSubscription && existingSubscription.status === SubscriptionStatus.ACTIVE) {
      throw new PaymentError('User already has an active subscription', 'already_subscribed', 400);
    }

    try {
      // Create Stripe customer if needed
      const stripeCustomerId = await this.stripeClient.createCustomer(
        `user-${dto.userId}@example.com`,
        dto.userId
      );

      // Get price ID based on plan and interval
      const planConfig = this.PLAN_CONFIGS[dto.plan];
      const priceId = this.getPriceId(dto.plan, dto.billingInterval);

      // Create Stripe subscription
      const stripeSubscription = await this.stripeClient.createSubscription(
        stripeCustomerId,
        priceId,
        dto.paymentMethodId
      );

      // Calculate period dates
      const now = new Date();
      const periodEnd = new Date(now);
      if (dto.billingInterval === 'monthly') {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      }

      // Create subscription record
      const subscription = await this.subscriptionRepository.create({
        userId: dto.userId,
        plan: dto.plan,
        status: this.mapStripeStatus(stripeSubscription.status),
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });

      // Create payment record
      const price = dto.billingInterval === 'monthly'
        ? planConfig.priceMonthly
        : planConfig.priceYearly;

      await this.paymentRepository.create({
        userId: dto.userId,
        subscriptionId: subscription.id,
        amount: price,
        currency: 'usd',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: stripeSubscription.id,
      });

      return subscription;
    } catch (error) {
      throw new PaymentError(
        `Failed to create subscription: ${(error as Error).message}`,
        'subscription_creation_failed',
        500
      );
    }
  }

  /**
   * Update an existing subscription
   */
  async updateSubscription(subscriptionId: string, dto: UpdateSubscriptionDTO): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);

    if (!subscription) {
      throw new PaymentError('Subscription not found', 'not_found', 404);
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new PaymentError('Cannot update inactive subscription', 'invalid_status', 400);
    }

    // Handle plan change
    if (dto.plan && dto.plan !== subscription.plan) {
      await this.changePlan(subscription, dto.plan);
    }

    // Handle cancellation
    if (dto.cancelAtPeriodEnd !== undefined) {
      if (dto.cancelAtPeriodEnd && subscription.stripeSubscriptionId) {
        await this.stripeClient.cancelSubscription(subscription.stripeSubscriptionId);
      }

      return await this.subscriptionRepository.update(subscriptionId, {
        cancelAtPeriodEnd: dto.cancelAtPeriodEnd,
      });
    }

    return subscription;
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId: string, immediate: boolean = false): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findById(subscriptionId);

    if (!subscription) {
      throw new PaymentError('Subscription not found', 'not_found', 404);
    }

    if (subscription.stripeSubscriptionId) {
      await this.stripeClient.cancelSubscription(subscription.stripeSubscriptionId);
    }

    if (immediate) {
      return await this.subscriptionRepository.update(subscriptionId, {
        status: SubscriptionStatus.CANCELED,
        cancelAtPeriodEnd: false,
      });
    } else {
      return await this.subscriptionRepository.update(subscriptionId, {
        cancelAtPeriodEnd: true,
      });
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepository.findById(paymentId);

    if (!payment) {
      throw new PaymentError('Payment not found', 'not_found', 404);
    }

    if (payment.status !== PaymentStatus.SUCCEEDED) {
      throw new PaymentError('Can only refund successful payments', 'invalid_status', 400);
    }

    if (!payment.stripePaymentIntentId) {
      throw new PaymentError('No Stripe payment intent found', 'missing_stripe_id', 400);
    }

    try {
      await this.stripeClient.refundPayment(payment.stripePaymentIntentId);

      return await this.paymentRepository.create({
        userId: payment.userId,
        subscriptionId: payment.subscriptionId,
        amount: -payment.amount, // Negative amount for refund
        currency: payment.currency,
        status: PaymentStatus.REFUNDED,
        stripePaymentIntentId: payment.stripePaymentIntentId,
      });
    } catch (error) {
      throw new PaymentError(
        `Failed to refund payment: ${(error as Error).message}`,
        'refund_failed',
        500
      );
    }
  }

  /**
   * Check if user has exceeded usage limits
   */
  async checkUsageLimits(userId: string, usage: UsageRecord): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findByUserId(userId);

    if (!subscription || subscription.status !== SubscriptionStatus.ACTIVE) {
      // No subscription = free tier limits
      return this.isWithinLimits(this.PLAN_CONFIGS[SubscriptionPlan.FREE], usage);
    }

    const planConfig = this.PLAN_CONFIGS[subscription.plan];
    return this.isWithinLimits(planConfig, usage);
  }

  /**
   * Get plan configuration
   */
  getPlanConfig(plan: SubscriptionPlan): PlanConfig {
    return this.PLAN_CONFIGS[plan];
  }

  /**
   * Calculate proration for plan change
   */
  calculateProration(
    currentPlan: SubscriptionPlan,
    newPlan: SubscriptionPlan,
    daysRemaining: number,
    billingInterval: 'monthly' | 'yearly'
  ): number {
    const currentPrice = billingInterval === 'monthly'
      ? this.PLAN_CONFIGS[currentPlan].priceMonthly
      : this.PLAN_CONFIGS[currentPlan].priceYearly;

    const newPrice = billingInterval === 'monthly'
      ? this.PLAN_CONFIGS[newPlan].priceMonthly
      : this.PLAN_CONFIGS[newPlan].priceYearly;

    const totalDays = billingInterval === 'monthly' ? 30 : 365;
    const unusedAmount = (currentPrice / totalDays) * daysRemaining;
    const proRatedNewAmount = (newPrice / totalDays) * daysRemaining;

    return Math.max(0, proRatedNewAmount - unusedAmount);
  }

  /**
   * Handle webhook events
   */
  async handleWebhook(payload: string, signature: string): Promise<void> {
    const isValid = this.stripeClient.verifyWebhookSignature(payload, signature);

    if (!isValid) {
      throw new PaymentError('Invalid webhook signature', 'invalid_signature', 401);
    }

    // In production, parse and handle specific webhook events
    // Examples: subscription.updated, payment.succeeded, payment.failed, etc.
  }

  /**
   * Private helper methods
   */

  private async createFreeSubscription(userId: string): Promise<Subscription> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + 100); // Never expires

    return await this.subscriptionRepository.create({
      userId,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
  }

  private async changePlan(subscription: Subscription, newPlan: SubscriptionPlan): Promise<void> {
    if (newPlan === SubscriptionPlan.FREE) {
      throw new PaymentError('Cannot downgrade to free plan directly', 'invalid_downgrade', 400);
    }

    if (!subscription.stripeSubscriptionId) {
      throw new PaymentError('No Stripe subscription found', 'missing_stripe_id', 400);
    }

    const priceId = this.getPriceId(newPlan, 'monthly'); // Default to monthly

    await this.stripeClient.updateSubscription(subscription.stripeSubscriptionId, priceId);
  }

  private isWithinLimits(planConfig: PlanConfig, usage: UsageRecord): boolean {
    return usage.apiCalls <= planConfig.apiCallLimit &&
           usage.tokensUsed <= planConfig.tokenLimit;
  }

  private getPriceId(plan: SubscriptionPlan, interval: 'monthly' | 'yearly'): string {
    // In production, these would be actual Stripe price IDs
    return `price_${plan}_${interval}`;
  }

  private mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'active': SubscriptionStatus.ACTIVE,
      'canceled': SubscriptionStatus.CANCELED,
      'past_due': SubscriptionStatus.PAST_DUE,
      'trialing': SubscriptionStatus.TRIALING,
      'incomplete': SubscriptionStatus.INCOMPLETE,
    };

    return statusMap[stripeStatus] || SubscriptionStatus.INCOMPLETE;
  }
}
