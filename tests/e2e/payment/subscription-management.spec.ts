import { test, expect } from '@playwright/test';

test.describe('Subscription Management Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login as user with Basic subscription
    await page.goto('/login');
    await page.fill('input[name="email"]', 'basic-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
  });

  test('should successfully upgrade from Basic to Pro plan', async ({ page }) => {
    await page.goto('/dashboard/billing');

    // View current plan
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Basic');

    // Click upgrade
    await page.click('button:has-text("Upgrade Plan")');

    // Select Pro plan
    await page.locator('[data-testid="plan-pro"]').locator('button:has-text("Upgrade")').click();

    // Confirm upgrade with proration info
    await expect(page.locator('text=/proration|prorated/i')).toBeVisible();
    await expect(page.locator('text=/immediately charged/i')).toBeVisible();

    await page.click('button:has-text("Confirm Upgrade")');

    // Verify success
    await expect(page.locator('text=/upgraded.*successfully|now.*pro/i')).toBeVisible();
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Pro');
  });

  test('should successfully downgrade from Basic to Free plan', async ({ page }) => {
    await page.goto('/dashboard/billing');

    await page.click('button:has-text("Change Plan")');
    await page.locator('[data-testid="plan-free"]').locator('button').click();

    // Show downgrade warning
    await expect(page.locator('text=/will lose access|features will be limited/i')).toBeVisible();

    // Confirm downgrade
    await page.click('button:has-text("Confirm Downgrade")');

    // Verify success
    await expect(page.locator('text=/downgraded|changes.*effective/i')).toBeVisible();

    // Downgrade might be effective at end of billing period
    await expect(page.locator('text=/effective.*end.*billing period|remains active until/i')).toBeVisible();
  });

  test('should cancel subscription successfully', async ({ page }) => {
    await page.goto('/dashboard/billing');

    await page.click('text=/cancel.*subscription/i');

    // Show cancellation warning
    await expect(page.locator('text=/sure.*want.*cancel/i')).toBeVisible();
    await expect(page.locator('text=/will lose access/i')).toBeVisible();

    // Confirm cancellation
    await page.click('button:has-text("Confirm Cancellation")');

    // Verify success
    await expect(page.locator('text=/subscription.*cancelled|cancellation.*successful/i')).toBeVisible();

    // Should show when access ends
    await expect(page.locator('text=/access until|ends on/i')).toBeVisible();
  });

  test('should reactivate cancelled subscription', async ({ page }) => {
    // Assume subscription is cancelled but still active until end of period
    await page.goto('/dashboard/billing');

    await expect(page.locator('text=/cancelled|scheduled.*cancellation/i')).toBeVisible();

    // Reactivate
    await page.click('button:has-text("Reactivate")');

    // Verify success
    await expect(page.locator('text=/reactivated|subscription.*restored/i')).toBeVisible();
    await expect(page.locator('[data-testid="subscription-status"]')).toContainText(/active/i);
  });

  test('should display usage metrics and limits', async ({ page }) => {
    await page.goto('/dashboard/billing');

    // Verify API calls usage
    await expect(page.locator('[data-testid="api-calls-usage"]')).toBeVisible();
    await expect(page.locator('text=/\\d+.*\\/.*1,?000.*API calls/i')).toBeVisible();

    // Verify token usage
    await expect(page.locator('[data-testid="token-usage"]')).toBeVisible();
    await expect(page.locator('text=/\\d+.*\\/.*100,?000.*tokens/i')).toBeVisible();

    // Verify usage progress bars
    await expect(page.locator('[data-testid="api-calls-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="token-progress"]')).toBeVisible();
  });

  test('should show warning when approaching usage limits', async ({ page }) => {
    // Assume user has used 90% of API calls
    await page.goto('/dashboard');

    // Should show warning banner
    await expect(page.locator('text=/approaching.*limit|90%.*used/i')).toBeVisible();

    // Click to view details or upgrade
    await page.click('text=/upgrade|view details/i');

    // Should navigate to billing page
    await expect(page).toHaveURL(/.*billing/);
  });

  test('should block API usage when limit exceeded', async ({ page }) => {
    // Assume user has exceeded limit
    await page.goto('/dashboard/ai');

    // Try to make AI request
    await page.fill('textarea[name="prompt"]', 'Test prompt');
    await page.click('button:has-text("Generate")');

    // Should show error
    await expect(page.locator('text=/limit.*exceeded|upgrade.*plan/i')).toBeVisible();

    // Should show upgrade CTA
    await expect(page.locator('button:has-text("Upgrade Now")')).toBeVisible();
  });

  test('should display billing history', async ({ page }) => {
    await page.goto('/dashboard/billing/history');

    // Verify table headers
    await expect(page.locator('text=Date')).toBeVisible();
    await expect(page.locator('text=Amount')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();

    // Verify at least one payment record
    await expect(page.locator('[data-testid="payment-record"]').first()).toBeVisible();

    // Verify download invoice button
    await expect(page.locator('button:has-text("Download")')).toBeVisible();
  });

  test('should download invoice PDF', async ({ page }) => {
    await page.goto('/dashboard/billing/history');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-invoice"]').first().click(),
    ]);

    // Verify file name
    expect(download.suggestedFilename()).toMatch(/invoice.*\.pdf/i);
  });

  test('should update payment method', async ({ page }) => {
    await page.goto('/dashboard/billing/payment-methods');

    // Add new payment method
    await page.click('button:has-text("Add Payment Method")');

    await page.fill('input[name="cardNumber"]', '5555555555554444'); // Mastercard
    await page.fill('input[name="expiry"]', '06/27');
    await page.fill('input[name="cvc"]', '456');

    await page.click('button:has-text("Save")');

    // Verify new card added
    await expect(page.locator('text=/•••• 4444/i')).toBeVisible();

    // Set as default
    await page.locator('[data-testid="payment-method"]').filter({ hasText: '4444' })
      .locator('button:has-text("Set as Default")').click();

    await expect(page.locator('text=/default.*payment.*method.*updated/i')).toBeVisible();
  });

  test('should delete payment method', async ({ page }) => {
    await page.goto('/dashboard/billing/payment-methods');

    // Assume user has at least 2 payment methods
    const paymentMethods = page.locator('[data-testid="payment-method"]');
    const count = await paymentMethods.count();

    if (count > 1) {
      // Delete non-default payment method
      await paymentMethods.nth(1).locator('button:has-text("Delete")').click();

      // Confirm deletion
      await page.click('button:has-text("Confirm Delete")');

      await expect(page.locator('text=/payment.*method.*removed/i')).toBeVisible();
    }
  });

  test('should prevent deletion of last payment method on active subscription', async ({ page }) => {
    await page.goto('/dashboard/billing/payment-methods');

    // Try to delete the only/default payment method
    await page.locator('[data-testid="payment-method"]').first()
      .locator('button:has-text("Delete")').click();

    // Should show error
    await expect(page.locator('text=/cannot delete|must have.*payment method/i')).toBeVisible();
  });

  test('should display next billing date and amount', async ({ page }) => {
    await page.goto('/dashboard/billing');

    // Verify next billing info
    await expect(page.locator('[data-testid="next-billing-date"]')).toBeVisible();
    await expect(page.locator('text=/next.*billing|renews on/i')).toBeVisible();
    await expect(page.locator('text=/\\$29.00/i')).toBeVisible(); // Basic plan price
  });

  test('should handle failed payment retry', async ({ page }) => {
    // Assume last payment failed
    await page.goto('/dashboard');

    // Should show payment failed banner
    await expect(page.locator('text=/payment.*failed|update.*payment.*method/i')).toBeVisible();

    // Click to update payment
    await page.click('button:has-text("Update Payment")');

    // Update card
    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button:has-text("Retry Payment")');

    // Verify success
    await expect(page.locator('text=/payment.*successful|subscription.*active/i')).toBeVisible();
  });

  test('should send email notifications for subscription changes', async ({ page }) => {
    await page.goto('/dashboard/billing/notifications');

    // Verify email preferences
    await expect(page.locator('input[name="billingReminders"]')).toBeChecked();
    await expect(page.locator('input[name="usageAlerts"]')).toBeChecked();
    await expect(page.locator('input[name="paymentReceipts"]')).toBeChecked();

    // Disable usage alerts
    await page.uncheck('input[name="usageAlerts"]');
    await page.click('button:has-text("Save Preferences")');

    await expect(page.locator('text=/preferences.*saved/i')).toBeVisible();
  });
});
