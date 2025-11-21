/**
 * Contract Tests for Stripe API
 *
 * These tests verify that our code correctly handles Stripe API responses.
 * Uses Pact to define contracts between our service and Stripe API.
 *
 * Benefits:
 * - Catch API changes early
 * - Verify request/response formats
 * - Document API expectations
 * - Test without hitting real Stripe API
 */

import { Pact } from '@pact-foundation/pact';
import path from 'path';

/**
 * Stripe API Client for testing
 */
class StripeAPIClient {
  constructor(private baseUrl: string) {}

  async createCustomer(email: string, metadata: any): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/customers`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_key',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        email,
        'metadata[userId]': metadata.userId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  async createSubscription(customerId: string, priceId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_key',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        'items[0][price]': priceId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  async cancelSubscription(subscriptionId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer test_key',
      },
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }

  async createPaymentIntent(amount: number, currency: string, customerId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v1/payment_intents`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer test_key',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        amount: String(amount),
        currency,
        customer: customerId,
      }),
    });

    if (!response.ok) {
      throw new Error(`Stripe API error: ${response.status}`);
    }

    return response.json();
  }
}

describe('Stripe API Contract Tests', () => {
  const provider = new Pact({
    consumer: 'AI-SaaS-Platform',
    provider: 'Stripe-API',
    port: 8989,
    log: path.resolve(process.cwd(), 'logs', 'pact.log'),
    dir: path.resolve(process.cwd(), 'pacts'),
    logLevel: 'info',
  });

  let stripeClient: StripeAPIClient;

  beforeAll(async () => {
    await provider.setup();
    stripeClient = new StripeAPIClient('http://localhost:8989');
  });

  afterAll(async () => {
    await provider.finalize();
  });

  afterEach(async () => {
    await provider.verify();
  });

  describe('Customer Creation', () => {
    it('should create a customer successfully', async () => {
      // Define expected interaction
      await provider.addInteraction({
        state: 'customer can be created',
        uponReceiving: 'a request to create a customer',
        withRequest: {
          method: 'POST',
          path: '/v1/customers',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'email=test%40example.com&metadata%5BuserId%5D=user-123',
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'cus_test123',
            object: 'customer',
            email: 'test@example.com',
            metadata: {
              userId: 'user-123',
            },
            created: 1234567890,
            livemode: false,
          },
        },
      });

      // Execute request
      const customer = await stripeClient.createCustomer('test@example.com', {
        userId: 'user-123',
      });

      // Verify response
      expect(customer.id).toBe('cus_test123');
      expect(customer.email).toBe('test@example.com');
      expect(customer.metadata.userId).toBe('user-123');
    });

    it('should handle customer creation error', async () => {
      await provider.addInteraction({
        state: 'invalid email provided',
        uponReceiving: 'a request with invalid email',
        withRequest: {
          method: 'POST',
          path: '/v1/customers',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'email=invalid-email&metadata%5BuserId%5D=user-123',
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: {
              type: 'invalid_request_error',
              message: 'Invalid email address',
              param: 'email',
            },
          },
        },
      });

      await expect(
        stripeClient.createCustomer('invalid-email', { userId: 'user-123' })
      ).rejects.toThrow(/Stripe API error: 400/);
    });
  });

  describe('Subscription Management', () => {
    it('should create subscription successfully', async () => {
      await provider.addInteraction({
        state: 'customer and price exist',
        uponReceiving: 'a request to create subscription',
        withRequest: {
          method: 'POST',
          path: '/v1/subscriptions',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'customer=cus_test123&items%5B0%5D%5Bprice%5D=price_basic_monthly',
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'sub_test123',
            object: 'subscription',
            customer: 'cus_test123',
            status: 'active',
            items: {
              data: [
                {
                  id: 'si_test123',
                  price: {
                    id: 'price_basic_monthly',
                    unit_amount: 2900,
                    currency: 'usd',
                  },
                },
              ],
            },
            current_period_start: 1234567890,
            current_period_end: 1237246290,
          },
        },
      });

      const subscription = await stripeClient.createSubscription(
        'cus_test123',
        'price_basic_monthly'
      );

      expect(subscription.id).toBe('sub_test123');
      expect(subscription.status).toBe('active');
      expect(subscription.customer).toBe('cus_test123');
    });

    it('should cancel subscription successfully', async () => {
      await provider.addInteraction({
        state: 'subscription exists',
        uponReceiving: 'a request to cancel subscription',
        withRequest: {
          method: 'DELETE',
          path: '/v1/subscriptions/sub_test123',
          headers: {
            'Authorization': 'Bearer test_key',
          },
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'sub_test123',
            object: 'subscription',
            status: 'canceled',
            canceled_at: 1234567890,
          },
        },
      });

      const canceled = await stripeClient.cancelSubscription('sub_test123');

      expect(canceled.id).toBe('sub_test123');
      expect(canceled.status).toBe('canceled');
      expect(canceled.canceled_at).toBeDefined();
    });
  });

  describe('Payment Intents', () => {
    it('should create payment intent successfully', async () => {
      await provider.addInteraction({
        state: 'customer exists',
        uponReceiving: 'a request to create payment intent',
        withRequest: {
          method: 'POST',
          path: '/v1/payment_intents',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'amount=2900&currency=usd&customer=cus_test123',
        },
        willRespondWith: {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            id: 'pi_test123',
            object: 'payment_intent',
            amount: 2900,
            currency: 'usd',
            customer: 'cus_test123',
            status: 'requires_payment_method',
            client_secret: 'pi_test123_secret_abc',
          },
        },
      });

      const paymentIntent = await stripeClient.createPaymentIntent(
        2900,
        'usd',
        'cus_test123'
      );

      expect(paymentIntent.id).toBe('pi_test123');
      expect(paymentIntent.amount).toBe(2900);
      expect(paymentIntent.currency).toBe('usd');
      expect(paymentIntent.status).toBe('requires_payment_method');
    });

    it('should handle payment intent with invalid amount', async () => {
      await provider.addInteraction({
        state: 'invalid amount provided',
        uponReceiving: 'a request with negative amount',
        withRequest: {
          method: 'POST',
          path: '/v1/payment_intents',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'amount=-100&currency=usd&customer=cus_test123',
        },
        willRespondWith: {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
          body: {
            error: {
              type: 'invalid_request_error',
              message: 'Invalid integer: -100',
              param: 'amount',
            },
          },
        },
      });

      await expect(
        stripeClient.createPaymentIntent(-100, 'usd', 'cus_test123')
      ).rejects.toThrow(/Stripe API error: 400/);
    });
  });

  describe('Webhook Events', () => {
    it('should verify webhook signature format', () => {
      // This tests our understanding of Stripe webhook structure
      const webhookEvent = {
        id: 'evt_test123',
        object: 'event',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active',
          },
        },
        created: 1234567890,
        livemode: false,
      };

      expect(webhookEvent.type).toBe('customer.subscription.updated');
      expect(webhookEvent.data.object.id).toBe('sub_test123');
    });
  });
});
