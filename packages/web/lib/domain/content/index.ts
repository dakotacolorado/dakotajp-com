// The content domain, split by entity. Consumers import "@/lib/domain/content".
export type {
  EntityType,
  Page,
  Post,
  PostProps,
  PostInput,
  VersionSummary,
} from "@dakotajp/core";

export { listVersions, rollbackToVersion } from "./versioning";
export { getPage, savePage } from "./pages";
export {
  listPosts,
  getPostMeta,
  getPost,
  createPost,
  updatePost,
  setPostSummary,
  deletePost,
} from "./posts";
