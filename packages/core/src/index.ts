// @dakotajp/core — the domain model (the system's glossary).
//
// Pure TypeScript only: no "server-only", no next/*, no AWS SDK clients. core is
// bundled into the Next server, client components, and the Lambdas, so it stays
// runtime-agnostic and dependency-light (arch.test.ts enforces it). Organized by
// sub-domain — start in `blog/` for the flagship.

// Cross-cutting
export * from "./schema";
export * from "./version";

// Sub-domains
export * from "./page";
export * from "./blog";
