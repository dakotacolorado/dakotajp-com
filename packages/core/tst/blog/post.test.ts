import { itemToMeta } from "../../src/blog/post";

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
