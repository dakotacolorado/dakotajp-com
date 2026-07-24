import Link from "next/link";
import type { PostMeta } from "@/lib/content";
import type { Stats } from "@/lib/likes";
import { formatDate } from "@/lib/date";

/**
 * One post in a list. Shared by the home page and the blog index so there is a
 * single thing to restyle when AI summaries land.
 *
 * The blurb prefers the generated `summary` and falls back to the `excerpt`
 * derived from the body on save — so cards look right today and upgrade
 * silently later, with no change here.
 *
 * Counts are display-only here; the interactive like button lives on the post
 * page (a card is itself a link, so nesting a button in it is awkward).
 */
export function PostCard({ post }: { post: PostMeta & Stats }) {
  const blurb = post.summary ?? post.excerpt;

  return (
    <article className="py-6">
      <Link href={`/blog/${post.slug}`} className="group block">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-serif text-xl leading-snug text-stone-900 decoration-stone-300 underline-offset-4 group-hover:underline dark:text-stone-100 dark:decoration-stone-600">
            {post.title}
          </h3>
          {!post.published && (
            <span className="shrink-0 rounded-sm border border-amber-500/40 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Draft
            </span>
          )}
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs uppercase tracking-[0.08em] text-stone-500 dark:text-stone-500">
          <span>{formatDate(post.publishedAt)}</span>
          {post.likes > 0 && (
            <span className="normal-case tracking-normal">
              ♥ {post.likes}
            </span>
          )}
          {post.commentCount > 0 && (
            <span className="normal-case tracking-normal">
              {post.commentCount}{" "}
              {post.commentCount === 1 ? "comment" : "comments"}
            </span>
          )}
        </p>

        {blurb && (
          <p className="mt-2.5 text-[0.94rem] leading-relaxed text-stone-600 dark:text-stone-400">
            {blurb}
          </p>
        )}

        {post.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {post.tags.map((tag) => (
              <li
                key={tag}
                className="text-xs lowercase tracking-wide text-stone-500 dark:text-stone-500"
              >
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </Link>
    </article>
  );
}
