import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  DEFAULT_TABLE_NAME,
  DEFAULT_RATE_LIMIT_TABLE_NAME,
} from "@dakotajp/core";

const region = process.env.AWS_REGION ?? "us-east-1";

// GOTCHA: with these unset, local dev reads and writes the production tables.
// CDK injects both for every deployed function.
export const TABLE_NAME = process.env.TABLE_NAME ?? DEFAULT_TABLE_NAME;

/** Ephemeral rate-limit windows only — a separate table, see ADR 0003. */
export const RATE_LIMIT_TABLE_NAME =
  process.env.RATE_LIMIT_TABLE_NAME ?? DEFAULT_RATE_LIMIT_TABLE_NAME;

// Reuse a single client across warm Lambda invocations.
const client = new DynamoDBClient({ region });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
