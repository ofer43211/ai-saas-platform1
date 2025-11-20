# Mutation Testing with Stryker

## What is Mutation Testing?

Mutation testing is a method to evaluate the **quality of your tests** by introducing small changes (mutations) to your source code and checking if your tests catch these bugs.

### How It Works

1. **Stryker mutates your code** - Changes operators, values, conditions
2. **Runs your tests** against each mutation
3. **Checks if tests fail** - If tests catch the mutation = "Killed" ✅
4. **Reports results** - Mutation score = % of mutations killed

### Example Mutations

```typescript
// Original code
if (user.age >= 18) {
  return true;
}

// Mutation 1: Change >= to >
if (user.age > 18) {  // Should be caught by test!
  return true;
}

// Mutation 2: Change 18 to 17
if (user.age >= 17) {  // Should be caught by test!
  return true;
}

// Mutation 3: Remove if condition
return true;  // Should be caught by test!
```

If your tests **don't catch** these mutations, it means your tests are not thorough enough!

## Why Mutation Testing?

- ✅ **Measure test quality** - Not just code coverage, but test effectiveness
- ✅ **Find weak tests** - Discover tests that don't actually validate behavior
- ✅ **Improve confidence** - Know your tests really work
- ✅ **Find edge cases** - Discover scenarios you didn't test

## Installation

```bash
# Install Stryker and required plugins
npm install --save-dev @stryker-mutator/core
npm install --save-dev @stryker-mutator/jest-runner
npm install --save-dev @stryker-mutator/typescript-checker
```

## Configuration

Configuration file: `stryker.conf.json`

### Key Settings

```json
{
  "testRunner": "jest",              // Use Jest for testing
  "mutate": ["src/**/*.ts"],         // Files to mutate
  "thresholds": {
    "high": 80,                      // 80%+ is excellent
    "low": 60,                       // 60-80% is acceptable
    "break": 50                      // <50% fails the build
  },
  "coverageAnalysis": "perTest",     // Faster analysis
  "maxConcurrentTestRunners": 2      // Parallel execution
}
```

## Running Mutation Tests

### Full Mutation Test
```bash
# Run on all code
npx stryker run

# This takes time! (~10-30 minutes for large codebases)
```

### Test Specific Files
```bash
# Test only auth service
npx stryker run --mutate "src/services/auth.service.ts"

# Test only payment service
npx stryker run --mutate "src/services/payment.service.ts"
```

### Quick Test (Development)
```bash
# Test with limited mutations (faster)
npx stryker run --mutate "src/services/auth.service.ts" --maxConcurrentTestRunners 4
```

## Understanding Results

### Mutation Score
```
Mutation Score: 85.4%
```

- **80%+** - Excellent test quality ✅
- **60-80%** - Good, but room for improvement ⚠️
- **<60%** - Weak tests, needs work ❌

### Mutation Status

#### Killed ✅
```
Mutant: Changed >= to >
Status: Killed
Test: should reject users under 18
```
**Good!** Your test caught this bug.

#### Survived ❌
```
Mutant: Changed && to ||
Status: Survived
No tests failed
```
**Bad!** You need a test for this scenario.

#### Timeout ⏱️
```
Mutant: Removed condition
Status: Timeout
Test took too long
```
Mutation caused infinite loop or very slow execution.

#### No Coverage 🔍
```
Mutant: In uncovered code
Status: NoCoverage
Code is not covered by tests
```
Add tests for this code first.

## Example Report

```
Mutation testing report:
┌─────────────────────────────────────┬─────────┬─────────┬─────────┐
│ File                                │ Killed  │ Survived│ Score   │
├─────────────────────────────────────┼─────────┼─────────┼─────────┤
│ src/services/auth.service.ts        │ 45/48   │ 3       │ 93.8%   │
│ src/services/payment.service.ts     │ 38/42   │ 4       │ 90.5%   │
│ src/services/ai.service.ts          │ 35/40   │ 5       │ 87.5%   │
│ src/middleware/rate-limiter.ts      │ 28/32   │ 4       │ 87.5%   │
│ src/utils/security.ts               │ 50/55   │ 5       │ 90.9%   │
│ src/utils/validation.ts             │ 15/15   │ 0       │ 100%    │
│ src/utils/crypto.ts                 │ 12/14   │ 2       │ 85.7%   │
├─────────────────────────────────────┼─────────┼─────────┼─────────┤
│ Total                               │ 223/246 │ 23      │ 90.7%   │
└─────────────────────────────────────┴─────────┴─────────┴─────────┘

Overall mutation score: 90.7% (target: 80%)
```

## Improving Mutation Score

### 1. Find Survived Mutants

```bash
# View HTML report
open reports/mutation/html/index.html
```

Click on "Survived" mutations to see what wasn't caught.

### 2. Add Missing Tests

Example survived mutant:
```typescript
// Original
if (attempts > 5) {
  lockAccount();
}

// Mutation: Changed > to >=
if (attempts >= 5) {  // SURVIVED!
  lockAccount();
}
```

Fix by adding test:
```typescript
it('should NOT lock account at exactly 5 attempts', () => {
  // Test the boundary condition
  user.failedAttempts = 5;
  const result = authService.checkLockout(user);
  expect(result.locked).toBe(false);
});

it('should lock account after 5 attempts', () => {
  user.failedAttempts = 6;
  const result = authService.checkLockout(user);
  expect(result.locked).toBe(true);
});
```

### 3. Test Edge Cases

Common survived mutants:
- **Boundary conditions**: `>` vs `>=`, `<` vs `<=`
- **Boolean operators**: `&&` vs `||`
- **Arithmetic**: `+` vs `-`, `*` vs `/`
- **Return values**: `true` vs `false`, `null` vs `undefined`

### 4. Remove Dead Code

If mutations in code have "No Coverage":
```typescript
// Either add tests for this code
it('should handle special case', () => {
  // Test the uncovered code
});

// Or remove the dead code
// Delete unused functions
```

## Best Practices

### 1. Start Small
```bash
# Don't run on entire codebase first time
# Start with one well-tested file
npx stryker run --mutate "src/utils/validation.ts"
```

### 2. Set Realistic Thresholds
```json
{
  "thresholds": {
    "high": 80,      // Start here
    "low": 60,       // Warn below this
    "break": 50      // Fail build below this
  }
}
```

### 3. Exclude Generated Code
```json
{
  "ignorePatterns": [
    "**/*.d.ts",
    "**/*.interface.ts",
    "**/types/**",
    "dist/**"
  ]
}
```

### 4. Use in CI/CD Carefully
```yaml
# Only run on main/PR, not every commit
- name: Mutation Testing
  if: github.event_name == 'pull_request'
  run: npx stryker run --mutate "src/**/*.ts"
```

### 5. Incremental Testing
```bash
# Test only changed files
npx stryker run --mutate "$(git diff --name-only main | grep '\.ts$')"
```

## Common Mutation Types

### Arithmetic Operator
```typescript
// Original: total = price + tax
// Mutants: total = price - tax
//          total = price * tax
//          total = price / tax
```

### Relational Operator
```typescript
// Original: if (age >= 18)
// Mutants: if (age > 18)
//          if (age <= 18)
//          if (age < 18)
//          if (age == 18)
```

### Logical Operator
```typescript
// Original: if (isValid && isActive)
// Mutants: if (isValid || isActive)
//          if (!isValid && isActive)
//          if (isValid && !isActive)
```

### Conditional Boundary
```typescript
// Original: for (let i = 0; i < 10; i++)
// Mutants: for (let i = 0; i <= 10; i++)
//          for (let i = 1; i < 10; i++)
```

### Return Value
```typescript
// Original: return true
// Mutants: return false
//          return null
//          return undefined
```

### String Literal
```typescript
// Original: status = 'active'
// Mutants: status = ''
//          status = 'inactive'
```

## Troubleshooting

### Stryker Takes Too Long
```json
{
  "maxConcurrentTestRunners": 4,     // Increase parallelism
  "timeoutMS": 30000,                 // Reduce timeout
  "coverageAnalysis": "perTest"       // Faster than "all"
}
```

### Out of Memory
```bash
# Increase Node memory
NODE_OPTIONS=--max_old_space_size=4096 npx stryker run
```

### Too Many Mutations
```json
{
  "mutator": {
    "excludedMutations": [
      "StringLiteral",    // Skip string mutations
      "BlockStatement"    // Skip block removals
    ]
  }
}
```

### Tests Keep Timing Out
```json
{
  "timeoutMS": 60000,
  "timeoutFactor": 2,    // Tests can take 2x normal time
  "jest": {
    "enableFindRelatedTests": true  // Only run relevant tests
  }
}
```

## Integration with CI/CD

### GitHub Actions
```yaml
name: Mutation Tests

on:
  pull_request:
    branches: [main, develop]

jobs:
  mutation-test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3

      - name: Install dependencies
        run: npm ci

      - name: Run mutation tests
        run: npx stryker run

      - name: Check mutation score
        run: |
          SCORE=$(cat reports/mutation/mutation.json | jq '.score')
          if (( $(echo "$SCORE < 80" | bc -l) )); then
            echo "Mutation score too low: $SCORE%"
            exit 1
          fi

      - name: Upload report
        uses: actions/upload-artifact@v3
        with:
          name: mutation-report
          path: reports/mutation/
```

## When to Run Mutation Tests

### ✅ Run mutation tests:
- Before merging major features
- When refactoring critical code
- To verify test quality
- During code reviews
- Weekly/monthly in CI

### ❌ Don't run every:
- Commit (too slow)
- Push (waste resources)
- On unchanged code

## Comparing with Code Coverage

| Metric | Code Coverage | Mutation Score |
|--------|---------------|----------------|
| **Measures** | Lines executed | Tests effectiveness |
| **Speed** | Fast | Slow |
| **Accuracy** | Can be misleading | More accurate |
| **Use** | Basic quality | Advanced quality |

### Example

```typescript
function divide(a, b) {
  if (b === 0) {
    return 0;  // Bug! Should throw error
  }
  return a / b;
}

// Bad test (100% coverage, but doesn't verify behavior)
it('should divide', () => {
  divide(10, 2);  // No assertion!
});
```

**Code Coverage:** 100% ✅
**Mutation Score:** 0% ❌ (mutations survive)

Fix:
```typescript
it('should divide correctly', () => {
  expect(divide(10, 2)).toBe(5);
});

it('should handle division by zero', () => {
  expect(() => divide(10, 0)).toThrow();
});
```

**Mutation Score:** 100% ✅

## Resources

- [Stryker Mutator Documentation](https://stryker-mutator.io/)
- [Mutation Testing Guide](https://stryker-mutator.io/docs/General/mutations/)
- [Jest Runner Plugin](https://stryker-mutator.io/docs/stryker-js/jest-runner/)
- [Best Practices](https://stryker-mutator.io/docs/General/guides/testing/)

## Summary

Mutation testing is a powerful tool to:
- ✅ Verify test quality
- ✅ Find weak tests
- ✅ Improve test coverage
- ✅ Catch edge cases
- ✅ Increase confidence

**Target:** 80%+ mutation score for critical code

**Use sparingly:** It's slow, but worth it for important code!
