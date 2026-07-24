import Link from "next/link";
import { getPage, listPosts } from "@/lib/content";
import { SEED_PAGES } from "@/lib/seed";
import { isAdmin } from "@/lib/auth";
import { Markdown } from "@/components/Markdown";
import { EditLink } from "@/components/EditLink";
import { PostCard } from "@/components/PostCard";

export const dynamic = "force-dynamic";

/** How many recent posts the home page shows before deferring to /blog. */
const RECENT_COUNT = 5;

export default async function HomePage() {
  const [page, admin] = await Promise.all([getPage("about"), isAdmin()]);
  const about = page ?? SEED_PAGES.about;
  // Drafts appear here only for the logged-in admin, same rule as /blog.
  const posts = await listPosts({ includeDrafts: admin, limit: RECENT_COUNT });

  return (
    <>
      <article>
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-3xl tracking-tight">{about.title}</h1>
          <EditLink href="/admin/pages/about" />
        </div>
        <Markdown>{about.body}</Markdown>
      </article>

      {posts.length > 0 && (
        <section className="mt-16 border-t border-stone-200 pt-8 dark:border-stone-800">
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
            Writing
          </h2>

          <div className="divide-y divide-stone-200 dark:divide-stone-800">
            {posts.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>

          <Link
            href="/blog"
            className="mt-2 inline-block border-b border-stone-300 pb-0.5 text-sm text-stone-600 transition-colors hover:border-stone-600 hover:text-stone-900 dark:border-stone-700 dark:text-stone-400 dark:hover:border-stone-400 dark:hover:text-stone-100"
          >
            All posts →
          </Link>
        </section>
      )}
    </>
  );
}
