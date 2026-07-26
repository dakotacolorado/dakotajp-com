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

// --- toggles ---------------------------------------------------------------

export async function togglePostLike(
  rid: string | null,
  slug: string,
): Promise<{ liked: boolean; likes: number }> {
  if (!rid) return { liked: false, likes: (await getPostStats(slug)).likes };

  const dedupe = likeKey(rid, slug, POST_LIKE_TARGET);
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
                  Key: statsKey(slug),
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
                  Key: statsKey(slug),
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
    liked: await readerLiked(rid, slug, POST_LIKE_TARGET),
    likes: (await getPostStats(slug)).likes,
  };
}

export async function toggleCommentLike(
  rid: string | null,
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<{ liked: boolean; likes: number }> {
  const target = commentKey(slug, createdAt, commentId);

  if (!rid) {
    const c = await ddb.send(
      new GetCommand({ TableName: TABLE_NAME, Key: target }),
    );
    return { liked: false, likes: (c.Item?.likes as number) ?? 0 };
  }

  const suffix = commentLikeTarget(commentId);
  const dedupe = likeKey(rid, slug, suffix);
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
                  Key: target,
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
                  Key: target,
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
      Key: target,
      ConsistentRead: true,
    }),
  );
  return {
    liked: await readerLiked(rid, slug, suffix),
    likes: (c.Item?.likes as number) ?? 0,
  };
}
