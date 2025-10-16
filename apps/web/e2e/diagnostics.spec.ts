import { test, expect } from '@playwright/test';

/**
 * Diagnostics Page E2E Tests
 * 
 * Tests the diagnostics page functionality:
 * 1. Chain configuration display
 * 2. Chain health checks
 * 3. Cost quotes display
 * 4. Inventory balances
 */

test.describe('Diagnostics Page', () => {
  test('should display loaded configuration', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should show page title
    await expect(page.getByRole('heading', { name: /diagnostics/i })).toBeVisible();
    
    // Should display chain configs
    await expect(page.getByTestId('chain-configs')).toBeVisible();
    
    // Should show both configured chains
    await expect(page.getByText(/arbitrum sepolia/i)).toBeVisible();
    await expect(page.getByText(/ethereum sepolia/i)).toBeVisible();
  });

  test('should display chain health status', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should show health section
    await expect(page.getByTestId('chain-health')).toBeVisible();
    
    // Should display status for each chain
    const arbHealth = page.getByTestId('health-421614');
    await expect(arbHealth).toBeVisible();
    await expect(arbHealth.getByText(/healthy|unhealthy/i)).toBeVisible();
    
    const ethHealth = page.getByTestId('health-11155111');
    await expect(ethHealth).toBeVisible();
    await expect(ethHealth.getByText(/healthy|unhealthy/i)).toBeVisible();
  });

  test('should display current cost quotes', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should show quotes section
    await expect(page.getByTestId('cost-quotes')).toBeVisible();
    
    // Should display quote for each chain
    await expect(page.getByTestId('quote-421614')).toBeVisible();
    await expect(page.getByTestId('quote-11155111')).toBeVisible();
    
    // Should show quote details
    const arbQuote = page.getByTestId('quote-421614');
    await expect(arbQuote.getByText(/gas.*cost/i)).toBeVisible();
    await expect(arbQuote.getByText(/bridge.*cost/i)).toBeVisible();
    await expect(arbQuote.getByText(/latency/i)).toBeVisible();
  });

  test('should display inventory balances', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should show inventory section
    await expect(page.getByTestId('inventory-balances')).toBeVisible();
    
    // Should display balance for each chain
    await expect(page.getByTestId('inventory-421614')).toBeVisible();
    await expect(page.getByTestId('inventory-11155111')).toBeVisible();
    
    // Should show PYUSD amounts
    await expect(page.getByText(/pyusd/i)).toHaveCount(2);
  });

  test('should redact sensitive data', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Private keys and secrets should not be displayed
    const pageContent = await page.textContent('body');
    expect(pageContent).not.toContain('0xPrivateKey');
    expect(pageContent).not.toContain('HMAC_SECRET');
    
    // Addresses should be visible (not sensitive)
    await expect(page.getByText(/0x[a-fA-F0-9]{40}/)).toBeVisible();
  });

  test('should refresh data on demand', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should have refresh button
    const refreshButton = page.getByRole('button', { name: /refresh/i });
    await expect(refreshButton).toBeVisible();
    
    // Click refresh
    await refreshButton.click();
    
    // Should show loading state briefly
    await expect(page.getByTestId('loading-indicator')).toBeVisible();
    
    // Data should reload
    await expect(page.getByTestId('chain-health')).toBeVisible();
  });

  test('should display contract addresses', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should show contract addresses section
    await expect(page.getByTestId('contract-addresses')).toBeVisible();
    
    // Should display key contracts
    await expect(page.getByText(/merchant.*registry/i)).toBeVisible();
    await expect(page.getByText(/checkout/i)).toBeVisible();
    await expect(page.getByText(/paymaster/i)).toBeVisible();
    await expect(page.getByText(/bridge.*escrow/i)).toBeVisible();
  });

  test('should display RPC endpoint status', async ({ page }) => {
    await page.goto('/diagnostics');
    
    // Should check RPC responsiveness
    await expect(page.getByTestId('rpc-status')).toBeVisible();
    
    // Should show response times
    await expect(page.getByText(/response.*time/i)).toBeVisible();
  });
});

