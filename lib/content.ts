import "server-only";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./dynamo";

/**
 * Content model, single-table DynamoDB.
 *
 *   Page (About / Resume):  pk = "PAGE"   sk = "<key>"
 *   Post (blog):            pk = "POST"   sk = "<slug>"
 *
 * Markdown is stored verbatim and rendered server-side.
 */

// --- Pages (singleton markdown documents like About and Resume) ------------

export interface Page {
  key: string;
  title: string;
  body: string; // markdown
  updatedAt: string;
}

export async function getPage(key: string): Promise<Page | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: "PAGE", sk: key } }),
  );
  if (!res.Item) return null;
  return {
    key,
    title: res.Item.title as string,
    body: res.Item.body as string,
    updatedAt: res.Item.updatedAt as string,
  };
}

export async function savePage(
  key: string,
  input: { title: string; body: string },
): Promise<Page> {
  const updatedAt = new Date().toISOString();
  const page: Page = { key, title: input.title, body: input.body, updatedAt };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { pk: "PAGE", sk: key, title: page.title, body: page.body, updatedAt },
    }),
  );
  return page;
}

// --- Posts (blog) ----------------------------------------------------------

export interface Post {
  slug: string;
  title: string;
  body: string; // markdown
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

function itemToPost(item: Record<string, unknown>): Post {
  return {
    slug: item.slug as string,
    title: item.title as string,
    body: item.body as string,
    published: Boolean(item.published),
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  };
}

export async function listPosts(opts?: {
  includeDrafts?: boolean;
}): Promise<Post[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "POST" },
    }),
  );
  let posts = (res.Items ?? []).map(itemToPost);
  if (!opts?.includeDrafts) posts = posts.filter((p) => p.published);
  // newest first
  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return posts;
}

export async function getPost(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: "POST", sk: slug } }),
  );
  if (!res.Item) return null;
  return itemToPost(res.Item);
}

export async function createPost(input: {
  slug: string;
  title: string;
  body: string;
  published: boolean;
}): Promise<Post> {
  const now = new Date().toISOString();
  const post: Post = { ...input, createdAt: now, updatedAt: now };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: "POST",
        sk: post.slug,
        slug: post.slug,
        title: post.title,
        body: post.body,
        published: post.published,
        createdAt: now,
        updatedAt: now,
      },
      // Don't clobber an existing post with the same slug.
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
  return post;
}

export async function updatePost(
  slug: string,
  input: { title: string; body: string; published: boolean },
): Promise<Post | null> {
  const existing = await getPost(slug);
  if (!existing) return null;
  const updatedAt = new Date().toISOString();
  const post: Post = { ...existing, ...input, updatedAt };
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        pk: "POST",
        sk: slug,
        slug,
        title: post.title,
        body: post.body,
        published: post.published,
        createdAt: post.createdAt,
        updatedAt,
      },
    }),
  );
  return post;
}

export async function deletePost(slug: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: "POST", sk: slug } }),
  );
}
