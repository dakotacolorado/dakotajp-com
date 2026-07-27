/** Constants the domain and the deployment share. See ADR 0002. */

/**
 * The content table the CDK stack creates. Deliberately a constant, not read
 * from `process.env` — a stray `TABLE_NAME` at deploy time would rename
 * production.
 */
export const DEFAULT_TABLE_NAME = "dakotajp-site";

/**
 * The rate-limit table. Separate from the content table because its items are
 * ephemeral operational state, not domain content — see ADR 0003.
 */
export const DEFAULT_RATE_LIMIT_TABLE_NAME = "dakotajp-ratelimit";

/** The versioned entities. Key shapes for these live in `storage/src/keys.ts`. */
export type EntityType = "PAGE" | "POST";

/** Derived from the body, not authored. Never enters a version snapshot. */
export const SUMMARY_FIELD = "summary";
export const SUMMARY_SOURCE_VERSION_FIELD = "summarySourceVersion";
export const DERIVED_FIELDS = [
  SUMMARY_FIELD,
  SUMMARY_SOURCE_VERSION_FIELD,
] as const;
