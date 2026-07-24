import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./dynamo";
import { getSecureParam, SSM_PARAMS } from "./ssm";

/**
 * Anonymous likes on posts and comments. No reader login.
 *
 * Abuse model (b): each reader gets a signed, httpOnly cookie holding a random
 * ID. A per-(reader, target) dedupe item enforces one like each and lets us
 * render the reader's own liked-state. This survives reloads and stops casual
 * repeat-click inflation (clearing cookies still mints a fresh identity — an
 * accepted limit for anonymous likes).
 *
 *   Dedupe:     pk = "LIKE#<rid>"   sk = "<slug>#post" | "<slug>#c#<id>"
 *   Post stats: pk = "POSTSTATS"    sk = "<slug>"   { likes, commentCount }
 *   Comment:    the COMMENT item gets a `likes` attribute
 *
 * Counters are atomic `ADD`s, never read-modify-write, and post likes live on a
 * separate POSTSTATS item — so a like landing mid-save can't be clobbered by
 * commitVersion's read-then-write of the POST item, and a like is never an edit
 * (no version bump, no snapshot).
 */

const READER_COOKIE = "rid";
const READER_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

export const STATS_PK = "POSTSTATS";
const likePk = (rid: string) => `LIKE#${rid}`;
const POST_SUFFIX = "post";
const commentSuffix = (commentId: string) => `c#${commentId}`;
const dedupeSk = (slug: string, suffix: string) => `${slug}#${suffix}`;

export interface Stats {
  likes: number;
  commentCount: number;
}

// --- reader identity -------------------------------------------------------

async function secretKey(): Promise<Uint8Array | null> {
  const secret = await getSecureParam(SSM_PARAMS.sessionSecret);
  return secret ? new TextEncoder().encode(secret) : null;
}

/** The reader's ID from their signed cookie, or null if absent/unverified. */
export async function getReaderId(): Promise<string | null> {
  const token = (await cookies()).get(READER_COOKIE)?.value;
  if (!token) return null;
  const key = await secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return typeof payload.rid === "string" ? payload.rid : null;
  } catch {
    return null;
  }
}

/** Read the reader's ID, minting + setting the cookie on first like. */
async function ensureReaderId(): Promise<string | null> {
  const existing = await getReaderId();
  if (existing) return existing;
  const key = await secretKey();
  if (!key) return null;

  const rid = randomUUID();
  const token = await new SignJWT({ rid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(key);
  (await cookies()).set(READER_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: READER_TTL_SECONDS,
  });
  return rid;
}

// --- reads -----------------------------------------------------------------

export async function getPostStats(slug: string): Promise<Stats> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: STATS_PK, sk: slug },
      ConsistentRead: true,
    }),
  );
  return {
    likes: (res.Item?.likes as number) ?? 0,
    commentCount: (res.Item?.commentCount as number) ?? 0,
  };
}

/** Every post's counters in one query, keyed by slug. */
export async function getAllPostStats(): Promise<Map<string, Stats>> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": STATS_PK },
    }),
  );
  const map = new Map<string, Stats>();
  for (const it of res.Items ?? []) {
    map.set(it.sk as string, {
      likes: (it.likes as number) ?? 0,
      commentCount: (it.commentCount as number) ?? 0,
    });
  }
  return map;
}

/**
 * Which targets on a post the current reader has liked — the suffixes "post"
 * and "c#<id>" — in one query. Used to render filled vs. empty hearts.
 */
export async function getReaderPostLikes(slug: string): Promise<Set<string>> {
  const rid = await getReaderId();
  if (!rid) return new Set();
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": likePk(rid),
        ":prefix": `${slug}#`,
      },
    }),
  );
  const prefixLen = `${slug}#`.length;
  const set = new Set<string>();
  for (const it of res.Items ?? []) set.add((it.sk as string).slice(prefixLen));
  return set;
}

async function readerLiked(
  rid: string,
  slug: string,
  suffix: string,
): Promise<boolean> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: likePk(rid), sk: dedupeSk(slug, suffix) },
    }),
  );
  return Boolean(res.Item);
}

// --- toggles ---------------------------------------------------------------

export async function togglePostLike(
  slug: string,
): Promise<{ liked: boolean; likes: number }> {
  const rid = await ensureReaderId();
  if (!rid) return { liked: false, likes: (await getPostStats(slug)).likes };

  const dedupe = { pk: likePk(rid), sk: dedupeSk(slug, POST_SUFFIX) };
  const already = Boolean(
    (await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: dedupe })))
      .Item,
  );

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: already
          ? [
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: dedupe,
                  ConditionExpression: "attribute_exists(pk)",
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { pk: STATS_PK, sk: slug },
                  UpdateExpression: "ADD #likes :d",
                  ExpressionAttributeNames: { "#likes": "likes" },
                  ExpressionAttributeValues: { ":d": -1 },
                },
              },
            ]
          : [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: dedupe,
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: { pk: STATS_PK, sk: slug },
                  UpdateExpression: "ADD #likes :d",
                  ExpressionAttributeNames: { "#likes": "likes" },
                  ExpressionAttributeValues: { ":d": 1 },
                },
              },
            ],
      }),
    );
  } catch {
    // A concurrent toggle raced us — fall through and report actual state.
  }

  return {
    liked: await readerLiked(rid, slug, POST_SUFFIX),
    likes: (await getPostStats(slug)).likes,
  };
}

export async function toggleCommentLike(
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<{ liked: boolean; likes: number }> {
  const commentKey = { pk: `COMMENT#${slug}`, sk: `${createdAt}#${commentId}` };

  const rid = await ensureReaderId();
  if (!rid) {
    const c = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: commentKey }),
    );
    return { liked: false, likes: (c.Item?.likes as number) ?? 0 };
  }

  const suffix = commentSuffix(commentId);
  const dedupe = { pk: likePk(rid), sk: dedupeSk(slug, suffix) };
  const already = Boolean(
    (await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: dedupe })))
      .Item,
  );

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: already
          ? [
              {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: dedupe,
                  ConditionExpression: "attribute_exists(pk)",
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: commentKey,
                  UpdateExpression: "ADD #likes :d",
                  ConditionExpression: "attribute_exists(pk)",
                  ExpressionAttributeNames: { "#likes": "likes" },
                  ExpressionAttributeValues: { ":d": -1 },
                },
              },
            ]
          : [
              {
                Put: {
                  TableName: TABLE_NAME,
                  Item: dedupe,
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
              {
                Update: {
                  TableName: TABLE_NAME,
                  Key: commentKey,
                  UpdateExpression: "ADD #likes :d",
                  ConditionExpression: "attribute_exists(pk)",
                  ExpressionAttributeNames: { "#likes": "likes" },
                  ExpressionAttributeValues: { ":d": 1 },
                },
              },
            ],
      }),
    );
  } catch {
    // Raced, or the comment was deleted — report actual state below.
  }

  const c = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: commentKey,
      ConsistentRead: true,
    }),
  );
  return {
    liked: await readerLiked(rid, slug, suffix),
    likes: (c.Item?.likes as number) ?? 0,
  };
}
