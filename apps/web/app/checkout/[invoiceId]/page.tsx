'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { authenticatePasskey, registerPasskey, hasPasskey } from '@/lib/passkey';
import { generateSessionKey, getSessionKey } from '@/lib/sessionKey';
import { getOrCreateSmartAccount, getPYUSDBalance } from '@/lib/smartAccount';
import { settleInvoice, approvePYUSD, checkPYUSDAllowance } from '@/lib/payment';
import { getChainById } from '@/lib/config';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
const GUARDIAN_ADDRESS = process.env.NEXT_PUBLIC_GUARDIAN_ADDRESS || '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const TEST_OWNER = process.env.NEXT_PUBLIC_TEST_OWNER || '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

interface Invoice {
  id: string;
  merchant: string;
  amount: string;
  chainId: number;
  expiry: number;
  memoHash: string;
  status: string;
}

interface CostQuote {
  chainId: number;
  chainName: string;
  gasSponsorCostUsd: number;
  estLatencyMs: number;
  bridgeCostUsd: number;
  totalCostUsd: number;
  needsBridge?: boolean;
  balance?: string;
}

type Step = 'loading' | 'auth' | 'chain' | 'bridge' | 'pay' | 'success' | 'error';

export default function CheckoutPage() {
  const params = useParams();
  const invoiceId = params.invoiceId as string;

  const [step, setStep] = useState<Step>('loading');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [user, setUser] = useState<any>(null);
  const [account, setAccount] = useState<string>('');
  const [quotes, setQuotes] = useState<CostQuote[]>([]);
  const [selectedChain, setSelectedChain] = useState<number>(0);
  const [error, setError] = useState<string>('');
  const [processing, setProcessing] = useState(false);

  // Step 1: Load invoice
  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  const loadInvoice = async () => {
    try {
      const response = await fetch(`${INDEXER_URL}/invoice/${invoiceId}`);
      if (!response.ok) throw new Error('Invoice not found');

      const data = await response.json();
      setInvoice(data);

      // Check if already paid
      if (data.status === 'paid') {
        setStep('success');
      } else {
        setStep('auth');
      }
    } catch (err) {
      setError('Failed to load invoice. Please check the link and try again.');
      setStep('error');
    }
  };

  // Step 2: Authenticate with passkey
  const handleAuth = async () => {
    try {
      setProcessing(true);

      let authenticatedUser;
      if (hasPasskey()) {
        authenticatedUser = await authenticatePasskey();
      } else {
        // First time - register passkey
        const username = prompt('Choose a username for your passkey:');
        if (!username) {
          setProcessing(false);
          return;
        }
        authenticatedUser = await registerPasskey(username);
      }

      setUser(authenticatedUser);

      // Generate or reuse session key
      let sessionKey = getSessionKey();
      if (!sessionKey) {
        sessionKey = generateSessionKey(1);
      }

      // Resolve chain for the invoice (default to Arbitrum Sepolia)
      const chainId = (invoice?.chainId as number) || 421614;
      const chain = getChainById(chainId);
      if (!chain) throw new Error(`Chain ${chainId} not configured`);

      console.log('Checkout config:', {
        chainId,
        rpcUrl: chain.rpcUrl,
        accountFactory: chain.contracts.accountFactory,
        testOwner: TEST_OWNER,
        guardian: GUARDIAN_ADDRESS,
      });

      if (!chain.rpcUrl) throw new Error(`Missing RPC URL for chain ${chainId}`);
      if (!chain.contracts.accountFactory || (chain.contracts.accountFactory as string).length !== 42) {
        console.error('AccountFactory value:', chain.contracts.accountFactory);
        console.error('AccountFactory length:', (chain.contracts.accountFactory as string).length);
        throw new Error(`Missing NEXT_PUBLIC_ACCOUNT_FACTORY_* for chain ${chainId}`);
      }

      // Owner address for MVP: use a configured test owner
      const testOwner = TEST_OWNER;

      if (!chain.contracts.accountFactory) {
        throw new Error('Missing NEXT_PUBLIC_ACCOUNT_FACTORY_* for selected chain');
      }

      const { address } = await getOrCreateSmartAccount(
        testOwner as any,
        GUARDIAN_ADDRESS as any,
        chain.contracts.accountFactory as any,
        chain.rpcUrl,
        0n
      );

      setAccount(address);
      setStep('chain');
    } catch (err: any) {
      console.error('Authentication failed:', err);
      setError(err.message || 'Authentication failed. Please try again.');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  // Step 3: Fetch cost quotes and select cheapest chain
  useEffect(() => {
    if (step === 'chain' && account) {
      fetchCostQuotes();
    }
  }, [step, account]);

  const fetchCostQuotes = async () => {
    try {
      const response = await fetch(`${INDEXER_URL}/costs/quotes`);
      const quotesData = await response.json();

      // For MVP, mock balance checks
      const quotesWithBalance = quotesData.map((q: CostQuote) => {
        const mockBalance = BigInt(Math.random() > 0.5 ? 100e6 : 0); // 50% chance of having funds
        const invoiceAmount = invoice ? BigInt(invoice.amount) : 0n;
        const needsBridge = mockBalance < invoiceAmount;

        return {
          ...q,
          balance: mockBalance.toString(),
          needsBridge,
          totalCost: q.gasSponsorCostUsd + (needsBridge ? q.bridgeCostUsd : 0),
        };
      });

      // Sort by total cost
      quotesWithBalance.sort((a: CostQuote, b: CostQuote) => a.totalCostUsd - b.totalCostUsd);

      setQuotes(quotesWithBalance);
      setSelectedChain(quotesWithBalance[0]?.chainId || 421614);
    } catch (err) {
      console.error('Failed to fetch cost quotes:', err);
      // Use fallback quotes
      setQuotes([
        {
          chainId: 421614,
          chainName: 'Arbitrum Sepolia',
          gasSponsorCostUsd: 0.01,
          estLatencyMs: 3000,
          bridgeCostUsd: 0.02,
          totalCostUsd: 0.03,
          needsBridge: false,
        },
        {
          chainId: 11155111,
          chainName: 'Ethereum Sepolia',
          gasSponsorCostUsd: 0.15,
          estLatencyMs: 12000,
          bridgeCostUsd: 0.02,
          totalCostUsd: 0.17,
          needsBridge: false,
        },
      ]);
      setSelectedChain(421614);
    }
  };

  // Step 4: Handle payment
  const handlePay = async () => {
    setProcessing(true);

    try {
      const selectedQuote = quotes.find((q) => q.chainId === selectedChain);
      const chain = getChainById(selectedChain);
      
      if (!chain || !invoice || !account) {
        throw new Error('Missing required data for payment');
      }

      // Check if bridge is needed
      if (selectedQuote?.needsBridge) {
        setStep('bridge');
        // TODO: Implement actual bridge logic
        setTimeout(() => {
          setStep('pay');
          setProcessing(false);
        }, 3000);
        return;
      }

      // Move to payment confirmation
      setStep('pay');
      setProcessing(false);
    } catch (error: any) {
      console.error('Payment preparation failed:', error);
      setError(error.message || 'Failed to prepare payment');
      setStep('error');
      setProcessing(false);
    }
  };

  // Step 5: Execute actual payment
  const executePayment = async () => {
    setProcessing(true);

    try {
      const chain = getChainById(selectedChain);
      
      if (!chain || !invoice || !account) {
        throw new Error('Missing required data for payment');
      }

      console.log('[Checkout] Executing payment...', {
        invoice: invoice.id,
        payer: account,
        chain: chain.name,
      });

      // Check allowance
      const allowance = await checkPYUSDAllowance(
        chain.pyusdAddress,
        account as any,
        chain.contracts.checkout,
        chain.rpcUrl
      );

      console.log('[Checkout] Current allowance:', allowance.toString());

      // Approve if needed
      if (allowance < BigInt(invoice.amount)) {
        console.log('[Checkout] Approving PYUSD spending...');
        const approvalResult = await approvePYUSD(
          chain.pyusdAddress,
          chain.contracts.checkout,
          BigInt(invoice.amount),
          account as any,
          chain.chainId,
          chain.rpcUrl,
          chain.entryPointAddress,
          chain.contracts.paymaster
        );

        if (!approvalResult.success) {
          throw new Error(approvalResult.error || 'Approval failed');
        }

        console.log('[Checkout] Approval successful:', approvalResult.txHash);
      }

      // Settle the invoice
      console.log('[Checkout] Settling invoice...');
      const result = await settleInvoice(
        invoice,
        account as any,
        chain.contracts.checkout,
        chain.chainId,
        chain.rpcUrl,
        chain.entryPointAddress,
        chain.contracts.paymaster
      );

      if (!result.success) {
        throw new Error(result.error || 'Settlement failed');
      }

      console.log('[Checkout] Payment successful!', {
        txHash: result.txHash,
        receiptId: result.receiptId,
      });

      setStep('success');
    } catch (error: any) {
      console.error('[Checkout] Payment failed:', error);
      setError(error.message || 'Payment failed');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading invoice...</p>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4 text-red-600">Error</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold mb-6">Checkout</h1>

        {/* Invoice Details */}
        <div className="bg-primary-50 border border-primary-200 p-6 rounded-lg mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">Amount</h3>
              <p className="text-3xl font-bold text-primary-600">
                {(parseInt(invoice.amount) / 1e6).toFixed(2)} <span className="text-xl">PYUSD</span>
              </p>
            </div>
            <div className="text-right">
              <h3 className="text-sm font-medium text-gray-600 mb-1">Merchant</h3>
              <p className="font-mono text-sm text-gray-700">
                {invoice.merchant.slice(0, 6)}...{invoice.merchant.slice(-4)}
              </p>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Expires:</span>
            <span className="font-medium">
              {new Date(invoice.expiry * 1000).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Step 1: Authentication */}
        {step === 'auth' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">🔐</div>
            <h2 className="text-2xl font-bold mb-4">Authenticate to Pay</h2>
            <p className="text-gray-600 mb-8">
              Use your device's biometrics to securely authenticate
            </p>
            <button
              onClick={handleAuth}
              disabled={processing}
              className="px-8 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing ? 'Authenticating...' : '👆 Sign in with Passkey'}
            </button>
            <p className="text-sm text-gray-500 mt-4">
              No wallet or seed phrase required
            </p>
          </div>
        )}

        {/* Step 2: Cheapest-Chain Toggle */}
        {step === 'chain' && quotes.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Select Payment Chain</h2>
            <p className="text-gray-600 mb-6">
              Choose the most cost-effective chain for your payment
            </p>

            <div className="space-y-4 mb-6">
              {quotes.map((quote) => (
                <div
                  key={quote.chainId}
                  onClick={() => setSelectedChain(quote.chainId)}
                  className={`border-2 rounded-lg p-5 cursor-pointer transition ${
                    selectedChain === quote.chainId
                      ? 'border-primary-600 bg-primary-50 shadow-md'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="radio"
                          checked={selectedChain === quote.chainId}
                          onChange={() => setSelectedChain(quote.chainId)}
                          className="w-5 h-5 text-primary-600"
                        />
                        <div className="font-semibold text-lg">{quote.chainName}</div>
                        {selectedChain === quote.chainId && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                            ✓ Cheapest
                          </span>
                        )}
                      </div>

                      <div className="ml-8 space-y-1 text-sm">
                        <div className="flex gap-2">
                          <span className="text-gray-600">Gas Sponsor:</span>
                          <span className="font-medium">
                            ${quote.gasSponsorCostUsd.toFixed(4)}
                          </span>
                        </div>
                        {quote.needsBridge && (
                          <div className="flex gap-2">
                            <span className="text-gray-600">Bridge Cost:</span>
                            <span className="font-medium text-orange-600">
                              ${quote.bridgeCostUsd.toFixed(4)}
                            </span>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <span className="text-gray-600">Est. Time:</span>
                          <span className="font-medium">
                            {(quote.estLatencyMs / 1000).toFixed(0)}s
                          </span>
                        </div>
                        {quote.needsBridge && (
                          <div className="text-orange-600 text-xs mt-1">
                            ⚠️ Bridging required (insufficient balance)
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="text-3xl font-bold text-primary-600">
                        ${quote.totalCostUsd.toFixed(4)}
                      </div>
                      <div className="text-xs text-gray-500">Total Cost</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex gap-3">
                <div className="text-blue-600 text-2xl">💡</div>
                <div className="text-sm text-blue-900">
                  <strong>Smart Routing:</strong> We automatically selected the cheapest chain for
                  you. You can change it if needed, but we recommend the default selection for
                  lowest costs.
                </div>
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={processing}
              className="w-full px-6 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-lg transition disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Continue to Payment →'}
            </button>
          </div>
        )}

        {/* Step 3: Bridge */}
        {step === 'bridge' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">🌉</div>
            <h2 className="text-2xl font-bold mb-4">Bridging Assets</h2>
            <p className="text-gray-600 mb-8">
              Moving PYUSD to {quotes.find((q) => q.chainId === selectedChain)?.chainName}
            </p>
            <div className="flex justify-center items-center gap-4 mb-8">
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce"></div>
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce delay-100"></div>
              <div className="w-3 h-3 bg-primary-600 rounded-full animate-bounce delay-200"></div>
            </div>
            <p className="text-sm text-gray-500">This usually takes 10-30 seconds</p>
          </div>
        )}

        {/* Step 4: Pay */}
        {step === 'pay' && (
          <div className="text-center py-8">
            <div className="text-6xl mb-6">💳</div>
            <h2 className="text-2xl font-bold mb-4">Confirm Payment</h2>
            <p className="text-gray-600 mb-8">
              Paying {(parseInt(invoice.amount) / 1e6).toFixed(2)} PYUSD on{' '}
              {quotes.find((q) => q.chainId === selectedChain)?.chainName}
            </p>
            <button
              onClick={executePayment}
              disabled={processing}
              className="px-8 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-lg transition disabled:opacity-50"
            >
              {processing ? 'Processing Payment...' : '✓ Pay Now (Gasless)'}
            </button>
            <p className="text-sm text-gray-500 mt-4">No gas fees required</p>
          </div>
        )}

        {/* Step 5: Success */}
        {step === 'success' && (
          <div className="text-center py-8">
            <div className="text-green-600 text-6xl mb-6">✅</div>
            <h2 className="text-2xl font-bold mb-4 text-green-600">Payment Successful!</h2>
            <p className="text-gray-600 mb-6">
              Your payment of {invoice ? (parseInt(invoice.amount) / 1e6).toFixed(2) : '0.00'} PYUSD
              has been processed
            </p>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Transaction Hash:</span>
                  <a
                    href="#"
                    className="text-primary-600 hover:text-primary-800 font-mono text-xs"
                  >
                    0x1234...5678
                  </a>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Chain:</span>
                  <span className="font-medium">
                    {quotes.find((q) => q.chainId === selectedChain)?.chainName || 'Arbitrum Sepolia'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Gas Paid:</span>
                  <span className="font-medium text-green-600">$0.00 (Sponsored)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <a
                href="/"
                className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
              >
                Done
              </a>
              <button className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                Download Receipt
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

