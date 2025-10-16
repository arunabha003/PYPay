'use client';

import { useState } from 'react';
import QRCode from 'qrcode';

export default function CreateInvoice() {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [expiry, setExpiry] = useState('30');
  const [chainId, setChainId] = useState(421614);
  const [qrCode, setQRCode] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In production, this would call the Invoice contract
      // For MVP, generate mock invoice ID
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const id =
        '0x' +
        Array.from(randomBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

      setInvoiceId(id);

      // Generate QR code for checkout URL
      const checkoutUrl = `${window.location.origin}/checkout/${id}`;
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
        id,
        amount,
        memo,
        expiry,
        chainId,
        checkoutUrl,
      });
    } catch (error) {
      console.error('Failed to create invoice:', error);
      alert('Failed to create invoice. Please try again.');
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

      {!invoiceId ? (
        <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-lg">
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
          <p className="text-gray-600 mb-6">
            Invoice ID: <span className="font-mono text-sm">{invoiceId.slice(0, 16)}...</span>
          </p>

          <div className="bg-gray-50 p-6 rounded-lg mb-6">
            <div className="grid grid-cols-2 gap-4 text-left mb-4">
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

