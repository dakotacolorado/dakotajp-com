import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @dakotajp/core and @dakotajp/storage are workspace packages consumed as
  // TypeScript source; Next must transpile them rather than treating them as
  // prebuilt node_modules.
  transpilePackages: ["@dakotajp/core", "@dakotajp/storage"],
};

export default nextConfig;
