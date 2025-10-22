import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    // Only apply client-side fixes
    if (!isServer) {
      // Ignore react-native dependencies that cause issues in browser
      config.resolve.alias = {
        ...config.resolve.alias,
        '@react-native-async-storage/async-storage': false,
      };
      
      // Fallback for missing modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Suppress all warnings for missing modules (both server and client)
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      // Suppress missing module warnings
      (warning: any) => {
        if (warning.message?.includes("Can't resolve '@react-native-async-storage/async-storage'")) {
          return true;
        }
        if (warning.message?.includes('@metamask/sdk')) {
          return true;
        }
        if (warning.message?.includes('indexedDB is not defined')) {
          return true;
        }
        return false;
      },
    ];
    
    return config;
  },
  // Suppress specific build warnings
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
