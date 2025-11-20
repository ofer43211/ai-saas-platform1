/**
 * Integration Tests: Payment Service + Usage Tracking
 * Tests subscription limits enforcement and usage metering
 */

import { PaymentService, ISubscriptionRepository, IPaymentRepository, IStripeClient } from '../../src/services/payment.service';
import { SubscriptionPlan, SubscriptionStatus, PaymentStatus } from '../../src/types/payment.types';

// Mock implementations
class MockSubscriptionRepository implements ISubscriptionRepository {
  private subscriptions: any[] = [];
  private idCounter = 1;

  async findById(id: string) {
    return this.subscriptions.find(s => s.id === id) || null;
  }

  async findByUserId(userId: string) {
    return this.subscriptions.find(s => s.userId === userId) || null;
  }

  async create(data: any) {
    const subscription = {
      ...data,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      usage: {
        apiCalls: 0,
        tokensUsed: 0,
      },
    };
    this.subscriptions.push(subscription);
    return subscription;
  }

  async update(id: string, data: any) {
    const index = this.subscriptions.findIndex(s => s.id === id);
    if (index === -1) throw new Error('Subscription not found');
    this.subscriptions[index] = { ...this.subscriptions[index], ...data, updatedAt: new Date() };
    return this.subscriptions[index];
  }

  reset() {
    this.subscriptions = [];
    this.idCounter = 1;
  }
}

class MockPaymentRepository implements IPaymentRepository {
  private payments: any[] = [];
  private idCounter = 1;

  async create(data: any) {
    const payment = {
      ...data,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.payments.push(payment);
    return payment;
  }

  async findById(id: string) {
    return this.payments.find(p => p.id === id) || null;
  }

  async findBySubscriptionId(subscriptionId: string) {
    return this.payments.filter(p => p.subscriptionId === subscriptionId);
  }

  reset() {
    this.payments = [];
    this.idCounter = 1;
  }
}

class MockStripeClient implements IStripeClient {
  async createCustomer(email: string, userId: string) {
    return `cus_${Date.now()}`;
  }

  async createSubscription(customerId: string, priceId: string, paymentMethodId: string) {
    return { id: `sub_${Date.now()}`, status: 'active' };
  }

  async cancelSubscription(subscriptionId: string) {}

  async updateSubscription(subscriptionId: string, priceId: string) {}

  async createPaymentIntent(amount: number, currency: string, customerId: string) {
    return `pi_${Date.now()}`;
  }

  async refundPayment(paymentIntentId: string) {}

  verifyWebhookSignature(payload: string, signature: string) {
    return true;
  }
}

describe('Payment Service + Usage Tracking Integration', () => {
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

  afterEach(() => {
    subscriptionRepo.reset();
    paymentRepo.reset();
  });

  describe('Usage Limits Enforcement', () => {
    it('should enforce Free plan limits (100 API calls, 10K tokens)', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-1',
        plan: SubscriptionPlan.FREE,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Simulate 99 API calls
      await subscriptionRepo.update(subscription.id, {
        usage: { apiCalls: 99, tokensUsed: 5000 },
      });

      // 100th call should be allowed
      let canUse = await paymentService.checkUsageLimit(subscription.id, 'apiCalls');
      expect(canUse).toBe(true);

      // Record 100th call
      await paymentService.recordUsage(subscription.id, { apiCalls: 1, tokensUsed: 100 });

      // 101st call should be blocked
      canUse = await paymentService.checkUsageLimit(subscription.id, 'apiCalls');
      expect(canUse).toBe(false);
    });

    it('should enforce Basic plan limits (1000 API calls, 100K tokens)', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-2',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 500 calls and 50K tokens
      await paymentService.recordUsage(subscription.id, { apiCalls: 500, tokensUsed: 50000 });

      let sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.usage.apiCalls).toBe(500);
      expect(sub?.usage.tokensUsed).toBe(50000);

      // Should still be within limit
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(true);

      // Use remaining allocation
      await paymentService.recordUsage(subscription.id, { apiCalls: 500, tokensUsed: 50000 });

      sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.usage.apiCalls).toBe(1000);
      expect(sub?.usage.tokensUsed).toBe(100000);

      // Should now be at limit
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(false);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(false);
    });

    it('should enforce Pro plan limits (10K API calls, 1M tokens)', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-3',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 9999 calls
      await paymentService.recordUsage(subscription.id, { apiCalls: 9999, tokensUsed: 900000 });

      // Should still be within limit
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(true);

      // One more call
      await paymentService.recordUsage(subscription.id, { apiCalls: 1, tokensUsed: 100000 });

      // Should now be at limit
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(false);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(false);
    });

    it('should allow unlimited usage for Enterprise plan', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-4',
        plan: SubscriptionPlan.ENTERPRISE,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use massive amounts
      await paymentService.recordUsage(subscription.id, { apiCalls: 100000, tokensUsed: 10000000 });

      // Should still be allowed (unlimited)
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(true);
    });
  });

  describe('Usage Reset on Billing Cycle', () => {
    it('should reset usage at start of new billing period', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-5',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use full allocation
      await paymentService.recordUsage(subscription.id, { apiCalls: 1000, tokensUsed: 100000 });

      // Verify at limit
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(false);

      // Simulate new billing period
      await subscriptionRepo.update(subscription.id, {
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usage: { apiCalls: 0, tokensUsed: 0 },
      });

      // Should be able to use again
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);
      expect(await paymentService.checkUsageLimit(subscription.id, 'tokens')).toBe(true);
    });
  });

  describe('Subscription Downgrade with Usage', () => {
    it('should handle downgrade when usage is within new plan limits', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-6',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 500 calls (within Basic plan limit)
      await paymentService.recordUsage(subscription.id, { apiCalls: 500, tokensUsed: 50000 });

      // Downgrade to Basic
      const updated = await paymentService.updateSubscription(subscription.id, {
        plan: SubscriptionPlan.BASIC,
      });

      expect(updated.plan).toBe(SubscriptionPlan.BASIC);

      // Should still have usage available (500/1000 used)
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);
    });

    it('should block downgrade when current usage exceeds new plan limits', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-7',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 2000 calls (exceeds Basic plan limit of 1000)
      await paymentService.recordUsage(subscription.id, { apiCalls: 2000, tokensUsed: 200000 });

      // Attempt downgrade to Basic should fail or warn
      await expect(
        paymentService.updateSubscription(subscription.id, {
          plan: SubscriptionPlan.BASIC,
        })
      ).rejects.toThrow(/usage exceeds|reduce usage/i);
    });
  });

  describe('Concurrent Usage Recording', () => {
    it('should accurately track usage with concurrent requests', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-8',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Simulate 100 concurrent requests, each using 1 API call and 100 tokens
      const requests = Array(100)
        .fill(0)
        .map(() => paymentService.recordUsage(subscription.id, { apiCalls: 1, tokensUsed: 100 }));

      await Promise.all(requests);

      // Verify total usage
      const sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.usage.apiCalls).toBe(100);
      expect(sub?.usage.tokensUsed).toBe(10000);
    });

    it('should prevent race conditions when approaching limit', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-9',
        plan: SubscriptionPlan.FREE,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Set usage to 95 (limit is 100)
      await subscriptionRepo.update(subscription.id, {
        usage: { apiCalls: 95, tokensUsed: 9500 },
      });

      // Try to make 10 concurrent requests
      const requests = Array(10)
        .fill(0)
        .map(async () => {
          const allowed = await paymentService.checkUsageLimit(subscription.id, 'apiCalls');
          if (allowed) {
            await paymentService.recordUsage(subscription.id, { apiCalls: 1, tokensUsed: 100 });
            return true;
          }
          return false;
        });

      const results = await Promise.all(requests);
      const successful = results.filter(r => r).length;

      // Should only allow 5 more requests (95 + 5 = 100)
      expect(successful).toBeLessThanOrEqual(5);

      // Total usage should not exceed limit
      const sub = await subscriptionRepo.findById(subscription.id);
      expect(sub?.usage.apiCalls).toBeLessThanOrEqual(100);
    });
  });

  describe('Usage Reporting and Analytics', () => {
    it('should generate accurate usage report for billing period', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-10',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Record various usage
      await paymentService.recordUsage(subscription.id, { apiCalls: 100, tokensUsed: 10000 });
      await paymentService.recordUsage(subscription.id, { apiCalls: 250, tokensUsed: 25000 });
      await paymentService.recordUsage(subscription.id, { apiCalls: 150, tokensUsed: 15000 });

      const report = await paymentService.getUsageReport(subscription.id);

      expect(report.totalApiCalls).toBe(500);
      expect(report.totalTokens).toBe(50000);
      expect(report.apiCallsRemaining).toBe(9500); // Pro limit 10000 - 500
      expect(report.tokensRemaining).toBe(950000); // Pro limit 1000000 - 50000
      expect(report.percentUsed.apiCalls).toBe(5); // 500/10000 = 5%
      expect(report.percentUsed.tokens).toBe(5); // 50000/1000000 = 5%
    });

    it('should identify users approaching usage limits', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-11',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 950 out of 1000 calls
      await paymentService.recordUsage(subscription.id, { apiCalls: 950, tokensUsed: 95000 });

      const report = await paymentService.getUsageReport(subscription.id);

      expect(report.percentUsed.apiCalls).toBe(95);
      expect(report.approachingLimit).toBe(true); // 95% > 90% threshold
      expect(report.recommendUpgrade).toBe(true);
    });
  });

  describe('Upgrade Flow with Usage Preservation', () => {
    it('should preserve usage when upgrading plans', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-12',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Use 800 calls on Basic plan
      await paymentService.recordUsage(subscription.id, { apiCalls: 800, tokensUsed: 80000 });

      // Upgrade to Pro
      const upgraded = await paymentService.updateSubscription(subscription.id, {
        plan: SubscriptionPlan.PRO,
      });

      // Usage should be preserved
      expect(upgraded.usage.apiCalls).toBe(800);
      expect(upgraded.usage.tokensUsed).toBe(80000);

      // But now with Pro limits
      expect(await paymentService.checkUsageLimit(subscription.id, 'apiCalls')).toBe(true);

      // Can use up to 9200 more calls (10000 - 800)
      const report = await paymentService.getUsageReport(subscription.id);
      expect(report.apiCallsRemaining).toBe(9200);
    });
  });

  describe('Overage Charges (Future Feature)', () => {
    it('should calculate overage charges for plans that support it', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-13',
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      // Exceed limit by 500 calls
      await subscriptionRepo.update(subscription.id, {
        usage: { apiCalls: 10500, tokensUsed: 1050000 },
      });

      // Calculate overage (if supported)
      const overage = await paymentService.calculateOverage(subscription.id);

      // Example: $0.01 per API call over limit
      expect(overage.apiCallsOver).toBe(500);
      expect(overage.estimatedCharge).toBeGreaterThan(0);
    });
  });

  describe('Usage Alerts', () => {
    it('should trigger alerts at 50%, 75%, and 90% usage', async () => {
      const subscription = await paymentService.createSubscription({
        userId: 'user-14',
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test',
      });

      const alerts: string[] = [];

      // 50% usage
      await paymentService.recordUsage(subscription.id, { apiCalls: 500, tokensUsed: 50000 });
      if (await paymentService.shouldSendAlert(subscription.id, 50)) {
        alerts.push('50%');
      }

      // 75% usage
      await paymentService.recordUsage(subscription.id, { apiCalls: 250, tokensUsed: 25000 });
      if (await paymentService.shouldSendAlert(subscription.id, 75)) {
        alerts.push('75%');
      }

      // 90% usage
      await paymentService.recordUsage(subscription.id, { apiCalls: 150, tokensUsed: 15000 });
      if (await paymentService.shouldSendAlert(subscription.id, 90)) {
        alerts.push('90%');
      }

      expect(alerts).toContain('50%');
      expect(alerts).toContain('75%');
      expect(alerts).toContain('90%');
    });
  });
});
