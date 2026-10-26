import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the floating dev badge (keeps dashboards and README screenshots clean; error overlay still works).
  devIndicators: false,
};

export default nextConfig;
