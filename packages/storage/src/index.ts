/**
 * The package's public surface, named one by one — see ADR 0002.
 *
 * `client.ts`, `keys.ts` and `partition.ts` are internals: the DynamoDB client,
 * the table names and every key shape stay in here, so every path to a table
 * runs through a repository. The list is explicit rather than `export *` so
 * adding a helper to a repository doesn't publish it by accident;
 * `index.test.ts` pins it.
 */

export {
  listPosts,
  getPostMeta,
  getPost,
  createPost,
  updatePost,
  setPostSummary,
  deletePost,
} from "./posts";

export { getPage, savePage } from "./pages";

export {
  commitVersion,
  listVersions,
  rollbackToVersion,
  deleteVersionHistory,
} from "./versioning";

export {
  listComments,
  addComment,
  listRecentComments,
  countCommentsSince,
  deleteComment,
  deleteComments,
} from "./comments";

export {
  getPostStats,
  getAllPostStats,
  getReaderPostLikes,
  togglePostLike,
  toggleCommentLike,
  type Stats,
} from "./likes";

export { tryAcquire } from "./ratelimit";
