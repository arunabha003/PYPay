import { test, expect } from '@playwright/test';

/**
 * Merchant Flow E2E Tests
 * 
 * Tests the complete merchant workflow:
 * 1. Merchant dashboard access
 * 2. Invoice creation
 * 3. QR code generation
 * 4. Invoice management
 * 5. CSV export
 */

test.describe('Merchant Portal', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to merchant dashboard
    await page.goto('/merchant');
  });

  test('should display merchant dashboard', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Merchant Dashboard');
    
    // Should show invoice statistics
    await expect(page.getByTestId('invoice-stats')).toBeVisible();
  });

  test('should create new invoice', async ({ page }) => {
    // Click create invoice button
    await page.getByRole('link', { name: /create invoice/i }).click();
    
    // Fill invoice form
    await page.getByLabel(/amount/i).fill('100');
    await page.getByLabel(/memo/i).fill('Coffee and pastry');
    
    // Set expiry to 1 hour from now
    const oneHourLater = new Date(Date.now() + 3600000);
    await page.getByLabel(/expiry/i).fill(oneHourLater.toISOString().slice(0, 16));
    
    // Select chain
    await page.getByLabel(/chain/i).selectOption('Arbitrum Sepolia');
    
    // Submit
    await page.getByRole('button', { name: /create invoice/i }).click();
    
    // Should show success message and QR code
    await expect(page.getByText(/invoice created/i)).toBeVisible();
    await expect(page.getByTestId('qr-code')).toBeVisible();
    
    // Should display invoice details
    await expect(page.getByTestId('invoice-id')).toBeVisible();
    await expect(page.getByText('100 PYUSD')).toBeVisible();
  });

  test('should display QR code with invoice URL', async ({ page }) => {
    // Create invoice first
    await page.getByRole('link', { name: /create invoice/i }).click();
    await page.getByLabel(/amount/i).fill('50');
    await page.getByLabel(/memo/i).fill('Test invoice');
    
    const oneHourLater = new Date(Date.now() + 3600000);
    await page.getByLabel(/expiry/i).fill(oneHourLater.toISOString().slice(0, 16));
    await page.getByLabel(/chain/i).selectOption('Arbitrum Sepolia');
    await page.getByRole('button', { name: /create invoice/i }).click();
    
    // Verify QR code is displayed
    const qrCode = page.getByTestId('qr-code');
    await expect(qrCode).toBeVisible();
    
    // Should have download button
    await expect(page.getByRole('button', { name: /download qr/i })).toBeVisible();
  });

  test('should filter invoices by status', async ({ page }) => {
    // Should show all invoices by default
    await expect(page.getByTestId('invoice-list')).toBeVisible();
    
    // Filter by unpaid
    await page.getByRole('tab', { name: /unpaid/i }).click();
    await expect(page.getByTestId('status-filter')).toHaveValue('unpaid');
    
    // Filter by paid
    await page.getByRole('tab', { name: /paid/i }).click();
    await expect(page.getByTestId('status-filter')).toHaveValue('paid');
  });

  test('should filter invoices by chain', async ({ page }) => {
    // Should show chain tabs
    await expect(page.getByRole('tab', { name: /arbitrum sepolia/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /ethereum sepolia/i })).toBeVisible();
    
    // Click Ethereum Sepolia tab
    await page.getByRole('tab', { name: /ethereum sepolia/i }).click();
    
    // Should filter invoices
    await expect(page).toHaveURL(/chainId=11155111/);
  });

  test('should export receipts as CSV', async ({ page }) => {
    // Click export button
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export csv/i }).click();
    
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/receipts.*\.csv/);
  });

  test('should cancel invoice', async ({ page }) => {
    // Assuming there's at least one unpaid invoice
    await page.getByRole('tab', { name: /unpaid/i }).click();
    
    // Find first invoice row
    const firstInvoice = page.getByTestId('invoice-row').first();
    
    // Click cancel button
    await firstInvoice.getByRole('button', { name: /cancel/i }).click();
    
    // Confirm cancellation
    await page.getByRole('button', { name: /confirm/i }).click();
    
    // Should show success message
    await expect(page.getByText(/invoice cancelled/i)).toBeVisible();
  });

  test('should display invoice details', async ({ page }) => {
    // Click on first invoice
    const firstInvoice = page.getByTestId('invoice-row').first();
    await firstInvoice.click();
    
    // Should show invoice details modal/page
    await expect(page.getByTestId('invoice-details')).toBeVisible();
    await expect(page.getByText(/amount/i)).toBeVisible();
    await expect(page.getByText(/merchant/i)).toBeVisible();
    await expect(page.getByText(/status/i)).toBeVisible();
  });
});

test.describe('Merchant Onboarding', () => {
  test('should check merchant status', async ({ page }) => {
    await page.goto('/merchant/onboard');
    
    // Should show onboarding instructions
    await expect(page.getByText(/register your merchant account/i)).toBeVisible();
  });
});

