import type { EntityType } from "@dakotajp/core";

/**
 * Every key family in the table, in one place. See ADR 0002.
 *
 * This module is the contract between every reader and writer of the table. It
 * is not exported from the package barrel: nothing outside `storage` builds a
 * key, so nothing outside `storage` needs this file.
 *
 * ```
 * item              pk                      sk                      holds
 * ----------------- ----------------------- ----------------------- ---------------------------------
 * page              PAGE                    <key>                   title + markdown body, inline
 * post metadata     POST                    <slug>                  title, tags, excerpt, summary
 * post body         POSTBODY                <slug>                  the markdown body, alone
 * version snapshot  VERSION#<TYPE>#<id>     0000000007              immutable copy of one save
 * comment           COMMENT#<slug>          <createdAt>#<uuid>      one comment (+GSI1 while visible)
 * post counters     POSTSTATS               <slug>                  { likes, commentCount }
 * like dedupe       LIKE#<rid>              <slug>#post             this reader liked the post
 *                                           <slug>#c#<commentId>    this reader liked that comment
 * rate-limit window RATELIMIT#<key>         <unix second>           { count, ttl }, self-expiring
 * ```
 *
 * Two shapes recur below. A `*Key` builds a whole `{ pk, sk }` — one addressed
 * item. A `*Partition` builds the `pk` alone — the argument to a Query that
 * reads a whole family.
 */

// --- entity types ----------------------------------------------------------

/**
 * A versioned entity's type doubles as the partition key of its current item,
 * which is why `PAGE`/`POST` appear both as `EntityType` and as a `pk` above.
 */
export const PAGE = "PAGE" satisfies EntityType;
export const POST = "POST" satisfies EntityType;

// --- current items (pages, post metadata) ----------------------------------

/** The live item for one entity. Superseded on every save; never a snapshot. */
export const currentKey = (type: EntityType, id: string) => ({
  pk: type,
  sk: id,
});

/** Every current item of one type — the list query's partition. */
export const currentPartition = (type: EntityType): string => type;

/** The body, split off so list queries never pay to read bodies. */
export const bodyKey = (type: EntityType, id: string) => ({
  pk: bodyPartition(type),
  sk: id,
});

export const bodyPartition = (type: EntityType): string => `${type}BODY`;

// --- version snapshots -----------------------------------------------------

/** Width of the zero-padded version in `sk`, so string order is numeric order. */
export const VERSION_PAD = 10;

export const paddedVersion = (version: number): string =>
  String(version).padStart(VERSION_PAD, "0");

/** One entity's whole history. */
export const versionPartition = (type: EntityType, id: string): string =>
  `VERSION#${type}#${id}`;

export const versionKey = (type: EntityType, id: string, version: number) => ({
  pk: versionPartition(type, id),
  sk: paddedVersion(version),
});

// --- comments --------------------------------------------------------------

/** One post's whole thread. */
export const commentPartition = (slug: string): string => `COMMENT#${slug}`;

/** Timestamp-first, so a Query returns a thread in creation order. */
export const commentSortKey = (createdAt: string, commentId: string): string =>
  `${createdAt}#${commentId}`;

export const commentKey = (
  slug: string,
  createdAt: string,
  commentId: string,
) => ({
  pk: commentPartition(slug),
  sk: commentSortKey(createdAt, commentId),
});

/** The slug is only in the partition key, so admin reads recover it from there. */
export const slugFromCommentPartition = (pk: string): string =>
  pk.slice("COMMENT#".length);

/**
 * Cross-post comment feed. Only comments carrying these attributes appear in
 * it — a tombstone has them removed, so it leaves moderation without leaving
 * its thread.
 */
export const COMMENT_FEED = {
  index: "GSI1",
  partitionAttribute: "GSI1PK",
  sortAttribute: "GSI1SK",
  partition: "COMMENT",
} as const;

/** The GSI attributes to stamp on a comment that should appear in the feed. */
export const commentFeedAttributes = (createdAt: string) => ({
  [COMMENT_FEED.partitionAttribute]: COMMENT_FEED.partition,
  [COMMENT_FEED.sortAttribute]: createdAt,
});

// --- post counters ---------------------------------------------------------

/**
 * Counters live off the POST item so a like landing mid-save isn't clobbered by
 * `commitVersion`'s read-then-write. Moved only by atomic `ADD`.
 */
export const STATS_PARTITION = "POSTSTATS";

export const statsKey = (slug: string) => ({
  pk: STATS_PARTITION,
  sk: slug,
});

// --- like dedupe -----------------------------------------------------------

/** What a reader liked, as the suffix of a dedupe `sk`. */
export const POST_LIKE_TARGET = "post";

export const commentLikeTarget = (commentId: string): string =>
  `c#${commentId}`;

/** Everything one reader has liked. */
export const likePartition = (rid: string): string => `LIKE#${rid}`;

/** Everything one reader has liked *on one post* — a `begins_with` prefix. */
export const likePrefix = (slug: string): string => `${slug}#`;

export const likeKey = (rid: string, slug: string, target: string) => ({
  pk: likePartition(rid),
  sk: `${likePrefix(slug)}${target}`,
});

/** A dedupe `sk` back to its target suffix (`post` or `c#<id>`). */
export const targetFromLikeSortKey = (sk: string, slug: string): string =>
  sk.slice(likePrefix(slug).length);

// --- rate limiting ---------------------------------------------------------

/** One fixed window. Items self-expire via the table's `ttl` attribute. */
export const rateLimitKey = (key: string, second: number) => ({
  pk: `RATELIMIT#${key}`,
  sk: String(second),
});
