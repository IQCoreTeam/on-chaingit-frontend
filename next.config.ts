import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [],
  serverExternalPackages: ["ws", "@solana/web3.js", "@coral-xyz/anchor", "iqlabs-sdk"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      os: false,
      crypto: false, 
    };
    return config;
  },
};

export default nextConfig;
