export class RateLimitExceeded extends Error {
  constructor(
    message: string,
    public retryAfter: number
  ) {
    super(message);
    this.name = 'RateLimitExceeded';
  }
}

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Prefix for storage keys
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: Date;
}

export interface IRateLimitStore {
  increment(key: string): Promise<number>;
  get(key: string): Promise<number>;
  reset(key: string): Promise<void>;
  getResetTime(key: string): Promise<Date>;
}

/**
 * In-memory rate limit store (for development/testing)
 * In production, use Redis or similar distributed store
 */
export class InMemoryRateLimitStore implements IRateLimitStore {
  private store: Map<string, { count: number; resetTime: Date }> = new Map();
  private readonly windowMs: number;

  constructor(windowMs: number) {
    this.windowMs = windowMs;

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  async increment(key: string): Promise<number> {
    const now = new Date();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      // Create new entry
      const resetTime = new Date(now.getTime() + this.windowMs);
      this.store.set(key, { count: 1, resetTime });
      return 1;
    }

    // Increment existing entry
    entry.count++;
    this.store.set(key, entry);
    return entry.count;
  }

  async get(key: string): Promise<number> {
    const entry = this.store.get(key);
    if (!entry || entry.resetTime < new Date()) {
      return 0;
    }
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getResetTime(key: string): Promise<Date> {
    const entry = this.store.get(key);
    if (!entry) {
      return new Date(Date.now() + this.windowMs);
    }
    return entry.resetTime;
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

export class RateLimiter {
  private readonly config: Required<RateLimitConfig>;
  private readonly store: IRateLimitStore;

  constructor(
    config: RateLimitConfig,
    store?: IRateLimitStore
  ) {
    this.config = {
      keyPrefix: 'rl',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };

    this.store = store || new InMemoryRateLimitStore(config.windowMs);
  }

  /**
   * Check rate limit for a key (e.g., user ID, IP address, API key)
   */
  async checkLimit(key: string): Promise<RateLimitInfo> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const count = await this.store.increment(fullKey);
    const resetTime = await this.store.getResetTime(fullKey);

    const remaining = Math.max(0, this.config.maxRequests - count);

    if (count > this.config.maxRequests) {
      const retryAfter = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
      throw new RateLimitExceeded(
        `Rate limit exceeded. Try again in ${retryAfter} seconds`,
        retryAfter
      );
    }

    return {
      limit: this.config.maxRequests,
      remaining,
      resetTime,
    };
  }

  /**
   * Get current rate limit info without incrementing
   */
  async getInfo(key: string): Promise<RateLimitInfo> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    const count = await this.store.get(fullKey);
    const resetTime = await this.store.getResetTime(fullKey);

    return {
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - count),
      resetTime,
    };
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    const fullKey = `${this.config.keyPrefix}:${key}`;
    await this.store.reset(fullKey);
  }

  /**
   * Record a request (optionally skip based on config)
   */
  async recordRequest(key: string, wasSuccessful: boolean): Promise<void> {
    if (this.config.skipSuccessfulRequests && wasSuccessful) {
      return;
    }

    if (this.config.skipFailedRequests && !wasSuccessful) {
      return;
    }

    // Just to record, we don't care about the result
    await this.checkLimit(key);
  }
}

/**
 * Multi-tier rate limiter (e.g., per-IP, per-user, per-API-key)
 */
export class MultiTierRateLimiter {
  private limiters: Map<string, RateLimiter> = new Map();

  constructor(
    private configs: Record<string, RateLimitConfig>
  ) {
    for (const [tier, config] of Object.entries(configs)) {
      this.limiters.set(tier, new RateLimiter(config));
    }
  }

  /**
   * Check all rate limits for different tiers
   */
  async checkLimits(keys: Record<string, string>): Promise<Record<string, RateLimitInfo>> {
    const results: Record<string, RateLimitInfo> = {};

    for (const [tier, key] of Object.entries(keys)) {
      const limiter = this.limiters.get(tier);
      if (limiter) {
        results[tier] = await limiter.checkLimit(key);
      }
    }

    return results;
  }

  /**
   * Get limiter for specific tier
   */
  getLimiter(tier: string): RateLimiter | undefined {
    return this.limiters.get(tier);
  }
}
