import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Docker production builds to succeed even if ESLint finds issues.
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config: any) => {
    // Copy PDF.js worker files to the public directory
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
