import {
  COMMENT_FEED,
  PAGE,
  POST,
  POST_LIKE_TARGET,
  STATS_PARTITION,
  VERSION_PAD,
  bodyKey,
  bodyPartition,
  commentFeedAttributes,
  commentKey,
  commentLikeTarget,
  commentPartition,
  commentSortKey,
  currentKey,
  currentPartition,
  likeKey,
  likePartition,
  likePrefix,
  paddedVersion,
  slugFromCommentPartition,
  statsKey,
  targetFromLikeSortKey,
  versionKey,
  versionPartition,
} from "./keys";

/**
 * These are the live key shapes, so the assertions are spelled out as literals
 * rather than rebuilt from the builders — a test that calls the same function
 * it checks would let a renamed prefix pass while orphaning every item already
 * in the table.
 */

describe("current items", () => {
  it("keys a page and a post by their entity type", () => {
    expect(currentKey(PAGE, "about")).toEqual({ pk: "PAGE", sk: "about" });
    expect(currentKey(POST, "a-post")).toEqual({ pk: "POST", sk: "a-post" });
  });

  it("lists one type from one partition", () => {
    expect(currentPartition(PAGE)).toBe("PAGE");
    expect(currentPartition(POST)).toBe("POST");
  });

  it("keeps bodies in a sibling partition", () => {
    expect(bodyPartition(POST)).toBe("POSTBODY");
    expect(bodyPartition(PAGE)).toBe("PAGEBODY");
    expect(bodyKey(POST, "a-post")).toEqual({ pk: "POSTBODY", sk: "a-post" });
  });
});

describe("version snapshots", () => {
  it("partitions history per entity", () => {
    expect(versionPartition(POST, "a-post")).toBe("VERSION#POST#a-post");
    expect(versionPartition(PAGE, "about")).toBe("VERSION#PAGE#about");
  });

  it("zero-pads to a fixed, sortable width", () => {
    expect(paddedVersion(3)).toBe("0000000003");
    expect(paddedVersion(3)).toHaveLength(VERSION_PAD);
    expect(paddedVersion(1234567890)).toBe("1234567890");
  });

  it("orders versions numerically as strings", () => {
    // The whole reason for the padding: v2 must sort before v10.
    expect(paddedVersion(2) < paddedVersion(10)).toBe(true);
  });

  it("keys one snapshot", () => {
    expect(versionKey(POST, "a-post", 7)).toEqual({
      pk: "VERSION#POST#a-post",
      sk: "0000000007",
    });
  });
});

describe("comments", () => {
  it("partitions a thread by post", () => {
    expect(commentPartition("a-post")).toBe("COMMENT#a-post");
  });

  it("sorts a thread by creation time", () => {
    expect(commentSortKey("2026-01-01T00:00:00.000Z", "c1")).toBe(
      "2026-01-01T00:00:00.000Z#c1",
    );
  });

  it("keys one comment", () => {
    expect(commentKey("a-post", "2026-01-01T00:00:00.000Z", "c1")).toEqual({
      pk: "COMMENT#a-post",
      sk: "2026-01-01T00:00:00.000Z#c1",
    });
  });

  it("recovers the slug from the partition key", () => {
    expect(slugFromCommentPartition("COMMENT#a-post")).toBe("a-post");
  });

  it("round-trips a slug through the partition key", () => {
    expect(slugFromCommentPartition(commentPartition("a-post"))).toBe("a-post");
  });

  it("declares the cross-post feed index", () => {
    expect(COMMENT_FEED).toEqual({
      index: "GSI1",
      partitionAttribute: "GSI1PK",
      sortAttribute: "GSI1SK",
      partition: "COMMENT",
    });
  });

  it("stamps the feed attributes a visible comment carries", () => {
    expect(commentFeedAttributes("2026-01-01T00:00:00.000Z")).toEqual({
      GSI1PK: "COMMENT",
      GSI1SK: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("post counters", () => {
  it("keeps every post's counters in one partition", () => {
    expect(STATS_PARTITION).toBe("POSTSTATS");
    expect(statsKey("a-post")).toEqual({ pk: "POSTSTATS", sk: "a-post" });
  });
});

describe("like dedupe", () => {
  it("partitions by reader", () => {
    expect(likePartition("rid-1")).toBe("LIKE#rid-1");
  });

  it("scopes a reader's likes to one post by prefix", () => {
    expect(likePrefix("a-post")).toBe("a-post#");
  });

  it("distinguishes a post like from a comment like", () => {
    expect(POST_LIKE_TARGET).toBe("post");
    expect(commentLikeTarget("c1")).toBe("c#c1");
    expect(likeKey("rid-1", "a-post", POST_LIKE_TARGET)).toEqual({
      pk: "LIKE#rid-1",
      sk: "a-post#post",
    });
    expect(likeKey("rid-1", "a-post", commentLikeTarget("c1"))).toEqual({
      pk: "LIKE#rid-1",
      sk: "a-post#c#c1",
    });
  });

  it("reads the target back off a dedupe sort key", () => {
    expect(targetFromLikeSortKey("a-post#post", "a-post")).toBe("post");
    expect(targetFromLikeSortKey("a-post#c#c1", "a-post")).toBe("c#c1");
  });

  it("round-trips every target through the sort key", () => {
    // getReaderPostLikes reverses likeKey to answer "did this reader like it?",
    // so the two must stay exact inverses.
    for (const target of [POST_LIKE_TARGET, commentLikeTarget("c1")]) {
      const { sk } = likeKey("rid-1", "a-post", target);
      expect(targetFromLikeSortKey(sk, "a-post")).toBe(target);
    }
  });

  it("round-trips a slug that itself contains the separator", () => {
    const slug = "a#post";
    const { sk } = likeKey("rid-1", slug, POST_LIKE_TARGET);
    expect(targetFromLikeSortKey(sk, slug)).toBe(POST_LIKE_TARGET);
  });
});

describe("key families", () => {
  it("does not collide across families", () => {
    // One table, so a duplicated prefix silently lands on another family's
    // items. Every partition builder must produce a distinct value.
    const partitions = [
      currentPartition(PAGE),
      currentPartition(POST),
      bodyPartition(PAGE),
      bodyPartition(POST),
      versionPartition(POST, "x"),
      commentPartition("x"),
      STATS_PARTITION,
      likePartition("x"),
    ];
    expect(new Set(partitions).size).toBe(partitions.length);
  });
});
