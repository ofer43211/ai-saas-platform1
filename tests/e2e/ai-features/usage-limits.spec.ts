import { test, expect } from '@playwright/test';

test.describe('AI Usage Limits Enforcement', () => {
  test('should enforce Free plan limits (100 API calls)', async ({ page }) => {
    // Login as free user
    await page.goto('/login');
    await page.fill('input[name="email"]', 'free-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Check usage
    await page.goto('/dashboard/billing');
    const usageText = await page.locator('[data-testid="api-calls-usage"]').textContent();
    const match = usageText?.match(/(\d+)\s*\/\s*(\d+)/);

    if (match) {
      const used = parseInt(match[1]);
      const limit = parseInt(match[2]);

      expect(limit).toBe(100); // Free plan limit

      if (used >= limit) {
        // Already at limit, verify API is blocked
        await page.goto('/dashboard/ai');
        await page.fill('textarea[name="prompt"]', 'Test prompt');
        await page.click('button:has-text("Generate")');

        await expect(page.locator('text=/limit.*exceeded|upgrade.*plan/i')).toBeVisible();
      }
    }
  });

  test('should enforce Basic plan limits (1000 API calls)', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'basic-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/billing');

    // Verify limit is 1000
    await expect(page.locator('[data-testid="api-calls-usage"]')).toContainText(/1,?000/);
  });

  test('should enforce token limits per request', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'basic-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/ai');

    // Try to set tokens beyond plan limit
    await page.fill('input[name="maxTokens"]', '200000'); // Beyond Basic plan 100K limit
    await page.fill('textarea[name="prompt"]', 'Test');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('text=/exceeds.*plan.*limit|upgrade.*higher/i')).toBeVisible();
  });

  test('should show upgrade prompt when approaching limit', async ({ page }) => {
    // Login as user near limit (90%+)
    await page.goto('/login');
    await page.fill('input[name="email"]', 'near-limit-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Should show warning banner
    await expect(page.locator('[data-testid="usage-warning"]')).toBeVisible();
    await expect(page.locator('text=/90%.*used|approaching.*limit/i')).toBeVisible();

    // Should have upgrade CTA
    await expect(page.locator('button:has-text("Upgrade Now")')).toBeVisible();
  });

  test('should reset usage at billing cycle', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'basic-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/billing');

    // Verify reset date shown
    await expect(page.locator('[data-testid="usage-reset-date"]')).toBeVisible();
    await expect(page.locator('text=/resets on|next reset/i')).toBeVisible();
  });

  test('should track token usage accurately', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'pro-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    // Get initial token count
    await page.goto('/dashboard/billing');
    const initialText = await page.locator('[data-testid="token-usage"]').textContent();
    const initialMatch = initialText?.match(/(\d+)/);
    const initialTokens = initialMatch ? parseInt(initialMatch[0]) : 0;

    // Make AI request
    await page.goto('/dashboard/ai');
    await page.fill('textarea[name="prompt"]', 'Short test');
    await page.click('button:has-text("Generate")');
    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // Check updated token count
    await page.goto('/dashboard/billing');
    const finalText = await page.locator('[data-testid="token-usage"]').textContent();
    const finalMatch = finalText?.match(/(\d+)/);
    const finalTokens = finalMatch ? parseInt(finalMatch[0]) : 0;

    // Should have increased
    expect(finalTokens).toBeGreaterThan(initialTokens);
  });

  test('should allow unlimited usage for Enterprise plan', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'enterprise-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/billing');

    // Should show unlimited
    await expect(page.locator('text=/unlimited|no limit/i')).toBeVisible();
  });

  test('should show usage breakdown by model', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'pro-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/billing/usage-details');

    // Should show breakdown
    await expect(page.locator('text=GPT-4')).toBeVisible();
    await expect(page.locator('text=Claude 3')).toBeVisible();

    // Each should have usage stats
    await expect(page.locator('[data-testid="model-usage-gpt4"]')).toBeVisible();
    await expect(page.locator('[data-testid="model-usage-claude"]')).toBeVisible();
  });

  test('should export usage report', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'pro-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);

    await page.goto('/dashboard/billing/usage-details');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export Usage")'),
    ]);

    expect(download.suggestedFilename()).toMatch(/usage.*\.(csv|xlsx)/i);
  });
});
