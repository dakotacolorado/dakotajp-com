import type { PostMeta } from "./content";
import type { Comment } from "./comments";
import type { Stats } from "./likes";
import type { SortOption } from "@/components/SortControl";

export type PostWithStats = PostMeta & Stats;

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

const byNewest = (a: PostWithStats, b: PostWithStats) =>
  a.publishedAt < b.publishedAt ? 1 : -1;

export function sortPosts(
  posts: PostWithStats[],
  sort: string,
): PostWithStats[] {
  const out = [...posts];
  switch (sort) {
    case "oldest":
      out.sort((a, b) => (a.publishedAt < b.publishedAt ? -1 : 1));
      break;
    case "likes":
      out.sort((a, b) => b.likes - a.likes || byNewest(a, b));
      break;
    case "comments":
      out.sort((a, b) => b.commentCount - a.commentCount || byNewest(a, b));
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
