import { test, expect } from '@playwright/test';

test.describe('User Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Navigate to login page
    await page.click('text=Log In');
    await expect(page).toHaveURL(/.*login/);

    // Fill in login form
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify redirect to dashboard
    await page.waitForURL(/.*dashboard/);
    await expect(page.locator('text=/welcome|dashboard/i')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'WrongPassword123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid.*credentials|incorrect.*password/i')).toBeVisible();
    // Should remain on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show error for non-existent user', async ({ page }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'nonexistent@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/user.*not found|invalid.*credentials/i')).toBeVisible();
  });

  test('should implement rate limiting after multiple failed attempts', async ({ page }) => {
    await page.click('text=Log In');

    // Attempt to login 5 times with wrong password
    for (let i = 0; i < 5; i++) {
      await page.fill('input[name="email"]', 'testuser@example.com');
      await page.fill('input[name="password"]', 'WrongPassword!');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // 6th attempt should be rate limited
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'WrongPassword!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=/too many.*attempts|account.*locked|try again later/i')).toBeVisible();
  });

  test('should persist login session after page refresh', async ({ page }) => {
    // Login first
    await page.click('text=Log In');
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*dashboard/);

    // Refresh the page
    await page.reload();

    // Should still be logged in and on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.click('text=Log In');
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    await page.waitForURL(/.*dashboard/);

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('text=Log Out');

    // Should redirect to home or login page
    await page.waitForURL(/\/(login|home)?/);

    // Verify logged out state
    await expect(page.locator('text=Log In')).toBeVisible();

    // Try to access dashboard directly
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show "Remember Me" functionality', async ({ page, context }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    // Check "Remember Me"
    await page.check('input[name="rememberMe"]');

    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Close and reopen browser (new page in same context)
    await page.close();
    const newPage = await context.newPage();
    await newPage.goto('/');

    // Should still be logged in
    await expect(newPage).toHaveURL(/.*dashboard/);
  });

  test('should validate email format on login', async ({ page }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/invalid.*email/i')).toBeVisible();
  });

  test('should show loading state during login', async ({ page }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    // Button should be disabled and show loading state
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText(/logging in|loading/i);
  });

  test('should redirect to original destination after login', async ({ page }) => {
    // Try to access a protected page while logged out
    await page.goto('/dashboard/settings');

    // Should redirect to login with return URL
    await expect(page).toHaveURL(/.*login.*returnUrl/);

    // Login
    await page.fill('input[name="email"]', 'testuser@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');

    // Should redirect back to settings
    await page.waitForURL(/.*settings/);
  });

  test('should handle login with unverified email', async ({ page }) => {
    await page.click('text=Log In');

    await page.fill('input[name="email"]', 'unverified@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    // Should show message about email verification
    await expect(page.locator('text=/verify.*email|email not verified/i')).toBeVisible();

    // Should offer resend verification option
    await expect(page.locator('text=/resend.*verification/i')).toBeVisible();
  });

  test('should show password reset link', async ({ page }) => {
    await page.click('text=Log In');

    await expect(page.locator('text=/forgot.*password/i')).toBeVisible();

    await page.click('text=/forgot.*password/i');

    await expect(page).toHaveURL(/.*forgot-password|reset-password/);
  });
});
