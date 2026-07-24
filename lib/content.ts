import "server-only";
import {
  GetCommand,
  QueryCommand,
  DeleteCommand,
  BatchGetCommand,
  UpdateCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./dynamo";
import { excerpt } from "./excerpt";
import { deleteComments } from "./comments";
import { enqueueSummary } from "./summary-queue";

/**
 * Content model, single-table DynamoDB, with version history.
 *
 *   Page (About / Resume):  pk = "PAGE"      sk = "<key>"
 *   Post metadata (blog):   pk = "POST"      sk = "<slug>"
 *   Post body:              pk = "POSTBODY"  sk = "<slug>"
 *
 * The items above are always the *current* version (what public pages read).
 * Every save also writes an immutable snapshot:
 *
 *   Version snapshot:       pk = "VERSION#<TYPE>#<id>"   sk = "<padded version>"
 *
 * All writes for one save happen in a single transaction, so they never
 * diverge. Rollback restores an old snapshot's content as a new (highest)
 * version, keeping history linear and auditable.
 *
 * Why a post's body lives in its own item: the blog index and the home page
 * list posts, and a DynamoDB query is capped at 1 MB *before* any projection
 * is applied — so bodies stored on the metadata item would be read (and paid
 * for) on every listing, then thrown away. Splitting them keeps list reads
 * proportional to the number of posts, not the length of them. The detail page
 * fetches both items in one BatchGet, so it costs no extra round trip.
 *
 * Pages keep their body inline: they're singletons, never listed.
 */

export type EntityType = "PAGE" | "POST";

const VERSION_PAD = 10;
const pad = (n: number) => String(n).padStart(VERSION_PAD, "0");
const versionPk = (type: EntityType, id: string) => `VERSION#${type}#${id}`;
const bodyPk = (type: EntityType) => `${type}BODY`;

/**
 * Fields *derived* from the body rather than authored — currently the AI
 * summary. They are carried across saves but never enter a version snapshot:
 * summarizing is not an edit, so it must not appear in history, and a rollback
 * should restore the body you wrote rather than a summary a model wrote about
 * some other version. `summarySourceVersion` is what makes staleness visible.
 */
const DERIVED_FIELDS = ["summary", "summarySourceVersion"] as const;

/**
 * Core write: bump the version, write the current item(s) and the snapshot
 * atomically. `content` holds the mutable versioned fields (title/body/
 * published/…); `extraCurrent` holds fields that live only on the current item.
 */
async function commitVersion(
  type: EntityType,
  id: string,
  content: Record<string, unknown>,
  opts?: {
    restoredFrom?: number;
    extraCurrent?: Record<string, unknown>;
    /** Store the body in its own item instead of on the current item. */
    splitBody?: boolean;
  },
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

  // A stale summary stays visible (and flagged) until the summarizer catches up.
  for (const field of DERIVED_FIELDS) {
    if (cur.Item?.[field] !== undefined) currentItem[field] = cur.Item[field];
  }

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

  let bodyItem: Record<string, unknown> | null = null;
  if (opts?.splitBody) {
    const body = String(content.body ?? "");
    delete currentItem.body;
    // Computed here, in the one place every write funnels through, so the
    // excerpt can never drift from the body it describes — including on
    // rollback, which recomputes it from the restored body.
    currentItem.excerpt = excerpt(body);
    bodyItem = { pk: bodyPk(type), sk: id, body };
  }

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: TABLE_NAME, Item: currentItem } },
        { Put: { TableName: TABLE_NAME, Item: snapshotItem } },
        ...(bodyItem
          ? [{ Put: { TableName: TABLE_NAME, Item: bodyItem } }]
          : []),
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
    preview: excerpt(String(it.body ?? ""), 140),
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
  if (type === "POST") {
    content.published = snap.published ?? false;
    content.publishedAt = snap.publishedAt ?? snap.savedAt;
    content.tags = snap.tags ?? [];
  }
  return commitVersion(type, id, content, {
    restoredFrom: version,
    splitBody: type === "POST",
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

/** Everything the list views need. Deliberately excludes the body. */
export interface PostMeta {
  slug: string;
  title: string;
  published: boolean;
  /** Authored publish date — backdatable, and what the site sorts by. */
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Plain-text opening, derived from the body on save. Always present. */
  excerpt: string;
  tags: string[];
  /** AI-generated. Absent until a summarizer has run over this post. */
  summary?: string;
  /** Body version `summary` was generated from; !== version means stale. */
  summarySourceVersion?: number;
}

export interface Post extends PostMeta {
  body: string; // markdown
}

export interface PostInput {
  title: string;
  body: string;
  published: boolean;
  publishedAt?: string;
  tags?: string[];
}

function itemToMeta(item: Record<string, unknown>): PostMeta {
  const createdAt = item.createdAt as string;
  return {
    slug: item.sk as string,
    title: item.title as string,
    published: Boolean(item.published),
    // Posts written before publishedAt existed fall back to their write time.
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

/** Post metadata only — no body read. This is what every list view uses. */
export async function listPosts(opts?: {
  includeDrafts?: boolean;
  limit?: number;
}): Promise<PostMeta[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": "POST" },
    }),
  );
  let posts = (res.Items ?? []).map(itemToMeta);
  if (!opts?.includeDrafts) posts = posts.filter((p) => p.published);
  posts.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1)); // newest first
  return opts?.limit ? posts.slice(0, opts.limit) : posts;
}

/** Single-item read for when the body isn't needed (existence checks, admin). */
export async function getPostMeta(slug: string): Promise<PostMeta | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk: "POST", sk: slug } }),
  );
  return res.Item ? itemToMeta(res.Item) : null;
}

/** Metadata + body, in one round trip. */
export async function getPost(slug: string): Promise<Post | null> {
  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [TABLE_NAME]: {
          Keys: [
            { pk: "POST", sk: slug },
            { pk: bodyPk("POST"), sk: slug },
          ],
        },
      },
    }),
  );
  const items = res.Responses?.[TABLE_NAME] ?? [];
  const meta = items.find((it) => it.pk === "POST");
  if (!meta) return null;
  const body = items.find((it) => it.pk === bodyPk("POST"))?.body;
  return { ...itemToMeta(meta), body: (body as string) ?? "" };
}

export async function createPost(
  input: PostInput & { slug: string },
): Promise<Post> {
  if (await getPostMeta(input.slug)) {
    throw new Error("A post with this slug already exists.");
  }
  await commitVersion(
    "POST",
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
    "POST",
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
 * Attach an AI-generated summary to a post.
 *
 * Deliberately not a `commitVersion` call: summarizing is not an edit, so it
 * must not bump the version or write a snapshot. Stamping the source version
 * is what lets a later job find posts whose summary has fallen behind their
 * body (`summarySourceVersion !== version`) and refresh just those.
 */
export async function setPostSummary(
  slug: string,
  summary: string,
  sourceVersion: number,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk: "POST", sk: slug },
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
  await deleteVersionHistory("POST", slug);
  await deleteComments(slug);
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { pk: bodyPk("POST"), sk: slug },
    }),
  );
  await ddb.send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { pk: "POST", sk: slug } }),
  );
}
