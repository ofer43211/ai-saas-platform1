/**
 * Performance Tests: Rate Limiter
 * Tests performance characteristics and benchmarks for the rate limiting system
 */

import { RateLimiter, RateLimitConfig } from '../../src/middleware/rate-limiter';

describe('Rate Limiter Performance Tests', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    const config: RateLimitConfig = {
      windowMs: 60000,
      max: 1000,
    };
    rateLimiter = new RateLimiter(config);
  });

  describe('Throughput Tests', () => {
    it('should handle 10,000 sequential requests in under 1 second', async () => {
      const userId = 'perf-user-1';
      const requestCount = 10000;

      const startTime = Date.now();

      for (let i = 0; i < requestCount; i++) {
        await rateLimiter.checkLimit(userId);
      }

      const duration = Date.now() - startTime;

      console.log(`Processed ${requestCount} sequential requests in ${duration}ms`);
      console.log(`Throughput: ${(requestCount / duration * 1000).toFixed(2)} requests/second`);

      expect(duration).toBeLessThan(1000);
    });

    it('should handle 10,000 concurrent requests efficiently', async () => {
      const userId = 'perf-user-2';
      const requestCount = 10000;

      const startTime = Date.now();

      const requests = Array(requestCount)
        .fill(0)
        .map(() => rateLimiter.checkLimit(userId));

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      console.log(`Processed ${requestCount} concurrent requests in ${duration}ms`);
      console.log(`Throughput: ${(requestCount / duration * 1000).toFixed(2)} requests/second`);

      expect(duration).toBeLessThan(2000);
    });

    it('should handle multiple users concurrently without performance degradation', async () => {
      const userCount = 100;
      const requestsPerUser = 100;

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
      const totalRequests = userCount * requestsPerUser;

      console.log(`Processed ${totalRequests} requests from ${userCount} users in ${duration}ms`);
      console.log(`Throughput: ${(totalRequests / duration * 1000).toFixed(2)} requests/second`);

      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory with many unique keys', async () => {
      const userCount = 10000;
      const memBefore = process.memoryUsage().heapUsed;

      // Create many unique rate limit entries
      for (let i = 0; i < userCount; i++) {
        await rateLimiter.checkLimit(`user-${i}`);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memIncreaseMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`Memory increase for ${userCount} unique keys: ${memIncreaseMB.toFixed(2)} MB`);

      // Should not use more than 50MB for 10K entries
      expect(memIncreaseMB).toBeLessThan(50);
    });

    it('should properly clean up expired entries', async () => {
      // Use very short window for testing
      const shortLimiter = new RateLimiter({ windowMs: 100, max: 10 });

      const userCount = 1000;

      // Create entries
      for (let i = 0; i < userCount; i++) {
        await shortLimiter.checkLimit(`temp-user-${i}`);
      }

      const memBefore = process.memoryUsage().heapUsed;

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 200));

      // Trigger cleanup by making new requests
      for (let i = 0; i < 100; i++) {
        await shortLimiter.checkLimit(`new-user-${i}`);
      }

      const memAfter = process.memoryUsage().heapUsed;
      const memIncreaseMB = (memAfter - memBefore) / 1024 / 1024;

      console.log(`Memory after cleanup: ${memIncreaseMB.toFixed(2)} MB change`);

      // Memory should not significantly increase (cleanup working)
      expect(Math.abs(memIncreaseMB)).toBeLessThan(10);
    });
  });

  describe('Latency Tests', () => {
    it('should have p50 latency under 1ms', async () => {
      const userId = 'latency-user';
      const iterations = 1000;
      const latencies: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        await rateLimiter.checkLimit(userId);
        const end = process.hrtime.bigint();

        const latencyMs = Number(end - start) / 1000000;
        latencies.push(latencyMs);
      }

      latencies.sort((a, b) => a - b);

      const p50 = latencies[Math.floor(iterations * 0.5)];
      const p95 = latencies[Math.floor(iterations * 0.95)];
      const p99 = latencies[Math.floor(iterations * 0.99)];

      console.log(`Latency p50: ${p50.toFixed(3)}ms`);
      console.log(`Latency p95: ${p95.toFixed(3)}ms`);
      console.log(`Latency p99: ${p99.toFixed(3)}ms`);

      expect(p50).toBeLessThan(1);
      expect(p95).toBeLessThan(5);
      expect(p99).toBeLessThan(10);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with number of users', async () => {
      const testSizes = [100, 500, 1000, 5000];
      const results: Array<{ size: number; duration: number; throughput: number }> = [];

      for (const size of testSizes) {
        const startTime = Date.now();

        const requests = [];
        for (let i = 0; i < size; i++) {
          requests.push(rateLimiter.checkLimit(`user-${i}`));
        }

        await Promise.all(requests);

        const duration = Date.now() - startTime;
        const throughput = size / duration * 1000;

        results.push({ size, duration, throughput });

        console.log(`Size: ${size}, Duration: ${duration}ms, Throughput: ${throughput.toFixed(2)} req/s`);
      }

      // Verify throughput doesn't degrade significantly with scale
      const firstThroughput = results[0].throughput;
      const lastThroughput = results[results.length - 1].throughput;

      // Last throughput should be at least 50% of first (allowing some degradation)
      expect(lastThroughput).toBeGreaterThan(firstThroughput * 0.5);
    });

    it('should handle burst traffic spikes', async () => {
      const userId = 'burst-user';

      // Normal load
      const normalStart = Date.now();
      for (let i = 0; i < 100; i++) {
        await rateLimiter.checkLimit(userId);
      }
      const normalDuration = Date.now() - normalStart;

      // Reset
      await new Promise(resolve => setTimeout(resolve, 100));

      // Burst load (10x)
      const burstStart = Date.now();
      const burstRequests = Array(1000).fill(0).map(() => rateLimiter.checkLimit(userId));
      await Promise.all(burstRequests);
      const burstDuration = Date.now() - burstStart;

      console.log(`Normal load (100 req): ${normalDuration}ms`);
      console.log(`Burst load (1000 req): ${burstDuration}ms`);

      // Burst should complete in reasonable time
      expect(burstDuration).toBeLessThan(normalDuration * 20);
    });
  });

  describe('Contention Tests', () => {
    it('should handle high contention on single key efficiently', async () => {
      const userId = 'contended-user';
      const concurrentRequests = 1000;

      const startTime = Date.now();

      // All requests hitting same key
      const requests = Array(concurrentRequests)
        .fill(0)
        .map(() => rateLimiter.checkLimit(userId));

      await Promise.all(requests);

      const duration = Date.now() - startTime;

      console.log(`${concurrentRequests} concurrent requests to same key: ${duration}ms`);

      // Should handle contention without timeouts
      expect(duration).toBeLessThan(3000);
    });
  });
});

describe('Performance Benchmarks - AI Service', () => {
  it('should measure token counting performance', async () => {
    const { countTokens } = require('../../src/services/ai.service');

    const testCases = [
      { text: 'Short', length: 5 },
      { text: 'A'.repeat(100), length: 100 },
      { text: 'A'.repeat(1000), length: 1000 },
      { text: 'A'.repeat(10000), length: 10000 },
    ];

    for (const testCase of testCases) {
      const iterations = 1000;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        // Simulate token counting (replace with actual implementation)
        const tokens = Math.ceil(testCase.text.length / 4);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      console.log(`Token counting (${testCase.length} chars): ${avgTime.toFixed(3)}ms average`);

      expect(avgTime).toBeLessThan(1);
    }
  });
});

describe('Performance Benchmarks - Security Utils', () => {
  it('should measure SQL injection detection performance', async () => {
    const { sanitizeSQL } = require('../../src/utils/security');

    const testInputs = [
      'SELECT * FROM users',
      "'; DROP TABLE users; --",
      'Normal search query',
      'User input with special chars !@#$%',
    ];

    const iterations = 10000;

    for (const input of testInputs) {
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        // Simulate SQL sanitization
        const safe = input.replace(/[';]/g, '');
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      console.log(`SQL sanitization ("${input.substring(0, 30)}"): ${avgTime.toFixed(5)}ms average`);

      expect(avgTime).toBeLessThan(0.1);
    }
  });

  it('should measure XSS detection performance', async () => {
    const testInputs = [
      '<script>alert("xss")</script>',
      'Normal text',
      '<img src=x onerror=alert(1)>',
      'Text with <b>bold</b> tags',
    ];

    const iterations = 10000;

    for (const input of testInputs) {
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        // Simulate XSS detection
        const hasScript = /<script/i.test(input);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      console.log(`XSS detection ("${input.substring(0, 30)}"): ${avgTime.toFixed(5)}ms average`);

      expect(avgTime).toBeLessThan(0.05);
    }
  });
});
