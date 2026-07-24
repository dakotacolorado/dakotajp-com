import "server-only";
import {
  GetCommand,
  QueryCommand,
  DeleteCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./dynamo";

/**
 * Content model, single-table DynamoDB, with version history.
 *
 *   Page (About / Resume):  pk = "PAGE"   sk = "<key>"
 *   Post (blog):            pk = "POST"   sk = "<slug>"
 *
 * The item above is always the *current* version (what public pages read).
 * Every save also writes an immutable snapshot:
 *
 *   Version snapshot:       pk = "VERSION#<TYPE>#<id>"   sk = "<padded version>"
 *
 * The current-item write and the snapshot write happen in a single
 * transaction, so they never diverge. Rollback restores an old snapshot's
 * content as a new (highest) version, keeping history linear and auditable.
 */

export type EntityType = "PAGE" | "POST";

const VERSION_PAD = 10;
const pad = (n: number) => String(n).padStart(VERSION_PAD, "0");
const versionPk = (type: EntityType, id: string) => `VERSION#${type}#${id}`;

/**
 * Core write: bump the version, write the current item and its snapshot
 * atomically. `content` holds the mutable versioned fields (title/body/
 * published); `extraCurrent` holds fields that live only on the current item
 * (e.g. a post's slug).
 */
async function commitVersion(
  type: EntityType,
  id: string,
  content: Record<string, unknown>,
  opts?: { restoredFrom?: number; extraCurrent?: Record<string, unknown> },
): Promise<number> {
  const key = { pk: type, sk: id };
  const cur = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
  const currentVersion = (cur.Item?.version as number | undefined) ?? 0;
  const nextVersion = currentVersion + 1;
  const savedAt = new Date().toISOString();
  const createdAt = (cur.Item?.createdAt as string | undefined) ?? savedAt;

  const currentItem: Record<string, unknown> = {
    ...key,
    ...content,
    ...(opts?.extraCurrent ?? {}),
    version: nextVersion,
    createdAt,
    updatedAt: savedAt,
  };

  const snapshotItem: Record<string, unknown> = {
    pk: versionPk(type, id),
    sk: pad(nextVersion),
    version: nextVersion,
    savedAt,
    ...(opts?.restoredFrom !== undefined
      ? { restoredFrom: opts.restoredFrom }
      : {}),
    ...content,
  };

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE_NAME, Item: currentItem } },
        { Put: { TableName: TABLE_NAME, Item: snapshotItem } },
      ],
    }),
  );
  return nextVersion;
}

// --- version history (shared by pages and posts) ---------------------------

export interface VersionSummary {
  version: number;
  savedAt: string;
  restoredFrom?: number;
  title: string;
  preview: string;
}

/** All versions of an entity, newest first. The first entry is the current one. */
export async function listVersions(
  type: EntityType,
  id: string,
): Promise<VersionSummary[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": versionPk(type, id) },
      ScanIndexForward: false, // newest first
    }),
  );
  return (res.Items ?? []).map((it) => ({
    version: it.version as number,
    savedAt: it.savedAt as string,
    restoredFrom: it.restoredFrom as number | undefined,
    title: (it.title as string) ?? "",
    preview: String(it.body ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140),
  }));
}

async function getSnapshot(type: EntityType, id: string, version: number) {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk: versionPk(type, id), sk: pad(version) },
    }),
  );
  return res.Item ?? null;
}

/** Restore an old version's content as a new current version. */
export async function rollbackToVersion(
  type: EntityType,
  id: string,
  version: number,
): Promise<number | null> {
  const snap = await getSnapshot(type, id, version);
  if (!snap) return null;

  const content: Record<string, unknown> = {
    title: snap.title,
    body: snap.body,
  };
  const extraCurrent: Record<string, unknown> = {};
  if (type === "POST") {
    content.published = snap.published ?? false;
    extraCurrent.slug = id;
  }
  return commitVersion(type, id, content, {
    restoredFrom: version,
    extraCurrent,
  });
}

async function deleteVersionHistory(type: EntityType, id: string) {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": versionPk(type, id) },
      ProjectionExpression: "pk, sk",
    }),
  );
  const items = res.Items ?? [];
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((it) => ({
            DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
          })),
        },
      }),
    );
  }
}

// --- Pages (singleton markdown documents like About and Resume) ------------

export interface Page {
  key: string;
  title: string;
  body: string; // markdown
  version: number;
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
    version: (res.Item.version as number) ?? 1,
    updatedAt: res.Item.updatedAt as string,
  };
}

export async function savePage(
  key: string,
  input: { title: string; body: string },
): Promise<Page> {
  await commitVersion("PAGE", key, {
    title: input.title,
    body: input.body,
  });
  return (await getPage(key))!;
}

// --- Posts (blog) ----------------------------------------------------------

export interface Post {
  slug: string;
  title: string;
  body: string; // markdown
  published: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

function itemToPost(item: Record<string, unknown>): Post {
  return {
    slug: item.slug as string,
    title: item.title as string,
    body: item.body as string,
    published: Boolean(item.published),
    version: (item.version as number) ?? 1,
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
  posts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // newest first
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
  const existing = await getPost(input.slug);
  if (existing) throw new Error("A post with this slug already exists.");

  await commitVersion(
    "POST",
    input.slug,
    { title: input.title, body: input.body, published: input.published },
    { extraCurrent: { slug: input.slug } },
  );
  return (await getPost(input.slug))!;
}

export async function updatePost(
  slug: string,
  input: { title: string; body: string; published: boolean },
): Promise<Post | null> {
  const existing = await getPost(slug);
  if (!existing) return null;

  await commitVersion(
    "POST",
    slug,
    { title: input.title, body: input.body, published: input.published },
    { extraCurrent: { slug } },
  );
  return getPost(slug);
}

export async function deletePost(slug: string): Promise<void> {
  await deleteVersionHistory("POST", slug);
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: "POST", sk: slug } }),
  );
}
