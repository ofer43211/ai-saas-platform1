import {
  RateLimiter,
  RateLimitExceeded,
  InMemoryRateLimitStore,
  MultiTierRateLimiter,
  RateLimitConfig,
} from '../rate-limiter';

describe('RateLimiter', () => {
  describe('Basic Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      for (let i = 0; i < 5; i++) {
        const info = await limiter.checkLimit('user-1');
        expect(info.remaining).toBe(5 - i - 1);
      }
    });

    it('should throw RateLimitExceeded when limit exceeded', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 3,
      });

      // Make 3 requests (should succeed)
      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-1');

      // 4th request should fail
      await expect(limiter.checkLimit('user-1')).rejects.toThrow(RateLimitExceeded);
    });

    it('should provide retry-after time in error', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      await limiter.checkLimit('user-1');

      try {
        await limiter.checkLimit('user-1');
        fail('Should have thrown RateLimitExceeded');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitExceeded);
        expect((error as RateLimitExceeded).retryAfter).toBeGreaterThan(0);
        expect((error as RateLimitExceeded).retryAfter).toBeLessThanOrEqual(60);
      }
    });

    it('should track different keys separately', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-1');

      // user-1 is at limit
      await expect(limiter.checkLimit('user-1')).rejects.toThrow(RateLimitExceeded);

      // user-2 should still be allowed
      const info = await limiter.checkLimit('user-2');
      expect(info.remaining).toBe(1);
    });

    it('should reset after window expires', async () => {
      const limiter = new RateLimiter({
        windowMs: 100, // 100ms window
        maxRequests: 2,
      });

      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-1');

      // At limit
      await expect(limiter.checkLimit('user-1')).rejects.toThrow(RateLimitExceeded);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be allowed again
      const info = await limiter.checkLimit('user-1');
      expect(info.remaining).toBe(1);
    });

    it('should provide accurate remaining count', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      for (let i = 0; i < 10; i++) {
        const info = await limiter.checkLimit('user-1');
        expect(info.limit).toBe(10);
        expect(info.remaining).toBe(10 - i - 1);
      }
    });

    it('should include reset time in response', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      const info = await limiter.checkLimit('user-1');

      expect(info.resetTime).toBeInstanceOf(Date);
      expect(info.resetTime.getTime()).toBeGreaterThan(Date.now());
      expect(info.resetTime.getTime()).toBeLessThanOrEqual(Date.now() + 60000);
    });
  });

  describe('getInfo', () => {
    it('should get rate limit info without incrementing', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
      });

      await limiter.checkLimit('user-1');
      const info1 = await limiter.getInfo('user-1');
      const info2 = await limiter.getInfo('user-1');

      expect(info1.remaining).toBe(4);
      expect(info2.remaining).toBe(4); // Should not change
    });

    it('should return full limit for new key', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      const info = await limiter.getInfo('new-user');

      expect(info.limit).toBe(10);
      expect(info.remaining).toBe(10);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for a key', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-1');

      // At limit
      await expect(limiter.checkLimit('user-1')).rejects.toThrow();

      // Reset
      await limiter.reset('user-1');

      // Should be allowed again
      const info = await limiter.checkLimit('user-1');
      expect(info.remaining).toBe(1);
    });

    it('should not affect other keys', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 2,
      });

      await limiter.checkLimit('user-1');
      await limiter.checkLimit('user-2');

      await limiter.reset('user-1');

      const info1 = await limiter.getInfo('user-1');
      const info2 = await limiter.getInfo('user-2');

      expect(info1.remaining).toBe(2); // Reset
      expect(info2.remaining).toBe(1); // Not reset
    });
  });

  describe('Configuration Options', () => {
    it('should use custom key prefix', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'custom',
      });

      // This test verifies the prefix is used internally
      // In practice, this affects storage but doesn't change behavior
      const info = await limiter.checkLimit('user-1');
      expect(info.remaining).toBe(4);
    });

    it('should skip successful requests when configured', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        skipSuccessfulRequests: true,
      });

      await limiter.recordRequest('user-1', true);
      await limiter.recordRequest('user-1', true);

      const info = await limiter.getInfo('user-1');
      expect(info.remaining).toBe(5); // Not incremented
    });

    it('should skip failed requests when configured', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        skipFailedRequests: true,
      });

      await limiter.recordRequest('user-1', false);
      await limiter.recordRequest('user-1', false);

      const info = await limiter.getInfo('user-1');
      expect(info.remaining).toBe(5); // Not incremented
    });
  });

  describe('InMemoryRateLimitStore', () => {
    it('should store and retrieve counts', async () => {
      const store = new InMemoryRateLimitStore(60000);

      await store.increment('key-1');
      await store.increment('key-1');
      const count = await store.get('key-1');

      expect(count).toBe(2);
    });

    it('should reset counts after window expires', async () => {
      const store = new InMemoryRateLimitStore(100);

      await store.increment('key-1');
      await store.increment('key-1');

      await new Promise(resolve => setTimeout(resolve, 150));

      const count = await store.get('key-1');
      expect(count).toBe(0);
    });

    it('should handle multiple keys independently', async () => {
      const store = new InMemoryRateLimitStore(60000);

      await store.increment('key-1');
      await store.increment('key-2');
      await store.increment('key-2');

      expect(await store.get('key-1')).toBe(1);
      expect(await store.get('key-2')).toBe(2);
    });

    it('should reset specific keys', async () => {
      const store = new InMemoryRateLimitStore(60000);

      await store.increment('key-1');
      await store.increment('key-2');

      await store.reset('key-1');

      expect(await store.get('key-1')).toBe(0);
      expect(await store.get('key-2')).toBe(1);
    });
  });

  describe('MultiTierRateLimiter', () => {
    it('should enforce multiple rate limits', async () => {
      const multiLimiter = new MultiTierRateLimiter({
        ip: { windowMs: 60000, maxRequests: 100 },
        user: { windowMs: 60000, maxRequests: 50 },
        apiKey: { windowMs: 60000, maxRequests: 1000 },
      });

      const results = await multiLimiter.checkLimits({
        ip: '192.168.1.1',
        user: 'user-123',
        apiKey: 'key-abc',
      });

      expect(results.ip.limit).toBe(100);
      expect(results.user.limit).toBe(50);
      expect(results.apiKey.limit).toBe(1000);
    });

    it('should throw if any tier exceeds limit', async () => {
      const multiLimiter = new MultiTierRateLimiter({
        ip: { windowMs: 60000, maxRequests: 2 },
        user: { windowMs: 60000, maxRequests: 10 },
      });

      // Exhaust IP limit
      await multiLimiter.checkLimits({ ip: '192.168.1.1', user: 'user-1' });
      await multiLimiter.checkLimits({ ip: '192.168.1.1', user: 'user-1' });

      // Should fail due to IP limit
      await expect(
        multiLimiter.checkLimits({ ip: '192.168.1.1', user: 'user-1' })
      ).rejects.toThrow(RateLimitExceeded);
    });

    it('should get specific tier limiter', () => {
      const multiLimiter = new MultiTierRateLimiter({
        ip: { windowMs: 60000, maxRequests: 100 },
        user: { windowMs: 60000, maxRequests: 50 },
      });

      const ipLimiter = multiLimiter.getLimiter('ip');
      expect(ipLimiter).toBeDefined();
      expect(ipLimiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid concurrent requests', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 10,
      });

      const promises = Array(10).fill(null).map(() =>
        limiter.checkLimit('user-1')
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
    });

    it('should handle zero remaining correctly', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1,
      });

      const info = await limiter.checkLimit('user-1');
      expect(info.remaining).toBe(0);

      await expect(limiter.checkLimit('user-1')).rejects.toThrow();
    });

    it('should handle very short windows', async () => {
      const limiter = new RateLimiter({
        windowMs: 10, // 10ms
        maxRequests: 2,
      });

      await limiter.checkLimit('user-1');
      await new Promise(resolve => setTimeout(resolve, 15));

      // Should be reset
      const info = await limiter.checkLimit('user-1');
      expect(info.remaining).toBe(1);
    });

    it('should handle very large limits', async () => {
      const limiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 1000000,
      });

      for (let i = 0; i < 100; i++) {
        await limiter.checkLimit('user-1');
      }

      const info = await limiter.getInfo('user-1');
      expect(info.remaining).toBe(1000000 - 100);
    });
  });
});
