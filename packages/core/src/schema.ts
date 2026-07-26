/** Constants the domain and the deployment share. See ADR 0002. */

/**
 * The table name the CDK stack creates. Deliberately a constant, not read from
 * `process.env` — a stray `TABLE_NAME` at deploy time would rename production.
 */
export const DEFAULT_TABLE_NAME = "dakotajp-site";

/** The versioned entities. Key shapes for these live in `storage/src/keys.ts`. */
export type EntityType = "PAGE" | "POST";

/** Derived from the body, not authored. Never enters a version snapshot. */
export const SUMMARY_FIELD = "summary";
export const SUMMARY_SOURCE_VERSION_FIELD = "summarySourceVersion";
export const DERIVED_FIELDS = [
  SUMMARY_FIELD,
  SUMMARY_SOURCE_VERSION_FIELD,
] as const;
