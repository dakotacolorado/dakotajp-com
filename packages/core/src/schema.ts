/** DynamoDB key shapes and entity constants. See ADR 0002. */

/**
 * The table name the CDK stack creates. Deliberately a constant, not read from
 * `process.env` — a stray `TABLE_NAME` at deploy time would rename production.
 */
export const DEFAULT_TABLE_NAME = "dakotajp-site";

export type EntityType = "PAGE" | "POST";

/** Fixed partition keys for the content model. */
export const PK = {
  page: "PAGE",
  post: "POST",
  postBody: "POSTBODY",
} as const;

export const bodyPk = (type: EntityType): string => `${type}BODY`;

/** Immutable version snapshots: `VERSION#<TYPE>#<id>`. */
export const versionPk = (type: EntityType, id: string): string =>
  `VERSION#${type}#${id}`;

export const VERSION_PAD = 10;
export const pad = (n: number): string => String(n).padStart(VERSION_PAD, "0");

/** Derived from the body, not authored. Never enters a version snapshot. */
export const SUMMARY_FIELD = "summary";
export const SUMMARY_SOURCE_VERSION_FIELD = "summarySourceVersion";
export const DERIVED_FIELDS = [
  SUMMARY_FIELD,
  SUMMARY_SOURCE_VERSION_FIELD,
] as const;
