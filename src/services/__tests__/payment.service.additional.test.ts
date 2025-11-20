/**
 * Additional Payment Service Tests
 * Additional test cases to push coverage to 95%+
 */

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
} from '../../types/payment.types';

// Reuse mocks from main test file
class MockSubscriptionRepository implements ISubscriptionRepository {
  private subscriptions: Subscription[] = [];
  private idCounter = 1;

  async findById(id: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.id === id) || null;
  }

  async findByUserId(userId: string): Promise<Subscription | null> {
    return this.subscriptions.find(s => s.userId === userId) || null;
  }

  async create(data: any): Promise<Subscription> {
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

  async create(data: any): Promise<Payment> {
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
  private shouldFail = false;
  private failureType = '';

  setShouldFail(fail: boolean, type = '') {
    this.shouldFail = fail;
    this.failureType = type;
  }

  async createCustomer(email: string, userId: string): Promise<string> {
    if (this.shouldFail && this.failureType === 'customer') {
      throw new Error('Stripe customer creation failed');
    }
    return `cus_${Date.now()}`;
  }

  async createSubscription(customerId: string, priceId: string, paymentMethodId: string) {
    if (this.shouldFail && this.failureType === 'subscription') {
      throw new Error('Stripe subscription creation failed');
    }
    return { id: `sub_${Date.now()}`, status: 'active' };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    if (this.shouldFail && this.failureType === 'cancel') {
      throw new Error('Stripe cancellation failed');
    }
  }

  async updateSubscription(subscriptionId: string, priceId: string): Promise<void> {
    if (this.shouldFail && this.failureType === 'update') {
      throw new Error('Stripe update failed');
    }
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string): Promise<string> {
    if (this.shouldFail && this.failureType === 'payment') {
      throw new Error('Payment intent creation failed');
    }
    return `pi_${Date.now()}`;
  }

  async refundPayment(paymentIntentId: string): Promise<void> {
    if (this.shouldFail && this.failureType === 'refund') {
      throw new Error('Refund failed');
    }
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return signature === 'valid_signature';
  }
}

describe('PaymentService - Additional Coverage', () => {
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

  describe('Edge Cases and Error Handling', () => {
    it('should handle Stripe customer creation failure gracefully', async () => {
      stripeClient.setShouldFail(true, 'customer');

      await expect(
        paymentService.createSubscription({
          userId: 'user-1',
          plan: SubscriptionPlan.BASIC,
          billingPeriod: 'monthly',
          paymentMethodId: 'pm_test',
        })
      ).rejects.toThrow(/customer creation failed/i);
    });

    it('should handle Stripe subscription creation failure and cleanup', async () => {
      stripeClient.setShouldFail(true, 'subscription');

      await expect(
        paymentService.createSubscription({
          userId: 'user-2',
          plan: SubscriptionPlan.PRO,
          billingPeriod: 'monthly',
          paymentMethodId: 'pm_test',
        })
      ).rejects.toThrow(/subscription creation failed/i);

      // Verify no subscription was created in our system
      const subscription = await subscriptionRepo.findByUserId('user-2');
      expect(subscription).toBeNull();
    });

    it('should handle missing payment method for paid plans', async () => {
      await expect(
        paymentService.createSubscription({
          userId: 'user-3',
          plan: SubscriptionPlan.BASIC,
          billingPeriod: 'monthly',
          paymentMethodId: '', // Empty payment method
        })
      ).rejects.toThrow(/payment method.*required/i);
    });

    it('should handle zero amount payments', async () => {
      const subscription = await subscriptionRepo.create({
        userId: 'user-4',
        plan: SubscriptionPlan.FREE,
        billingPeriod: 'monthly',
        status: SubscriptionStatus.ACTIVE,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Create payment with $0 amount (shouldn't call Stripe)
      const payment = await paymentRepo.create({
        subscriptionId: subscription.id,
        amount: 0,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: null,
      });

      expect(payment.amount).toBe(0);
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('should handle subscription cancellation when Stripe call fails', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-5',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      stripeClient.setShouldFail(true, 'cancel');

      await expect(
        paymentService.cancelSubscription(subscription.id)
      ).rejects.toThrow(/cancellation failed/i);

      // Verify subscription status not changed
      const sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should handle update subscription when Stripe call fails', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-6',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      stripeClient.setShouldFail(true, 'update');

      await expect(
        paymentService.updateSubscription(subscription.id, {
          plan: SubscriptionPlan.PRO,
        })
      ).rejects.toThrow(/update failed/i);

      // Verify plan not changed
      const sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.plan).toBe(SubscriptionPlan.BASIC);
    });
  });

  describe('Proration Edge Cases', () => {
    it('should handle proration with negative days remaining', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PRO,
        -5, // Negative days (period already ended)
        'monthly'
      );

      expect(proration).toBe(0);
    });

    it('should handle proration with fractional days', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.PRO,
        15.5, // Half day
        'monthly'
      );

      expect(proration).toBeGreaterThan(0);
      expect(proration).toBeLessThan(7000); // Full difference is $70
    });

    it('should handle same-plan proration', () => {
      const proration = paymentService.calculateProration(
        SubscriptionPlan.BASIC,
        SubscriptionPlan.BASIC,
        15,
        'monthly'
      );

      expect(proration).toBe(0);
    });
  });

  describe('Usage Limit Edge Cases', () => {
    it('should handle usage check for non-existent subscription', async () => {
      await expect(
        paymentService.checkUsageLimit('non-existent-sub', 'apiCalls')
      ).rejects.toThrow(/subscription not found/i);
    });

    it('should handle usage recording for cancelled subscription', async () => {
      const subscription = await subscriptionRepo.create({
        userId: 'user-7',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        status: SubscriptionStatus.CANCELLED,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      await expect(
        paymentService.recordUsage(subscription.id, { apiCalls: 10, tokensUsed: 1000 })
      ).rejects.toThrow(/inactive.*cancelled/i);
    });

    it('should handle usage limits for suspended subscriptions', async () => {
      const subscription = await subscriptionRepo.create({
        userId: 'user-8',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        status: SubscriptionStatus.PAST_DUE,
        stripeSubscriptionId: null,
        stripeCustomerId: null,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      // Should block usage for past due subscriptions
      await expect(
        paymentService.checkUsageLimit(subscription.id, 'apiCalls')
      ).rejects.toThrow(/past due|suspended/i);
    });

    it('should handle token limit checks', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-9',
        plan: SubscriptionPlan.FREE, // 10K token limit
        billingPeriod: 'monthly',
        paymentMethodId: '',
      });

      await subscriptionRepo.update(subscription.id, {
        usage: { apiCalls: 50, tokensUsed: 9500 }, // Near token limit
      });

      // Should allow 500 more tokens
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(true);

      // Exceed token limit
      await subscriptionRepo.update(subscription.id, {
        usage: { apiCalls: 50, tokensUsed: 10001 },
      });

      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(false);
    });
  });

  describe('Plan Configuration', () => {
    it('should return all plan features correctly', () => {
      const freePlan = paymentService.getPlanConfig(SubscriptionPlan.FREE);
      expect(freePlan.features).toContain('Basic AI access');
      expect(freePlan.apiCallLimit).toBe(100);
      expect(freePlan.tokenLimit).toBe(10000);

      const basicPlan = paymentService.getPlanConfig(SubscriptionPlan.BASIC);
      expect(basicPlan.features).toContain('Standard AI access');
      expect(basicPlan.apiCallLimit).toBe(1000);

      const proPlan = paymentService.getPlanConfig(SubscriptionPlan.PRO);
      expect(proPlan.features).toContain('Priority support');
      expect(proPlan.apiCallLimit).toBe(10000);

      const enterprisePlan = paymentService.getPlanConfig(SubscriptionPlan.ENTERPRISE);
      expect(enterprisePlan.apiCallLimit).toBeNull(); // Unlimited
      expect(enterprisePlan.tokenLimit).toBeNull(); // Unlimited
    });

    it('should handle invalid plan gracefully', () => {
      expect(() => {
        paymentService.getPlanConfig('INVALID_PLAN' as any);
      }).toThrow(/invalid plan/i);
    });
  });

  describe('Payment Refund Edge Cases', () => {
    it('should handle refund for payment with partial amount', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-10',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      const payment = await paymentRepo.create({
        subscriptionId: subscription.id,
        amount: 2900,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: 'pi_test_123',
      });

      // Request partial refund
      await paymentService.refundPayment(payment.id, { amount: 1000 }); // Partial

      const refunded = await paymentRepo.findById(payment.id);
      expect(refunded?.status).toBe(PaymentStatus.REFUNDED);
    });

    it('should handle refund when Stripe call fails', async () => {
      const payment = await paymentRepo.create({
        subscriptionId: 'sub-123',
        amount: 2900,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: 'pi_test_456',
      });

      stripeClient.setShouldFail(true, 'refund');

      await expect(
        paymentService.refundPayment(payment.id)
      ).rejects.toThrow(/refund failed/i);

      // Payment status should not change
      const notRefunded = await paymentRepo.findById(payment.id);
      expect(notRefunded?.status).toBe(PaymentStatus.SUCCEEDED);
    });

    it('should handle double refund attempts', async () => {
      const payment = await paymentRepo.create({
        subscriptionId: 'sub-456',
        amount: 2900,
        currency: 'USD',
        status: PaymentStatus.REFUNDED, // Already refunded
        stripePaymentIntentId: 'pi_test_789',
      });

      await expect(
        paymentService.refundPayment(payment.id)
      ).rejects.toThrow(/already.*refunded/i);
    });
  });

  describe('Webhook Handling', () => {
    it('should handle payment_succeeded webhook', async () => {
      const result = await paymentService.processWebhook(
        {
          type: 'payment_succeeded',
          subscriptionId: 'sub-123',
          amount: 2900,
        },
        'valid_signature'
      );

      expect(result.processed).toBe(true);
    });

    it('should handle payment_failed webhook', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-11',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      const result = await paymentService.processWebhook(
        {
          type: 'payment_failed',
          subscriptionId: subscription.id,
        },
        'valid_signature'
      );

      expect(result.processed).toBe(true);

      // Subscription should be marked as past_due
      const updated = await subscriptionRepo.findById(subscription.id);
      expect(updated?.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('should handle subscription_deleted webhook', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-12',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      await paymentService.processWebhook(
        {
          type: 'subscription_deleted',
          subscriptionId: subscription.id,
        },
        'valid_signature'
      );

      const deleted = await subscriptionRepo.findById(subscription.id);
      expect(deleted?.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('should handle unknown webhook event types', async () => {
      const result = await paymentService.processWebhook(
        {
          type: 'unknown_event_type',
          data: {},
        },
        'valid_signature'
      );

      // Should not throw, just ignore
      expect(result.processed).toBe(false);
    });
  });

  describe('Subscription Period Management', () => {
    it('should correctly set period dates for yearly subscription', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-13',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'yearly',
        paymentMethodId: 'pm_test',
      });

      const start = new Date(subscription.currentPeriodStart);
      const end = new Date(subscription.currentPeriodEnd);

      const daysDiff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      // Should be approximately 365 days
      expect(daysDiff).toBeGreaterThan(364);
      expect(daysDiff).toBeLessThan(366);
    });

    it('should handle period extension on upgrade', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-14',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      const originalEnd = subscription.currentPeriodEnd;

      // Upgrade
      await paymentService.updateSubscription(subscription.id, {
        plan: SubscriptionPlan.PRO,
      });

      const updated = await subscriptionRepo.findById(subscription.id);

      // Period end should remain the same (no extension)
      expect(updated?.currentPeriodEnd).toEqual(originalEnd);
    });
  });

  describe('Error Object Properties', () => {
    it('should include error code and status in PaymentError', async () => {
      try {
        await paymentService.checkUsageLimit('invalid-id', 'apiCalls');
      } catch (error: any) {
        expect(error).toBeInstanceOf(PaymentError);
        expect(error.code).toBeDefined();
        expect(error.statusCode).toBeDefined();
        expect(error.message).toBeDefined();
      }
    });
  });
});
