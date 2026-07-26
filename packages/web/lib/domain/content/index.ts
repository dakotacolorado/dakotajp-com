// The content domain. Persistence lives in @dakotajp/storage (shared with the
// Lambdas); the entity/types come from @dakotajp/core. This barrel keeps the
// app's import path (`@/lib/domain/content`) stable.
export type {
  EntityType,
  Page,
  Post,
  PostProps,
  PostInput,
  VersionSummary,
} from "@dakotajp/core";

export {
  listVersions,
  rollbackToVersion,
  getPage,
  savePage,
  listPosts,
  getPostMeta,
  getPost,
  createPost,
  updatePost,
  setPostSummary,
  deletePost,
} from "@dakotajp/storage";
