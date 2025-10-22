'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { arbitrumSepolia, sepolia } from 'wagmi/chains';

// Get config function to avoid SSR issues
export function getWagmiConfig() {
  return getDefaultConfig({
    appName: 'PyPay Merchant Portal',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID',
    chains: [arbitrumSepolia, sepolia],
    ssr: false, // Disable SSR to avoid indexedDB errors
  });
}
