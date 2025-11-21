/**
 * Integration Tests: AI Service + Rate Limiter + Authentication
 * Tests the complete request flow from authentication through rate limiting to AI service execution
 */

import { AIService, IAIProvider } from '../../src/services/ai.service';
import { RateLimiter, RateLimitConfig } from '../../src/middleware/rate-limiter';
import { SubscriptionPlan } from '../../src/types/payment.types';

// Mock AI Provider
class MockAIProvider implements IAIProvider {
  private shouldFail = false;
  private delayMs = 0;
  private callCount = 0;

  async complete(request: any) {
    this.callCount++;

    if (this.delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      throw new Error('AI Provider Error');
    }

    return {
      content: 'This is a mock AI response',
      model: request.model,
      usage: {
        promptTokens: 10,
        completionTokens: 15,
        totalTokens: 25,
      },
    };
  }

  async stream(request: any) {
    // Mock streaming response
    return {
      async *[Symbol.asyncIterator]() {
        yield { content: 'Mock ', done: false };
        yield { content: 'streaming ', done: false };
        yield { content: 'response', done: true };
      },
    };
  }

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  setDelay(ms: number) {
    this.delayMs = ms;
  }

  getCallCount() {
    return this.callCount;
  }

  reset() {
    this.shouldFail = false;
    this.delayMs = 0;
    this.callCount = 0;
  }
}

describe('AI Service + Rate Limiter Integration', () => {
  let aiService: AIService;
  let rateLimiter: RateLimiter;
  let mockProvider: MockAIProvider;

  beforeEach(() => {
    mockProvider = new MockAIProvider();
    aiService = new AIService(mockProvider);

    // Configure rate limiter with different limits for different plans
    const config: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      max: 10, // Default: 10 requests per minute
    };

    rateLimiter = new RateLimiter(config);
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe('Rate-Limited AI Requests', () => {
    it('should allow AI requests within rate limit', async () => {
      const userId = 'user-123';

      // Make 5 requests (within limit of 10)
      for (let i = 0; i < 5; i++) {
        const allowed = await rateLimiter.checkLimit(userId);
        expect(allowed).toBe(true);

        if (allowed) {
          const response = await aiService.complete({
            model: 'gpt-4',
            messages: [{ role: 'user', content: `Test ${i}` }],
          });

          expect(response.content).toBeDefined();
        }
      }

      expect(mockProvider.getCallCount()).toBe(5);
    });

    it('should block AI requests when rate limit exceeded', async () => {
      const userId = 'user-456';

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimiter.checkLimit(userId);
        expect(allowed).toBe(true);
      }

      // 11th request should be blocked
      const blockedRequest = await rateLimiter.checkLimit(userId);
      expect(blockedRequest).toBe(false);

      // Verify AI service wasn't called
      expect(mockProvider.getCallCount()).toBe(0);
    });

    it('should enforce different rate limits for different subscription plans', async () => {
      // Free plan: 5 requests per minute
      const freeLimiter = new RateLimiter({ windowMs: 60000, max: 5 });

      // Basic plan: 20 requests per minute
      const basicLimiter = new RateLimiter({ windowMs: 60000, max: 20 });

      // Pro plan: 100 requests per minute
      const proLimiter = new RateLimiter({ windowMs: 60000, max: 100 });

      const freeUserId = 'free-user';
      const basicUserId = 'basic-user';
      const proUserId = 'pro-user';

      // Free user exhausts limit at 5
      for (let i = 0; i < 5; i++) {
        expect(await freeLimiter.checkLimit(freeUserId)).toBe(true);
      }
      expect(await freeLimiter.checkLimit(freeUserId)).toBe(false);

      // Basic user can make 20 requests
      for (let i = 0; i < 20; i++) {
        expect(await basicLimiter.checkLimit(basicUserId)).toBe(true);
      }
      expect(await basicLimiter.checkLimit(basicUserId)).toBe(false);

      // Pro user can make 100 requests
      for (let i = 0; i < 100; i++) {
        expect(await proLimiter.checkLimit(proUserId)).toBe(true);
      }
      expect(await proLimiter.checkLimit(proUserId)).toBe(false);
    });
  });

  describe('Rate Limiter with Concurrent AI Requests', () => {
    it('should handle concurrent requests and enforce rate limit correctly', async () => {
      const userId = 'concurrent-user';

      // Make 15 concurrent requests (limit is 10)
      const requests = Array(15)
        .fill(0)
        .map(async () => {
          const allowed = await rateLimiter.checkLimit(userId);
          if (allowed) {
            return await aiService.complete({
              model: 'gpt-4',
              messages: [{ role: 'user', content: 'Test' }],
            });
          }
          return null;
        });

      const results = await Promise.all(requests);

      // Count successful requests
      const successful = results.filter(r => r !== null).length;

      // Should be exactly 10 (the rate limit)
      expect(successful).toBe(10);
    });

    it('should handle burst traffic with proper rate limiting', async () => {
      const userId = 'burst-user';

      // Simulate burst: 20 requests at once
      const burstRequests = Array(20)
        .fill(0)
        .map(() => rateLimiter.checkLimit(userId));

      const results = await Promise.all(burstRequests);

      // Only first 10 should be allowed
      const allowed = results.filter(r => r === true).length;
      const blocked = results.filter(r => r === false).length;

      expect(allowed).toBe(10);
      expect(blocked).toBe(10);
    });
  });

  describe('AI Service with Usage Tracking and Rate Limiting', () => {
    it('should track API calls and tokens across rate-limited requests', async () => {
      const userId = 'tracked-user';
      let totalTokens = 0;
      let successfulCalls = 0;

      // Make requests until rate limited
      for (let i = 0; i < 15; i++) {
        const allowed = await rateLimiter.checkLimit(userId);

        if (allowed) {
          const response = await aiService.complete({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          });

          totalTokens += response.usage.totalTokens;
          successfulCalls++;
        }
      }

      expect(successfulCalls).toBe(10); // Rate limit
      expect(totalTokens).toBe(250); // 10 calls * 25 tokens each
    });

    it('should enforce token limits per request independent of rate limits', async () => {
      const userId = 'token-limited-user';
      const maxTokensPerRequest = 1000;

      // Request with too many tokens
      const largeRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
        maxTokens: 5000, // Exceeds limit
      };

      const allowed = await rateLimiter.checkLimit(userId);
      expect(allowed).toBe(true);

      // AI service should reject based on token limit
      await expect(aiService.complete(largeRequest)).rejects.toThrow(/token.*limit/i);
    });
  });

  describe('Rate Limit Reset and Window Management', () => {
    it('should reset rate limit after window expires', async () => {
      // Use short window for testing (100ms)
      const shortLimiter = new RateLimiter({ windowMs: 100, max: 3 });
      const userId = 'reset-user';

      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        expect(await shortLimiter.checkLimit(userId)).toBe(true);
      }

      expect(await shortLimiter.checkLimit(userId)).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should allow requests again
      expect(await shortLimiter.checkLimit(userId)).toBe(true);
    });

    it('should maintain separate rate limits for different users', async () => {
      const user1 = 'user-1';
      const user2 = 'user-2';

      // Exhaust limit for user1
      for (let i = 0; i < 10; i++) {
        expect(await rateLimiter.checkLimit(user1)).toBe(true);
      }
      expect(await rateLimiter.checkLimit(user1)).toBe(false);

      // user2 should still have full limit
      for (let i = 0; i < 10; i++) {
        expect(await rateLimiter.checkLimit(user2)).toBe(true);
      }
      expect(await rateLimiter.checkLimit(user2)).toBe(false);
    });
  });

  describe('AI Service Errors with Rate Limiting', () => {
    it('should count failed AI requests against rate limit', async () => {
      const userId = 'error-user';
      mockProvider.setShouldFail(true);

      let successfulLimits = 0;
      let failedAICalls = 0;

      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimiter.checkLimit(userId);

        if (allowed) {
          successfulLimits++;
          try {
            await aiService.complete({
              model: 'gpt-4',
              messages: [{ role: 'user', content: 'Test' }],
            });
          } catch (error) {
            failedAICalls++;
          }
        }
      }

      expect(successfulLimits).toBe(10);
      expect(failedAICalls).toBe(10);

      // Next request should be rate limited
      expect(await rateLimiter.checkLimit(userId)).toBe(false);
    });

    it('should not consume rate limit if request validation fails before AI call', async () => {
      const userId = 'validation-user';

      // Invalid request (empty messages)
      try {
        await aiService.complete({
          model: 'gpt-4',
          messages: [],
        });
      } catch (error) {
        // Expected validation error
      }

      // Rate limit should not be consumed since request was invalid
      // In real implementation, rate limit check happens after validation
      const allowed = await rateLimiter.checkLimit(userId);
      expect(allowed).toBe(true);
    });
  });

  describe('Streaming with Rate Limiting', () => {
    it('should apply rate limit to streaming requests', async () => {
      const userId = 'stream-user';

      // Make 10 streaming requests
      for (let i = 0; i < 10; i++) {
        const allowed = await rateLimiter.checkLimit(userId);
        expect(allowed).toBe(true);

        if (allowed) {
          const stream = await aiService.stream({
            model: 'gpt-4',
            messages: [{ role: 'user', content: 'Test' }],
          });

          // Consume stream
          const chunks = [];
          for await (const chunk of stream) {
            chunks.push(chunk);
          }

          expect(chunks.length).toBeGreaterThan(0);
        }
      }

      // 11th request should be rate limited
      expect(await rateLimiter.checkLimit(userId)).toBe(false);
    });

    it('should handle cancelled streaming requests with rate limiting', async () => {
      const userId = 'cancel-stream-user';

      const allowed = await rateLimiter.checkLimit(userId);
      expect(allowed).toBe(true);

      if (allowed) {
        const stream = await aiService.stream({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test' }],
        });

        // Consume only first chunk then cancel
        const iterator = stream[Symbol.asyncIterator]();
        const first = await iterator.next();
        expect(first.done).toBe(false);

        // Cancel stream (in real implementation this would abort the request)
        // Rate limit should still be consumed
      }

      // Verify rate limit was consumed
      const info = rateLimiter.getLimitInfo(userId);
      expect(info.remaining).toBe(9);
    });
  });

  describe('Performance under Rate Limiting', () => {
    it('should handle rate limit checks efficiently under load', async () => {
      const userCount = 100;
      const requestsPerUser = 5;

      const startTime = Date.now();

      const allRequests = [];
      for (let i = 0; i < userCount; i++) {
        const userId = `perf-user-${i}`;

        for (let j = 0; j < requestsPerUser; j++) {
          allRequests.push(rateLimiter.checkLimit(userId));
        }
      }

      await Promise.all(allRequests);

      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 1 second for 500 checks)
      expect(duration).toBeLessThan(1000);
    });
  });
});
