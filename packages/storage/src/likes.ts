import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./client";
import {
  POST_LIKE_TARGET,
  STATS_PARTITION,
  commentKey,
  commentLikeTarget,
  likeKey,
  likePartition,
  likePrefix,
  statsKey,
  targetFromLikeSortKey,
} from "./keys";

// A comment's own `likes` attribute lives on the COMMENT item; a post's lives
// on its POSTSTATS item. `rid` is resolved by the caller (ADR 0001).

export interface Stats {
  likes: number;
  commentCount: number;
}

// --- reads -----------------------------------------------------------------

export async function getPostStats(slug: string): Promise<Stats> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: statsKey(slug),
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
      ExpressionAttributeValues: { ":pk": STATS_PARTITION },
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

/** Which targets on a post this reader has liked: the suffixes "post" and "c#<id>". */
export async function getReaderPostLikes(
  rid: string | null,
  slug: string,
): Promise<Set<string>> {
  if (!rid) return new Set();
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: {
        ":pk": likePartition(rid),
        ":prefix": likePrefix(slug),
      },
    }),
  );
  const set = new Set<string>();
  for (const it of res.Items ?? []) {
    set.add(targetFromLikeSortKey(it.sk as string, slug));
  }
  return set;
}

async function readerLiked(
  rid: string,
  slug: string,
  target: string,
): Promise<boolean> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: likeKey(rid, slug, target) }),
  );
  return Boolean(res.Item);
}

/**
 * The `likes` attribute on whichever item holds this target's counter, read
 * consistently so a toggle never reports the count it just superseded.
 */
async function readLikeCount(counterKey: {
  pk: string;
  sk: string;
}): Promise<number> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: counterKey,
      ConsistentRead: true,
    }),
  );
  return (res.Item?.likes as number) ?? 0;
}

// --- toggles ---------------------------------------------------------------

/** What a toggle acts on: the dedupe suffix plus the item holding the count. */
interface LikeTarget {
  /** Identifies what was liked, as the suffix of the dedupe `sk`. */
  suffix: string;
  /** The item whose `likes` attribute this toggle moves. */
  counterKey: { pk: string; sk: string };
  /**
   * Whether the counter item must already exist. A comment counts on its own
   * item, so a deleted comment must fail the toggle; a post's POSTSTATS item
   * is created by the first like, so it must not.
   */
  requireCounter: boolean;
}

/**
 * Flip one reader's like on one target.
 *
 * The dedupe marker and the counter move in a single transaction, so a like is
 * never counted twice and the count can't drift from the markers. A losing
 * race throws, which is why the real state is re-read before returning rather
 * than inferred from what we intended to write.
 */
async function toggleLike(
  rid: string | null,
  slug: string,
  target: LikeTarget,
): Promise<{ liked: boolean; likes: number }> {
  if (!rid) {
    return { liked: false, likes: await readLikeCount(target.counterKey) };
  }

  const dedupe = likeKey(rid, slug, target.suffix);
  const already = Boolean(
    (await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: dedupe })))
      .Item,
  );

  const counter = {
    TableName: TABLE_NAME,
    Key: target.counterKey,
    UpdateExpression: "ADD #likes :d",
    ...(target.requireCounter
      ? { ConditionExpression: "attribute_exists(pk)" }
      : {}),
    ExpressionAttributeNames: { "#likes": "likes" },
    ExpressionAttributeValues: { ":d": already ? -1 : 1 },
  };

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          already
            ? {
                Delete: {
                  TableName: TABLE_NAME,
                  Key: dedupe,
                  ConditionExpression: "attribute_exists(pk)",
                },
              }
            : {
                Put: {
                  TableName: TABLE_NAME,
                  Item: dedupe,
                  ConditionExpression: "attribute_not_exists(pk)",
                },
              },
          { Update: counter },
        ],
      }),
    );
  } catch {
    // Raced, or the target is gone — report actual state below.
  }

  return {
    liked: await readerLiked(rid, slug, target.suffix),
    likes: await readLikeCount(target.counterKey),
  };
}

export async function togglePostLike(
  rid: string | null,
  slug: string,
): Promise<{ liked: boolean; likes: number }> {
  return toggleLike(rid, slug, {
    suffix: POST_LIKE_TARGET,
    counterKey: statsKey(slug),
    requireCounter: false,
  });
}

export async function toggleCommentLike(
  rid: string | null,
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<{ liked: boolean; likes: number }> {
  return toggleLike(rid, slug, {
    suffix: commentLikeTarget(commentId),
    counterKey: commentKey(slug, createdAt, commentId),
    requireCounter: true,
  });
}
