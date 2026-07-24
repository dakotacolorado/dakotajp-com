import "server-only";
import { QueryCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";
import { ddb, TABLE_NAME } from "./dynamo";

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
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: pk(slug), sk: `${createdAt}#${id}`, ...comment },
    }),
  );
  return comment;
}
