/**
 * DynamoDB key shapes and entity constants — the single source of truth.
 *
 * Pure and runtime-agnostic (see ADR 0001): imported by the Next server, the
 * summarizer Lambda, the CDK stack, and tests. No `server-only`, no `next/*`,
 * no AWS SDK clients.
 */

/**
 * The table name. CDK injects `TABLE_NAME` into the Lambda's env; the default is
 * the name the CDK stack creates, so dev and prod resolve to the same table and
 * the name lives in exactly one place.
 */
export const TABLE_NAME = process.env.TABLE_NAME ?? "dakotajp-site";

export type EntityType = "PAGE" | "POST";

/** Fixed partition keys for the content model. */
export const PK = {
  page: "PAGE",
  post: "POST",
  postBody: "POSTBODY",
} as const;

/** Body items live under `<TYPE>BODY` so list views never read bodies. */
export const bodyPk = (type: EntityType): string => `${type}BODY`;

/** Immutable version snapshots: `VERSION#<TYPE>#<id>`. */
export const versionPk = (type: EntityType, id: string): string =>
  `VERSION#${type}#${id}`;

export const VERSION_PAD = 10;
export const pad = (n: number): string => String(n).padStart(VERSION_PAD, "0");

/**
 * Fields derived from the body (the AI summary), not authored. Carried across
 * saves but never entered into a version snapshot — summarizing isn't an edit.
 * The summarizer writes these; a rollback must not restore them.
 */
export const SUMMARY_FIELD = "summary";
export const SUMMARY_SOURCE_VERSION_FIELD = "summarySourceVersion";
export const DERIVED_FIELDS = [
  SUMMARY_FIELD,
  SUMMARY_SOURCE_VERSION_FIELD,
] as const;
