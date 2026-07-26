import * as storage from "./index";

/**
 * The storage boundary, enforced. `client.ts` and `keys.ts` are deliberately
 * not re-exported: the DynamoDB client, the table name, and every key shape are
 * this package's internals, so every path to the table runs through a
 * repository. A barrel that leaks them gives callers a way around the
 * repositories, and this test is what stops that.
 */
describe("the storage barrel", () => {
  it("keeps the DynamoDB client and table name private", () => {
    expect(storage).not.toHaveProperty("ddb");
    expect(storage).not.toHaveProperty("TABLE_NAME");
  });

  it("keeps every key builder private", () => {
    // ADR 0002: nothing outside this package constructs a key.
    for (const exported of Object.keys(storage)) {
      expect(exported).not.toMatch(/Key$|Partition$|_PARTITION$|_TARGET$/);
    }
  });

  it("exports every repository's public surface", () => {
    expect(Object.keys(storage).sort()).toEqual(
      [
        // posts
        "itemToMeta",
        "listPosts",
        "getPostMeta",
        "getPost",
        "createPost",
        "updatePost",
        "setPostSummary",
        "deletePost",
        // pages
        "getPage",
        "savePage",
        // versioning
        "commitVersion",
        "listVersions",
        "rollbackToVersion",
        "deleteVersionHistory",
        // comments
        "listComments",
        "addComment",
        "listRecentComments",
        "countCommentsSince",
        "deleteComment",
        "deleteComments",
        // likes
        "getPostStats",
        "getAllPostStats",
        "getReaderPostLikes",
        "togglePostLike",
        "toggleCommentLike",
        // ratelimit
        "tryAcquire",
      ].sort(),
    );
  });
});
