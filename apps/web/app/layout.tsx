import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TapKit - Walletless PYUSD Checkout',
  description: 'Pay with PYUSD using passkeys on the cheapest network',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
        <nav className="border-b bg-white/80 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-primary-600">TapKit</h1>
              <div className="flex gap-4">
                <a href="/" className="text-gray-600 hover:text-primary-600">
                  Home
                </a>
                <a href="/merchant" className="text-gray-600 hover:text-primary-600">
                  Merchant
                </a>
                <a href="/diagnostics" className="text-gray-600 hover:text-primary-600">
                  Diagnostics
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="container mx-auto px-4 py-8">{children}</main>
        <footer className="border-t mt-16 py-8 text-center text-gray-500 text-sm">
          <p>PyPay - Walletless, Gasless PYUSD Checkout</p>
          <p className="mt-2">Built with ERC-4337, WebAuthn, and Multi-Chain Routing</p>
        </footer>
      </body>
    </html>
  );
}

