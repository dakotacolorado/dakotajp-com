import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_TABLE_NAME } from "@dakotajp/core";

const region = process.env.AWS_REGION ?? "us-east-1";

// GOTCHA: with TABLE_NAME unset, local dev reads and writes the production
// table. CDK injects it for every deployed function.
export const TABLE_NAME = process.env.TABLE_NAME ?? DEFAULT_TABLE_NAME;

// Reuse a single client across warm Lambda invocations.
const client = new DynamoDBClient({ region });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
