import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  webpack(config) {
    if (process.env.VERCEL === "1" || process.env.CI === "true") {
      config.infrastructureLogging = {
        ...config.infrastructureLogging,
        level: "error"
      };
    }
    return config;
  }
};

export default nextConfig;
