import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_TABLE_NAME } from "@dakotajp/core";

/**
 * Server-only DynamoDB access layer.
 *
 * This module must never be imported into a Client Component — it runs
 * exclusively on the server (API routes / server components / server actions),
 * so table access and IAM credentials never reach the browser.
 *
 * Credentials are resolved automatically from the Lambda execution role in
 * production, or from the local AWS profile during development. No secrets are
 * ever bundled into the app.
 */

const region = process.env.AWS_REGION ?? "us-east-1";

// Which table this runtime talks to. CDK injects TABLE_NAME into every function's
// env; the fallback is the name the stack creates, so local dev hits the same
// table without configuration. The name itself is declared once, in core.
export const TABLE_NAME = process.env.TABLE_NAME ?? DEFAULT_TABLE_NAME;

// Reuse a single client across warm Lambda invocations.
const client = new DynamoDBClient({ region });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
