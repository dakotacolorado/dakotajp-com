import Link from "next/link";
import type { Post } from "@dakotajp/core";
import type { Stats } from "@dakotajp/storage";
import { formatDate } from "@/lib/util/date";

/** One post in a list. Counts are display-only — the card is itself a link. */
export function PostCard({ post, stats }: { post: Post; stats: Stats }) {
  return (
    <article className="py-6">
      <Link href={`/blog/${post.slug}`} className="group block">
        <div className="flex items-baseline gap-2.5">
          <h3 className="font-serif text-xl leading-snug text-stone-900 decoration-stone-300 underline-offset-4 group-hover:underline dark:text-stone-100 dark:decoration-stone-600">
            {post.title}
          </h3>
          {post.isDraft && (
            <span className="shrink-0 rounded-sm border border-amber-500/40 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Draft
            </span>
          )}
        </div>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs uppercase tracking-[0.08em] text-stone-500 dark:text-stone-500">
          <span>{formatDate(post.publishedAt)}</span>
          {stats.likes > 0 && (
            <span className="normal-case tracking-normal">
              ♥ {stats.likes}
            </span>
          )}
          {stats.commentCount > 0 && (
            <span className="normal-case tracking-normal">
              {stats.commentCount}{" "}
              {stats.commentCount === 1 ? "comment" : "comments"}
            </span>
          )}
        </p>

        {post.blurb && (
          <p className="mt-2.5 text-[0.94rem] leading-relaxed text-stone-600 dark:text-stone-400">
            {post.blurb}
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
