# Testing Quick Start Guide

This guide will help you get your testing infrastructure up and running quickly.

## Setup (5 minutes)

### 1. Install Dependencies

```bash
npm install
```

This will install all testing dependencies including:
- Jest (test runner)
- ts-jest (TypeScript support)
- Playwright (E2E testing)
- Testing Library (React component testing)
- Supertest (API testing)

### 2. Verify Installation

```bash
npm test
```

You should see example tests passing. This confirms your testing setup is working.

## Writing Your First Tests

### Unit Test Example

Create a file: `src/utils/calculator.ts`
```typescript
export class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }

  multiply(a: number, b: number): number {
    return a * b;
  }

  divide(a: number, b: number): number {
    if (b === 0) {
      throw new Error('Cannot divide by zero');
    }
    return a / b;
  }
}
```

Create test: `src/utils/__tests__/calculator.test.ts`
```typescript
import { Calculator } from '../calculator';

describe('Calculator', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(calculator.add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(calculator.add(-2, -3)).toBe(-5);
    });
  });

  describe('divide', () => {
    it('should divide two numbers', () => {
      expect(calculator.divide(10, 2)).toBe(5);
    });

    it('should throw error when dividing by zero', () => {
      expect(() => calculator.divide(10, 0)).toThrow('Cannot divide by zero');
    });
  });
});
```

Run the test:
```bash
npm test -- calculator.test.ts
```

### Integration Test Example

Create file: `src/services/user.service.ts`
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
}

export class UserService {
  private users: User[] = [];

  async create(email: string, name: string): Promise<User> {
    // Check if user already exists
    const exists = this.users.find(u => u.email === email);
    if (exists) {
      throw new Error('User already exists');
    }

    const user: User = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      name,
    };

    this.users.push(user);
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    return this.users.find(u => u.email === email);
  }
}
```

Create test: `tests/integration/user.service.test.ts`
```typescript
import { UserService } from '../../src/services/user.service';

describe('UserService Integration', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  it('should create a new user', async () => {
    const user = await userService.create('test@example.com', 'Test User');

    expect(user).toHaveProperty('id');
    expect(user.email).toBe('test@example.com');
    expect(user.name).toBe('Test User');
  });

  it('should find user by email', async () => {
    await userService.create('test@example.com', 'Test User');
    const found = await userService.findByEmail('test@example.com');

    expect(found).toBeDefined();
    expect(found?.name).toBe('Test User');
  });

  it('should throw error for duplicate email', async () => {
    await userService.create('test@example.com', 'Test User');

    await expect(
      userService.create('test@example.com', 'Another User')
    ).rejects.toThrow('User already exists');
  });
});
```

## Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Generate coverage report
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

## Coverage Reports

After running `npm run test:coverage`, open:
```
coverage/lcov-report/index.html
```

This shows:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

## Best Practices Checklist

- [ ] Write tests before or alongside code (TDD)
- [ ] Keep tests isolated and independent
- [ ] Use descriptive test names
- [ ] Follow AAA pattern (Arrange, Act, Assert)
- [ ] Mock external dependencies
- [ ] Test edge cases and error scenarios
- [ ] Maintain >80% code coverage
- [ ] Run tests before committing

## Common Testing Patterns

### 1. Testing Async Functions
```typescript
it('should fetch user data', async () => {
  const userData = await fetchUser('123');
  expect(userData.id).toBe('123');
});
```

### 2. Testing Promises
```typescript
it('should reject with error', async () => {
  await expect(fetchUser('invalid')).rejects.toThrow('User not found');
});
```

### 3. Testing with Mocks
```typescript
const mockFn = jest.fn().mockResolvedValue({ id: '123' });

it('should call mock function', async () => {
  const result = await mockFn();
  expect(mockFn).toHaveBeenCalledTimes(1);
  expect(result.id).toBe('123');
});
```

### 4. Testing Timers
```typescript
jest.useFakeTimers();

it('should delay execution', () => {
  const callback = jest.fn();
  setTimeout(callback, 1000);

  jest.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
});
```

### 5. Snapshot Testing
```typescript
it('should match snapshot', () => {
  const data = { name: 'Test', value: 123 };
  expect(data).toMatchSnapshot();
});
```

## Next Steps

1. Read the comprehensive [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md)
2. Set up CI/CD with GitHub Actions (already configured in `.github/workflows/test.yml`)
3. Start writing tests for your core features
4. Aim for 80%+ coverage on critical paths
5. Configure code coverage reporting service (Codecov, Coveralls)

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/docs/)
- [Playwright Docs](https://playwright.dev/docs/intro)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## Troubleshooting

### Tests not running?
```bash
# Clear Jest cache
npm test -- --clearCache

# Reinstall dependencies
rm -rf node_modules
npm install
```

### TypeScript errors in tests?
Make sure your test files are included in `tsconfig.json`:
```json
{
  "include": ["src/**/*", "tests/**/*"]
}
```

### Coverage not accurate?
Check `collectCoverageFrom` in `jest.config.js` to ensure all source files are included.

## Questions?

Refer to the detailed analysis in [TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md) for comprehensive testing strategies and best practices.
