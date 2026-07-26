// The comments domain. Persistence lives in @dakotajp/storage; the Comment
// entity in @dakotajp/core. Kept here so app imports (`@/lib/domain/comments`)
// stay stable.
export { Comment } from "@dakotajp/core";
export {
  listComments,
  addComment,
  listRecentComments,
  countCommentsSince,
  deleteComment,
  deleteComments,
} from "@dakotajp/storage";
