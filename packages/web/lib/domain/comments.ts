import "server-only";
import {
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, TABLE_NAME } from "@/lib/db/dynamo";
import { STATS_PK } from "@/lib/domain/likes";

/**
 * Public blog comments (no login).
 *
 *   pk = "COMMENT#<postSlug>"   sk = "<ISO timestamp>#<uuid>"
 *
 * Anyone may post a { username, message }. Rendering escapes output (React),
 * so stored markup is inert. Spam mitigation (rate limit / Turnstile) can be
 * layered onto addComment later without changing this shape.
 *
 * Comments are partitioned per post, so a cross-post feed (the admin dashboard)
 * reads the GSI: every comment also carries GSI1PK = "COMMENT" and
 * GSI1SK = createdAt, giving "newest across all posts" as one query. Only
 * comments written with those keys are indexed (see the backfill script).
 */

export interface Comment {
  id: string;
  username: string;
  message: string;
  createdAt: string;
  likes: number;
  /** Parent comment's `id`. Absent for top-level comments. */
  parentId?: string;
  /** Tombstone: deleted but kept as a node because it has replies. Rendered as
   *  "[deleted]" with the author and controls suppressed. */
  deleted?: boolean;
}

/** A comment plus which post it belongs to — for the cross-post admin feed. */
export interface AdminComment extends Comment {
  slug: string;
}

const GSI = "GSI1";
const pk = (slug: string) => `COMMENT#${slug}`;

function itemToComment(item: Record<string, unknown>): Comment {
  return {
    id: item.id as string,
    username: item.username as string,
    message: item.message as string,
    createdAt: item.createdAt as string,
    likes: (item.likes as number) ?? 0,
    parentId: item.parentId as string | undefined,
    deleted: (item.deleted as boolean | undefined) || undefined,
  };
}

/** A post's whole thread in one query. The tree is assembled in memory. */
export async function listComments(slug: string): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk(slug) },
      ScanIndexForward: true, // oldest first
    }),
  );
  return (res.Items ?? []).map(itemToComment);
}

export async function addComment(
  slug: string,
  input: { username: string; message: string; parentId?: string },
): Promise<Comment> {
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const comment: Comment = {
    id,
    username: input.username,
    message: input.message,
    createdAt,
    likes: 0,
    ...(input.parentId ? { parentId: input.parentId } : {}),
  };
  // Write the comment and bump the post's commentCount atomically, so the
  // denormalized count the blog list sorts by can't drift from reality.
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
              ...comment,
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
  return comment;
}

function toAdminComment(item: Record<string, unknown>): AdminComment {
  const partition = item.pk as string; // "COMMENT#<slug>"
  return {
    slug: partition.slice("COMMENT#".length),
    ...itemToComment(item),
  };
}

/**
 * Newest comments across every post, via the GSI. Tombstoned (deleted) comments
 * drop out of the moderation feed while still living in their thread — so we
 * over-fetch and filter, then trim to `limit`.
 */
export async function listRecentComments(limit = 10): Promise<AdminComment[]> {
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
    .filter((c) => !c.deleted)
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
 * Delete a single comment (admin moderation). If it has replies it is
 * **tombstoned** (kept as a node so the replies aren't orphaned); a leaf is
 * hard-deleted. Keeps the post's `commentCount` in step. `sk` is
 * `` `${createdAt}#${id}` ``.
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
    // Tombstone: blank the content, drop it from the moderation feed (remove
    // its GSI keys), but leave the node so replies keep their parent. The node
    // still counts toward commentCount.
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

  // Leaf: hard delete and decrement the counter atomically.
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
    // No POSTSTATS counter (a pre-#1 comment), or already gone.
    await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: key }));
  }
}

/**
 * Delete every comment on a post. Called by `deletePost` — without it, deleting
 * a post leaves its thread behind forever, pointing at a slug that no longer
 * resolves.
 */
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
