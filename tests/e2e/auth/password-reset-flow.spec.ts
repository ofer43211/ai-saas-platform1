import { test, expect } from '@playwright/test';

test.describe('Password Reset Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should successfully request password reset', async ({ page }) => {
    // Navigate to password reset page
    await page.click('text=Log In');
    await page.click('text=/forgot.*password/i');

    await expect(page).toHaveURL(/.*forgot-password|reset-password/);

    // Enter email
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.click('button[type="submit"]');

    // Verify success message
    await expect(page.locator('text=/reset.*link.*sent|check.*email/i')).toBeVisible();
  });

  test('should show error for non-existent email', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.click('button[type="submit"]');

    // For security, might show success message even for non-existent emails
    // OR show error - depends on security policy
    await expect(page.locator('text=/email.*sent|user.*not.*found/i')).toBeVisible();
  });

  test('should validate email format on password reset request', async ({ page }) => {
    await page.goto('/forgot-password');

    await page.fill('input[name="email"]', 'invalid-email');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid.*email/i')).toBeVisible();
  });

  test('should rate limit password reset requests', async ({ page }) => {
    await page.goto('/forgot-password');

    const email = 'testuser@example.com';

    // Send multiple reset requests
    for (let i = 0; i < 3; i++) {
      await page.fill('input[name="email"]', email);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);

      // Navigate back if redirected
      if (!page.url().includes('forgot-password')) {
        await page.goto('/forgot-password');
      }
    }

    // Additional request should be rate limited
    await page.fill('input[name="email"]', email);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/too many.*requests|try again later/i')).toBeVisible();
  });

  test('should successfully reset password with valid token', async ({ page }) => {
    // Simulate clicking reset link from email
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    // Fill in new password
    await page.fill('input[name="newPassword"]', 'NewSecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass123!');

    await page.click('button[type="submit"]');

    // Verify success message
    await expect(page.locator('text=/password.*reset.*successful|password.*updated/i')).toBeVisible();

    // Should redirect to login
    await page.waitForURL(/.*login/);

    // Test login with new password
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'NewSecurePass123!');
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should show error for expired reset token', async ({ page }) => {
    const expiredToken = 'expired-token-123';
    await page.goto(`/reset-password?token=${expiredToken}`);

    await page.fill('input[name="newPassword"]', 'NewSecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/token.*expired|link.*expired/i')).toBeVisible();
  });

  test('should show error for invalid reset token', async ({ page }) => {
    const invalidToken = 'invalid-token-123';
    await page.goto(`/reset-password?token=${invalidToken}`);

    await page.fill('input[name="newPassword"]', 'NewSecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid.*token|invalid.*link/i')).toBeVisible();
  });

  test('should validate password strength on reset', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    // Try weak password
    await page.fill('input[name="newPassword"]', '123');
    await page.fill('input[name="confirmPassword"]', '123');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/password.*weak|password.*requirements/i')).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    await page.fill('input[name="newPassword"]', 'NewSecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'DifferentPass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/passwords.*match/i')).toBeVisible();
  });

  test('should prevent reuse of old password', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    // Try to use the same password
    await page.fill('input[name="newPassword"]', 'SecurePass123!'); // Old password
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/cannot.*reuse|choose.*different.*password/i')).toBeVisible();
  });

  test('should invalidate token after successful password reset', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';

    // First reset (should succeed)
    await page.goto(`/reset-password?token=${resetToken}`);
    await page.fill('input[name="newPassword"]', 'NewSecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'NewSecurePass123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/password.*reset.*successful/i')).toBeVisible();

    // Try to use same token again
    await page.goto(`/reset-password?token=${resetToken}`);
    await page.fill('input[name="newPassword"]', 'AnotherPass123!');
    await page.fill('input[name="confirmPassword"]', 'AnotherPass123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/token.*invalid|token.*used/i')).toBeVisible();
  });

  test('should show password strength indicator', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    const passwordInput = page.locator('input[name="newPassword"]');

    // Weak password
    await passwordInput.fill('123');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/weak/i);

    // Medium password
    await passwordInput.fill('Password123');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/medium|fair/i);

    // Strong password
    await passwordInput.fill('SecurePass123!@#');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/strong/i);
  });

  test('should allow password visibility toggle', async ({ page }) => {
    const resetToken = 'valid-reset-token-123';
    await page.goto(`/reset-password?token=${resetToken}`);

    const passwordInput = page.locator('input[name="newPassword"]');
    await passwordInput.fill('SecurePass123!');

    // Should be hidden by default
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Toggle visibility
    await page.click('[data-testid="toggle-password-visibility"]');
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Toggle back
    await page.click('[data-testid="toggle-password-visibility"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });
});
