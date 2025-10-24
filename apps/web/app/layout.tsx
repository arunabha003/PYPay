import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PyPay - Walletless PYUSD Checkout',
  description: 'Pay with PYUSD using passkeys. Fast, secure, and gasless.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <nav className="border-b border-gray-200 bg-white shadow-sm">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <a href="/" className="flex items-center space-x-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xl">Py</span>
                </div>
                <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  PyPay
                </span>
              </a>
              <div className="flex gap-6">
                <a href="/" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                  Home
                </a>
                <a href="/merchant" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                  Merchant
                </a>
                <a href="/diagnostics" className="text-gray-700 hover:text-blue-600 font-medium transition-colors">
                  Diagnostics
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-6 py-12">{children}</main>
        <footer className="border-t border-gray-200 mt-20 py-8 bg-gray-50">
          <div className="container mx-auto px-6 text-center">
            <div className="flex items-center justify-center space-x-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">Py</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                PyPay
              </span>
            </div>
            <p className="text-gray-600 text-sm">Walletless, Gasless PYUSD Checkout </p>
            <p className="text-gray-500 text-xs mt-2">Built with ERC-4337, WebAuthn & Multi-Chain Routing</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

