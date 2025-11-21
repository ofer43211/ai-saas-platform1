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

This project has **world-class test coverage** with **600+ tests** across multiple categories:

- **Unit Tests:** 241 tests with 95%+ coverage
- **E2E Tests:** 88 comprehensive user journey tests
- **Integration Tests:** 90+ multi-service integration tests
- **Performance Tests:** 20+ benchmark tests
- **Resilience Tests:** 25+ error recovery tests
- **Concurrency Tests:** 30+ race condition tests
- **Database Tests:** Real database integration tests
- **Contract Tests:** API contract validation (Pact)
- **Mutation Tests:** Test quality verification (Stryker)

### Running Tests

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit           # Unit tests
npm run test:integration    # Integration tests
npm run test:e2e           # End-to-end tests (Playwright)
npm run test:database       # Database integration tests
npm run test:performance    # Performance benchmarks
npm run test:resilience     # Error recovery tests
npm run test:concurrency    # Race condition tests
npm run test:contract       # API contract tests
npm run test:mutation       # Mutation testing (slow!)
npm run test:all           # All tests (unit + E2E)

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
- **[MUTATION_TESTING.md](./MUTATION_TESTING.md)** - Guide to mutation testing with Stryker
- **[tests/database/README.md](./tests/database/README.md)** - Database integration testing guide
- **[tests/contract/README.md](./tests/contract/README.md)** - Contract testing guide

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
│   ├── integration/      # Multi-service integration tests
│   ├── database/         # Real database integration tests
│   ├── contract/         # API contract tests (Pact)
│   ├── performance/      # Performance benchmarks
│   ├── resilience/       # Error recovery tests
│   ├── concurrency/      # Race condition tests
│   └── examples/         # Example/template tests
├── .github/workflows/    # CI/CD configuration
├── stryker.conf.json     # Mutation testing config
└── playwright.config.ts  # E2E testing config
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