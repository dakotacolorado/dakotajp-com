import "server-only";
import {
  QueryCommand,
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
 */

export interface Comment {
  id: string;
  username: string;
  message: string;
  createdAt: string;
  likes: number;
}

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
            Item: { pk: pk(slug), sk: `${createdAt}#${id}`, ...comment },
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
