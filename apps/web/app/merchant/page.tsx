'use client';

import { useState, useEffect } from 'react';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';

interface Invoice {
  id: string;
  merchant: string;
  amount: string;
  chainId: number;
  expiry: number;
  memoHash: string;
  status: string;
  createdAt: string;
  txHash?: string;
}

export default function MerchantDashboard() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedChain, setSelectedChain] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Mock merchant address - in production, get from auth
  const merchantAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

  useEffect(() => {
    fetchInvoices();
  }, [selectedChain, statusFilter]);

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedChain !== 'all') params.append('chainId', selectedChain);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(
        `${INDEXER_URL}/merchant/${merchantAddress}/invoices?${params}`
      );
      const data = await response.json();
      setInvoices(data.invoices || []);
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    window.open(`${INDEXER_URL}/merchant/${merchantAddress}/receipts.csv`, '_blank');
  };

  const getChainName = (chainId: number) => {
    return chainId === 421614 ? 'Arbitrum Sepolia' : 'Ethereum Sepolia';
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Merchant Dashboard</h1>
          <p className="text-gray-600 mt-2">Manage your invoices and view receipts</p>
        </div>
        <a
          href="/merchant/invoices/new"
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 font-medium transition"
        >
          + Create Invoice
        </a>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Chain</label>
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Chains</option>
              <option value="421614">Arbitrum Sepolia</option>
              <option value="11155111">Ethereum Sepolia</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Status</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="pt-7">
            <button
              onClick={exportCSV}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              📊 Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-gray-400 text-5xl mb-4">📄</div>
            <p className="text-gray-600 mb-4">No invoices found</p>
            <a
              href="/merchant/invoices/new"
              className="inline-block px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              Create Your First Invoice
            </a>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Invoice ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Chain
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-mono text-gray-900">
                      {invoice.id.slice(0, 10)}...
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-semibold">
                    {(parseInt(invoice.amount) / 1e6).toFixed(2)} PYUSD
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getChainName(invoice.chainId)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        invoice.status === 'paid'
                          ? 'bg-green-100 text-green-800'
                          : invoice.status === 'cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(invoice.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <a
                      href={`/checkout/${invoice.id}`}
                      className="text-primary-600 hover:text-primary-900"
                    >
                      View
                    </a>
                    {invoice.txHash && (
                      <>
                        {' • '}
                        <a
                          href={`https://sepolia.arbiscan.io/tx/${invoice.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:text-primary-900"
                        >
                          Explorer
                        </a>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

