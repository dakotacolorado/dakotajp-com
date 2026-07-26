import {
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchGetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Post, type PostInput, type PostProps } from "@dakotajp/core";
import { ddb, TABLE_NAME } from "./client";
import { deleteComments } from "./comments";
import {
  POST,
  bodyKey,
  bodyPartition,
  currentKey,
  currentPartition,
  statsKey,
} from "./keys";
import { commitVersion, deleteVersionHistory } from "./versioning";

/**
 * DynamoDB item → post props, metadata only. Absent attributes mean an item
 * written before that field existed, hence the fallbacks.
 */
export function itemToMeta(item: Record<string, unknown>): PostProps {
  const createdAt = item.createdAt as string;
  return {
    slug: item.sk as string,
    title: item.title as string,
    published: Boolean(item.published),
    publishedAt: (item.publishedAt as string) ?? createdAt,
    createdAt,
    updatedAt: item.updatedAt as string,
    version: (item.version as number) ?? 1,
    excerpt: (item.excerpt as string) ?? "",
    tags: (item.tags as string[]) ?? [],
    summary: item.summary as string | undefined,
    summarySourceVersion: item.summarySourceVersion as number | undefined,
  };
}

/** Post metadata only — no body read. */
export async function listPosts(opts?: {
  includeDrafts?: boolean;
  limit?: number;
}): Promise<Post[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": currentPartition(POST) },
    }),
  );
  let posts = (res.Items ?? []).map((it) => Post.from(itemToMeta(it)));
  if (!opts?.includeDrafts) posts = posts.filter((p) => p.published);
  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)); // newest first
  return opts?.limit ? posts.slice(0, opts.limit) : posts;
}

export async function getPostMeta(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: currentKey(POST, slug) }),
  );
  return res.Item ? Post.from(itemToMeta(res.Item)) : null;
}

/** Metadata + body, in one round trip. */
export async function getPost(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: [currentKey(POST, slug), bodyKey(POST, slug)],
        },
      },
    }),
  );
  const items = res.Responses?.[TABLE_NAME] ?? [];
  const meta = items.find((it) => it.pk === currentPartition(POST));
  if (!meta) return null;
  const body = items.find((it) => it.pk === bodyPartition(POST))?.body;
  return Post.from({ ...itemToMeta(meta), body: (body as string) ?? "" });
}

export async function createPost(
  input: PostInput & { slug: string },
): Promise<Post> {
  if (await getPostMeta(input.slug)) {
    throw new Error("A post with this slug already exists.");
  }
  await commitVersion(
    POST,
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
  return (await getPost(input.slug))!;
}

export async function updatePost(
  slug: string,
  input: PostInput,
): Promise<Post | null> {
  const existing = await getPostMeta(slug);
  if (!existing) return null;

  await commitVersion(
    POST,
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
  return getPost(slug);
}

/**
 * Attach an AI summary. Not a `commitVersion` call — summarizing is not an
 * edit, so it must not bump the version or write a snapshot.
 */
export async function setPostSummary(
  slug: string,
  summary: string,
  sourceVersion: number,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: currentKey(POST, slug),
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
  await deleteVersionHistory(POST, slug);
  await deleteComments(slug);
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: bodyKey(POST, slug) }),
  );
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: statsKey(slug) }),
  );
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: currentKey(POST, slug) }),
  );
}
