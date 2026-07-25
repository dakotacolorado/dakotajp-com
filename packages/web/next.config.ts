import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @dakotajp/core is a workspace package consumed as TypeScript source; Next
  // must transpile it rather than treating it as a prebuilt node_module.
  transpilePackages: ["@dakotajp/core"],
};

export default nextConfig;
