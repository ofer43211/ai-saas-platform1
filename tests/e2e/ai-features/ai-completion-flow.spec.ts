import { test, expect } from '@playwright/test';

test.describe('AI Completion Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', 'pro-user@example.com');
    await page.fill('input[name="password"]', 'SecurePass123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*dashboard/);
  });

  test('should successfully generate AI completion with GPT-4', async ({ page }) => {
    await page.goto('/dashboard/ai');

    // Select model
    await page.selectOption('select[name="model"]', 'gpt-4');

    // Enter prompt
    await page.fill('textarea[name="prompt"]', 'Write a haiku about programming');

    // Generate
    await page.click('button:has-text("Generate")');

    // Wait for response
    await expect(page.locator('[data-testid="ai-response"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty();

    // Verify response contains text
    const responseText = await page.locator('[data-testid="ai-response"]').textContent();
    expect(responseText?.length).toBeGreaterThan(10);

    // Verify usage stats updated
    await expect(page.locator('[data-testid="tokens-used"]')).toContainText(/\d+/);
  });

  test('should support streaming responses', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.check('input[name="stream"]');

    await page.fill('textarea[name="prompt"]', 'Count from 1 to 10');
    await page.click('button:has-text("Generate")');

    // Verify streaming indicator
    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible();

    // Wait for first chunk
    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 5000 });

    // Response should gradually appear
    await page.waitForTimeout(1000);
    const midText = await page.locator('[data-testid="ai-response"]').textContent();

    await page.waitForTimeout(2000);
    const finalText = await page.locator('[data-testid="ai-response"]').textContent();

    // Final text should be longer than mid text
    expect(finalText!.length).toBeGreaterThanOrEqual(midText!.length);

    // Streaming indicator should disappear when done
    await expect(page.locator('[data-testid="streaming-indicator"]')).not.toBeVisible({ timeout: 15000 });
  });

  test('should cancel streaming response', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.check('input[name="stream"]');

    await page.fill('textarea[name="prompt"]', 'Write a long story about AI');
    await page.click('button:has-text("Generate")');

    // Wait for streaming to start
    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible();

    // Cancel after 1 second
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Stop")');

    // Streaming should stop
    await expect(page.locator('[data-testid="streaming-indicator"]')).not.toBeVisible();

    // Response should still have partial content
    const responseText = await page.locator('[data-testid="ai-response"]').textContent();
    expect(responseText?.length).toBeGreaterThan(0);
  });

  test('should support multiple AI models', async ({ page }) => {
    await page.goto('/dashboard/ai');

    // Verify available models
    const modelSelect = page.locator('select[name="model"]');
    await expect(modelSelect).toBeVisible();

    const options = await modelSelect.locator('option').allTextContents();
    expect(options).toContain('GPT-4');
    expect(options).toContain('GPT-3.5 Turbo');
    expect(options).toContain('Claude 3 Opus');
    expect(options).toContain('Claude 3 Sonnet');
  });

  test('should enforce max token limit', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');

    // Set very high max tokens
    await page.fill('input[name="maxTokens"]', '100000');

    await page.fill('textarea[name="prompt"]', 'Test prompt');
    await page.click('button:has-text("Generate")');

    // Should show error
    await expect(page.locator('text=/exceeds.*limit|max tokens.*high/i')).toBeVisible();
  });

  test('should show error for empty prompt', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');

    // Try to generate without prompt
    await page.click('button:has-text("Generate")');

    await expect(page.locator('text=/prompt.*required|enter.*prompt/i')).toBeVisible();
  });

  test('should handle API rate limit errors gracefully', async ({ page }) => {
    await page.goto('/dashboard/ai');

    // Make multiple rapid requests to trigger rate limit
    for (let i = 0; i < 10; i++) {
      await page.fill('textarea[name="prompt"]', `Test prompt ${i}`);
      await page.click('button:has-text("Generate")');
      await page.waitForTimeout(100);
    }

    // Should show rate limit error
    await expect(page.locator('text=/rate limit|too many requests|slow down/i')).toBeVisible({ timeout: 15000 });
  });

  test('should display token count estimate', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.fill('textarea[name="prompt"]', 'This is a test prompt for token counting');

    // Token count should update
    await expect(page.locator('[data-testid="token-estimate"]')).toContainText(/\d+.*tokens?/i);

    // Add more text
    await page.fill('textarea[name="prompt"]', 'This is a much longer test prompt for token counting that should have more tokens');

    // Count should increase
    const tokenText = await page.locator('[data-testid="token-estimate"]').textContent();
    const tokenCount = parseInt(tokenText?.match(/\d+/)?.[0] || '0');
    expect(tokenCount).toBeGreaterThan(10);
  });

  test('should save and load conversation history', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.fill('textarea[name="prompt"]', 'Hello AI');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // Save conversation
    await page.click('button:has-text("Save")');
    await page.fill('input[name="conversationName"]', 'Test Conversation');
    await page.click('button:has-text("Save Conversation")');

    // Navigate away
    await page.goto('/dashboard');

    // Go back and load conversation
    await page.goto('/dashboard/ai/history');
    await page.click('text=Test Conversation');

    // Verify conversation loaded
    await expect(page.locator('[data-testid="conversation-messages"]')).toContainText('Hello AI');
  });

  test('should support temperature and other parameters', async ({ page }) => {
    await page.goto('/dashboard/ai');

    // Expand advanced settings
    await page.click('text=/advanced.*settings|show.*more/i');

    // Verify parameter controls
    await expect(page.locator('input[name="temperature"]')).toBeVisible();
    await expect(page.locator('input[name="topP"]')).toBeVisible();
    await expect(page.locator('input[name="frequencyPenalty"]')).toBeVisible();
    await expect(page.locator('input[name="presencePenalty"]')).toBeVisible();

    // Set temperature
    await page.fill('input[name="temperature"]', '0.9');

    await page.fill('textarea[name="prompt"]', 'Creative story prompt');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });
  });

  test('should show cost estimate before generation', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.selectOption('select[name="model"]', 'gpt-4');
    await page.fill('input[name="maxTokens"]', '1000');

    // Should show estimated cost
    await expect(page.locator('[data-testid="cost-estimate"]')).toContainText(/\$\d+\.\d+/);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await page.goto('/dashboard/ai');

    // Simulate offline
    await page.context().setOffline(true);

    await page.fill('textarea[name="prompt"]', 'Test prompt');
    await page.click('button:has-text("Generate")');

    // Should show network error
    await expect(page.locator('text=/network.*error|connection.*failed|offline/i')).toBeVisible();

    // Go back online
    await page.context().setOffline(false);
  });

  test('should export response as markdown', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.fill('textarea[name="prompt"]', 'Write a markdown document');
    await page.click('button:has-text("Generate")');

    await expect(page.locator('[data-testid="ai-response"]')).not.toBeEmpty({ timeout: 10000 });

    // Export
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('button:has-text("Export")'),
      page.click('text=Markdown'),
    ]);

    expect(download.suggestedFilename()).toMatch(/\.md$/);
  });

  test('should show loading skeleton during generation', async ({ page }) => {
    await page.goto('/dashboard/ai');

    await page.fill('textarea[name="prompt"]', 'Test prompt');
    await page.click('button:has-text("Generate")');

    // Should show loading state
    await expect(page.locator('[data-testid="loading-skeleton"]')).toBeVisible();

    // Loading should disappear when done
    await expect(page.locator('[data-testid="loading-skeleton"]')).not.toBeVisible({ timeout: 15000 });
  });
});
