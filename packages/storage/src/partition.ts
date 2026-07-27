import { QueryCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./client";

/** BatchWriteItem accepts at most 25 requests per call. */
const BATCH_WRITE_MAX = 25;

/**
 * Delete every item under one partition key.
 *
 * Internal — not exported from the package barrel. Cascading deletes (a post's
 * version history, a post's comments) are the same Query-then-batch-delete
 * loop over a different partition, and having one copy means the pagination
 * fix ADR 0002 calls for lands in one place.
 *
 * KNOWN GAP: neither the Query nor the BatchWrite is paginated — a partition
 * over 1 MB leaves a tail behind, as does an `UnprocessedItems` response. This
 * matches the behaviour of the two loops it replaces; fixing it is a separate
 * change.
 */
export async function deletePartition(pk: string): Promise<void> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk",
      ExpressionAttributeValues: { ":pk": pk },
      ProjectionExpression: "pk, sk",
    }),
  );
  const items = res.Items ?? [];
  for (let i = 0; i < items.length; i += BATCH_WRITE_MAX) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: items.slice(i, i + BATCH_WRITE_MAX).map((it) => ({
            DeleteRequest: { Key: { pk: it.pk, sk: it.sk } },
          })),
        },
      }),
    );
  }
}
