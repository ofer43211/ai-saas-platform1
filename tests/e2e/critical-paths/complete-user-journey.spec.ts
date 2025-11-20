import { test, expect } from '@playwright/test';

test.describe('Complete User Journey', () => {
  test('should complete full user lifecycle: signup → verify → subscribe → use AI → upgrade', async ({ page }) => {
    const timestamp = Date.now();
    const email = `journey-test-${timestamp}@example.com`;

    // STEP 1: Registration
    await page.goto('/');
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecureJourney123!@#');
    await page.fill('input[name="confirmPassword"]', 'SecureJourney123!@#');
    await page.fill('input[name="name"]', 'Journey Test User');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/registration.*successful|verify.*email/i')).toBeVisible();

    // STEP 2: Email Verification (simulate click from email)
    // In real scenario, extract token from email. Here we'll skip to verified state
    // or use a test endpoint to verify the account
    await page.goto('/verify-email?token=test-verification-token');
    await expect(page.locator('text=/email.*verified|verification.*successful/i')).toBeVisible();

    // STEP 3: Login
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecureJourney123!@#');
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*dashboard/);
    await expect(page.locator('text=/welcome|dashboard/i')).toBeVisible();

    // STEP 4: Explore Dashboard (Free Plan)
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Free');

    // Check usage limits for Free plan
    await page.goto('/dashboard/billing');
    await expect(page.locator('text=/100.*API calls/i')).toBeVisible();
    await expect(page.locator('text=/10,?000.*tokens/i')).toBeVisible();

    // STEP 5: Try AI Features on Free Plan
    await page.goto('/dashboard/ai');
    await page.selectOption('select[name="model"]', 'gpt-3.5-turbo'); // Free tier model

    await page.fill('textarea[name="prompt"]', 'Write a short greeting');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // Verify usage updated
    await page.goto('/dashboard/billing');
    await expect(page.locator('[data-testid="api-calls-usage"]')).toContainText(/[1-9]/); // At least 1 call used

    // STEP 6: Upgrade to Basic Plan
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    // Fill payment details
    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/26');
    await page.fill('input[name="cvc"]', '123');
    await page.fill('input[name="zipCode"]', '12345');

    await page.click('button[type="submit"]:has-text("Subscribe")');

    await expect(page.locator('text=/subscription.*successful|welcome.*basic/i')).toBeVisible({
      timeout: 15000,
    });

    // STEP 7: Verify Basic Plan Features
    await page.goto('/dashboard/billing');
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Basic');
    await expect(page.locator('text=/1,?000.*API calls/i')).toBeVisible();
    await expect(page.locator('text=/100,?000.*tokens/i')).toBeVisible();

    // STEP 8: Use AI with Higher Limits
    await page.goto('/dashboard/ai');
    await page.selectOption('select[name="model"]', 'gpt-4'); // Premium model

    await page.fill('textarea[name="prompt"]', 'Write a detailed explanation of quantum computing');
    await page.fill('input[name="maxTokens"]', '500');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 15000 });

    const response = await page.locator('[data-testid="ai-response"]').textContent();
    expect(response?.length).toBeGreaterThan(100); // Should be detailed

    // STEP 9: Save Conversation
    await page.click('button:has-text("Save")');
    await page.fill('input[name="conversationName"]', 'Quantum Computing Discussion');
    await page.click('button:has-text("Save Conversation")');

    await expect(page.locator('text=/saved.*successfully/i')).toBeVisible();

    // STEP 10: View Billing History
    await page.goto('/dashboard/billing/history');
    await expect(page.locator('[data-testid="payment-record"]')).toBeVisible();
    await expect(page.locator('text=/\\$29/i')).toBeVisible(); // Basic plan charge

    // STEP 11: Upgrade to Pro Plan
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-pro"]').locator('button:has-text("Upgrade")').click();

    await expect(page.locator('text=/proration|prorated/i')).toBeVisible();
    await page.click('button:has-text("Confirm Upgrade")');

    await expect(page.locator('text=/upgraded.*successfully|now.*pro/i')).toBeVisible();

    // STEP 12: Verify Pro Plan Features
    await page.goto('/dashboard/billing');
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Pro');
    await expect(page.locator('text=/10,?000.*API calls/i')).toBeVisible();
    await expect(page.locator('text=/1,?000,?000.*tokens|1M.*tokens/i')).toBeVisible();
    await expect(page.locator('text=/priority.*support/i')).toBeVisible();

    // STEP 13: Use Premium Features
    await page.goto('/dashboard/ai');

    // Enable streaming
    await page.check('input[name="stream"]');

    // Use Claude 3 Opus (premium model)
    await page.selectOption('select[name="model"]', 'claude-3-opus');

    await page.fill('textarea[name="prompt"]', 'Analyze the implications of AI on society');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible();
    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // STEP 14: Access Conversation History
    await page.goto('/dashboard/ai/history');
    await expect(page.locator('text=Quantum Computing Discussion')).toBeVisible();

    // Load previous conversation
    await page.click('text=Quantum Computing Discussion');
    await expect(page.locator('text=/quantum computing/i')).toBeVisible();

    // STEP 15: Update Profile
    await page.goto('/dashboard/profile');
    await page.fill('input[name="name"]', 'Journey Test User Pro');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=/profile.*updated/i')).toBeVisible();

    // STEP 16: Manage Payment Methods
    await page.goto('/dashboard/billing/payment-methods');

    // Add second payment method
    await page.click('button:has-text("Add Payment Method")');
    await page.fill('input[name="cardNumber"]', '5555555555554444');
    await page.fill('input[name="expiry"]', '06/27');
    await page.fill('input[name="cvc"]', '456');
    await page.click('button:has-text("Save")');

    await expect(page.locator('text=/•••• 4444/i')).toBeVisible();

    // STEP 17: Export Usage Report
    await page.goto('/dashboard/billing/usage-details');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Usage")'),
    ]);

    expect(download.suggestedFilename()).toMatch(/usage/i);

    // STEP 18: Verify all features accessible
    // Check that user has full access to Pro features
    await page.goto('/dashboard');

    const sections = [
      'AI Playground',
      'Conversations',
      'Usage Stats',
      'Billing',
      'Settings',
    ];

    for (const section of sections) {
      await expect(page.locator(`text=${section}`)).toBeVisible();
    }

    // STEP 19: Test Logout and Re-login
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Log Out');

    await page.waitForURL(/\/(login|home)?$/);

    // Login again
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecureJourney123!@#');
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*dashboard/);

    // Verify subscription persisted
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Pro');

    // STEP 20: Final Verification
    // Everything should still work after logout/login
    await page.goto('/dashboard/ai/history');
    await expect(page.locator('text=Quantum Computing Discussion')).toBeVisible();
  });

  test('should handle complete error recovery journey', async ({ page }) => {
    const timestamp = Date.now();
    const email = `error-test-${timestamp}@example.com`;

    // Registration
    await page.goto('/');
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

    await page.click('button[type="submit"]');
    await expect(page.locator('text=/registration.*successful/i')).toBeVisible();

    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Try to subscribe with failing card
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    await page.fill('input[name="cardNumber"]', '4000000000000002'); // Card that fails
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator('text=/card.*declined|payment.*failed/i')).toBeVisible();

    // Retry with valid card
    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    // Should succeed
    await expect(page.locator('text=/subscription.*successful/i')).toBeVisible();

    // Try AI request that fails
    await page.goto('/dashboard/ai');

    // Simulate network error
    await page.context().setOffline(true);

    await page.fill('textarea[name="prompt"]', 'Test');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('text=/network.*error|connection.*failed/i')).toBeVisible();

    // Recover
    await page.context().setOffline(false);

    await page.click('button:has-text("Retry")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // Everything should work now
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Basic');
  });
});
