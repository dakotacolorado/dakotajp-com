jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import {
  getPostStats,
  getAllPostStats,
  getReaderPostLikes,
  togglePostLike,
  toggleCommentLike,
} from "./likes";

const send = ddb.send as unknown as jest.Mock;

const command = (call: number) => ({
  name: send.mock.calls[call][0].constructor.name,
  input: send.mock.calls[call][0].input as Record<string, unknown>,
});

/** The Delete/Put + Update pair a toggle writes. */
const toggleWrite = (call: number) =>
  command(call).input.TransactItems as Record<string, Record<string, unknown>>[];

beforeEach(() => send.mockReset());

describe("getPostStats", () => {
  it("reads the counters consistently, so a fresh like is never missed", async () => {
    send.mockResolvedValueOnce({ Item: { likes: 3, commentCount: 5 } });

    await expect(getPostStats("a-post")).resolves.toEqual({
      likes: 3,
      commentCount: 5,
    });
    expect(command(0)).toMatchObject({
      name: "GetCommand",
      input: {
        TableName: TABLE_NAME,
        Key: { pk: "POSTSTATS", sk: "a-post" },
        ConsistentRead: true,
      },
    });
  });

  it("reports zeroes for a post nobody has interacted with", async () => {
    send.mockResolvedValueOnce({});
    await expect(getPostStats("a-post")).resolves.toEqual({
      likes: 0,
      commentCount: 0,
    });
  });
});

describe("getAllPostStats", () => {
  it("returns every post's counters in one query, keyed by slug", async () => {
    send.mockResolvedValueOnce({
      Items: [
        { sk: "one", likes: 2, commentCount: 1 },
        { sk: "two" }, // never liked or commented on
      ],
    });

    const stats = await getAllPostStats();

    expect(stats.get("one")).toEqual({ likes: 2, commentCount: 1 });
    expect(stats.get("two")).toEqual({ likes: 0, commentCount: 0 });
    expect(command(0).input).toMatchObject({
      ExpressionAttributeValues: { ":pk": "POSTSTATS" },
    });
  });

  it("returns an empty map when nothing has stats yet", async () => {
    send.mockResolvedValueOnce({});
    await expect(getAllPostStats()).resolves.toEqual(new Map());
  });
});

describe("getReaderPostLikes", () => {
  it("returns the liked targets on a post as bare suffixes", async () => {
    send.mockResolvedValueOnce({
      Items: [{ sk: "a-post#post" }, { sk: "a-post#c#c1" }],
    });

    const liked = await getReaderPostLikes("rid-1", "a-post");

    expect(liked).toEqual(new Set(["post", "c#c1"]));
    expect(command(0).input).toMatchObject({
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": "LIKE#rid-1", ":prefix": "a-post#" },
    });
  });

  it("short-circuits for a reader with no identity cookie", async () => {
    await expect(getReaderPostLikes(null, "a-post")).resolves.toEqual(new Set());
    expect(send).not.toHaveBeenCalled(); // no cookie, no read
  });

  it("returns nothing when the reader has liked nothing on this post", async () => {
    send.mockResolvedValueOnce({});
    await expect(getReaderPostLikes("rid-1", "a-post")).resolves.toEqual(new Set());
  });
});

describe("togglePostLike", () => {
  it("reports the count without writing when there's no reader id", async () => {
    send.mockResolvedValueOnce({ Item: { likes: 4 } });

    await expect(togglePostLike(null, "a-post")).resolves.toEqual({
      liked: false,
      likes: 4,
    });
    expect(send).toHaveBeenCalledTimes(1); // a read, never a write
  });

  it("likes: writes the dedupe marker and adds one, guarded against a double", async () => {
    send
      .mockResolvedValueOnce({}) // dedupe probe — not liked yet
      .mockResolvedValueOnce({}) // the transaction
      .mockResolvedValueOnce({ Item: { pk: "LIKE#rid-1" } }) // readerLiked
      .mockResolvedValueOnce({ Item: { likes: 1 } }); // getPostStats

    await expect(togglePostLike("rid-1", "a-post")).resolves.toEqual({
      liked: true,
      likes: 1,
    });

    const [dedupe, counter] = toggleWrite(1);
    expect(dedupe.Put).toMatchObject({
      Item: { pk: "LIKE#rid-1", sk: "a-post#post" },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    expect(counter.Update).toMatchObject({
      Key: { pk: "POSTSTATS", sk: "a-post" },
      UpdateExpression: "ADD #likes :d", // atomic, never read-modify-write
      ExpressionAttributeValues: { ":d": 1 },
    });
  });

  it("unlikes: removes the marker and subtracts one", async () => {
    send
      .mockResolvedValueOnce({ Item: { pk: "LIKE#rid-1" } }) // already liked
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({}) // readerLiked — gone now
      .mockResolvedValueOnce({ Item: { likes: 0 } });

    await expect(togglePostLike("rid-1", "a-post")).resolves.toEqual({
      liked: false,
      likes: 0,
    });

    const [dedupe, counter] = toggleWrite(1);
    expect(dedupe.Delete).toMatchObject({
      Key: { pk: "LIKE#rid-1", sk: "a-post#post" },
      ConditionExpression: "attribute_exists(pk)",
    });
    expect(counter.Update).toMatchObject({
      ExpressionAttributeValues: { ":d": -1 },
    });
  });

  it("reports the real state when a concurrent toggle wins the race", async () => {
    send
      .mockResolvedValueOnce({}) // probe says not liked
      .mockRejectedValueOnce(new Error("TransactionCanceledException"))
      .mockResolvedValueOnce({ Item: { pk: "LIKE#rid-1" } }) // but it is
      .mockResolvedValueOnce({ Item: { likes: 1 } });

    await expect(togglePostLike("rid-1", "a-post")).resolves.toEqual({
      liked: true,
      likes: 1,
    });
  });
});

describe("toggleCommentLike", () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const commentKey = { pk: "COMMENT#a-post", sk: `${createdAt}#c1` };

  it("reads the comment's count without writing when there's no reader id", async () => {
    send.mockResolvedValueOnce({ Item: { likes: 2 } });

    await expect(
      toggleCommentLike(null, "a-post", "c1", createdAt),
    ).resolves.toEqual({ liked: false, likes: 2 });
    expect(command(0).input).toMatchObject({
      Key: commentKey,
      ConsistentRead: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reports zero for a comment that has no likes attribute yet", async () => {
    send.mockResolvedValueOnce({});
    await expect(
      toggleCommentLike(null, "a-post", "c1", createdAt),
    ).resolves.toEqual({ liked: false, likes: 0 });
  });

  it("likes: counts on the comment item itself, only if it still exists", async () => {
    send
      .mockResolvedValueOnce({}) // dedupe probe
      .mockResolvedValueOnce({}) // transaction
      .mockResolvedValueOnce({ Item: { pk: "LIKE#rid-1" } }) // readerLiked
      .mockResolvedValueOnce({ Item: { likes: 1 } }); // consistent re-read

    await expect(
      toggleCommentLike("rid-1", "a-post", "c1", createdAt),
    ).resolves.toEqual({ liked: true, likes: 1 });

    const [dedupe, counter] = toggleWrite(1);
    expect(dedupe.Put).toMatchObject({
      Item: { pk: "LIKE#rid-1", sk: "a-post#c#c1" },
      ConditionExpression: "attribute_not_exists(pk)",
    });
    expect(counter.Update).toMatchObject({
      Key: commentKey,
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":d": 1 },
    });
  });

  it("unlikes: removes the marker and subtracts one from the comment", async () => {
    send
      .mockResolvedValueOnce({ Item: { pk: "LIKE#rid-1" } }) // already liked
      .mockResolvedValueOnce({}) // transaction
      .mockResolvedValueOnce({}) // readerLiked — gone now
      .mockResolvedValueOnce({ Item: { likes: 0 } }); // consistent re-read

    await expect(
      toggleCommentLike("rid-1", "a-post", "c1", createdAt),
    ).resolves.toEqual({ liked: false, likes: 0 });

    const [dedupe, counter] = toggleWrite(1);
    expect(dedupe.Delete).toMatchObject({ Key: { pk: "LIKE#rid-1", sk: "a-post#c#c1" } });
    expect(counter.Update).toMatchObject({
      ExpressionAttributeValues: { ":d": -1 },
    });
  });

  it("reports the real state when the comment was deleted mid-toggle", async () => {
    send
      .mockResolvedValueOnce({}) // dedupe probe
      .mockRejectedValueOnce(new Error("TransactionCanceledException"))
      .mockResolvedValueOnce({}) // nothing was ever marked liked
      .mockResolvedValueOnce({}); // and the comment is gone

    await expect(
      toggleCommentLike("rid-1", "a-post", "c1", createdAt),
    ).resolves.toEqual({ liked: false, likes: 0 });
  });
});
