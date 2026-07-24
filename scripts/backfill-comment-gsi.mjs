#!/usr/bin/env node
/**
 * One-time backfill: add GSI1PK/GSI1SK to comments written before the
 * cross-post index existed, so they appear in the admin dashboard feed.
 *
 * Safe to re-run (idempotent — skips comments that already have the keys).
 * Uses your local AWS credentials, region us-east-1.
 *
 * Usage:  node scripts/backfill-comment-gsi.mjs
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = "dakotajp-site";
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "us-east-1" }),
);

let scanned = 0;
let updated = 0;
let startKey;

do {
  const res = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "begins_with(pk, :c)",
      ExpressionAttributeValues: { ":c": "COMMENT#" },
      ExclusiveStartKey: startKey,
    }),
  );

  for (const item of res.Items ?? []) {
    scanned++;
    if (item.GSI1PK) continue; // already indexed
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: "SET GSI1PK = :p, GSI1SK = :s",
        ExpressionAttributeValues: { ":p": "COMMENT", ":s": item.createdAt },
      }),
    );
    updated++;
  }
  startKey = res.LastEvaluatedKey;
} while (startKey);

console.log(`Scanned ${scanned} comments, backfilled ${updated}.`);
