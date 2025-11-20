# AI SaaS Platform

A production-ready AI-powered SaaS platform with comprehensive authentication, payment processing, and AI integration features.

## Features

- **Authentication & Authorization**
  - User registration and login
  - JWT token management
  - Email verification
  - Password reset functionality
  - Role-based access control (RBAC)

- **AI Integration**
  - Multiple AI model support (GPT-4, Claude 3, Cohere)
  - Streaming responses
  - Token counting and management
  - Retry logic with exponential backoff
  - Rate limiting

- **Payment & Billing**
  - Stripe integration
  - 4-tier subscription model (Free, Basic, Pro, Enterprise)
  - Usage tracking (API calls, tokens)
  - Plan upgrades/downgrades
  - Refund handling
  - Webhook verification

- **Security**
  - Input validation and sanitization
  - SQL injection prevention
  - XSS prevention
  - CSRF protection
  - Rate limiting
  - Secure password hashing (PBKDF2)

## Testing

This project has **world-class test coverage** with **534+ tests** across multiple categories:

- **Unit Tests:** 241 tests with 95%+ coverage
- **E2E Tests:** 88 comprehensive user journey tests
- **Integration Tests:** 90+ multi-service integration tests
- **Performance Tests:** 20+ benchmark tests
- **Resilience Tests:** 25+ error recovery tests
- **Concurrency Tests:** 30+ race condition tests

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit           # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests (Playwright)

# Generate coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Test Documentation

- **[TEST_COVERAGE_IMPROVEMENTS.md](./TEST_COVERAGE_IMPROVEMENTS.md)** - Comprehensive overview of all test improvements
- **[TEST_IMPLEMENTATION_SUMMARY.md](./TEST_IMPLEMENTATION_SUMMARY.md)** - Implementation summary and metrics
- **[TEST_COVERAGE_ANALYSIS.md](./TEST_COVERAGE_ANALYSIS.md)** - Detailed coverage analysis and strategy
- **[TESTING_QUICK_START.md](./TESTING_QUICK_START.md)** - Get started with testing in 5 minutes

## Project Structure

```
ai-saas-platform/
├── src/
│   ├── services/          # Business logic (Auth, AI, Payment)
│   ├── middleware/        # Express middleware (Rate limiter)
│   ├── utils/            # Utilities (Crypto, Security, Validation)
│   └── types/            # TypeScript type definitions
├── tests/
│   ├── e2e/              # End-to-end tests (Playwright)
│   ├── integration/      # Integration tests
│   ├── performance/      # Performance benchmarks
│   ├── resilience/       # Error recovery tests
│   └── concurrency/      # Race condition tests
└── .github/workflows/    # CI/CD configuration
```

## CI/CD

Automated testing runs on:
- Every push to main/develop/claude/* branches
- Every pull request
- Node.js versions: 18.x, 20.x

Tests include:
- Linting
- Unit tests
- Integration tests
- E2E tests
- Coverage reporting (Codecov)

## Development

```bash
# Install dependencies
npm install

# Run tests in watch mode
npm run test:watch

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

## License

ISC