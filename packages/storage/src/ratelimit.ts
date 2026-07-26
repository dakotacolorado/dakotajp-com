import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./client";

/**
 * Fixed-window rate limiter. Backed by DynamoDB so the cap holds across Lambda
 * instances; items self-expire via the table's `ttl` attribute.
 *
 *   pk = "RATELIMIT#<key>"   sk = "<unix second>"   { count, ttl }
 */
export async function tryAcquire(key: string, limit = 1): Promise<boolean> {
  const second = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { pk: `RATELIMIT#${key}`, sk: String(second) },
        UpdateExpression: "ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)",
        ExpressionAttributeNames: { "#c": "count", "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":limit": limit,
          ":ttl": second + 120,
        },
        ConditionExpression: "attribute_not_exists(#c) OR #c < :limit",
      }),
    );
    return true;
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "ConditionalCheckFailedException"
    ) {
      return false; // window is full
    }
    throw err;
  }
}
