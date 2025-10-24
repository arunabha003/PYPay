export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-20">
        <div className="inline-flex items-center space-x-3 mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-3xl">Py</span>
          </div>
          <h1 className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            PyPay
          </h1>
        </div>
        <p className="text-2xl text-gray-600 mb-4 font-light">
          Walletless, Gasless PYUSD Checkout Powered by ERC-4337
        </p>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
        </p>
      </div>
      
      {/* Main Feature Cards */}
      <div className="grid md:grid-cols-2 gap-8 mb-20">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-10 rounded-2xl border border-blue-200 hover:shadow-xl transition-shadow">
          <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4 text-gray-900">For Merchants</h2>
          <p className="text-gray-700 mb-8 text-lg">
            Create invoices, receive payments, and manage receipts. All transactions are on-chain, gasless, and instant.
          </p>
          <a
            href="/merchant"
            className="inline-flex items-center px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition font-semibold shadow-lg hover:shadow-xl"
          >
            Open Merchant Portal
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </a>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-10 rounded-2xl border border-purple-200 hover:shadow-xl transition-shadow">
          <div className="w-14 h-14 bg-purple-600 rounded-xl flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold mb-4 text-gray-900">For Buyers</h2>
          <p className="text-gray-700 mb-8 text-lg">
            Scan a QR code, authenticate with biometrics, and pay instantly. No wallet setup, no gas fees required.
          </p>
          <div className="inline-flex items-center px-8 py-4 bg-gray-100 text-gray-700 rounded-xl font-medium">
            Scan merchant QR to start
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
        </div>
      </div>
      
      {/* Features Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-12 rounded-2xl border border-gray-200">
        <h3 className="text-3xl font-bold mb-10 text-center text-gray-900">Why PyPay?</h3>
        <div className="grid md:grid-cols-3 gap-10">
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h4 className="font-bold text-xl mb-3 text-gray-900">Walletless</h4>
            <p className="text-gray-600 leading-relaxed">
              No seed phrases, no extensions. Use your device's biometrics for secure authentication.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h4 className="font-bold text-xl mb-3 text-gray-900">Gasless</h4>
            <p className="text-gray-600 leading-relaxed">
              ERC-4337 paymaster sponsors all fees. You never need ETH for gas.
            </p>
          </div>
          <div className="text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <h4 className="font-bold text-xl mb-3 text-gray-900">Multi-Chain</h4>
            <p className="text-gray-600 leading-relaxed">
              Instant cross-chain bridging to ensure seamless transactions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

