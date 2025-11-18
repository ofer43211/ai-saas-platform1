import {
  PaymentService,
  PaymentError,
  ISubscriptionRepository,
  IPaymentRepository,
  IStripeClient,
} from '../payment.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  PaymentStatus,
  Subscription,
  Payment,
  CreateSubscriptionDTO,
  UsageRecord,
} from '../../types/payment.types';

// Mock Repositories
class MockSubscriptionRepository implements ISubscriptionRepository {
  private subscriptions: Subscription[] = [];
  private idCounter = 1;

  async findById(id: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.id === id) || null;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.userId === userId) || null;
  }

  async create(data: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>): Promise<Subscription> {
    const subscription: Subscription = {
      ...data,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.subscriptions.push(subscription);
    return subscription;
  }

  async update(id: string, data: Partial<Subscription>): Promise<Subscription> {
    const index = this.subscriptions.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Subscription not found');

    this.subscriptions[index] = {
      ...this.subscriptions[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.subscriptions[index];
  }

  reset() {
    this.subscriptions = [];
    this.idCounter = 1;
  }
}

class MockPaymentRepository implements IPaymentRepository {
  private payments: Payment[] = [];
  private idCounter = 1;

  async create(data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment> {
    const payment: Payment = {
      ...data,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.push(payment);
    return payment;
  }

  async findById(id: string): Promise<Payment | null> {
    return this.payments.find(p => p.id === id) || null;
  }

  async findBySubscriptionId(subscriptionId: string): Promise<Payment[]> {
    return this.payments.filter(p => p.subscriptionId === subscriptionId);
  }

  reset() {
    this.payments = [];
    this.idCounter = 1;
  }
}

class MockStripeClient implements IStripeClient {
  private customerIdCounter = 1;
  private subscriptionIdCounter = 1;

  async createCustomer(email: string, userId: string): Promise<string> {
    return `cus_${this.customerIdCounter++}`;
  }

  async createSubscription(
    customerId: string,
    priceId: string,
    paymentMethodId: string
  ): Promise<{ id: string; status: string }> {
    return {
      id: `sub_${this.subscriptionIdCounter++}`,
      status: 'active',
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // Mock cancellation
  }

  async updateSubscription(subscriptionId: string, priceId: string): Promise<void> {
    // Mock update
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string): Promise<string> {
    return `pi_${Math.random().toString(36).substr(2, 9)}`;
  }

  async refundPayment(paymentIntentId: string): Promise<void> {
    // Mock refund
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return signature === 'valid_signature';
  }

  reset() {
    this.customerIdCounter = 1;
    this.subscriptionIdCounter = 1;
  }
}

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let subscriptionRepo: MockSubscriptionRepository;
  let paymentRepo: MockPaymentRepository;
  let stripeClient: MockStripeClient;

  beforeEach(() => {
    subscriptionRepo = new MockSubscriptionRepository();
    paymentRepo = new MockPaymentRepository();
    stripeClient = new MockStripeClient();
    paymentService = new PaymentService(subscriptionRepo, paymentRepo, stripeClient);
  });

  describe('createSubscription', () => {
    it('should create a free subscription without payment', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.FREE,
        paymentMethodId: '',
        billingInterval: 'monthly',
      };

      const subscription = await paymentService.createSubscription(dto);

      expect(subscription).toBeDefined();
      expect(subscription.userId).toBe('user-1');
      expect(subscription.plan).toBe(SubscriptionPlan.FREE);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.stripeSubscriptionId).toBeUndefined();
    });

    it('should create a paid subscription with Stripe', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };

      const subscription = await paymentService.createSubscription(dto);

      expect(subscription).toBeDefined();
      expect(subscription.plan).toBe(SubscriptionPlan.BASIC);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
      expect(subscription.stripeSubscriptionId).toBeDefined();
      expect(subscription.stripeCustomerId).toBeDefined();
    });

    it('should create payment record for paid subscriptions', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.PRO,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };

      const subscription = await paymentService.createSubscription(dto);
      const payments = await paymentRepo.findBySubscriptionId(subscription.id);

      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(99); // Pro monthly price
      expect(payments[0].status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('should charge yearly price for yearly billing', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'yearly',
      };

      const subscription = await paymentService.createSubscription(dto);
      const payments = await paymentRepo.findBySubscriptionId(subscription.id);

      expect(payments[0].amount).toBe(290); // Basic yearly price
    });

    it('should throw error for invalid plan', async () => {
      const dto = {
        userId: 'user-1',
        plan: 'invalid_plan' as SubscriptionPlan,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly' as const,
      };

      await expect(paymentService.createSubscription(dto)).rejects.toThrow(
        PaymentError
      );
      await expect(paymentService.createSubscription(dto)).rejects.toThrow(
        'Invalid subscription plan'
      );
    });

    it('should throw error if user already has active subscription', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };

      await paymentService.createSubscription(dto);

      await expect(paymentService.createSubscription(dto)).rejects.toThrow(
        'User already has an active subscription'
      );
    });

    it('should set correct period dates for monthly subscription', async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };

      const subscription = await paymentService.createSubscription(dto);

      const periodLength = subscription.currentPeriodEnd.getTime() -
                          subscription.currentPeriodStart.getTime();
      const expectedLength = 30 * 24 * 60 * 60 * 1000; // ~30 days

      expect(periodLength).toBeGreaterThan(expectedLength * 0.95);
      expect(periodLength).toBeLessThan(expectedLength * 1.05);
    });
  });

  describe('updateSubscription', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };
      const sub = await paymentService.createSubscription(dto);
      subscriptionId = sub.id;
    });

    it('should update subscription to cancel at period end', async () => {
      const updated = await paymentService.updateSubscription(subscriptionId, {
        cancelAtPeriodEnd: true,
      });

      expect(updated.cancelAtPeriodEnd).toBe(true);
      expect(updated.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should throw error for non-existent subscription', async () => {
      await expect(
        paymentService.updateSubscription('non-existent', {
          cancelAtPeriodEnd: true,
        })
      ).rejects.toThrow('Subscription not found');
    });

    it('should throw error for inactive subscription', async () => {
      await subscriptionRepo.update(subscriptionId, {
        status: SubscriptionStatus.CANCELED,
      });

      await expect(
        paymentService.updateSubscription(subscriptionId, {
          plan: SubscriptionPlan.PRO,
        })
      ).rejects.toThrow('Cannot update inactive subscription');
    });
  });

  describe('cancelSubscription', () => {
    let subscriptionId: string;

    beforeEach(async () => {
      const dto: CreateSubscriptionDTO = {
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      };
      const sub = await paymentService.createSubscription(dto);
      subscriptionId = sub.id;
    });

    it('should cancel subscription at period end by default', async () => {
      const canceled = await paymentService.cancelSubscription(subscriptionId);

      expect(canceled.cancelAtPeriodEnd).toBe(true);
      expect(canceled.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should cancel subscription immediately when requested', async () => {
      const canceled = await paymentService.cancelSubscription(subscriptionId, true);

      expect(canceled.status).toBe(SubscriptionStatus.CANCELED);
      expect(canceled.cancelAtPeriodEnd).toBe(false);
    });

    it('should throw error for non-existent subscription', async () => {
      await expect(
        paymentService.cancelSubscription('non-existent')
      ).rejects.toThrow('Subscription not found');
    });
  });

  describe('refundPayment', () => {
    let paymentId: string;

    beforeEach(async () => {
      const payment = await paymentRepo.create({
        userId: 'user-1',
        subscriptionId: 'sub-1',
        amount: 99,
        currency: 'usd',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: 'pi_123',
      });
      paymentId = payment.id;
    });

    it('should refund a successful payment', async () => {
      const refund = await paymentService.refundPayment(paymentId);

      expect(refund).toBeDefined();
      expect(refund.amount).toBe(-99); // Negative amount
      expect(refund.status).toBe(PaymentStatus.REFUNDED);
    });

    it('should throw error for non-existent payment', async () => {
      await expect(
        paymentService.refundPayment('non-existent')
      ).rejects.toThrow('Payment not found');
    });

    it('should throw error for non-successful payment', async () => {
      const failedPayment = await paymentRepo.create({
        userId: 'user-1',
        subscriptionId: 'sub-1',
        amount: 99,
        currency: 'usd',
        status: PaymentStatus.FAILED,
        stripePaymentIntentId: 'pi_456',
      });

      await expect(
        paymentService.refundPayment(failedPayment.id)
      ).rejects.toThrow('Can only refund successful payments');
    });

    it('should throw error for payment without Stripe ID', async () => {
      const payment = await paymentRepo.create({
        userId: 'user-1',
        subscriptionId: 'sub-1',
        amount: 99,
        currency: 'usd',
        status: PaymentStatus.SUCCEEDED,
      });

      await expect(
        paymentService.refundPayment(payment.id)
      ).rejects.toThrow('No Stripe payment intent found');
    });
  });

  describe('checkUsageLimits', () => {
    const usage: UsageRecord = {
      userId: 'user-1',
      apiCalls: 500,
      tokensUsed: 50000,
      periodStart: new Date(),
      periodEnd: new Date(),
    };

    it('should enforce free tier limits for users without subscription', async () => {
      const withinLimits = await paymentService.checkUsageLimits('user-1', {
        ...usage,
        apiCalls: 50,
        tokensUsed: 5000,
      });

      expect(withinLimits).toBe(true);
    });

    it('should reject usage exceeding free tier limits', async () => {
      const withinLimits = await paymentService.checkUsageLimits('user-1', {
        ...usage,
        apiCalls: 200, // Free tier is 100
        tokensUsed: 5000,
      });

      expect(withinLimits).toBe(false);
    });

    it('should allow usage within plan limits', async () => {
      await paymentService.createSubscription({
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      });

      const withinLimits = await paymentService.checkUsageLimits('user-1', usage);

      expect(withinLimits).toBe(true); // Basic allows 1K calls, 100K tokens
    });

    it('should reject usage exceeding plan limits', async () => {
      await paymentService.createSubscription({
        userId: 'user-1',
        plan: SubscriptionPlan.BASIC,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      });

      const withinLimits = await paymentService.checkUsageLimits('user-1', {
        ...usage,
        apiCalls: 2000, // Exceeds Basic limit of 1K
        tokensUsed: 50000,
      });

      expect(withinLimits).toBe(false);
    });

    it('should allow unlimited usage for enterprise plan', async () => {
      await paymentService.createSubscription({
        userId: 'user-1',
        plan: SubscriptionPlan.ENTERPRISE,
        paymentMethodId: 'pm_123',
        billingInterval: 'monthly',
      });

      const withinLimits = await paymentService.checkUsageLimits('user-1', {
        ...usage,
        apiCalls: 1000000,
        tokensUsed: 10000000,
      });

      expect(withinLimits).toBe(true);
    });
  });

  describe('getPlanConfig', () => {
    it('should return correct config for each plan', () => {
      const freeConfig = paymentService.getPlanConfig(SubscriptionPlan.FREE);
      expect(freeConfig.priceMonthly).toBe(0);
      expect(freeConfig.apiCallLimit).toBe(100);

      const basicConfig = paymentService.getPlanConfig(SubscriptionPlan.BASIC);
      expect(basicConfig.priceMonthly).toBe(29);
      expect(basicConfig.apiCallLimit).toBe(1000);

      const proConfig = paymentService.getPlanConfig(SubscriptionPlan.PRO);
      expect(proConfig.priceMonthly).toBe(99);
      expect(proConfig.apiCallLimit).toBe(10000);

      const enterpriseConfig = paymentService.getPlanConfig(SubscriptionPlan.ENTERPRISE);
      expect(enterpriseConfig.priceMonthly).toBe(499);
      expect(enterpriseConfig.apiCallLimit).toBe(Infinity);
    });
  });

  describe('calculateProration', () => {
    it('should calculate correct proration for upgrade', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PRO,
        15, // 15 days remaining
        'monthly'
      );

      // Expected: ((99-29) / 30) * 15 = 35
      expect(proration).toBeCloseTo(35, 0);
    });

    it('should return 0 for downgrade within period', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.PRO,
        SubscriptionPlan.BASIC,
        15,
        'monthly'
      );

      expect(proration).toBe(0);
    });

    it('should calculate yearly proration correctly', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PRO,
        182, // ~half year
        'yearly'
      );

      // Expected: ((990-290) / 365) * 182 ≈ 349
      expect(proration).toBeCloseTo(349, 0);
    });

    it('should return 0 when no days remaining', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PRO,
        0,
        'monthly'
      );

      expect(proration).toBe(0);
    });
  });

  describe('handleWebhook', () => {
    it('should accept valid webhook signature', async () => {
      await expect(
        paymentService.handleWebhook('payload', 'valid_signature')
      ).resolves.not.toThrow();
    });

    it('should reject invalid webhook signature', async () => {
      await expect(
        paymentService.handleWebhook('payload', 'invalid_signature')
      ).rejects.toThrow(PaymentError);
      await expect(
        paymentService.handleWebhook('payload', 'invalid_signature')
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should return 401 status for invalid signature', async () => {
      try {
        await paymentService.handleWebhook('payload', 'invalid');
      } catch (error) {
        expect((error as PaymentError).statusCode).toBe(401);
      }
    });
  });

  describe('Error Codes', () => {
    it('should provide error codes for different scenarios', async () => {
      try {
        await paymentService.createSubscription({
          userId: 'user-1',
          plan: 'invalid' as SubscriptionPlan,
          paymentMethodId: 'pm_123',
          billingInterval: 'monthly',
        });
      } catch (error) {
        expect((error as PaymentError).code).toBe('invalid_plan');
      }
    });

    it('should provide HTTP status codes', async () => {
      try {
        await paymentService.cancelSubscription('non-existent');
      } catch (error) {
        expect((error as PaymentError).statusCode).toBe(404);
      }
    });
  });
});
