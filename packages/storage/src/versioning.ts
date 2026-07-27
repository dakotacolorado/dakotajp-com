import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DERIVED_FIELDS,
  excerpt,
  type EntityType,
  type VersionSummary,
} from "@dakotajp/core";
import { ddb, TABLE_NAME } from "./client";
import { deletePartition } from "./partition";
import {
  POST,
  bodyKey,
  currentKey,
  versionKey,
  versionPartition,
} from "./keys";

/**
 * Bump the version, writing the current item(s) and the snapshot in one
 * transaction. `content` holds the versioned fields; `splitBody` stores the
 * body separately. Returns the new version number.
 */
export async function commitVersion(
  type: EntityType,
  id: string,
  content: Record<string, unknown>,
  opts?: {
    restoredFrom?: number;
    splitBody?: boolean;
  },
): Promise<number> {
  const key = currentKey(type, id);
  const cur = await ddb.send(new GetCommand({ TableName: TABLE_NAME, Key: key }));
  const currentVersion = (cur.Item?.version as number | undefined) ?? 0;
  const nextVersion = currentVersion + 1;
  const savedAt = new Date().toISOString();
  const createdAt = (cur.Item?.createdAt as string | undefined) ?? savedAt;

  const currentItem: Record<string, unknown> = {
    ...key,
    ...content,
    version: nextVersion,
    createdAt,
    updatedAt: savedAt,
  };

  // Carried forward, not versioned — a stale summary stays visible until the
  // summarizer catches up.
  for (const field of DERIVED_FIELDS) {
    if (cur.Item?.[field] !== undefined) currentItem[field] = cur.Item[field];
  }

  const snapshotItem: Record<string, unknown> = {
    ...versionKey(type, id, nextVersion),
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
    // Derived here so it cannot drift from the body — rollback included.
    currentItem.excerpt = excerpt(body);
    bodyItem = { ...bodyKey(type, id), body };
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

/** All versions, newest first. The first entry is the current one. */
export async function listVersions(
  type: EntityType,
  id: string,
): Promise<VersionSummary[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": versionPartition(type, id) },
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
      Key: versionKey(type, id, version),
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
  if (type === POST) {
    content.published = snap.published ?? false;
    content.publishedAt = snap.publishedAt ?? snap.savedAt;
    content.tags = snap.tags ?? [];
  }
  return commitVersion(type, id, content, {
    restoredFrom: version,
    splitBody: type === POST,
  });
}

export async function deleteVersionHistory(type: EntityType, id: string) {
  await deletePartition(versionPartition(type, id));
}
