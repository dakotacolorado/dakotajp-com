import { listPosts } from "@/lib/domain/content";
import { getAllPostStats } from "@/lib/domain/likes";
import { isAdmin } from "@/lib/domain/auth";
import { EditLink } from "@/components/admin/EditLink";
import { PostCard } from "@/components/public/PostCard";
import { SortControl } from "@/components/public/SortControl";
import {
  POST_SORT_OPTIONS,
  DEFAULT_POST_SORT,
  normalizePostSort,
  sortPosts,
} from "@/lib/domain/sorting";

export const dynamic = "force-dynamic";

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const [{ sort: rawSort }, admin] = await Promise.all([
    searchParams,
    isAdmin(),
  ]);
  const sort = normalizePostSort(rawSort);

  const [posts, stats] = await Promise.all([
    listPosts({ includeDrafts: admin }),
    getAllPostStats(),
  ]);
  const withStats = posts.map((p) => ({
    ...p,
    ...(stats.get(p.slug) ?? { likes: 0, commentCount: 0 }),
  }));
  const sorted = sortPosts(withStats, sort);

  return (
    <section>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">Blog</h1>
        <EditLink href="/admin/blog" />
      </div>

      {sorted.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">
          No posts yet{admin ? " — create one from the admin dashboard." : "."}
        </p>
      ) : (
        <>
          <div className="mb-2">
            <SortControl
              basePath="/blog"
              current={sort}
              defaultValue={DEFAULT_POST_SORT}
              options={POST_SORT_OPTIONS}
            />
          </div>
          <div className="divide-y divide-stone-200 dark:divide-stone-800">
            {sorted.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
