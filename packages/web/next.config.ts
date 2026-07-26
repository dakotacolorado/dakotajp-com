import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages are consumed as TypeScript source, not prebuilt.
  transpilePackages: ["@dakotajp/core", "@dakotajp/storage"],
};

export default nextConfig;
