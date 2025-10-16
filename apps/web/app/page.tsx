export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto text-center py-16">
      <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-primary-600 to-blue-600 bg-clip-text text-transparent">
        TapKit
      </h1>
      <p className="text-xl text-gray-600 mb-12">
        Walletless, Gasless PYUSD Checkout with Multi-Chain Routing
      </p>
      
      <div className="grid md:grid-cols-2 gap-8 mb-16">
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
          <div className="text-4xl mb-4">🏪</div>
          <h2 className="text-2xl font-bold mb-4">For Merchants</h2>
          <p className="text-gray-600 mb-6">
            Create invoices, receive payments, and export receipts - all on-chain and gasless.
          </p>
          <a
            href="/merchant"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition"
          >
            Merchant Portal →
          </a>
        </div>
        
        <div className="bg-white p-8 rounded-xl shadow-lg border border-gray-200">
          <div className="text-4xl mb-4">💳</div>
          <h2 className="text-2xl font-bold mb-4">For Buyers</h2>
          <p className="text-gray-600 mb-6">
            Scan QR or tap NFC, authenticate with your face or fingerprint, and pay.
          </p>
          <div className="text-sm text-gray-500">
            Scan a merchant's QR code to start
          </div>
        </div>
      </div>
      
      <div className="bg-primary-50 p-8 rounded-xl border border-primary-200">
        <h3 className="text-xl font-bold mb-4">✨ Key Features</h3>
        <div className="grid md:grid-cols-3 gap-6 text-left">
          <div>
            <div className="font-semibold mb-2">🔐 Walletless</div>
            <div className="text-sm text-gray-600">
              No seed phrases, no browser extensions. Just your device's biometrics.
            </div>
          </div>
          <div>
            <div className="font-semibold mb-2">⛽ Gasless</div>
            <div className="text-sm text-gray-600">
              ERC-4337 Paymaster sponsors all fees. You never need ETH.
            </div>
          </div>
          <div>
            <div className="font-semibold mb-2">🔗 Multi-Chain</div>
            <div className="text-sm text-gray-600">
              Automatically routes to the cheapest network with cross-chain bridging.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

