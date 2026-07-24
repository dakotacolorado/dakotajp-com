import "server-only";
import {
  QueryCommand,
  DeleteCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, TABLE_NAME } from "./dynamo";
import { STATS_PK } from "./likes";

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
}

/** A comment plus which post it belongs to — for the cross-post admin feed. */
export interface AdminComment extends Comment {
  slug: string;
}

const GSI = "GSI1";
const pk = (slug: string) => `COMMENT#${slug}`;

export async function listComments(slug: string): Promise<Comment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk(slug) },
      ScanIndexForward: true, // oldest first
    }),
  );
  return (res.Items ?? []).map((item) => ({
    id: item.id as string,
    username: item.username as string,
    message: item.message as string,
    createdAt: item.createdAt as string,
    likes: (item.likes as number) ?? 0,
  }));
}

export async function addComment(
  slug: string,
  input: { username: string; message: string },
): Promise<Comment> {
  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const comment: Comment = {
    id,
    username: input.username,
    message: input.message,
    createdAt,
    likes: 0,
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
    id: item.id as string,
    username: item.username as string,
    message: item.message as string,
    createdAt: item.createdAt as string,
    likes: (item.likes as number) ?? 0,
  };
}

/** Newest comments across every post, via the GSI. */
export async function listRecentComments(limit = 10): Promise<AdminComment[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI,
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": "COMMENT" },
      ScanIndexForward: false, // newest first
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map(toAdminComment);
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
 * Delete a single comment (admin moderation) and keep the post's
 * `commentCount` in step. The `sk` is `` `${createdAt}#${id}` ``.
 */
export async function deleteComment(slug: string, sk: string): Promise<void> {
  const key = { pk: pk(slug), sk };
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
    // No POSTSTATS counter (a pre-#1 comment), or the comment was already gone.
    // Remove the comment best-effort so moderation always succeeds.
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
