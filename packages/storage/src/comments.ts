import {
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { Comment } from "@dakotajp/core";
import { ddb, TABLE_NAME } from "./client";
import { STATS_PK } from "./likes";

//   pk = "COMMENT#<slug>"   sk = "<ISO timestamp>#<uuid>"
//   GSI1PK = "COMMENT"      GSI1SK = createdAt      cross-post feed
//
// GOTCHA: only comments carrying GSI1PK/GSI1SK appear in the cross-post feed.
// A tombstoned comment has them removed, so it drops out of moderation while
// staying in its thread.

const GSI = "GSI1";
const pk = (slug: string) => `COMMENT#${slug}`;

/** `slug` lives in the partition key, not on the item, so the caller supplies it. */
function itemToComment(item: Record<string, unknown>, slug: string): Comment {
  return Comment.from({
    slug,
    id: item.id as string,
    username: item.username as string,
    message: item.message as string,
    createdAt: item.createdAt as string,
    likes: (item.likes as number) ?? 0,
    parentId: item.parentId as string | undefined,
    deleted: (item.deleted as boolean | undefined) || undefined,
  });
}

/** A post's whole thread in one query. */
export async function listComments(slug: string): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk(slug) },
      ScanIndexForward: true, // oldest first
    }),
  );
  return (res.Items ?? []).map((it) => itemToComment(it, slug));
}

export async function addComment(
  slug: string,
  input: { username: string; message: string; parentId?: string },
): Promise<Comment> {
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const stored = {
    id,
    username: input.username,
    message: input.message,
    createdAt,
    likes: 0,
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
  // One transaction, so the denormalized commentCount can't drift.
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              pk: pk(slug),
              sk: `${createdAt}#${id}`,
              GSI1PK: "COMMENT",
              GSI1SK: createdAt,
              ...stored,
            },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { pk: STATS_PK, sk: slug },
            UpdateExpression: "ADD #count :one",
            ExpressionAttributeNames: { "#count": "commentCount" },
            ExpressionAttributeValues: { ":one": 1 },
          },
        },
      ],
    }),
  );
  return Comment.from({ slug, ...stored });
}

function toAdminComment(item: Record<string, unknown>): Comment {
  const partition = item.pk as string; // "COMMENT#<slug>"
  return itemToComment(item, partition.slice("COMMENT#".length));
}

/** Newest comments across every post. Over-fetches so filtering can still fill `limit`. */
export async function listRecentComments(limit = 10): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "COMMENT" },
      ScanIndexForward: false, // newest first
      Limit: limit * 2 + 10,
    }),
  );
  return (res.Items ?? [])
    .map(toAdminComment)
    .filter((c) => !c.isDeleted)
    .slice(0, limit);
}

/** Count of comments at or after an ISO timestamp (e.g. 24h / 7d ago). */
export async function countCommentsSince(sinceIso: string): Promise<number> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI,
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK >= :since",
      ExpressionAttributeValues: { ":pk": "COMMENT", ":since": sinceIso },
      Select: "COUNT",
    }),
  );
  return res.Count ?? 0;
}

/**
 * Delete one comment. A comment with replies is tombstoned; a leaf is hard
 * deleted. `sk` is `` `${createdAt}#${id}` ``.
 */
export async function deleteComment(
  slug: string,
  commentId: string,
  sk: string,
): Promise<void> {
  const key = { pk: pk(slug), sk };
  const thread = await listComments(slug);
  const hasReplies = thread.some((c) => c.parentId === commentId);

  if (hasReplies) {
    // A tombstone still counts toward commentCount.
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression:
          "SET #deleted = :true, #u = :anon, #m = :anon REMOVE GSI1PK, GSI1SK",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeNames: {
          "#deleted": "deleted",
          "#u": "username",
          "#m": "message",
        },
        ExpressionAttributeValues: { ":true": true, ":anon": "[deleted]" },
      }),
    );
    return;
  }

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Delete: {
              TableName: TABLE_NAME,
              Key: key,
              // Guards against a double delete over-decrementing the count.
              ConditionExpression: "attribute_exists(pk)",
            },
          },
          {
            Update: {
              TableName: TABLE_NAME,
              Key: { pk: STATS_PK, sk: slug },
              UpdateExpression: "ADD #count :neg",
              ConditionExpression: "attribute_exists(pk) AND #count > :zero",
              ExpressionAttributeNames: { "#count": "commentCount" },
              ExpressionAttributeValues: { ":neg": -1, ":zero": 0 },
            },
          },
        ],
      }),
    );
  } catch {
    // No POSTSTATS counter yet, or the comment is already gone.
    await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: key }));
  }
}

/** Delete every comment on a post. */
export async function deleteComments(slug: string): Promise<void> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk(slug) },
      ProjectionExpression: "pk, sk",
    }),
  );
  const items = res.Items ?? [];
  for (let i = 0; i < items.length; i += 25) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: items.slice(i, i + 25).map((it) => ({
            DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
          })),
        },
      }),
    );
  }
}
