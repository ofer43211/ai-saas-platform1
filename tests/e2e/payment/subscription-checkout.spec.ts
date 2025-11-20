import { test, expect } from '@playwright/test';

test.describe('Subscription Checkout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
  });

  test('should display all available subscription plans', async ({ page }) => {
    await page.goto('/pricing');

    // Verify all plans are displayed
    await expect(page.locator('text=Free')).toBeVisible();
    await expect(page.locator('text=Basic')).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
    await expect(page.locator('text=Enterprise')).toBeVisible();

    // Verify pricing
    await expect(page.locator('text=/\\$29.*month|29.*\\/.*mo/i')).toBeVisible(); // Basic
    await expect(page.locator('text=/\\$99.*month|99.*\\/.*mo/i')).toBeVisible(); // Pro
    await expect(page.locator('text=/\\$499.*month|499.*\\/.*mo/i')).toBeVisible(); // Enterprise
  });

  test('should successfully upgrade from Free to Basic plan', async ({ page }) => {
    await page.goto('/pricing');

    // Click upgrade on Basic plan
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    // Should navigate to checkout
    await expect(page).toHaveURL(/.*checkout/);

    // Verify plan details
    await expect(page.locator('text=Basic Plan')).toBeVisible();
    await expect(page.locator('text=/\\$29.*month/i')).toBeVisible();

    // Fill in payment details (Stripe test card)
    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');
    await page.fill('input[name="zipCode"]', '12345');

    // Submit payment
    await page.click('button[type="submit"]:has-text("Subscribe")');

    // Wait for success message
    await expect(page.locator('text=/subscription.*successful|welcome.*basic/i')).toBeVisible({
      timeout: 10000,
    });

    // Verify redirect to dashboard
    await page.waitForURL(/.*dashboard/);

    // Verify plan badge
    await expect(page.locator('[data-testid="current-plan"]')).toContainText('Basic');
  });

  test('should show error for invalid credit card', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    // Fill in invalid card
    await page.fill('input[name="cardNumber"]', '4000000000000002'); // Stripe test card that fails
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/card.*declined|payment.*failed/i')).toBeVisible();
  });

  test('should show error for expired card', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-pro"]').locator('button:has-text("Upgrade")').click();

    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/20'); // Expired
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/card.*expired|expiration.*invalid/i')).toBeVisible();
  });

  test('should support annual billing with discount', async ({ page }) => {
    await page.goto('/pricing');

    // Toggle to annual billing
    await page.click('[data-testid="billing-toggle-annual"]');

    // Verify annual pricing (should show discount)
    await expect(page.locator('text=/\\$290.*year|save.*20%/i')).toBeVisible(); // Basic annual
    await expect(page.locator('text=/\\$990.*year/i')).toBeVisible(); // Pro annual

    // Start checkout with annual plan
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    // Verify annual pricing in checkout
    await expect(page.locator('text=/\\$290.*year/i')).toBeVisible();
    await expect(page.locator('text=/billed annually/i')).toBeVisible();
  });

  test('should display plan features comparison', async ({ page }) => {
    await page.goto('/pricing');

    // Verify Basic plan features
    const basicPlan = page.locator('[data-testid="plan-basic"]');
    await expect(basicPlan.locator('text=/1,?000.*API.*calls/i')).toBeVisible();
    await expect(basicPlan.locator('text=/100,?000.*tokens/i')).toBeVisible();

    // Verify Pro plan features
    const proPlan = page.locator('[data-testid="plan-pro"]');
    await expect(proPlan.locator('text=/10,?000.*API.*calls/i')).toBeVisible();
    await expect(proPlan.locator('text=/1,?000,?000.*tokens|1M.*tokens/i')).toBeVisible();
    await expect(proPlan.locator('text=/priority.*support/i')).toBeVisible();
  });

  test('should prevent downgrade to Free plan when usage exceeds limits', async ({ page }) => {
    // Assume user is on Pro plan with high usage
    await page.goto('/dashboard/billing');

    await page.click('text=/change plan|manage subscription/i');

    // Try to downgrade to Free
    await page.locator('[data-testid="plan-free"]').locator('button').click();

    // Should show warning about usage
    await expect(page.locator('text=/current usage exceeds|reduce usage/i')).toBeVisible();

    // Downgrade button should be disabled or show confirmation
    const confirmButton = page.locator('button:has-text("Confirm Downgrade")');
    if (await confirmButton.isVisible()) {
      await expect(confirmButton).toBeDisabled();
    }
  });

  test('should show loading state during payment processing', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    // Verify loading state
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText(/processing|please wait/i);
  });

  test('should handle 3D Secure authentication', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-pro"]').locator('button:has-text("Upgrade")').click();

    // Use 3D Secure test card
    await page.fill('input[name="cardNumber"]', '4000002500003155');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    await page.click('button[type="submit"]');

    // Should show 3D Secure modal (iframe from Stripe)
    await expect(page.frameLocator('iframe[name*="stripe"]').locator('text=/authenticate|complete/i')).toBeVisible({
      timeout: 10000,
    });

    // Complete authentication
    await page.frameLocator('iframe[name*="stripe"]').locator('button:has-text("Complete")').click();

    // Should succeed after authentication
    await expect(page.locator('text=/subscription.*successful/i')).toBeVisible();
  });

  test('should allow applying promo code', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    // Apply promo code
    await page.click('text=/have.*promo.*code|apply.*coupon/i');
    await page.fill('input[name="promoCode"]', 'TESTPROMO20');
    await page.click('button:has-text("Apply")');

    // Verify discount applied
    await expect(page.locator('text=/20%.*off|discount.*applied/i')).toBeVisible();
    await expect(page.locator('text=/\\$23.20/i')).toBeVisible(); // $29 - 20% = $23.20
  });

  test('should show error for invalid promo code', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    await page.click('text=/have.*promo.*code/i');
    await page.fill('input[name="promoCode"]', 'INVALID CODE');
    await page.click('button:has-text("Apply")');

    await expect(page.locator('text=/invalid.*code|promo.*not.*found/i')).toBeVisible();
  });

  test('should save payment method for future use', async ({ page }) => {
    await page.goto('/pricing');
    await page.locator('[data-testid="plan-basic"]').locator('button:has-text("Upgrade")').click();

    await page.fill('input[name="cardNumber"]', '4242424242424242');
    await page.fill('input[name="expiry"]', '12/25');
    await page.fill('input[name="cvc"]', '123');

    // Check "Save payment method"
    await page.check('input[name="savePaymentMethod"]');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/subscription.*successful/i')).toBeVisible();

    // Go to payment methods page
    await page.goto('/dashboard/billing/payment-methods');

    // Verify card is saved
    await expect(page.locator('text=/•••• 4242/i')).toBeVisible();
    await expect(page.locator('text=/expires.*12\\/25/i')).toBeVisible();
  });
});
