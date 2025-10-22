'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import QRCode from 'qrcode';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

interface Merchant {
  address: string;
  payoutAddress: string;
  feeBps: number;
  active: boolean;
  chainId: number;
}

interface CostQuote {
  chainId: number;
  chainName: string;
  gasSponsorCostUsd: number;
  estLatencyMs: number;
  bridgeCostUsd: number;
  totalCostUsd: number;
}

export default function CreateInvoice() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [chainId, setChainId] = useState(421614);
  const [qrCode, setQRCode] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [costQuotes, setCostQuotes] = useState<CostQuote[]>([]);
  const [loadingCosts, setLoadingCosts] = useState(false);

  // Use connected wallet address as merchant
  const merchantAddress = connectedAddress || '';

  // Fetch real-time gas costs
  useEffect(() => {
    fetchGasCosts();
  }, []);

  const fetchGasCosts = async () => {
    try {
      setLoadingCosts(true);
      const response = await fetch(`${INDEXER_URL}/costs/quotes`);
      if (response.ok) {
        const quotes = await response.json();
        setCostQuotes(quotes);
      }
    } catch (error) {
      console.error('Failed to fetch gas costs:', error);
    } finally {
      setLoadingCosts(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!merchantAddress) {
        throw new Error('Please select a merchant');
      }

      // Create invoice on-chain via API
      const response = await fetch('/api/invoice/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chainId,
          merchant: merchantAddress,
          amount: parseFloat(amount),
          expiryMinutes: parseInt(expiry),
          memo,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create invoice');
      }

      const result = await response.json();
      setInvoiceId(result.invoiceId);
      setTxHash(result.txHash);

      // Generate QR code for checkout URL
      const checkoutUrl = `${window.location.origin}/checkout/${result.invoiceId}`;
      const qr = await QRCode.toDataURL(checkoutUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
      setQRCode(qr);

      console.log('Invoice created:', {
        id: result.invoiceId,
        txHash: result.txHash,
        amount,
        memo,
        expiry,
        chainId,
        merchantAddress,
        checkoutUrl,
      });
    } catch (error) {
      console.error('Failed to create invoice:', error);
      setError(error instanceof Error ? error.message : 'Failed to create invoice. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = `invoice-${invoiceId.slice(0, 10)}.png`;
    link.click();
  };

  const writeNFC = async () => {
    if ('NDEFReader' in window) {
      try {
        const ndef = new (window as any).NDEFReader();
        await ndef.write({
          records: [
            {
              recordType: 'url',
              data: `${window.location.origin}/checkout/${invoiceId}`,
            },
          ],
        });
        alert('NFC tag written successfully!');
      } catch (error) {
        console.error('NFC write failed:', error);
        alert('Failed to write NFC tag. Make sure NFC is enabled on your device.');
      }
    } else {
      alert('NFC is not supported on this device/browser.');
    }
  };

  // Show wallet connect prompt if not connected
  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4 text-gray-900">Connect Wallet to Create Invoice</h1>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            Please connect your merchant wallet to create invoices and receive payments.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Page Title */}
      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Create Invoice</h1>
            <p className="text-gray-600">
              Generate a payment request with QR code and optional NFC tag
            </p>
          </div>
          <div className="ml-auto" style={{ transform: 'scale(0.85)', transformOrigin: 'top right' }}>
            <ConnectButton />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {!invoiceId ? (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-lg">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Merchant Address
            </label>
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-sm text-gray-700">
              {merchantAddress}
            </div>
            <p className="text-sm text-gray-500 mt-1">Payment will be sent to your connected wallet</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Amount (PYUSD) *
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="10.00"
              required
            />
            <p className="text-sm text-gray-500 mt-1">Minimum: 0.01 PYUSD</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">Memo *</label>
            <input
              type="text"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Coffee and pastry"
              maxLength={100}
              required
            />
            <p className="text-sm text-gray-500 mt-1">Brief description of payment</p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expiry (minutes from now) *
            </label>
            <input
              type="number"
              min="5"
              max="1440"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              required
            />
            <p className="text-sm text-gray-500 mt-1">Invoice valid for 5-1440 minutes</p>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Chain *
            </label>
            <div className="space-y-3">
              {/* Arbitrum Sepolia Option */}
              <label
                className={`relative flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition ${
                  chainId === 421614
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="chainId"
                  value={421614}
                  checked={chainId === 421614}
                  onChange={(e) => setChainId(parseInt(e.target.value))}
                  className="sr-only"
                />
                <div className="flex items-center space-x-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    chainId === 421614 ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {chainId === 421614 && (
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Arbitrum Sepolia</p>
                    <p className="text-xs text-gray-500">Recommended - Lower Fees</p>
                  </div>
                </div>
                <div className="text-right">
                  {loadingCosts ? (
                    <div className="animate-pulse">
                      <div className="h-4 w-16 bg-gray-200 rounded"></div>
                    </div>
                  ) : (
                    <>
                      {costQuotes.find(q => q.chainId === 421614) && (
                        <>
                          <p className="text-sm font-bold text-green-600">
                            ${(costQuotes.find(q => q.chainId === 421614)?.gasSponsorCostUsd || 0) < 0.0001 
                              ? '<$0.0001' 
                              : (costQuotes.find(q => q.chainId === 421614)?.gasSponsorCostUsd || 0).toFixed(4)}
                          </p>
                          <p className="text-xs text-gray-500">Gas (Sponsored)</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </label>

              {/* Ethereum Sepolia Option */}
              <label
                className={`relative flex items-center justify-between p-4 border-2 rounded-xl cursor-pointer transition ${
                  chainId === 11155111
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="chainId"
                  value={11155111}
                  checked={chainId === 11155111}
                  onChange={(e) => setChainId(parseInt(e.target.value))}
                  className="sr-only"
                />
                <div className="flex items-center space-x-3">
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    chainId === 11155111 ? 'border-blue-500' : 'border-gray-300'
                  }`}>
                    {chainId === 11155111 && (
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Ethereum Sepolia</p>
                    <p className="text-xs text-gray-500">Higher gas costs</p>
                  </div>
                </div>
                <div className="text-right">
                  {loadingCosts ? (
                    <div className="animate-pulse">
                      <div className="h-4 w-16 bg-gray-200 rounded"></div>
                    </div>
                  ) : (
                    <>
                      {costQuotes.find(q => q.chainId === 11155111) && (
                        <>
                          <p className="text-sm font-bold text-green-600">
                            ${(costQuotes.find(q => q.chainId === 11155111)?.gasSponsorCostUsd || 0) < 0.0001 
                              ? '<$0.0001' 
                              : (costQuotes.find(q => q.chainId === 11155111)?.gasSponsorCostUsd || 0).toFixed(4)}
                          </p>
                          <p className="text-xs text-gray-500">Gas (Sponsored)</p>
                        </>
                      )}
                    </>
                  )}
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium text-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating Invoice...' : 'Create Invoice'}
          </button>
        </form>
      ) : (
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <div className="text-green-600 text-6xl mb-4">✓</div>
          <h2 className="text-2xl font-bold mb-2 text-green-600">Invoice Created!</h2>
          <p className="text-gray-600 mb-2">
            Invoice ID: <span className="font-mono text-sm">{invoiceId.slice(0, 16)}...</span>
          </p>
          {txHash && (
            <p className="text-gray-600 mb-6">
              Transaction:{' '}
              <a
                href={`${chainId === 421614 ? 'https://sepolia.arbiscan.io' : 'https://sepolia.etherscan.io'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline font-mono text-sm"
              >
                {txHash.slice(0, 16)}...
              </a>
            </p>
          )}

          <div className="bg-gray-50 p-6 rounded-lg mb-6">
            <div className="grid grid-cols-2 gap-4 text-left mb-4">
              <div>
                <span className="text-sm text-gray-600">Merchant:</span>
                <div className="font-mono text-xs">{merchantAddress}</div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Amount:</span>
                <div className="font-semibold">{parseFloat(amount).toFixed(2)} PYUSD</div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Chain:</span>
                <div className="font-semibold">
                  {chainId === 421614 ? 'Arbitrum Sepolia' : 'Ethereum Sepolia'}
                </div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Memo:</span>
                <div className="font-semibold">{memo}</div>
              </div>
              <div>
                <span className="text-sm text-gray-600">Expires in:</span>
                <div className="font-semibold">{expiry} minutes</div>
              </div>
            </div>
          </div>

          {qrCode && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-4">QR Code</h3>
              <div className="inline-block p-4 bg-white border-2 border-gray-200 rounded-lg">
                <img src={qrCode} alt="Invoice QR Code" className="w-80 h-80" />
              </div>
              <p className="text-sm text-gray-600 mt-2">
                Customer can scan this code to pay
              </p>
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <button
              onClick={downloadQR}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
            >
              📥 Download QR
            </button>

            <button
              onClick={writeNFC}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              📱 Write to NFC
            </button>

            <a
              href={`/checkout/${invoiceId}`}
              className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              🔗 Open Checkout
            </a>
          </div>

          <div className="mt-6 pt-6 border-t">
            <a
              href="/merchant"
              className="text-primary-600 hover:text-primary-800 font-medium"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      )}
    </div>
  );
}


