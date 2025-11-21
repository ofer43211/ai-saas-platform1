# Database Integration Tests

This directory contains integration tests that use real databases to verify repository implementations and database operations.

## Test Suites

### 1. SQLite In-Memory Tests
**File:** `sqlite-integration.test.ts`

- **Fast execution** - Uses SQLite in-memory database
- **No setup required** - Runs immediately
- **Good for CI/CD** - Quick and reliable
- **Coverage:**
  - CRUD operations
  - Unique constraints
  - Foreign key relationships
  - Transactions (commit/rollback)
  - Complex joins and aggregations
  - Bulk operations
  - Index performance

### 2. PostgreSQL Tests (with Testcontainers)
**File:** `postgres-integration.test.ts`

- **Production-like** - Tests with real PostgreSQL
- **Isolated** - Each test gets fresh container
- **Comprehensive** - Tests PostgreSQL-specific features
- **Requirements:** Docker must be installed and running
- **Coverage:**
  - All SQLite test coverage
  - PostgreSQL-specific types (JSONB, Arrays)
  - Advanced constraints (CHECK, EXCLUDE)
  - CASCADE DELETE/UPDATE
  - Full-text search
  - Database triggers

## Running the Tests

### SQLite Tests (Recommended for most cases)
```bash
# Run SQLite integration tests
npm test -- tests/database/sqlite-integration.test.ts

# Watch mode
npm run test:watch -- tests/database/sqlite-integration.test.ts
```

### PostgreSQL Tests (Requires Docker)
```bash
# Make sure Docker is running
docker ps

# Run PostgreSQL integration tests
npm test -- tests/database/postgres-integration.test.ts
```

### All Database Tests
```bash
npm test -- tests/database
```

## Setup for PostgreSQL Tests

### Install Testcontainers
```bash
npm install --save-dev testcontainers @testcontainers/postgresql pg
npm install --save-dev @types/pg
```

### Verify Docker
```bash
# Check Docker is running
docker --version
docker ps

# Pull PostgreSQL image (optional, but faster)
docker pull postgres:15-alpine
```

## Test Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  email_verified BOOLEAN DEFAULT FALSE,
  role VARCHAR(50) DEFAULT 'user',
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Subscriptions Table
```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL,
  billing_period VARCHAR(20) NOT NULL,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  api_calls_used INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Payments Table
```sql
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(50) NOT NULL,
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Best Practices

### 1. Use Transactions for Data Integrity
```typescript
await db.run('BEGIN TRANSACTION');
try {
  await userRepo.create(userData);
  await subscriptionRepo.create(subscriptionData);
  await db.run('COMMIT');
} catch (error) {
  await db.run('ROLLBACK');
  throw error;
}
```

### 2. Clean Up Between Tests
```typescript
beforeEach(async () => {
  // Clean in reverse order of foreign keys
  await db.run('DELETE FROM payments');
  await db.run('DELETE FROM subscriptions');
  await db.run('DELETE FROM users');
});
```

### 3. Test Constraints
```typescript
// Unique constraint
it('should enforce unique email', async () => {
  await userRepo.create({ email: 'test@example.com', ... });
  await expect(
    userRepo.create({ email: 'test@example.com', ... })
  ).rejects.toThrow(/unique constraint/i);
});

// Foreign key constraint
it('should enforce foreign key', async () => {
  await expect(
    subscriptionRepo.create({ userId: 99999, ... })
  ).rejects.toThrow(/foreign key constraint/i);
});
```

### 4. Test Performance
```typescript
it('should use indexes efficiently', async () => {
  // Create many records
  for (let i = 0; i < 1000; i++) {
    await repo.create({ ... });
  }

  // Lookup should be fast
  const start = Date.now();
  const result = await repo.findByEmail('test500@example.com');
  const duration = Date.now() - start;

  expect(duration).toBeLessThan(10); // Fast with index
});
```

## CI/CD Integration

### SQLite (Recommended for CI)
SQLite tests run immediately without any setup, making them perfect for CI/CD:

```yaml
# .github/workflows/test.yml
- name: Run database integration tests
  run: npm test -- tests/database/sqlite-integration.test.ts
```

### PostgreSQL (Optional)
If you want to test with PostgreSQL in CI:

```yaml
# .github/workflows/test.yml
services:
  postgres:
    image: postgres:15-alpine
    env:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: test
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

- name: Run PostgreSQL integration tests
  run: npm test -- tests/database/postgres-integration.test.ts
  env:
    DATABASE_URL: postgresql://postgres:test@localhost:5432/test
```

## Troubleshooting

### SQLite Issues
- **UNIQUE constraint failed:** Check for duplicate data in test
- **FOREIGN KEY constraint failed:** Ensure parent record exists
- **Table not found:** Verify schema creation in `beforeAll`

### PostgreSQL/Testcontainers Issues
- **Docker not running:** Start Docker Desktop
- **Port conflict:** Kill process using port 5432
- **Image pull timeout:** Pre-pull image or increase timeout
- **Permission denied:** Check Docker permissions

### Performance Issues
- **Slow tests:** Use transactions for bulk operations
- **Memory issues:** Clean up data in `afterEach`
- **Connection leaks:** Always close connections in `afterAll`

## Migration from Mock to Real DB

When migrating from mock repositories to real database:

1. **Keep mock tests** for unit testing
2. **Add DB tests** for integration testing
3. **Use same interface** (IUserRepository, etc.)
4. **Test both implementations** to ensure consistency

Example:
```typescript
// Unit test with mock
describe('AuthService with Mock', () => {
  let authService: AuthService;
  let mockRepo: MockUserRepository;

  beforeEach(() => {
    mockRepo = new MockUserRepository();
    authService = new AuthService(mockRepo, ...);
  });

  // Fast, isolated tests
});

// Integration test with real DB
describe('AuthService with Real DB', () => {
  let authService: AuthService;
  let dbRepo: SQLiteUserRepository;
  let db: TestDatabase;

  beforeAll(async () => {
    db = new TestDatabase();
    await db.createSchema();
    dbRepo = new SQLiteUserRepository(db);
    authService = new AuthService(dbRepo, ...);
  });

  // Slower, but tests actual DB behavior
});
```

## Resources

- [SQLite Documentation](https://www.sqlite.org/docs.html)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Testcontainers for Node.js](https://node.testcontainers.org/)
- [Database Testing Best Practices](https://martinfowler.com/articles/database-testing.html)
