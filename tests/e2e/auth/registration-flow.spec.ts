import { test, expect } from '@playwright/test';

test.describe('User Registration Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should successfully register a new user with valid credentials', async ({ page }) => {
    // Navigate to registration page
    await page.click('text=Sign Up');
    await expect(page).toHaveURL(/.*register/);

    // Fill in registration form
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', 'SecurePass123!@#');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!@#');
    await page.fill('input[name="name"]', 'Test User');

    // Submit form
    await page.click('button[type="submit"]');

    // Verify success message
    await expect(page.locator('text=Registration successful')).toBeVisible();

    // Verify redirect to dashboard or email verification page
    await page.waitForURL(/\/(dashboard|verify-email)/);
  });

  test('should show error for invalid email format', async ({ page }) => {
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', 'invalid-email');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    // Verify error message
    await expect(page.locator('text=/invalid email/i')).toBeVisible();
  });

  test('should show error for weak password', async ({ page }) => {
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', '123'); // Too weak
    await page.fill('input[name="confirmPassword"]', '123');

    await page.click('button[type="submit"]');

    // Verify password strength error
    await expect(page.locator('text=/password.*weak|must be at least/i')).toBeVisible();
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'DifferentPass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/passwords.*match/i')).toBeVisible();
  });

  test('should show error for duplicate email', async ({ page }) => {
    await page.click('text=Sign Up');

    // Use a known existing email (you might need to seed this in test setup)
    await page.fill('input[name="email"]', 'existing@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/email.*already.*exists|already registered/i')).toBeVisible();
  });

  test('should display password strength indicator', async ({ page }) => {
    await page.click('text=Sign Up');

    const passwordInput = page.locator('input[name="password"]');

    // Test weak password
    await passwordInput.fill('123');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/weak/i);

    // Test medium password
    await passwordInput.fill('Password123');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/medium|fair/i);

    // Test strong password
    await passwordInput.fill('SecurePass123!@#');
    await expect(page.locator('[data-testid="password-strength"]')).toContainText(/strong/i);
  });

  test('should allow toggling password visibility', async ({ page }) => {
    await page.click('text=Sign Up');

    const passwordInput = page.locator('input[name="password"]');
    await passwordInput.fill('SecurePass123!');

    // Verify password is hidden by default
    await expect(passwordInput).toHaveAttribute('type', 'password');

    // Click show password button
    await page.click('[data-testid="toggle-password-visibility"]');

    // Verify password is now visible
    await expect(passwordInput).toHaveAttribute('type', 'text');

    // Click again to hide
    await page.click('[data-testid="toggle-password-visibility"]');
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should validate all required fields', async ({ page }) => {
    await page.click('text=Sign Up');

    // Try to submit without filling any fields
    await page.click('button[type="submit"]');

    // Verify error messages for required fields
    await expect(page.locator('text=/email.*required/i')).toBeVisible();
    await expect(page.locator('text=/password.*required/i')).toBeVisible();
  });

  test('should prevent registration with common passwords', async ({ page }) => {
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="password"]', 'password123'); // Common password
    await page.fill('input[name="confirmPassword"]', 'password123');

    await page.click('button[type="submit"]');

    await expect(page.locator('text=/password.*common|choose.*stronger/i')).toBeVisible();
  });

  test('should show loading state during registration', async ({ page }) => {
    await page.click('text=Sign Up');

    await page.fill('input[name="email"]', `test${Date.now()}@example.com`);
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

    // Click submit and immediately check for loading state
    await page.click('button[type="submit"]');

    // Button should be disabled and show loading state
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText(/loading|registering/i);
  });
});
