jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import { tryAcquire } from "./ratelimit";

const send = ddb.send as unknown as jest.Mock;

/** The shape the SDK throws when a ConditionExpression rejects a write. */
const conditionalCheckFailed = () =>
  Object.assign(new Error("The conditional request failed"), {
    name: "ConditionalCheckFailedException",
  });

beforeEach(() => send.mockReset());
afterEach(() => jest.useRealTimers());

describe("tryAcquire", () => {
  it("grants the window and writes a self-expiring counter item", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    const second = Math.floor(Date.parse("2026-04-01T00:00:00.000Z") / 1000);
    send.mockResolvedValueOnce({});

    await expect(tryAcquire("bedrock")).resolves.toBe(true);

    expect(send.mock.calls[0][0].input).toMatchObject({
      TableName: TABLE_NAME,
      Key: { pk: "RATELIMIT#bedrock", sk: String(second) },
      UpdateExpression: "ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)",
      ConditionExpression: "attribute_not_exists(#c) OR #c < :limit",
      ExpressionAttributeValues: {
        ":one": 1,
        ":limit": 1, // the default cap: one call per second
        ":ttl": second + 120,
      },
    });
  });

  it("puts each second in its own item, so the window is fixed not sliding", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-04-01T00:00:00.000Z"));
    send.mockResolvedValue({});

    await tryAcquire("bedrock");
    jest.setSystemTime(new Date("2026-04-01T00:00:01.000Z"));
    await tryAcquire("bedrock");

    const [first, second] = send.mock.calls.map(([cmd]) => cmd.input.Key.sk);
    expect(Number(second)).toBe(Number(first) + 1);
  });

  it("passes an explicit limit through to the condition", async () => {
    send.mockResolvedValueOnce({});

    await tryAcquire("bedrock", 5);

    expect(send.mock.calls[0][0].input.ExpressionAttributeValues[":limit"]).toBe(5);
  });

  it("denies when the window is already full", async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed());
    await expect(tryAcquire("bedrock")).resolves.toBe(false);
  });

  it("rethrows anything that isn't the window being full", async () => {
    // A throttled or unreachable table must not read as "allowed" *or* as a
    // silent deny — the caller has to see that the limiter itself broke.
    send.mockRejectedValueOnce(new Error("ProvisionedThroughputExceeded"));
    await expect(tryAcquire("bedrock")).rejects.toThrow(
      "ProvisionedThroughputExceeded",
    );
  });

  it("rethrows a non-Error rejection rather than swallowing it", async () => {
    send.mockRejectedValueOnce("boom");
    await expect(tryAcquire("bedrock")).rejects.toBe("boom");
  });
});
