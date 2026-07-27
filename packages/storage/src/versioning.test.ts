jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import {
  commitVersion,
  listVersions,
  rollbackToVersion,
  deleteVersionHistory,
} from "./versioning";

const send = ddb.send as unknown as jest.Mock;

type Put = { Put: { TableName: string; Item: Record<string, unknown> } };

/**
 * The items put by the `TransactWriteCommand` sent on the given `ddb.send`
 * call — `commitVersion`'s current item, snapshot, and (when split) body item.
 */
const transactItems = (call = 1): Record<string, unknown>[] =>
  (send.mock.calls[call][0].input.TransactItems as Put[]).map((t) => t.Put.Item);

const command = (call: number) => ({
  name: send.mock.calls[call][0].constructor.name,
  input: send.mock.calls[call][0].input as Record<string, unknown>,
});

beforeEach(() => send.mockReset());

describe("commitVersion", () => {
  it("bumps the version and writes current + snapshot in one transaction", async () => {
    send
      .mockResolvedValueOnce({
        Item: { version: 2, createdAt: "2026-01-01T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({});

    const next = await commitVersion("PAGE", "about", {
      title: "About",
      body: "Hi.",
    });

    expect(next).toBe(3);
    const [current, snapshot] = transactItems();
    expect(current).toMatchObject({
      pk: "PAGE",
      sk: "about",
      title: "About",
      body: "Hi.",
      version: 3,
      createdAt: "2026-01-01T00:00:00.000Z", // preserved from the existing item
    });
    expect(snapshot).toMatchObject({
      pk: "VERSION#PAGE#about",
      sk: "0000000003",
      version: 3,
      title: "About",
      body: "Hi.",
    });
    // The snapshot's savedAt is the same instant as the current item's update.
    expect(snapshot.savedAt).toBe(current.updatedAt);
  });

  it("starts a brand-new entity at version 1 and stamps createdAt", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const next = await commitVersion("PAGE", "resume", { title: "R", body: "" });

    expect(next).toBe(1);
    expect(transactItems()[0]).toMatchObject({
      version: 1,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    jest.useRealTimers();
  });

  it("carries derived fields onto the current item but not into the snapshot", async () => {
    // A stale summary stays visible (and flagged) until the summarizer catches
    // up; a rollback must never restore one, so snapshots don't carry them.
    send
      .mockResolvedValueOnce({
        Item: { version: 1, summary: "Old summary.", summarySourceVersion: 1 },
      })
      .mockResolvedValueOnce({});

    await commitVersion("POST", "p", { title: "T", body: "B" });

    const [current, snapshot] = transactItems();
    expect(current).toMatchObject({
      summary: "Old summary.",
      summarySourceVersion: 1,
    });
    expect(snapshot.summary).toBeUndefined();
    expect(snapshot.summarySourceVersion).toBeUndefined();
  });

  it("splits the body into its own item and derives the excerpt from it", async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await commitVersion(
      "POST",
      "p",
      { title: "T", body: "# Heading\n\nSome **prose**." },
      { splitBody: true },
    );

    const [current, snapshot, body] = transactItems();
    expect(current.body).toBeUndefined();
    expect(current.excerpt).toBe("Heading Some prose.");
    expect(body).toEqual({ pk: "POSTBODY", sk: "p", body: "# Heading\n\nSome **prose**." });
    // The snapshot keeps the full body — that's what a rollback restores.
    expect(snapshot.body).toBe("# Heading\n\nSome **prose**.");
  });

  it("writes an empty body item when the content has no body to split", async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await commitVersion("POST", "p", { title: "T" }, { splitBody: true });

    const [current, , body] = transactItems();
    expect(body).toEqual({ pk: "POSTBODY", sk: "p", body: "" });
    expect(current.excerpt).toBe("");
  });

  it("records restoredFrom on the snapshot when given one", async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    await commitVersion("PAGE", "about", { title: "T", body: "B" }, {
      restoredFrom: 2,
    });

    expect(transactItems()[1].restoredFrom).toBe(2);
    expect(transactItems()[0].restoredFrom).toBeUndefined();
  });
});

describe("listVersions", () => {
  it("queries the version partition newest-first and previews each body", async () => {
    send.mockResolvedValueOnce({
      Items: [
        {
          version: 2,
          savedAt: "2026-02-01T00:00:00.000Z",
          title: "Second",
          body: "The second body.",
          restoredFrom: 1,
        },
        { version: 1, savedAt: "2026-01-01T00:00:00.000Z" },
      ],
    });

    const versions = await listVersions("POST", "p");

    expect(command(0)).toMatchObject({
      name: "QueryCommand",
      input: {
        ExpressionAttributeValues: { ":pk": "VERSION#POST#p" },
        ScanIndexForward: false,
      },
    });
    expect(versions[0]).toEqual({
      version: 2,
      savedAt: "2026-02-01T00:00:00.000Z",
      restoredFrom: 1,
      title: "Second",
      preview: "The second body.",
    });
    // A snapshot with no title/body still yields usable defaults.
    expect(versions[1]).toEqual({
      version: 1,
      savedAt: "2026-01-01T00:00:00.000Z",
      restoredFrom: undefined,
      title: "",
      preview: "",
    });
  });

  it("truncates the preview to 140 characters", async () => {
    send.mockResolvedValueOnce({
      Items: [{ version: 1, savedAt: "x", title: "T", body: "word ".repeat(60) }],
    });

    const [version] = await listVersions("POST", "p");

    expect(version.preview.length).toBeLessThanOrEqual(141); // 140 + ellipsis
    expect(version.preview.endsWith("…")).toBe(true);
  });

  it("survives an entity with no history", async () => {
    send.mockResolvedValueOnce({});
    await expect(listVersions("PAGE", "about")).resolves.toEqual([]);
  });
});

describe("rollbackToVersion", () => {
  it("returns null when the snapshot doesn't exist", async () => {
    send.mockResolvedValueOnce({});

    await expect(rollbackToVersion("POST", "p", 9)).resolves.toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
    expect(command(0)).toMatchObject({
      name: "GetCommand",
      input: { Key: { pk: "VERSION#POST#p", sk: "0000000009" } },
    });
  });

  it("restores a post's content as a new highest version", async () => {
    send
      .mockResolvedValueOnce({
        Item: {
          version: 2,
          savedAt: "2026-02-01T00:00:00.000Z",
          title: "Old title",
          body: "Old body.",
          published: true,
          publishedAt: "2026-01-15T00:00:00.000Z",
          tags: ["aws"],
        },
      })
      .mockResolvedValueOnce({ Item: { version: 5 } }) // commitVersion's read
      .mockResolvedValueOnce({});

    const next = await rollbackToVersion("POST", "p", 2);

    expect(next).toBe(6); // a rollback moves forward, it doesn't rewind
    const [current, snapshot, body] = transactItems(2);
    expect(current).toMatchObject({
      title: "Old title",
      published: true,
      publishedAt: "2026-01-15T00:00:00.000Z",
      tags: ["aws"],
      excerpt: "Old body.", // recomputed from the restored body
    });
    expect(snapshot.restoredFrom).toBe(2);
    expect(body.body).toBe("Old body."); // posts split their body out
  });

  it("defaults a pre-publishedAt post snapshot to its savedAt", async () => {
    send
      .mockResolvedValueOnce({
        Item: { version: 1, savedAt: "2026-02-01T00:00:00.000Z", title: "T", body: "B" },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await rollbackToVersion("POST", "p", 1);

    expect(transactItems(2)[0]).toMatchObject({
      published: false,
      publishedAt: "2026-02-01T00:00:00.000Z",
      tags: [],
    });
  });

  it("restores a page inline — no post-only fields, no body item", async () => {
    send
      .mockResolvedValueOnce({
        Item: { version: 1, savedAt: "2026-02-01T00:00:00.000Z", title: "T", body: "B" },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    await rollbackToVersion("PAGE", "about", 1);

    const items = transactItems(2);
    expect(items).toHaveLength(2); // current + snapshot, no body item
    expect(items[0].body).toBe("B");
    expect(items[0].published).toBeUndefined();
  });
});

describe("deleteVersionHistory", () => {
  it("batch-deletes every snapshot, 25 at a time", async () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      pk: "VERSION#POST#p",
      sk: String(i),
    }));
    send.mockResolvedValueOnce({ Items: items }).mockResolvedValue({});

    await deleteVersionHistory("POST", "p");

    expect(command(0).input).toMatchObject({ ProjectionExpression: "pk, sk" });
    const batches = send.mock.calls.slice(1);
    expect(batches).toHaveLength(2); // DynamoDB caps BatchWrite at 25 items
    expect(batches[0][0].input.RequestItems[TABLE_NAME]).toHaveLength(25);
    expect(batches[1][0].input.RequestItems[TABLE_NAME]).toHaveLength(5);
    expect(batches[0][0].input.RequestItems[TABLE_NAME][0]).toEqual({
      DeleteRequest: { Key: { pk: "VERSION#POST#p", sk: "0" } },
    });
  });

  it("writes nothing when there's no history", async () => {
    send.mockResolvedValueOnce({});

    await deleteVersionHistory("PAGE", "about");

    expect(send).toHaveBeenCalledTimes(1); // the query, and nothing else
  });
});
