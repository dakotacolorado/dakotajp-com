import * as storage from "./index";

/**
 * The storage boundary, enforced. `client.ts` is deliberately not re-exported:
 * the DynamoDB client and the table name are this package's internals, so every
 * path to the table runs through a repository. A barrel that leaks them gives
 * callers a way around the repositories, and this test is what stops that.
 */
describe("the storage barrel", () => {
  it("keeps the DynamoDB client and table name private", () => {
    expect(storage).not.toHaveProperty("ddb");
    expect(storage).not.toHaveProperty("TABLE_NAME");
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
        "STATS_PK",
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
