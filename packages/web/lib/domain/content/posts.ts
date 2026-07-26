import "server-only";
import {
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchGetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { PK, bodyPk, itemToMeta, Post, type PostInput } from "@dakotajp/core";
import { ddb, TABLE_NAME } from "@/lib/db/dynamo";
import { deleteComments } from "@/lib/domain/comments";
import { enqueueSummary } from "@/lib/services/summary-queue";
import { STATS_PK } from "@/lib/domain/likes";
import { commitVersion, deleteVersionHistory } from "./versioning";

/**
 * Posts. Body lives in its own `POSTBODY` item so list views never read bodies
 * (a DynamoDB query is capped at 1 MB before projection); the detail page reads
 * both items in one BatchGet.
 */

/** Post metadata only — no body read. This is what every list view uses. */
export async function listPosts(opts?: {
  includeDrafts?: boolean;
  limit?: number;
}): Promise<Post[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": PK.post },
    }),
  );
  let posts = (res.Items ?? []).map((it) => Post.from(itemToMeta(it)));
  if (!opts?.includeDrafts) posts = posts.filter((p) => p.published);
  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)); // newest first
  return opts?.limit ? posts.slice(0, opts.limit) : posts;
}

/** Single-item read for when the body isn't needed (existence checks, admin). */
export async function getPostMeta(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: PK.post, sk: slug } }),
  );
  return res.Item ? Post.from(itemToMeta(res.Item)) : null;
}

/** Metadata + body, in one round trip. */
export async function getPost(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: [
            { pk: PK.post, sk: slug },
            { pk: bodyPk(PK.post), sk: slug },
          ],
        },
      },
    }),
  );
  const items = res.Responses?.[TABLE_NAME] ?? [];
  const meta = items.find((it) => it.pk === PK.post);
  if (!meta) return null;
  const body = items.find((it) => it.pk === bodyPk(PK.post))?.body;
  return Post.from({ ...itemToMeta(meta), body: (body as string) ?? "" });
}

export async function createPost(
  input: PostInput & { slug: string },
): Promise<Post> {
  if (await getPostMeta(input.slug)) {
    throw new Error("A post with this slug already exists.");
  }
  await commitVersion(
    PK.post,
    input.slug,
    {
      title: input.title,
      body: input.body,
      published: input.published,
      publishedAt: input.publishedAt ?? new Date().toISOString(),
      tags: input.tags ?? [],
    },
    { splitBody: true },
  );
  await enqueueSummary(input.slug);
  return (await getPost(input.slug))!;
}

export async function updatePost(
  slug: string,
  input: PostInput,
): Promise<Post | null> {
  const existing = await getPostMeta(slug);
  if (!existing) return null;

  await commitVersion(
    PK.post,
    slug,
    {
      title: input.title,
      body: input.body,
      published: input.published,
      publishedAt: input.publishedAt ?? existing.publishedAt,
      tags: input.tags ?? existing.tags,
    },
    { splitBody: true },
  );
  await enqueueSummary(slug);
  return getPost(slug);
}

/**
 * Attach an AI-generated summary to a post. Deliberately not a `commitVersion`
 * call: summarizing is not an edit, so it must not bump the version or write a
 * snapshot. Stamping the source version lets a later job find posts whose
 * summary has fallen behind their body and refresh just those.
 */
export async function setPostSummary(
  slug: string,
  summary: string,
  sourceVersion: number,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: PK.post, sk: slug },
      UpdateExpression: "SET #summary = :summary, #source = :source",
      ExpressionAttributeNames: {
        "#summary": "summary",
        "#source": "summarySourceVersion",
      },
      ExpressionAttributeValues: { ":summary": summary, ":source": sourceVersion },
      ConditionExpression: "attribute_exists(pk)",
    }),
  );
}

export async function deletePost(slug: string): Promise<void> {
  await deleteVersionHistory(PK.post, slug);
  await deleteComments(slug);
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: bodyPk(PK.post), sk: slug },
    }),
  );
  // Drop the denormalized like/comment counters with the post.
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: STATS_PK, sk: slug } }),
  );
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: PK.post, sk: slug } }),
  );
}
