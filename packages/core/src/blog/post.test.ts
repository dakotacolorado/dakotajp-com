import { Post, type PostProps } from "./post";

const PROPS: PostProps = {
  slug: "hello-world",
  title: "Hello",
  published: true,
  publishedAt: "2026-01-02T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
  version: 4,
  excerpt: "An opening.",
  tags: ["aws", "ts"],
  body: "# Hello\n\nBody.",
  summary: "A summary.",
  summarySourceVersion: 4,
};

describe("Post entity", () => {
  it("exposes props as fields", () => {
    const post = Post.from(PROPS);
    expect(post.slug).toBe("hello-world");
    expect(post.tags).toEqual(["aws", "ts"]);
  });

  it("round-trips through toJSON / from (the RSC-boundary contract)", () => {
    // Serialize as React would across the server→client boundary, then rehydrate.
    const wire = JSON.parse(JSON.stringify(Post.from(PROPS)));
    const restored = Post.from(wire);
    expect(restored.toJSON()).toEqual(PROPS);
    expect(restored).toBeInstanceOf(Post); // methods are back
    expect(restored.blurb).toBe("A summary.");
  });

  it("toJSON omits derived getters — only plain props cross the wire", () => {
    const json = Post.from(PROPS).toJSON();
    expect(json).not.toHaveProperty("isDraft");
    expect(json).not.toHaveProperty("blurb");
  });

  describe("behavior", () => {
    it("isDraft reflects published", () => {
      expect(Post.from({ ...PROPS, published: false }).isDraft).toBe(true);
      expect(Post.from(PROPS).isDraft).toBe(false);
    });

    it("blurb prefers summary, falls back to excerpt", () => {
      expect(Post.from(PROPS).blurb).toBe("A summary.");
      expect(Post.from({ ...PROPS, summary: undefined }).blurb).toBe(
        "An opening.",
      );
    });

    it("isSummaryStale when the source version lags the current version", () => {
      expect(Post.from(PROPS).isSummaryStale).toBe(false);
      expect(
        Post.from({ ...PROPS, summarySourceVersion: 3 }).isSummaryStale,
      ).toBe(true);
      // No summary yet → not "stale", just absent.
      expect(
        Post.from({ ...PROPS, summary: undefined, summarySourceVersion: undefined })
          .isSummaryStale,
      ).toBe(false);
    });

    it("hasBody reflects whether the body was loaded", () => {
      expect(Post.from(PROPS).hasBody).toBe(true);
      const { body: _omit, ...meta } = PROPS;
      expect(Post.from(meta).hasBody).toBe(false);
    });
  });
});
