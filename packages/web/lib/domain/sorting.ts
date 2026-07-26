import type { Post } from "@dakotajp/core";
import type { Comment } from "@/lib/domain/comments";
import type { Stats } from "@/lib/domain/likes";
import type { SortOption } from "@/components/public/SortControl";

/**
 * A post paired with its denormalized engagement counts. Likes/comment counts
 * live in a separate stats item, not on the Post entity, so lists carry the two
 * side by side rather than flattening them — the entity keeps its behavior.
 */
export type RankedPost = { post: Post; stats: Stats };

// --- posts -----------------------------------------------------------------

export const POST_SORT_OPTIONS: SortOption[] = [
  { value: "newest", label: "newest" },
  { value: "oldest", label: "oldest" },
  { value: "likes", label: "most liked" },
  { value: "comments", label: "most commented" },
];
export const DEFAULT_POST_SORT = "newest";

export function normalizePostSort(raw?: string): string {
  return POST_SORT_OPTIONS.some((o) => o.value === raw)
    ? (raw as string)
    : DEFAULT_POST_SORT;
}

const byNewest = (a: RankedPost, b: RankedPost) =>
  a.post.publishedAt < b.post.publishedAt ? 1 : -1;

export function sortPosts(posts: RankedPost[], sort: string): RankedPost[] {
  const out = [...posts];
  switch (sort) {
    case "oldest":
      out.sort((a, b) => (a.post.publishedAt < b.post.publishedAt ? -1 : 1));
      break;
    case "likes":
      out.sort((a, b) => b.stats.likes - a.stats.likes || byNewest(a, b));
      break;
    case "comments":
      out.sort(
        (a, b) => b.stats.commentCount - a.stats.commentCount || byNewest(a, b),
      );
      break;
    default:
      out.sort(byNewest);
  }
  return out;
}

// --- comments --------------------------------------------------------------

export const COMMENT_SORT_OPTIONS: SortOption[] = [
  { value: "liked", label: "most liked" },
  { value: "newest", label: "newest" },
  { value: "oldest", label: "oldest" },
];
export const DEFAULT_COMMENT_SORT = "liked";

export function normalizeCommentSort(raw?: string): string {
  return COMMENT_SORT_OPTIONS.some((o) => o.value === raw)
    ? (raw as string)
    : DEFAULT_COMMENT_SORT;
}

/** Comparator for one level of siblings — applied recursively in a thread. */
export function commentComparator(
  sort: string,
): (a: Comment, b: Comment) => number {
  switch (sort) {
    case "newest":
      return (a, b) => (a.createdAt < b.createdAt ? 1 : -1);
    case "oldest":
      return (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
    default: // most liked; ties resolve oldest-first
      return (a, b) => b.likes - a.likes || (a.createdAt < b.createdAt ? -1 : 1);
  }
}

export function sortComments(comments: Comment[], sort: string): Comment[] {
  return [...comments].sort(commentComparator(sort));
}
