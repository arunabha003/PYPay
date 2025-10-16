import { test, expect } from '@playwright/test';

/**
 * Buyer Checkout Flow E2E Tests
 * 
 * Tests the complete buyer payment workflow:
 * 1. Load invoice
 * 2. Passkey authentication (mocked in E2E)
 * 3. Smart account setup
 * 4. Cheapest-Chain Toggle
 * 5. Bridge flow (if needed)
 * 6. Payment settlement
 * 7. Receipt display
 */

test.describe('Buyer Checkout', () => {
  const mockInvoiceId = 'test-invoice-123';
  
  test.beforeEach(async ({ page }) => {
    // Mock API responses for testing
    await page.route('**/api/invoice/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockInvoiceId,
          merchant: '0x1234567890123456789012345678901234567890',
          amount: '100000000', // 100 PYUSD
          chainId: 421614, // Arbitrum Sepolia
          expiry: Math.floor(Date.now() / 1000) + 3600,
          memoHash: '0xabcd...',
          status: 'unpaid',
        }),
      });
    });
    
    await page.route('**/api/costs/quotes', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            chainId: 421614,
            gasSponsorCostUsd: 0.05,
            estLatencyMs: 2000,
            bridgeCostUsd: 0,
            totalCostUsd: 0.05,
            updatedAt: Date.now(),
          },
          {
            chainId: 11155111,
            gasSponsorCostUsd: 0.15,
            estLatencyMs: 12000,
            bridgeCostUsd: 0.30,
            totalCostUsd: 0.45,
            updatedAt: Date.now(),
          },
        ]),
      });
    });
  });

  test('should load invoice details', async ({ page }) => {
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Should display invoice information
    await expect(page.getByTestId('invoice-amount')).toContainText('100 PYUSD');
    await expect(page.getByTestId('merchant-address')).toBeVisible();
    await expect(page.getByTestId('invoice-memo')).toBeVisible();
  });

  test('should display cheapest-chain toggle', async ({ page }) => {
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Should show chain selection UI
    await expect(page.getByTestId('chain-selector')).toBeVisible();
    
    // Should display cost quotes for each chain
    await expect(page.getByText(/arbitrum sepolia/i)).toBeVisible();
    await expect(page.getByText(/ethereum sepolia/i)).toBeVisible();
    
    // Should highlight cheapest option
    const cheapestOption = page.getByTestId('chain-option').first();
    await expect(cheapestOption).toHaveClass(/recommended|cheapest/);
  });

  test('should show cost breakdown per chain', async ({ page }) => {
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Arbitrum Sepolia (cheapest)
    const arbOption = page.getByTestId('chain-option-421614');
    await expect(arbOption.getByText(/gas cost.*\$0\.05/i)).toBeVisible();
    await expect(arbOption.getByText(/bridge.*\$0\.00/i)).toBeVisible();
    await expect(arbOption.getByText(/total.*\$0\.05/i)).toBeVisible();
    
    // Ethereum Sepolia
    const ethOption = page.getByTestId('chain-option-11155111');
    await expect(ethOption.getByText(/gas cost.*\$0\.15/i)).toBeVisible();
    await expect(ethOption.getByText(/bridge.*\$0\.30/i)).toBeVisible();
    await expect(ethOption.getByText(/total.*\$0\.45/i)).toBeVisible();
  });

  test('should allow chain selection', async ({ page }) => {
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Select Ethereum Sepolia (more expensive option)
    await page.getByTestId('chain-option-11155111').click();
    
    // Should update selection
    await expect(page.getByTestId('selected-chain')).toContainText('Ethereum Sepolia');
  });

  test('should handle passkey authentication', async ({ page }) => {
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Mock WebAuthn API
    await page.addInitScript(() => {
      // @ts-ignore
      window.navigator.credentials = {
        get: async () => ({
          id: 'test-credential-id',
          type: 'public-key',
          rawId: new Uint8Array([1, 2, 3]).buffer,
          response: {
            clientDataJSON: new Uint8Array([4, 5, 6]).buffer,
            authenticatorData: new Uint8Array([7, 8, 9]).buffer,
            signature: new Uint8Array([10, 11, 12]).buffer,
          },
        }),
      };
    });
    
    // Click authenticate button
    await page.getByRole('button', { name: /authenticate/i }).click();
    
    // Should show authenticated state
    await expect(page.getByText(/authenticated/i)).toBeVisible();
  });

  test('should display bridge flow when needed', async ({ page }) => {
    // Mock balance check showing insufficient funds on invoice chain
    await page.route('**/api/balance/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          balance: '0', // No PYUSD on invoice chain
        }),
      });
    });
    
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Select chain requiring bridge
    await page.getByTestId('chain-option-11155111').click();
    
    // Should show bridge warning
    await expect(page.getByText(/bridge required/i)).toBeVisible();
    await expect(page.getByText(/you don't have.*pyusd.*ethereum sepolia/i)).toBeVisible();
  });

  test('should complete payment flow', async ({ page }) => {
    // Mock successful payment
    await page.route('**/api/pay', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          txHash: '0xabcd1234...',
          receiptId: 'receipt-123',
        }),
      });
    });
    
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Authenticate (mocked)
    await page.addInitScript(() => {
      // @ts-ignore
      window.navigator.credentials = {
        get: async () => ({ id: 'test-credential' }),
      };
    });
    await page.getByRole('button', { name: /authenticate/i }).click();
    
    // Select cheapest chain
    await page.getByTestId('chain-option-421614').click();
    
    // Click pay button
    await page.getByRole('button', { name: /pay now/i }).click();
    
    // Should show loading state
    await expect(page.getByTestId('payment-loading')).toBeVisible();
    
    // Should show success message
    await expect(page.getByText(/payment successful/i)).toBeVisible({
      timeout: 10000,
    });
    
    // Should display receipt
    await expect(page.getByTestId('receipt')).toBeVisible();
    await expect(page.getByTestId('tx-hash')).toContainText('0xabcd1234');
  });

  test('should display receipt with transaction details', async ({ page }) => {
    // Navigate to successful payment state (after payment)
    // This would typically be done by completing the payment flow
    // For testing, we can mock the receipt endpoint
    
    await page.route(`**/api/receipt/*`, (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'receipt-123',
          invoiceId: mockInvoiceId,
          payer: '0xBuyerAddress...',
          merchant: '0xMerchantAddress...',
          amount: '100000000',
          chainId: 421614,
          txHash: '0xTransactionHash...',
          blockTime: Math.floor(Date.now() / 1000),
        }),
      });
    });
    
    await page.goto(`/receipt/receipt-123`);
    
    // Should display all receipt details
    await expect(page.getByTestId('receipt-amount')).toContainText('100 PYUSD');
    await expect(page.getByTestId('receipt-merchant')).toBeVisible();
    await expect(page.getByTestId('receipt-txhash')).toBeVisible();
    
    // Should have download/print buttons
    await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /print/i })).toBeVisible();
  });

  test('should handle expired invoice', async ({ page }) => {
    // Mock expired invoice
    await page.route('**/api/invoice/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockInvoiceId,
          merchant: '0x1234567890123456789012345678901234567890',
          amount: '100000000',
          chainId: 421614,
          expiry: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
          memoHash: '0xabcd...',
          status: 'unpaid',
        }),
      });
    });
    
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Should show expiry warning
    await expect(page.getByText(/invoice expired/i)).toBeVisible();
    
    // Pay button should be disabled
    await expect(page.getByRole('button', { name: /pay now/i })).toBeDisabled();
  });

  test('should handle already paid invoice', async ({ page }) => {
    // Mock paid invoice
    await page.route('**/api/invoice/*', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: mockInvoiceId,
          merchant: '0x1234567890123456789012345678901234567890',
          amount: '100000000',
          chainId: 421614,
          expiry: Math.floor(Date.now() / 1000) + 3600,
          memoHash: '0xabcd...',
          status: 'paid',
        }),
      });
    });
    
    await page.goto(`/checkout/${mockInvoiceId}`);
    
    // Should show already paid message
    await expect(page.getByText(/already paid/i)).toBeVisible();
    
    // Should not show payment UI
    await expect(page.getByRole('button', { name: /pay now/i })).not.toBeVisible();
  });
});

test.describe('Bridge Flow', () => {
  test('should complete bridge lock on source chain', async ({ page }) => {
    // Mock bridge quote API
    await page.route('**/api/bridge/quote', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: 'bridge-ref-123',
          srcChainId: 421614,
          dstChainId: 11155111,
          bridgeCostUsd: 0.30,
          etaMs: 120000,
        }),
      });
    });
    
    await page.goto('/bridge');
    
    // Fill bridge form
    await page.getByLabel(/from chain/i).selectOption('Arbitrum Sepolia');
    await page.getByLabel(/to chain/i).selectOption('Ethereum Sepolia');
    await page.getByLabel(/amount/i).fill('100');
    
    // Submit
    await page.getByRole('button', { name: /bridge/i }).click();
    
    // Should show lock transaction
    await expect(page.getByText(/lock.*pyusd/i)).toBeVisible();
    
    // Should show waiting for release state
    await expect(page.getByText(/waiting.*release/i)).toBeVisible();
  });

  test('should monitor bridge status', async ({ page }) => {
    const bridgeRef = 'bridge-ref-123';
    
    // Mock bridge status endpoint
    let callCount = 0;
    await page.route(`**/api/bridge/${bridgeRef}`, (route) => {
      callCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ref: bridgeRef,
          status: callCount < 3 ? 'locked' : 'released',
          lockTxHash: '0xLockTx...',
          releaseTxHash: callCount < 3 ? null : '0xReleaseTx...',
        }),
      });
    });
    
    await page.goto(`/bridge/${bridgeRef}`);
    
    // Should show progress
    await expect(page.getByTestId('bridge-status')).toContainText(/locked/i);
    
    // Wait for release (polls every few seconds)
    await expect(page.getByTestId('bridge-status')).toContainText(/released/i, {
      timeout: 15000,
    });
    
    // Should show both transaction hashes
    await expect(page.getByText(/0xLockTx/)).toBeVisible();
    await expect(page.getByText(/0xReleaseTx/)).toBeVisible();
  });
});

test.describe('Session Key Management', () => {
  test('should handle session key expiry', async ({ page }) => {
    // Test that expired session keys are detected and user is prompted to re-authenticate
    await page.goto('/checkout/test-invoice');
    
    // Mock expired session key in local storage
    await page.evaluate(() => {
      localStorage.setItem(
        'pypay_session_key',
        JSON.stringify({
          privateKey: '0xExpiredKey...',
          validUntil: Date.now() - 1000, // Expired
        })
      );
    });
    
    // Should show re-authentication prompt
    await expect(page.getByText(/session expired/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /re-authenticate/i })).toBeVisible();
  });
});

