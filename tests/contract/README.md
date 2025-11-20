# Contract Testing with Pact

Contract tests verify that our service correctly integrates with external APIs by defining and testing the "contract" (expected request/response format) between services.

## What is Contract Testing?

Contract testing ensures:
1. **We send correctly formatted requests** to external APIs
2. **We handle responses** in the expected format
3. **Breaking changes are detected** before production
4. **Tests run without hitting real APIs** (faster, more reliable)

## Benefits

- ✅ **Catch API changes early** - Know when providers update their APIs
- ✅ **Document API expectations** - Living documentation of integrations
- ✅ **Fast tests** - No need to hit real APIs
- ✅ **Reliable** - No network issues or API downtime
- ✅ **Safe** - Test error scenarios without real API calls

## Test Suites

### 1. Stripe API Contracts
**File:** `stripe-api.contract.test.ts`

Tests for Stripe payment processing:
- Customer creation
- Subscription management
- Payment intents
- Webhook events
- Error handling (invalid requests, rate limits)

### 2. OpenAI API Contracts
**File:** `openai-api.contract.test.ts`

Tests for OpenAI chat completions:
- Chat completion requests
- Streaming responses
- Function calling
- Different models (GPT-4, GPT-3.5)
- Error scenarios (rate limits, invalid models, context length)

### 3. Anthropic (Claude) API Contracts
**File:** `anthropic-api.contract.test.ts` (if implemented)

Tests for Claude API:
- Message creation
- Streaming
- Different Claude models
- Error handling

## Setup

### Install Pact
```bash
npm install --save-dev @pact-foundation/pact
```

### Verify Installation
```bash
npx pact --version
```

## Running Contract Tests

### All Contract Tests
```bash
npm test -- tests/contract
```

### Specific Provider
```bash
# Stripe tests
npm test -- tests/contract/stripe-api.contract.test.ts

# OpenAI tests
npm test -- tests/contract/openai-api.contract.test.ts
```

### With Coverage
```bash
npm run test:coverage -- tests/contract
```

## How Contract Tests Work

### 1. Define Expected Interaction
```typescript
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
    body: 'email=test@example.com',
  },
  willRespondWith: {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      id: 'cus_test123',
      email: 'test@example.com',
    },
  },
});
```

### 2. Execute Request
```typescript
const customer = await stripeClient.createCustomer('test@example.com');
```

### 3. Verify Contract
```typescript
expect(customer.id).toBe('cus_test123');
expect(customer.email).toBe('test@example.com');
```

### 4. Pact Verifies
- Request matches expected format
- Response is handled correctly
- Generates pact file (contract definition)

## Pact Files

Contract definitions are saved in `/pacts` directory:
```
pacts/
├── ai-saas-platform-stripe-api.json
├── ai-saas-platform-openai-api.json
└── ai-saas-platform-anthropic-api.json
```

These files:
- Document the integration contract
- Can be shared with API providers for verification
- Can be published to Pact Broker for collaboration

## Testing Scenarios

### Success Cases
```typescript
it('should create subscription successfully', async () => {
  await provider.addInteraction({
    // ... define successful interaction
  });

  const subscription = await client.createSubscription(...);

  expect(subscription.status).toBe('active');
});
```

### Error Cases
```typescript
it('should handle rate limit error', async () => {
  await provider.addInteraction({
    state: 'rate limit exceeded',
    // ... define error response
    willRespondWith: {
      status: 429,
      body: {
        error: { message: 'Rate limit exceeded' }
      }
    }
  });

  await expect(client.request()).rejects.toThrow(/rate limit/i);
});
```

### Edge Cases
```typescript
it('should handle empty response', async () => {
  await provider.addInteraction({
    // ... response with no data
    willRespondWith: {
      status: 200,
      body: { data: [] }
    }
  });

  const result = await client.fetch();
  expect(result.data).toEqual([]);
});
```

## Best Practices

### 1. Test All Critical Paths
- Success scenarios
- Common error scenarios
- Rate limiting
- Authentication failures
- Validation errors

### 2. Use Realistic Data
```typescript
// Good - Realistic test data
body: {
  email: 'test@example.com',
  amount: 2900,  // $29.00 in cents
  currency: 'usd'
}

// Avoid - Unrealistic data
body: {
  email: 'test',
  amount: 999999999,
  currency: 'xyz'
}
```

### 3. Test Response Structure
```typescript
it('should have correct response structure', async () => {
  const response = await client.create(...);

  // Verify all expected fields exist
  expect(response).toHaveProperty('id');
  expect(response).toHaveProperty('created');
  expect(response).toHaveProperty('status');
});
```

### 4. Keep Contracts Up-to-Date
When APIs change:
1. Update contract tests
2. Verify all tests pass
3. Update integration code if needed
4. Regenerate pact files

## Troubleshooting

### Pact Mock Server Not Starting
```bash
# Check if port is in use
lsof -i :8989

# Kill process on port
kill -9 <PID>

# Or use different port in test config
```

### Contract Verification Fails
```bash
# Enable detailed logging
logLevel: 'debug'

# Check pact.log file
cat logs/pact.log
```

### Request/Response Mismatch
- Verify request headers (especially Content-Type)
- Check URL encoding for form data
- Ensure JSON structure matches exactly
- Validate authentication headers

## Integration with CI/CD

### Run in CI Pipeline
```yaml
# .github/workflows/test.yml
- name: Run contract tests
  run: npm test -- tests/contract

- name: Publish pacts
  run: npx pact-broker publish pacts --broker-base-url ${{ secrets.PACT_BROKER_URL }}
```

### Pact Broker (Optional)
For team collaboration:
1. Set up Pact Broker
2. Publish consumer contracts
3. Provider verifies contracts
4. Ensures compatibility

```bash
# Publish pacts
npx pact-broker publish \
  pacts \
  --broker-base-url https://your-pact-broker.com \
  --consumer-app-version $(git rev-parse HEAD)

# Verify pacts (provider side)
npx pact-broker verify \
  --provider Stripe-API \
  --broker-base-url https://your-pact-broker.com
```

## When to Use Contract Tests

### ✅ Use contract tests when:
- Integrating with external APIs
- API has well-defined contract
- Want to detect breaking changes early
- Need fast, reliable integration tests
- Testing error scenarios

### ❌ Don't use contract tests for:
- Internal services (use integration tests)
- Unstable/changing APIs
- APIs without clear contracts
- Complete end-to-end validation (use E2E tests)

## Resources

- [Pact Documentation](https://docs.pact.io/)
- [Pact Best Practices](https://docs.pact.io/implementation_guides/javascript/best_practices)
- [Stripe API Documentation](https://stripe.com/docs/api)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
- [Contract Testing Guide](https://martinfowler.com/articles/consumerDrivenContracts.html)

## Example: Full Workflow

```typescript
describe('Payment Flow Contract', () => {
  it('should complete full payment workflow', async () => {
    // 1. Create customer
    await provider.addInteraction({ /* customer creation */ });
    const customer = await stripe.createCustomer(...);

    // 2. Create subscription
    await provider.addInteraction({ /* subscription creation */ });
    const subscription = await stripe.createSubscription(...);

    // 3. Create payment intent
    await provider.addInteraction({ /* payment intent */ });
    const payment = await stripe.createPaymentIntent(...);

    // Verify complete flow
    expect(customer.id).toBeDefined();
    expect(subscription.customer).toBe(customer.id);
    expect(payment.customer).toBe(customer.id);
  });
});
```
