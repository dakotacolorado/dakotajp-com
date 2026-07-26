jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import {
  listComments,
  addComment,
  listRecentComments,
  countCommentsSince,
  deleteComment,
  deleteComments,
} from "./comments";

const send = ddb.send as unknown as jest.Mock;

const command = (call: number) => ({
  name: send.mock.calls[call][0].constructor.name,
  input: send.mock.calls[call][0].input as Record<string, unknown>,
});

const commentItem = (over: Record<string, unknown> = {}) => ({
  pk: "COMMENT#a-post",
  sk: "2026-01-01T00:00:00.000Z#c1",
  id: "c1",
  username: "ada",
  message: "Nice post.",
  createdAt: "2026-01-01T00:00:00.000Z",
  likes: 2,
  ...over,
});

beforeEach(() => send.mockReset());

describe("listComments", () => {
  it("reads a post's thread oldest-first and stamps the slug from the query", async () => {
    // `slug` isn't an attribute on the item — it lives in the partition key, so
    // the caller has to put it back on the entity.
    send.mockResolvedValueOnce({ Items: [commentItem()] });

    const [comment] = await listComments("a-post");

    expect(comment.slug).toBe("a-post");
    expect(comment.id).toBe("c1");
    expect(comment.likes).toBe(2);
    expect(comment.isReply).toBe(false);
    expect(command(0)).toMatchObject({
      name: "QueryCommand",
      input: {
        TableName: TABLE_NAME,
        ExpressionAttributeValues: { ":pk": "COMMENT#a-post" },
        ScanIndexForward: true,
      },
    });
  });

  it("defaults likes and normalizes a falsy tombstone flag away", async () => {
    send.mockResolvedValueOnce({
      Items: [commentItem({ likes: undefined, deleted: false, parentId: "c0" })],
    });

    const [comment] = await listComments("a-post");

    expect(comment.likes).toBe(0);
    expect(comment.deleted).toBeUndefined();
    expect(comment.isDeleted).toBe(false);
    expect(comment.isReply).toBe(true);
  });

  it("survives a post with no comments", async () => {
    send.mockResolvedValueOnce({});
    await expect(listComments("a-post")).resolves.toEqual([]);
  });
});

describe("addComment", () => {
  it("writes the comment and bumps commentCount in one transaction", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-01T10:00:00.000Z"));
    send.mockResolvedValueOnce({});

    const comment = await addComment("a-post", {
      username: "ada",
      message: "Hello.",
    });

    const items = command(0).input.TransactItems as [
      { Put: { Item: Record<string, unknown> } },
      { Update: Record<string, unknown> },
    ];
    expect(items[0].Put.Item).toMatchObject({
      pk: "COMMENT#a-post",
      sk: `2026-05-01T10:00:00.000Z#${comment.id}`,
      // The GSI keys are what makes this comment visible in the admin feed.
      GSI1PK: "COMMENT",
      GSI1SK: "2026-05-01T10:00:00.000Z",
      username: "ada",
      message: "Hello.",
      likes: 0,
    });
    expect(items[1].Update).toMatchObject({
      Key: { pk: "POSTSTATS", sk: "a-post" },
      UpdateExpression: "ADD #count :one",
      ExpressionAttributeValues: { ":one": 1 },
    });
    expect(comment.slug).toBe("a-post");
    expect(comment.id).toEqual(expect.any(String));
    jest.useRealTimers();
  });

  it("stores parentId only for a reply", async () => {
    send.mockResolvedValue({});

    const top = await addComment("a-post", { username: "a", message: "m" });
    const reply = await addComment("a-post", {
      username: "b",
      message: "m",
      parentId: top.id,
    });

    const topItem = (command(0).input.TransactItems as { Put: { Item: Record<string, unknown> } }[])[0].Put.Item;
    const replyItem = (command(1).input.TransactItems as { Put: { Item: Record<string, unknown> } }[])[0].Put.Item;
    expect("parentId" in topItem).toBe(false);
    expect(replyItem.parentId).toBe(top.id);
    expect(reply.isReply).toBe(true);
  });

  it("gives every comment a distinct id", async () => {
    send.mockResolvedValue({});

    const a = await addComment("a-post", { username: "a", message: "m" });
    const b = await addComment("a-post", { username: "a", message: "m" });

    expect(a.id).not.toBe(b.id);
  });
});

describe("listRecentComments", () => {
  it("reads the GSI newest-first, drops tombstones, and trims to the limit", async () => {
    send.mockResolvedValueOnce({
      Items: [
        commentItem({ pk: "COMMENT#one", id: "a" }),
        commentItem({ pk: "COMMENT#two", id: "b", deleted: true }),
        commentItem({ pk: "COMMENT#three", id: "c" }),
        commentItem({ pk: "COMMENT#four", id: "d" }),
      ],
    });

    const recent = await listRecentComments(2);

    expect(recent.map((c) => c.id)).toEqual(["a", "c"]);
    // The slug comes back out of the partition key for the cross-post feed.
    expect(recent.map((c) => c.slug)).toEqual(["one", "three"]);
    expect(command(0).input).toMatchObject({
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ScanIndexForward: false,
      // Over-fetched, because tombstones are filtered out after the read.
      Limit: 2 * 2 + 10,
    });
  });

  it("defaults to 10 and survives an empty feed", async () => {
    send.mockResolvedValueOnce({});

    await expect(listRecentComments()).resolves.toEqual([]);
    expect(command(0).input).toMatchObject({ Limit: 30 });
  });
});

describe("countCommentsSince", () => {
  it("counts through the GSI without reading items", async () => {
    send.mockResolvedValueOnce({ Count: 7 });

    await expect(countCommentsSince("2026-01-01T00:00:00.000Z")).resolves.toBe(7);
    expect(command(0).input).toMatchObject({
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk AND GSI1SK >= :since",
      ExpressionAttributeValues: { ":since": "2026-01-01T00:00:00.000Z" },
      Select: "COUNT",
    });
  });

  it("reports zero when the response carries no count", async () => {
    send.mockResolvedValueOnce({});
    await expect(countCommentsSince("2026-01-01T00:00:00.000Z")).resolves.toBe(0);
  });
});

describe("deleteComment", () => {
  // The caller passes `createdAt`; storage builds the sort key from it.
  const createdAt = "2026-01-01T00:00:00.000Z";
  const sk = `${createdAt}#c1`;

  it("tombstones a comment that has replies, keeping the node for them", async () => {
    send
      .mockResolvedValueOnce({
        Items: [commentItem(), commentItem({ id: "c2", parentId: "c1" })],
      })
      .mockResolvedValueOnce({});

    await deleteComment("a-post", "c1", createdAt);

    expect(command(1)).toMatchObject({
      name: "UpdateCommand",
      input: {
        Key: { pk: "COMMENT#a-post", sk },
        UpdateExpression:
          "SET #deleted = :true, #u = :anon, #m = :anon REMOVE GSI1PK, GSI1SK",
        ConditionExpression: "attribute_exists(pk)",
        ExpressionAttributeValues: { ":true": true, ":anon": "[deleted]" },
      },
    });
    expect(send).toHaveBeenCalledTimes(2); // the count is untouched
  });

  it("hard-deletes a leaf and decrements commentCount atomically", async () => {
    send.mockResolvedValueOnce({ Items: [commentItem()] }).mockResolvedValueOnce({});

    await deleteComment("a-post", "c1", createdAt);

    const items = command(1).input.TransactItems as [
      { Delete: Record<string, unknown> },
      { Update: Record<string, unknown> },
    ];
    expect(command(1).name).toBe("TransactWriteCommand");
    expect(items[0].Delete).toMatchObject({
      Key: { pk: "COMMENT#a-post", sk },
      ConditionExpression: "attribute_exists(pk)",
    });
    expect(items[1].Update).toMatchObject({
      Key: { pk: "POSTSTATS", sk: "a-post" },
      // Guarded so a double delete can't drive the counter negative.
      ConditionExpression: "attribute_exists(pk) AND #count > :zero",
      ExpressionAttributeValues: { ":neg": -1, ":zero": 0 },
    });
  });

  it("still deletes the comment when there's no counter to decrement", async () => {
    // Comments written before POSTSTATS existed have no counter item, so the
    // guarded transaction fails — the comment must go anyway.
    send
      .mockResolvedValueOnce({ Items: [commentItem()] })
      .mockRejectedValueOnce(new Error("TransactionCanceledException"))
      .mockResolvedValueOnce({});

    await deleteComment("a-post", "c1", createdAt);

    expect(command(2)).toMatchObject({
      name: "DeleteCommand",
      input: { Key: { pk: "COMMENT#a-post", sk } },
    });
  });
});

describe("deleteComments", () => {
  it("batch-deletes a whole thread, 25 at a time", async () => {
    const items = Array.from({ length: 26 }, (_, i) => ({
      pk: "COMMENT#a-post",
      sk: String(i),
    }));
    send.mockResolvedValueOnce({ Items: items }).mockResolvedValue({});

    await deleteComments("a-post");

    expect(command(0).input).toMatchObject({ ProjectionExpression: "pk, sk" });
    const batches = send.mock.calls.slice(1);
    expect(batches).toHaveLength(2); // DynamoDB caps BatchWrite at 25 items
    expect(batches[0][0].input.RequestItems[TABLE_NAME]).toHaveLength(25);
    expect(batches[1][0].input.RequestItems[TABLE_NAME]).toEqual([
      { DeleteRequest: { Key: { pk: "COMMENT#a-post", sk: "25" } } },
    ]);
  });

  it("writes nothing for a post with no thread", async () => {
    send.mockResolvedValueOnce({});

    await deleteComments("a-post");

    expect(send).toHaveBeenCalledTimes(1); // the query, and nothing else
  });
});
