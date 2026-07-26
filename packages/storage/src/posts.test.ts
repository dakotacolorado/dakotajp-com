jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import {
  itemToMeta,
  listPosts,
  getPostMeta,
  getPost,
  createPost,
  updatePost,
  setPostSummary,
  deletePost,
} from "./posts";

const send = ddb.send as unknown as jest.Mock;

/** The command each `ddb.send` call received, in order. */
const calls = () =>
  send.mock.calls.map(([cmd]) => ({
    name: cmd.constructor.name,
    input: cmd.input as Record<string, unknown>,
  }));

const postItem = (over: Record<string, unknown> = {}) => ({
  pk: "POST",
  sk: "a-post",
  title: "A post",
  published: true,
  publishedAt: "2026-02-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  version: 1,
  excerpt: "Opening.",
  tags: [],
  ...over,
});

beforeEach(() => send.mockReset());

describe("itemToMeta", () => {
  it("maps a full item", () => {
    const meta = itemToMeta({
      sk: "hello-world",
      title: "Hello",
      published: true,
      publishedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      version: 4,
      excerpt: "An opening.",
      tags: ["aws", "ts"],
      summary: "A summary.",
      summarySourceVersion: 4,
    });
    expect(meta).toEqual({
      slug: "hello-world",
      title: "Hello",
      published: true,
      publishedAt: "2026-01-02T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
      version: 4,
      excerpt: "An opening.",
      tags: ["aws", "ts"],
      summary: "A summary.",
      summarySourceVersion: 4,
    });
  });

  it("applies fallbacks for older / partial items", () => {
    const meta = itemToMeta({
      sk: "legacy",
      title: "Legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(meta.published).toBe(false);
    expect(meta.publishedAt).toBe("2026-01-01T00:00:00.000Z"); // falls back to createdAt
    expect(meta.version).toBe(1);
    expect(meta.excerpt).toBe("");
    expect(meta.tags).toEqual([]);
    expect(meta.summary).toBeUndefined();
    expect(meta.summarySourceVersion).toBeUndefined();
  });
});

describe("listPosts", () => {
  const items = [
    postItem({ sk: "middle", publishedAt: "2026-02-02T00:00:00.000Z" }),
    postItem({ sk: "newest", publishedAt: "2026-03-01T00:00:00.000Z" }),
    postItem({ sk: "draft", published: false, publishedAt: "2026-04-01T00:00:00.000Z" }),
    postItem({ sk: "oldest", publishedAt: "2026-01-05T00:00:00.000Z" }),
  ];

  it("queries the POST partition and hides drafts by default", async () => {
    send.mockResolvedValueOnce({ Items: items });

    const posts = await listPosts();

    expect(posts.map((p) => p.slug)).toEqual(["newest", "middle", "oldest"]);
    expect(calls()[0]).toMatchObject({
      name: "QueryCommand",
      input: {
        TableName: TABLE_NAME,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": "POST" },
      },
    });
  });

  it("includes drafts on request, still newest first", async () => {
    send.mockResolvedValueOnce({ Items: items });

    const posts = await listPosts({ includeDrafts: true });

    expect(posts.map((p) => p.slug)).toEqual([
      "draft",
      "newest",
      "middle",
      "oldest",
    ]);
  });

  it("applies the limit after sorting and filtering", async () => {
    send.mockResolvedValueOnce({ Items: items });

    const posts = await listPosts({ limit: 2 });

    expect(posts.map((p) => p.slug)).toEqual(["newest", "middle"]);
  });

  it("survives an empty table", async () => {
    send.mockResolvedValueOnce({});
    await expect(listPosts()).resolves.toEqual([]);
  });
});

describe("getPostMeta", () => {
  it("reads the metadata item by key", async () => {
    send.mockResolvedValueOnce({ Item: postItem() });

    const post = await getPostMeta("a-post");

    expect(post?.slug).toBe("a-post");
    expect(post?.hasBody).toBe(false); // metadata read never loads the body
    expect(calls()[0]).toMatchObject({
      name: "GetCommand",
      input: { TableName: TABLE_NAME, Key: { pk: "POST", sk: "a-post" } },
    });
  });

  it("returns null for a missing post", async () => {
    send.mockResolvedValueOnce({});
    await expect(getPostMeta("nope")).resolves.toBeNull();
  });
});

describe("getPost", () => {
  it("joins the metadata and body items from one BatchGet", async () => {
    send.mockResolvedValueOnce({
      Responses: {
        [TABLE_NAME]: [
          { pk: "POSTBODY", sk: "a-post", body: "# Body" },
          postItem(),
        ],
      },
    });

    const post = await getPost("a-post");

    expect(post?.body).toBe("# Body");
    expect(calls()[0]).toMatchObject({
      name: "BatchGetCommand",
      input: {
        RequestItems: {
          [TABLE_NAME]: {
            Keys: [
              { pk: "POST", sk: "a-post" },
              { pk: "POSTBODY", sk: "a-post" },
            ],
          },
        },
      },
    });
  });

  it("returns null when the metadata item is absent, body or not", async () => {
    send.mockResolvedValueOnce({
      Responses: { [TABLE_NAME]: [{ pk: "POSTBODY", sk: "orphan", body: "x" }] },
    });
    await expect(getPost("orphan")).resolves.toBeNull();
  });

  it("returns null when the BatchGet came back with no responses at all", async () => {
    send.mockResolvedValueOnce({});
    await expect(getPost("a-post")).resolves.toBeNull();
  });

  it("treats a missing body item as an empty body", async () => {
    send.mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [postItem()] } });

    const post = await getPost("a-post");

    expect(post?.body).toBe("");
    expect(post?.hasBody).toBe(true);
  });
});

describe("createPost", () => {
  it("refuses a slug that already exists", async () => {
    send.mockResolvedValueOnce({ Item: postItem() }); // getPostMeta

    await expect(
      createPost({ slug: "a-post", title: "Dupe", body: "", published: false }),
    ).rejects.toThrow("A post with this slug already exists.");
    expect(send).toHaveBeenCalledTimes(1); // nothing written
  });

  it("commits a first version with the body split out, then re-reads", async () => {
    send
      .mockResolvedValueOnce({}) // getPostMeta — free slug
      .mockResolvedValueOnce({}) // commitVersion's current-item read
      .mockResolvedValueOnce({}) // commitVersion's transaction
      .mockResolvedValueOnce({
        Responses: {
          [TABLE_NAME]: [
            postItem({ sk: "fresh" }),
            { pk: "POSTBODY", sk: "fresh", body: "Hello." },
          ],
        },
      });

    const post = await createPost({
      slug: "fresh",
      title: "Fresh",
      body: "Hello.",
      published: true,
      tags: ["ts"],
    });

    const transact = calls()[2];
    expect(transact.name).toBe("TransactWriteCommand");
    const items = (
      transact.input as unknown as {
        TransactItems: { Put: { Item: Record<string, unknown> } }[];
      }
    ).TransactItems;
    expect(items).toHaveLength(3); // current + snapshot + body
    expect(items[0].Put.Item).toMatchObject({
      pk: "POST",
      sk: "fresh",
      title: "Fresh",
      published: true,
      tags: ["ts"],
      version: 1,
    });
    expect(items[0].Put.Item.body).toBeUndefined(); // body lives in its own item
    expect(items[2].Put.Item).toMatchObject({
      pk: "POSTBODY",
      sk: "fresh",
      body: "Hello.",
    });
    expect(post.slug).toBe("fresh");
  });

  it("stamps publishedAt with now when the author didn't set one", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-05-05T12:00:00.000Z"));
    send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [postItem()] } });

    await createPost({ slug: "x", title: "X", body: "b", published: false });

    const put = (
      calls()[2].input as unknown as {
        TransactItems: { Put: { Item: Record<string, unknown> } }[];
      }
    ).TransactItems[0].Put.Item;
    expect(put.publishedAt).toBe("2026-05-05T12:00:00.000Z");
    jest.useRealTimers();
  });
});

describe("updatePost", () => {
  it("returns null for a post that isn't there", async () => {
    send.mockResolvedValueOnce({}); // getPostMeta

    await expect(
      updatePost("ghost", { title: "T", body: "B", published: true }),
    ).resolves.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the existing publishedAt and tags when the input omits them", async () => {
    const existing = postItem({ tags: ["aws"] });
    send
      .mockResolvedValueOnce({ Item: existing }) // getPostMeta
      .mockResolvedValueOnce({ Item: existing }) // commitVersion read
      .mockResolvedValueOnce({}) // transaction
      .mockResolvedValueOnce({ Responses: { [TABLE_NAME]: [existing] } });

    await updatePost("a-post", { title: "Retitled", body: "New", published: true });

    const put = (
      calls()[2].input as unknown as {
        TransactItems: { Put: { Item: Record<string, unknown> } }[];
      }
    ).TransactItems[0].Put.Item;
    expect(put).toMatchObject({
      title: "Retitled",
      publishedAt: "2026-02-01T00:00:00.000Z",
      tags: ["aws"],
      version: 2,
    });
  });
});

describe("setPostSummary", () => {
  it("updates only the derived fields, and only on an existing post", async () => {
    send.mockResolvedValueOnce({});

    await setPostSummary("a-post", "A summary.", 3);

    expect(calls()[0]).toMatchObject({
      name: "UpdateCommand",
      input: {
        TableName: TABLE_NAME,
        Key: { pk: "POST", sk: "a-post" },
        UpdateExpression: "SET #summary = :summary, #source = :source",
        ExpressionAttributeValues: { ":summary": "A summary.", ":source": 3 },
        ConditionExpression: "attribute_exists(pk)",
      },
    });
  });
});

describe("deletePost", () => {
  it("removes history, comments, body, stats and the post itself", async () => {
    send.mockResolvedValue({}); // every query comes back empty

    await deletePost("a-post");

    expect(calls().map((c) => c.name)).toEqual([
      "QueryCommand", // version history
      "QueryCommand", // comments
      "DeleteCommand", // body
      "DeleteCommand", // stats
      "DeleteCommand", // the post
    ]);
    expect(calls().slice(2).map((c) => (c.input as { Key: unknown }).Key)).toEqual([
      { pk: "POSTBODY", sk: "a-post" },
      { pk: "POSTSTATS", sk: "a-post" },
      { pk: "POST", sk: "a-post" },
    ]);
  });
});
