/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'encoding');
    
    // @simplewebauthn/browser is client-side only
    if (isServer) {
      config.externals.push('@simplewebauthn/browser');
    }
    
    return config;
  },
};

module.exports = nextConfig;

