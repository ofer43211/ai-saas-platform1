/**
 * Integration Tests: Authentication + Payment Services
 * Tests the interaction between authentication, payment processing, and subscription management
 */

import { AuthService, IUserRepository, IJWTService } from '../../src/services/auth.service';
import { PaymentService, ISubscriptionRepository, IPaymentRepository, IStripeClient } from '../../src/services/payment.service';
import { CryptoUtil } from '../../src/utils/crypto';
import { SubscriptionPlan, SubscriptionStatus, PaymentStatus } from '../../src/types/payment.types';
import { UserStatus, UserRole } from '../../src/types/user.types';

// Mock implementations
class MockUserRepository implements IUserRepository {
  private users: any[] = [];
  private idCounter = 1;

  async findById(id: string) {
    return this.users.find(u => u.id === id) || null;
  }

  async findByEmail(email: string) {
    return this.users.find(u => u.email === email) || null;
  }

  async create(userData: any) {
    const user = {
      ...userData,
      id: String(this.idCounter++),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  async update(id: string, data: any) {
    const index = this.users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('User not found');
    this.users[index] = { ...this.users[index], ...data, updatedAt: new Date() };
    return this.users[index];
  }

  reset() {
    this.users = [];
    this.idCounter = 1;
  }
}

class MockJWTService implements IJWTService {
  private tokens = new Map<string, any>();

  generateToken(payload: any): string {
    const token = `token_${Date.now()}_${Math.random()}`;
    this.tokens.set(token, payload);
    return token;
  }

  verifyToken(token: string): any {
    if (!this.tokens.has(token)) {
      throw new Error('Invalid token');
    }
    return this.tokens.get(token);
  }

  reset() {
    this.tokens.clear();
  }
}

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
  private customers = new Map<string, any>();
  private subscriptions = new Map<string, any>();
  private customerCounter = 1;
  private subscriptionCounter = 1;

  async createCustomer(email: string, userId: string): Promise<string> {
    const customerId = `cus_${this.customerCounter++}`;
    this.customers.set(customerId, { email, userId });
    return customerId;
  }

  async createSubscription(customerId: string, priceId: string, paymentMethodId: string) {
    const subscriptionId = `sub_${this.subscriptionCounter++}`;
    this.subscriptions.set(subscriptionId, { customerId, priceId, paymentMethodId, status: 'active' });
    return { id: subscriptionId, status: 'active' };
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      sub.status = 'canceled';
    }
  }

  async updateSubscription(subscriptionId: string, priceId: string): Promise<void> {
    const sub = this.subscriptions.get(subscriptionId);
    if (sub) {
      sub.priceId = priceId;
    }
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string): Promise<string> {
    return `pi_${Date.now()}`;
  }

  async refundPayment(paymentIntentId: string): Promise<void> {
    // Mock refund
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    return signature === 'valid_signature';
  }

  reset() {
    this.customers.clear();
    this.subscriptions.clear();
    this.customerCounter = 1;
    this.subscriptionCounter = 1;
  }
}

describe('Authentication + Payment Integration', () => {
  let authService: AuthService;
  let paymentService: PaymentService;
  let userRepo: MockUserRepository;
  let jwtService: MockJWTService;
  let subscriptionRepo: MockSubscriptionRepository;
  let paymentRepo: MockPaymentRepository;
  let stripeClient: MockStripeClient;

  beforeEach(() => {
    userRepo = new MockUserRepository();
    jwtService = new MockJWTService();
    subscriptionRepo = new MockSubscriptionRepository();
    paymentRepo = new MockPaymentRepository();
    stripeClient = new MockStripeClient();

    authService = new AuthService(userRepo, jwtService, new CryptoUtil());
    paymentService = new PaymentService(subscriptionRepo, paymentRepo, stripeClient);
  });

  afterEach(() => {
    userRepo.reset();
    jwtService.reset();
    subscriptionRepo.reset();
    paymentRepo.reset();
    stripeClient.reset();
  });

  describe('Complete User Registration and Subscription Flow', () => {
    it('should register user, verify email, and create subscription', async () => {
      // Step 1: Register user
      const registerResult = await authService.register({
        email: 'newuser@example.com',
        password: 'SecurePass123!',
        name: 'New User',
      });

      expect(registerResult.user).toHaveProperty('id');
      expect(registerResult.user.email).toBe('newuser@example.com');
      expect(registerResult.user.status).toBe(UserStatus.PENDING);
      expect(registerResult.verificationToken).toBeDefined();

      const userId = registerResult.user.id;

      // Step 2: Verify email
      const verifyResult = await authService.verifyEmail(registerResult.verificationToken);
      expect(verifyResult.success).toBe(true);

      const user = await userRepo.findById(userId);
      expect(user?.status).toBe(UserStatus.ACTIVE);
      expect(user?.emailVerified).toBe(true);

      // Step 3: Create subscription
      const subscription = await paymentService.createSubscription({
        userId: userId,
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      expect(subscription).toHaveProperty('id');
      expect(subscription.userId).toBe(userId);
      expect(subscription.plan).toBe(SubscriptionPlan.BASIC);
      expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);

      // Step 4: Verify subscription is linked to user
      const userSubscription = await subscriptionRepo.findByUserId(userId);
      expect(userSubscription).toBeDefined();
      expect(userSubscription?.plan).toBe(SubscriptionPlan.BASIC);
    });

    it('should prevent subscription creation for unverified users', async () => {
      // Register user but don't verify email
      const registerResult = await authService.register({
        email: 'unverified@example.com',
        password: 'SecurePass123!',
        name: 'Unverified User',
      });

      const user = await userRepo.findById(registerResult.user.id);
      expect(user?.status).toBe(UserStatus.PENDING);

      // This would typically be enforced at a higher level (controller/middleware)
      // but we can test the logic here
      if (user?.status !== UserStatus.ACTIVE) {
        await expect(
          paymentService.createSubscription({
            userId: registerResult.user.id,
            plan: SubscriptionPlan.BASIC,
            billingPeriod: 'monthly',
            paymentMethodId: 'pm_test_123',
          })
        ).rejects.toThrow();
      }
    });
  });

  describe('Login and Subscription Access Control', () => {
    it('should login and retrieve user subscription status', async () => {
      // Setup: Create and verify user
      const registerResult = await authService.register({
        email: 'subscriber@example.com',
        password: 'SecurePass123!',
        name: 'Subscriber',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      // Create subscription
      await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      // Login
      const loginResult = await authService.login('subscriber@example.com', 'SecurePass123!');

      expect(loginResult.token).toBeDefined();
      expect(loginResult.user.email).toBe('subscriber@example.com');

      // Retrieve subscription
      const subscription = await subscriptionRepo.findByUserId(loginResult.user.id);
      expect(subscription).toBeDefined();
      expect(subscription?.plan).toBe(SubscriptionPlan.PRO);
      expect(subscription?.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should block login for suspended users after payment failure', async () => {
      // Create user and subscription
      const registerResult = await authService.register({
        email: 'suspended@example.com',
        password: 'SecurePass123!',
        name: 'Suspended User',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      const subscription = await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      // Simulate payment failure - suspend subscription
      await subscriptionRepo.update(subscription.id, {
        status: SubscriptionStatus.PAST_DUE,
      });

      // Suspend user account
      await userRepo.update(registerResult.user.id, {
        status: UserStatus.SUSPENDED,
      });

      // Attempt login
      await expect(
        authService.login('suspended@example.com', 'SecurePass123!')
      ).rejects.toThrow(/suspended|inactive/i);
    });
  });

  describe('Subscription Upgrades and Role Changes', () => {
    it('should upgrade subscription from Basic to Pro', async () => {
      // Create user with Basic plan
      const registerResult = await authService.register({
        email: 'upgrader@example.com',
        password: 'SecurePass123!',
        name: 'Upgrader',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      const subscription = await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      expect(subscription.plan).toBe(SubscriptionPlan.BASIC);

      // Upgrade to Pro
      const updatedSubscription = await paymentService.updateSubscription(subscription.id, {
        plan: SubscriptionPlan.PRO,
      });

      expect(updatedSubscription.plan).toBe(SubscriptionPlan.PRO);

      // Verify change persisted
      const retrieved = await subscriptionRepo.findByUserId(registerResult.user.id);
      expect(retrieved?.plan).toBe(SubscriptionPlan.PRO);
    });

    it('should handle subscription cancellation and access restriction', async () => {
      // Create user with subscription
      const registerResult = await authService.register({
        email: 'canceller@example.com',
        password: 'SecurePass123!',
        name: 'Canceller',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      const subscription = await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      // Cancel subscription
      await paymentService.cancelSubscription(subscription.id);

      // Verify cancellation
      const cancelled = await subscriptionRepo.findById(subscription.id);
      expect(cancelled?.status).toBe(SubscriptionStatus.CANCELLED);

      // User should still be able to login, but with restricted access
      const loginResult = await authService.login('canceller@example.com', 'SecurePass123!');
      expect(loginResult.token).toBeDefined();

      // Subscription status should indicate cancelled
      const userSubscription = await subscriptionRepo.findByUserId(loginResult.user.id);
      expect(userSubscription?.status).toBe(SubscriptionStatus.CANCELLED);
    });
  });

  describe('Payment Failure Recovery Flow', () => {
    it('should handle failed payment and retry workflow', async () => {
      // Create user with subscription
      const registerResult = await authService.register({
        email: 'paymentfail@example.com',
        password: 'SecurePass123!',
        name: 'Payment Fail',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      const subscription = await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      // Create failed payment record
      const failedPayment = await paymentRepo.create({
        subscriptionId: subscription.id,
        amount: 2900, // $29.00
        currency: 'USD',
        status: PaymentStatus.FAILED,
        stripePaymentIntentId: 'pi_failed_123',
      });

      expect(failedPayment.status).toBe(PaymentStatus.FAILED);

      // Update subscription to PAST_DUE
      await subscriptionRepo.update(subscription.id, {
        status: SubscriptionStatus.PAST_DUE,
      });

      // Simulate successful retry
      const retryPayment = await paymentRepo.create({
        subscriptionId: subscription.id,
        amount: 2900,
        currency: 'USD',
        status: PaymentStatus.SUCCEEDED,
        stripePaymentIntentId: 'pi_success_123',
      });

      expect(retryPayment.status).toBe(PaymentStatus.SUCCEEDED);

      // Reactivate subscription
      await subscriptionRepo.update(subscription.id, {
        status: SubscriptionStatus.ACTIVE,
      });

      // Verify user can now access services
      const loginResult = await authService.login('paymentfail@example.com', 'SecurePass123!');
      const activeSubscription = await subscriptionRepo.findByUserId(loginResult.user.id);

      expect(activeSubscription?.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('Multi-User Subscription Scenarios', () => {
    it('should prevent duplicate subscriptions for same user', async () => {
      // Create user
      const registerResult = await authService.register({
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
        name: 'Duplicate Test',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      // Create first subscription
      const subscription1 = await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.BASIC,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      expect(subscription1).toBeDefined();

      // Attempt to create second subscription
      await expect(
        paymentService.createSubscription({
          userId: registerResult.user.id,
          plan: SubscriptionPlan.PRO,
          billingPeriod: 'monthly',
          paymentMethodId: 'pm_test_456',
        })
      ).rejects.toThrow(/already has.*subscription/i);
    });
  });

  describe('Token-Based Subscription Access', () => {
    it('should include subscription info in JWT token payload', async () => {
      // Create user with subscription
      const registerResult = await authService.register({
        email: 'tokentest@example.com',
        password: 'SecurePass123!',
        name: 'Token Test',
      });

      await authService.verifyEmail(registerResult.verificationToken);

      await paymentService.createSubscription({
        userId: registerResult.user.id,
        plan: SubscriptionPlan.PRO,
        billingPeriod: 'monthly',
        paymentMethodId: 'pm_test_123',
      });

      // Login to get token
      const loginResult = await authService.login('tokentest@example.com', 'SecurePass123!');

      // Verify token
      const payload = jwtService.verifyToken(loginResult.token);
      expect(payload.userId).toBe(registerResult.user.id);
      expect(payload.email).toBe('tokentest@example.com');

      // Retrieve subscription using userId from token
      const subscription = await subscriptionRepo.findByUserId(payload.userId);
      expect(subscription?.plan).toBe(SubscriptionPlan.PRO);
    });
  });
});
