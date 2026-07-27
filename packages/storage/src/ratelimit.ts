import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, RATE_LIMIT_TABLE_NAME } from "./client";

/**
 * Fixed-window rate limiter. Backed by DynamoDB so the cap holds across Lambda
 * instances, in its own table because a window is ephemeral operational state
 * rather than content — see ADR 0003.
 *
 * The key lives here rather than in `keys.ts`: that module is the contract for
 * the content table, and nothing in this one shares a partition space with it.
 *
 * ```
 * item              pk                sk               holds
 * ----------------- ----------------- ---------------- --------------------------
 * rate-limit window RATELIMIT#<key>   <unix second>    { count, ttl }
 * ```
 */
const rateLimitKey = (key: string, second: number) => ({
  pk: `RATELIMIT#${key}`,
  sk: String(second),
});

/** How long a spent window sticks around before TTL reclaims it. */
const WINDOW_TTL_SECONDS = 120;

/**
 * Claim one slot in the current one-second window. Returns false when the
 * window is already full.
 */
export async function tryAcquire(key: string, limit = 1): Promise<boolean> {
  const second = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: RATE_LIMIT_TABLE_NAME,
        Key: rateLimitKey(key, second),
        UpdateExpression: "ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)",
        ExpressionAttributeNames: { "#c": "count", "#ttl": "ttl" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":limit": limit,
          ":ttl": second + WINDOW_TTL_SECONDS,
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
