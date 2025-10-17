'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode';

interface Merchant {
  address: string;
  payoutAddress: string;
  feeBps: number;
  active: boolean;
  chainId: number;
}

export default function CreateInvoice() {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [chainId, setChainId] = useState(421614);
  const [merchantAddress, setMerchantAddress] = useState('');
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [qrCode, setQRCode] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMerchants, setLoadingMerchants] = useState(true);
  const [error, setError] = useState('');

  // Fetch registered merchants
  useEffect(() => {
    async function fetchMerchants() {
      try {
        setLoadingMerchants(true);
        const response = await fetch(`/api/merchants?chainId=${chainId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch merchants');
        }
        const data = await response.json();
        setMerchants(data.merchants || []);
        
        // Auto-select first merchant if available
        if (data.merchants && data.merchants.length > 0) {
          setMerchantAddress(data.merchants[0].address);
        }
      } catch (err) {
        console.error('Failed to fetch merchants:', err);
        setError('Failed to load merchants. Please ensure the indexer is running.');
      } finally {
        setLoadingMerchants(false);
      }
    }

    fetchMerchants();
  }, [chainId]);

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

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Create Invoice</h1>
      <p className="text-gray-600 mb-8">
        Generate a payment request with QR code and optional NFC tag
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {!invoiceId ? (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-lg">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Merchant *
            </label>
            {loadingMerchants ? (
              <div className="text-gray-500">Loading merchants...</div>
            ) : merchants.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 text-sm">
                No merchants registered on this chain. Please register a merchant first.
              </div>
            ) : (
              <select
                value={merchantAddress}
                onChange={(e) => setMerchantAddress(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              >
                {merchants.map((merchant) => (
                  <option key={merchant.address} value={merchant.address}>
                    {merchant.address} {!merchant.active && '(Inactive)'}
                  </option>
                ))}
              </select>
            )}
            <p className="text-sm text-gray-500 mt-1">Select the merchant receiving payment</p>
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
            <select
              value={chainId}
              onChange={(e) => setChainId(parseInt(e.target.value))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value={421614}>Arbitrum Sepolia (Recommended - Lower Fees)</option>
              <option value={11155111}>Ethereum Sepolia</option>
            </select>
            <p className="text-sm text-gray-500 mt-1">
              Buyer can still choose cheapest chain at checkout
            </p>
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


