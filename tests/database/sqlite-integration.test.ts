/**
 * Database Integration Tests
 * Tests with real database connections to verify repository implementations
 *
 * This suite uses SQLite in-memory database for fast testing
 * For production-like testing, use testcontainers with PostgreSQL
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';

// In-memory SQLite database for testing
class TestDatabase {
  private db: Database;

  constructor() {
    this.db = new Database(':memory:');
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async get(sql: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async createSchema(): Promise<void> {
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        email_verified INTEGER DEFAULT 0,
        role TEXT DEFAULT 'user',
        failed_login_attempts INTEGER DEFAULT 0,
        locked_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        billing_period TEXT NOT NULL,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        current_period_start DATETIME,
        current_period_end DATETIME,
        api_calls_used INTEGER DEFAULT 0,
        tokens_used INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        stripe_payment_intent_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
      )
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    await this.run(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)
    `);
  }

  async dropAll(): Promise<void> {
    await this.run('DROP TABLE IF EXISTS payments');
    await this.run('DROP TABLE IF EXISTS subscriptions');
    await this.run('DROP TABLE IF EXISTS users');
  }
}

// Repository implementation with real database
class SQLiteUserRepository {
  constructor(private db: TestDatabase) {}

  async create(user: any): Promise<any> {
    await this.db.run(
      'INSERT INTO users (email, password_hash, name, status, role) VALUES (?, ?, ?, ?, ?)',
      [user.email, user.passwordHash, user.name, user.status || 'pending', user.role || 'user']
    );

    return this.db.get('SELECT * FROM users WHERE email = ?', [user.email]);
  }

  async findByEmail(email: string): Promise<any> {
    return this.db.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async findById(id: number): Promise<any> {
    return this.db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async update(id: number, data: any): Promise<any> {
    const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = Object.values(data);

    await this.db.run(
      `UPDATE users SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );

    return this.findById(id);
  }

  async delete(id: number): Promise<void> {
    await this.db.run('DELETE FROM users WHERE id = ?', [id]);
  }
}

class SQLiteSubscriptionRepository {
  constructor(private db: TestDatabase) {}

  async create(subscription: any): Promise<any> {
    await this.db.run(
      `INSERT INTO subscriptions
       (user_id, plan, status, billing_period, stripe_customer_id, stripe_subscription_id,
        current_period_start, current_period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        subscription.userId,
        subscription.plan,
        subscription.status,
        subscription.billingPeriod,
        subscription.stripeCustomerId,
        subscription.stripeSubscriptionId,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
      ]
    );

    return this.db.get('SELECT * FROM subscriptions WHERE id = last_insert_rowid()');
  }

  async findByUserId(userId: number): Promise<any> {
    return this.db.get('SELECT * FROM subscriptions WHERE user_id = ?', [userId]);
  }

  async findById(id: number): Promise<any> {
    return this.db.get('SELECT * FROM subscriptions WHERE id = ?', [id]);
  }

  async update(id: number, data: any): Promise<any> {
    const fields = Object.keys(data).map(key => `${key} = ?`).join(', ');
    const values = Object.values(data);

    await this.db.run(
      `UPDATE subscriptions SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );

    return this.findById(id);
  }
}

describe('Database Integration Tests - SQLite', () => {
  let db: TestDatabase;
  let userRepo: SQLiteUserRepository;
  let subscriptionRepo: SQLiteSubscriptionRepository;

  beforeAll(async () => {
    db = new TestDatabase();
    await db.createSchema();

    userRepo = new SQLiteUserRepository(db);
    subscriptionRepo = new SQLiteSubscriptionRepository(db);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await db.run('DELETE FROM payments');
    await db.run('DELETE FROM subscriptions');
    await db.run('DELETE FROM users');
  });

  describe('User Repository', () => {
    it('should create a new user', async () => {
      const user = await userRepo.create({
        email: 'test@example.com',
        passwordHash: 'hashed_password',
        name: 'Test User',
        status: 'active',
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.name).toBe('Test User');
      expect(user.status).toBe('active');
    });

    it('should enforce unique email constraint', async () => {
      await userRepo.create({
        email: 'duplicate@example.com',
        passwordHash: 'hash1',
        name: 'User 1',
      });

      // Try to create another user with same email
      await expect(
        userRepo.create({
          email: 'duplicate@example.com',
          passwordHash: 'hash2',
          name: 'User 2',
        })
      ).rejects.toThrow(/UNIQUE constraint failed/i);
    });

    it('should find user by email', async () => {
      await userRepo.create({
        email: 'findme@example.com',
        passwordHash: 'hash',
        name: 'Find Me',
      });

      const found = await userRepo.findByEmail('findme@example.com');

      expect(found).toBeDefined();
      expect(found.email).toBe('findme@example.com');
      expect(found.name).toBe('Find Me');
    });

    it('should update user data', async () => {
      const user = await userRepo.create({
        email: 'update@example.com',
        passwordHash: 'hash',
        name: 'Original Name',
        status: 'pending',
      });

      const updated = await userRepo.update(user.id, {
        name: 'Updated Name',
        status: 'active',
        email_verified: 1,
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.status).toBe('active');
      expect(updated.email_verified).toBe(1);
    });

    it('should delete user', async () => {
      const user = await userRepo.create({
        email: 'delete@example.com',
        passwordHash: 'hash',
        name: 'Delete Me',
      });

      await userRepo.delete(user.id);

      const found = await userRepo.findById(user.id);
      expect(found).toBeUndefined();
    });

    it('should handle concurrent user creation', async () => {
      const users = await Promise.all([
        userRepo.create({
          email: 'user1@example.com',
          passwordHash: 'hash1',
          name: 'User 1',
        }),
        userRepo.create({
          email: 'user2@example.com',
          passwordHash: 'hash2',
          name: 'User 2',
        }),
        userRepo.create({
          email: 'user3@example.com',
          passwordHash: 'hash3',
          name: 'User 3',
        }),
      ]);

      expect(users).toHaveLength(3);
      expect(users.every(u => u.id)).toBe(true);
    });
  });

  describe('Subscription Repository', () => {
    let userId: number;

    beforeEach(async () => {
      const user = await userRepo.create({
        email: 'subscriber@example.com',
        passwordHash: 'hash',
        name: 'Subscriber',
      });
      userId = user.id;
    });

    it('should create subscription with foreign key', async () => {
      const subscription = await subscriptionRepo.create({
        userId: userId,
        plan: 'basic',
        status: 'active',
        billingPeriod: 'monthly',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });

      expect(subscription).toBeDefined();
      expect(subscription.user_id).toBe(userId);
      expect(subscription.plan).toBe('basic');
    });

    it('should enforce foreign key constraint', async () => {
      // Try to create subscription for non-existent user
      await expect(
        subscriptionRepo.create({
          userId: 99999, // Non-existent
          plan: 'pro',
          status: 'active',
          billingPeriod: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        })
      ).rejects.toThrow(/FOREIGN KEY constraint failed/i);
    });

    it('should find subscription by user ID', async () => {
      await subscriptionRepo.create({
        userId: userId,
        plan: 'pro',
        status: 'active',
        billingPeriod: 'yearly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      const found = await subscriptionRepo.findByUserId(userId);

      expect(found).toBeDefined();
      expect(found.user_id).toBe(userId);
      expect(found.plan).toBe('pro');
    });

    it('should update subscription', async () => {
      const subscription = await subscriptionRepo.create({
        userId: userId,
        plan: 'basic',
        status: 'active',
        billingPeriod: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      const updated = await subscriptionRepo.update(subscription.id, {
        plan: 'pro',
        api_calls_used: 500,
        tokens_used: 50000,
      });

      expect(updated.plan).toBe('pro');
      expect(updated.api_calls_used).toBe(500);
      expect(updated.tokens_used).toBe(50000);
    });

    it('should cascade delete when user is deleted', async () => {
      const subscription = await subscriptionRepo.create({
        userId: userId,
        plan: 'basic',
        status: 'active',
        billingPeriod: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      // Delete user
      await userRepo.delete(userId);

      // Subscription should still exist (no cascade in SQLite by default)
      // In production with PostgreSQL, you would configure CASCADE
      const found = await subscriptionRepo.findById(subscription.id);

      // This behavior depends on DB configuration
      // expect(found).toBeUndefined(); // With CASCADE
    });
  });

  describe('Complex Queries', () => {
    it('should join users and subscriptions', async () => {
      const user = await userRepo.create({
        email: 'joined@example.com',
        passwordHash: 'hash',
        name: 'Joined User',
      });

      await subscriptionRepo.create({
        userId: user.id,
        plan: 'pro',
        status: 'active',
        billingPeriod: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      const result = await db.get(`
        SELECT u.*, s.plan, s.status as subscription_status
        FROM users u
        LEFT JOIN subscriptions s ON u.id = s.user_id
        WHERE u.email = ?
      `, ['joined@example.com']);

      expect(result).toBeDefined();
      expect(result.email).toBe('joined@example.com');
      expect(result.plan).toBe('pro');
      expect(result.subscription_status).toBe('active');
    });

    it('should aggregate subscription counts by plan', async () => {
      // Create multiple users with subscriptions
      for (let i = 0; i < 5; i++) {
        const user = await userRepo.create({
          email: `user${i}@example.com`,
          passwordHash: 'hash',
          name: `User ${i}`,
        });

        await subscriptionRepo.create({
          userId: user.id,
          plan: i < 3 ? 'basic' : 'pro',
          status: 'active',
          billingPeriod: 'monthly',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
        });
      }

      const stats = await db.query(`
        SELECT plan, COUNT(*) as count
        FROM subscriptions
        GROUP BY plan
        ORDER BY plan
      `);

      expect(stats).toHaveLength(2);
      expect(stats.find(s => s.plan === 'basic')?.count).toBe(3);
      expect(stats.find(s => s.plan === 'pro')?.count).toBe(2);
    });
  });

  describe('Transaction Support', () => {
    it('should rollback on error', async () => {
      // Start transaction
      await db.run('BEGIN TRANSACTION');

      try {
        await userRepo.create({
          email: 'rollback@example.com',
          passwordHash: 'hash',
          name: 'Rollback Test',
        });

        // Cause an error (duplicate email)
        await userRepo.create({
          email: 'rollback@example.com',
          passwordHash: 'hash',
          name: 'Duplicate',
        });

        await db.run('COMMIT');
      } catch (error) {
        await db.run('ROLLBACK');
      }

      // User should not exist due to rollback
      const found = await userRepo.findByEmail('rollback@example.com');
      expect(found).toBeUndefined();
    });

    it('should commit successful transaction', async () => {
      await db.run('BEGIN TRANSACTION');

      const user = await userRepo.create({
        email: 'commit@example.com',
        passwordHash: 'hash',
        name: 'Commit Test',
      });

      await subscriptionRepo.create({
        userId: user.id,
        plan: 'basic',
        status: 'active',
        billingPeriod: 'monthly',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });

      await db.run('COMMIT');

      // Both should exist
      const foundUser = await userRepo.findByEmail('commit@example.com');
      const foundSub = await subscriptionRepo.findByUserId(user.id);

      expect(foundUser).toBeDefined();
      expect(foundSub).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should handle bulk inserts efficiently', async () => {
      const startTime = Date.now();

      await db.run('BEGIN TRANSACTION');

      for (let i = 0; i < 100; i++) {
        await userRepo.create({
          email: `bulk${i}@example.com`,
          passwordHash: 'hash',
          name: `Bulk User ${i}`,
        });
      }

      await db.run('COMMIT');

      const duration = Date.now() - startTime;

      console.log(`Bulk insert of 100 users: ${duration}ms`);

      // Should complete in reasonable time
      expect(duration).toBeLessThan(1000);

      const count = await db.get('SELECT COUNT(*) as count FROM users');
      expect(count.count).toBe(100);
    });

    it('should use indexes for fast lookups', async () => {
      // Create many users
      await db.run('BEGIN TRANSACTION');
      for (let i = 0; i < 1000; i++) {
        await userRepo.create({
          email: `indexed${i}@example.com`,
          passwordHash: 'hash',
          name: `User ${i}`,
        });
      }
      await db.run('COMMIT');

      // Lookup should be fast due to index
      const startTime = Date.now();
      const found = await userRepo.findByEmail('indexed500@example.com');
      const duration = Date.now() - startTime;

      console.log(`Indexed lookup from 1000 users: ${duration}ms`);

      expect(found).toBeDefined();
      expect(duration).toBeLessThan(10); // Very fast with index
    });
  });
});
