jest.mock("./client");

import { ddb, TABLE_NAME } from "./client";
import { getPage, savePage } from "./pages";

const send = ddb.send as unknown as jest.Mock;

const command = (call: number) => ({
  name: send.mock.calls[call][0].constructor.name,
  input: send.mock.calls[call][0].input as Record<string, unknown>,
});

beforeEach(() => send.mockReset());

describe("getPage", () => {
  it("reads the singleton item and keys the entity by its page key", async () => {
    send.mockResolvedValueOnce({
      Item: {
        title: "About",
        body: "# About me",
        version: 3,
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    });

    const page = await getPage("about");

    expect(page).toEqual({
      key: "about",
      title: "About",
      body: "# About me",
      version: 3,
      updatedAt: "2026-03-01T00:00:00.000Z",
    });
    expect(command(0)).toMatchObject({
      name: "GetCommand",
      input: { TableName: TABLE_NAME, Key: { pk: "PAGE", sk: "about" } },
    });
  });

  it("defaults the version for items written before versioning landed", async () => {
    send.mockResolvedValueOnce({
      Item: { title: "Resume", body: "", updatedAt: "2026-01-01T00:00:00.000Z" },
    });

    await expect(getPage("resume")).resolves.toMatchObject({ version: 1 });
  });

  it("returns null for a page that doesn't exist", async () => {
    send.mockResolvedValueOnce({});
    await expect(getPage("nope")).resolves.toBeNull();
  });
});

describe("savePage", () => {
  it("commits a version with the body inline, then returns the saved page", async () => {
    send
      .mockResolvedValueOnce({}) // commitVersion's current-item read
      .mockResolvedValueOnce({}) // the transaction
      .mockResolvedValueOnce({
        Item: {
          title: "About",
          body: "New body",
          version: 1,
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      });

    const page = await savePage("about", { title: "About", body: "New body" });

    const items = command(1).input.TransactItems as {
      Put: { Item: Record<string, unknown> };
    }[];
    expect(items).toHaveLength(2); // current + snapshot — pages don't split bodies
    expect(items[0].Put.Item).toMatchObject({
      pk: "PAGE",
      sk: "about",
      title: "About",
      body: "New body",
    });
    expect(page.body).toBe("New body");
  });
});
