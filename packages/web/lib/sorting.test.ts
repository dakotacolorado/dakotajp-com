import {
  POST_SORT_OPTIONS,
  DEFAULT_POST_SORT,
  normalizePostSort,
  sortPosts,
  COMMENT_SORT_OPTIONS,
  DEFAULT_COMMENT_SORT,
  normalizeCommentSort,
  type RankedPost,
} from "./sorting";
import { Post } from "@dakotajp/core";

const ranked = (
  slug: string,
  publishedAt: string,
  likes = 0,
  commentCount = 0,
): RankedPost => ({
  post: Post.from({
    slug,
    title: slug,
    published: true,
    publishedAt,
    createdAt: publishedAt,
    updatedAt: publishedAt,
    version: 1,
    excerpt: "",
    tags: [],
  }),
  stats: { likes, commentCount },
});

// Distinct dates and distinct counts, so every comparator has a total order.
const a = ranked("a", "2026-01-01T00:00:00.000Z", 5, 1);
const b = ranked("b", "2026-02-01T00:00:00.000Z", 1, 9);
const c = ranked("c", "2026-03-01T00:00:00.000Z", 3, 4);
const all = [a, b, c];

const slugs = (posts: RankedPost[]) => posts.map((r) => r.post.slug);

describe("normalizePostSort", () => {
  it.each(POST_SORT_OPTIONS.map((o) => o.value))("passes through %s", (v) => {
    expect(normalizePostSort(v)).toBe(v);
  });

  it.each([undefined, "", "nonsense", "LIKES"])(
    "falls back to the default for %p",
    (raw) => {
      expect(normalizePostSort(raw)).toBe(DEFAULT_POST_SORT);
    },
  );
});

describe("normalizeCommentSort", () => {
  it.each(COMMENT_SORT_OPTIONS.map((o) => o.value))("passes through %s", (v) => {
    expect(normalizeCommentSort(v)).toBe(v);
  });

  it("falls back to the default for an unknown value", () => {
    expect(normalizeCommentSort("nonsense")).toBe(DEFAULT_COMMENT_SORT);
  });
});

describe("sortPosts", () => {
  it("sorts newest first by default", () => {
    expect(slugs(sortPosts(all, DEFAULT_POST_SORT))).toEqual(["c", "b", "a"]);
  });

  it("sorts oldest first", () => {
    expect(slugs(sortPosts(all, "oldest"))).toEqual(["a", "b", "c"]);
  });

  it("sorts by likes", () => {
    expect(slugs(sortPosts(all, "likes"))).toEqual(["a", "c", "b"]);
  });

  it("sorts by comment count", () => {
    expect(slugs(sortPosts(all, "comments"))).toEqual(["b", "c", "a"]);
  });

  it("treats an unknown sort as the default rather than reordering", () => {
    expect(slugs(sortPosts(all, "nonsense"))).toEqual(["c", "b", "a"]);
  });

  it("breaks like ties with newest first", () => {
    const older = ranked("older", "2026-01-01T00:00:00.000Z", 7);
    const newer = ranked("newer", "2026-06-01T00:00:00.000Z", 7);
    expect(slugs(sortPosts([older, newer], "likes"))).toEqual([
      "newer",
      "older",
    ]);
  });

  it("breaks comment-count ties with newest first", () => {
    const older = ranked("older", "2026-01-01T00:00:00.000Z", 0, 2);
    const newer = ranked("newer", "2026-06-01T00:00:00.000Z", 0, 2);
    expect(slugs(sortPosts([older, newer], "comments"))).toEqual([
      "newer",
      "older",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const input = [...all];
    sortPosts(input, "oldest");
    expect(slugs(input)).toEqual(["a", "b", "c"]);
  });

  it("survives an empty list", () => {
    expect(sortPosts([], "likes")).toEqual([]);
  });
});
