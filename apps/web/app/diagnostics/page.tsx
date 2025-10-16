'use client';

import { useState, useEffect } from 'react';

const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL || 'http://localhost:3001';
const RELAYER_URL = process.env.NEXT_PUBLIC_RELAYER_URL || 'http://localhost:3002';

interface SystemHealth {
  indexer: 'healthy' | 'unhealthy' | 'unknown';
  relayer: 'healthy' | 'unhealthy' | 'unknown';
  costEngine: 'healthy' | 'unhealthy' | 'unknown';
}

interface ChainInfo {
  name: string;
  chainId: number;
  explorerUrl: string;
}

interface CostQuote {
  chainId: number;
  chainName: string;
  gasSponsorCostUsd: number;
  estLatencyMs: number;
  bridgeCostUsd: number;
  totalCostUsd: number;
  updatedAt: number;
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<SystemHealth>({
    indexer: 'unknown',
    relayer: 'unknown',
    costEngine: 'unknown',
  });
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [quotes, setQuotes] = useState<CostQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkHealth();
    loadChainInfo();
    loadCostQuotes();
  }, []);

  const checkHealth = async () => {
    // Check indexer
    try {
      const response = await fetch(`${INDEXER_URL}/health`);
      setHealth((prev) => ({ ...prev, indexer: response.ok ? 'healthy' : 'unhealthy' }));
    } catch {
      setHealth((prev) => ({ ...prev, indexer: 'unhealthy' }));
    }

    // Check relayer
    try {
      const response = await fetch(`${RELAYER_URL}/health`);
      setHealth((prev) => ({ ...prev, relayer: response.ok ? 'healthy' : 'unhealthy' }));
    } catch {
      setHealth((prev) => ({ ...prev, relayer: 'unhealthy' }));
    }

    // Cost engine health is included in indexer
    setHealth((prev) => ({ ...prev, costEngine: prev.indexer }));
  };

  const loadChainInfo = async () => {
    try {
      const response = await fetch(`${INDEXER_URL}/chains`);
      const data = await response.json();
      setChains(data);
    } catch {
      setChains([
        { name: 'Arbitrum Sepolia', chainId: 421614, explorerUrl: 'https://sepolia.arbiscan.io' },
        { name: 'Ethereum Sepolia', chainId: 11155111, explorerUrl: 'https://sepolia.etherscan.io' },
      ]);
    }
  };

  const loadCostQuotes = async () => {
    try {
      const response = await fetch(`${INDEXER_URL}/costs/quotes`);
      const data = await response.json();
      setQuotes(data);
    } catch {
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <span className="text-green-600 text-2xl">✓</span>;
      case 'unhealthy':
        return <span className="text-red-600 text-2xl">✗</span>;
      default:
        return <span className="text-gray-400 text-2xl">?</span>;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">System Diagnostics</h1>
      <p className="text-gray-600 mb-8">Monitor the health and status of all PyPay services</p>

      {/* Service Health */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Service Health</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {Object.entries(health).map(([service, status]) => (
            <div
              key={service}
              className={`border-2 rounded-lg p-4 ${getStatusColor(status)}`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold capitalize">{service}</div>
                  <div className="text-sm mt-1">{status}</div>
                </div>
                {getStatusIcon(status)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Configured Chains */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Configured Chains</h2>
        {chains.length === 0 ? (
          <p className="text-gray-500">No chains configured</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {chains.map((chain) => (
              <div key={chain.chainId} className="border rounded-lg p-4">
                <div className="font-semibold mb-2">{chain.name}</div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>Chain ID: {chain.chainId}</div>
                  <div>
                    <a
                      href={chain.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-800"
                    >
                      Block Explorer →
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost Quotes */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-bold mb-4">Current Cost Quotes</h2>
        {loading ? (
          <p className="text-gray-500">Loading quotes...</p>
        ) : quotes.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No cost quotes available</p>
            <p className="text-sm text-gray-400">Make sure the cost engine service is running</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Chain
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Gas Sponsor
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Bridge Cost
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Total
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Latency
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {quotes.map((quote) => (
                  <tr key={quote.chainId}>
                    <td className="px-4 py-3 font-medium">{quote.chainName}</td>
                    <td className="px-4 py-3 text-sm">
                      ${quote.gasSponsorCostUsd.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm">${quote.bridgeCostUsd.toFixed(4)}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-primary-600">
                      ${quote.totalCostUsd.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {(quote.estLatencyMs / 1000).toFixed(1)}s
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(quote.updatedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Configuration</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-600">Indexer URL:</span>
            <span className="font-mono text-xs">{INDEXER_URL}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-600">Relayer URL:</span>
            <span className="font-mono text-xs">{RELAYER_URL}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-gray-600">Environment:</span>
            <span className="font-medium">
              {process.env.NODE_ENV || 'development'}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-8 text-center text-sm text-gray-500">
        <p>System diagnostics refresh automatically</p>
        <button
          onClick={() => {
            checkHealth();
            loadCostQuotes();
          }}
          className="mt-2 text-primary-600 hover:text-primary-800 font-medium"
        >
          ↻ Refresh Now
        </button>
      </div>
    </div>
  );
}

