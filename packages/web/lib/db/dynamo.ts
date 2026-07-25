import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

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

// The table name is defined once, in the shared model (CDK injects TABLE_NAME
// into the Lambda; the default is the name the stack creates).
export { TABLE_NAME } from "@dakotajp/core";

// Reuse a single client across warm Lambda invocations.
const client = new DynamoDBClient({ region });

export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
