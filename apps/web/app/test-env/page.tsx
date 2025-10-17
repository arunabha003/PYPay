'use client';

export default function TestEnvPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Environment Variables Test</h1>
      <div className="space-y-2">
        <div>RPC_ARBITRUM: {process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC || 'NOT SET'}</div>
        <div>RPC_SEPOLIA: {process.env.NEXT_PUBLIC_ETHEREUM_SEPOLIA_RPC || 'NOT SET'}</div>
        <div>FACTORY_ARB: {process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ARBSEPOLIA || 'NOT SET'}</div>
        <div>FACTORY_SEP: {process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_SEPOLIA || 'NOT SET'}</div>
        <div>PYUSD_ARB: {process.env.NEXT_PUBLIC_PYUSD_ARBSEPOLIA || 'NOT SET'}</div>
        <div>TEST_OWNER: {process.env.NEXT_PUBLIC_TEST_OWNER || 'NOT SET'}</div>
      </div>
    </div>
  );
}
