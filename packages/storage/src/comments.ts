import {
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { Comment } from "@dakotajp/core";
import { ddb, TABLE_NAME } from "./client";
import { deletePartition } from "./partition";
import {
  COMMENT_FEED,
  commentFeedAttributes,
  commentKey,
  commentPartition,
  slugFromCommentPartition,
  statsKey,
} from "./keys";

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
      ExpressionAttributeValues: { ":pk": commentPartition(slug) },
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
              ...commentKey(slug, createdAt, id),
              ...commentFeedAttributes(createdAt),
              ...stored,
            },
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: statsKey(slug),
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
  return itemToComment(item, slugFromCommentPartition(item.pk as string));
}

/** Newest comments across every post. Over-fetches so filtering can still fill `limit`. */
export async function listRecentComments(limit = 10): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: COMMENT_FEED.index,
      KeyConditionExpression: `${COMMENT_FEED.partitionAttribute} = :pk`,
      ExpressionAttributeValues: { ":pk": COMMENT_FEED.partition },
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
      IndexName: COMMENT_FEED.index,
      KeyConditionExpression: `${COMMENT_FEED.partitionAttribute} = :pk AND ${COMMENT_FEED.sortAttribute} >= :since`,
      ExpressionAttributeValues: {
        ":pk": COMMENT_FEED.partition,
        ":since": sinceIso,
      },
      Select: "COUNT",
    }),
  );
  return res.Count ?? 0;
}

/**
 * Delete one comment, addressed by the `createdAt` its sort key is built from.
 * A comment with replies is tombstoned; a leaf is hard deleted.
 */
export async function deleteComment(
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<void> {
  const key = commentKey(slug, createdAt, commentId);
  const thread = await listComments(slug);
  const hasReplies = thread.some((c) => c.parentId === commentId);

  if (hasReplies) {
    // A tombstone still counts toward commentCount, and dropping the GSI
    // attributes takes it out of the cross-post feed without unthreading it.
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: key,
        UpdateExpression:
          `SET #deleted = :true, #u = :anon, #m = :anon ` +
          `REMOVE ${COMMENT_FEED.partitionAttribute}, ${COMMENT_FEED.sortAttribute}`,
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
              Key: statsKey(slug),
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
  await deletePartition(commentPartition(slug));
}
