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

/**
 * Key prefix for uploaded images, and the CloudFront path that serves them.
 * The two are deliberately the same string: the `/media/*` behaviour passes the
 * path through to S3 untouched, so an object's public URL is just `/` + its
 * key. Change one and the other has to move with it.
 */
export const MEDIA_PREFIX = "media";

/** What the upload endpoint will sign for. Anything else is rejected. */
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/**
 * Ceiling on a single upload, checked when signing and enforced again by the
 * signed policy. Generous because the browser resizes before it uploads — this
 * is the guard for the paths that skip that, not the expected size.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The versioned entities. Key shapes for these live in `storage/src/keys.ts`. */
export type EntityType = "PAGE" | "POST";

/** Derived from the body, not authored. Never enters a version snapshot. */
export const SUMMARY_FIELD = "summary";
export const SUMMARY_SOURCE_VERSION_FIELD = "summarySourceVersion";
export const DERIVED_FIELDS = [
  SUMMARY_FIELD,
  SUMMARY_SOURCE_VERSION_FIELD,
] as const;
