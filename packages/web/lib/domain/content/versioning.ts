import "server-only";
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  PK,
  bodyPk,
  versionPk,
  pad,
  DERIVED_FIELDS,
  type EntityType,
  type VersionSummary,
} from "@dakotajp/core";
import { ddb, TABLE_NAME } from "@/lib/db/dynamo";
import { excerpt } from "@/lib/util/excerpt";

/**
 * The versioning engine, shared by pages and posts.
 *
 * Every save writes the current item(s) and an immutable snapshot
 * (`VERSION#<TYPE>#<id>`) in one transaction, so they never diverge. Rollback
 * restores an old snapshot's content as a new (highest) version.
 */

/**
 * Bump the version, write the current item(s) and the snapshot atomically.
 * `content` holds the mutable versioned fields; `extraCurrent` holds fields that
 * live only on the current item; `splitBody` stores the body in its own item.
 */
export async function commitVersion(
  type: EntityType,
  id: string,
  content: Record<string, unknown>,
  opts?: {
    restoredFrom?: number;
    extraCurrent?: Record<string, unknown>;
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
  if (type === PK.post) {
    content.published = snap.published ?? false;
    content.publishedAt = snap.publishedAt ?? snap.savedAt;
    content.tags = snap.tags ?? [];
  }
  return commitVersion(type, id, content, {
    restoredFrom: version,
    splitBody: type === PK.post,
  });
}

export async function deleteVersionHistory(type: EntityType, id: string) {
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
