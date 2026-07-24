import { listPosts } from "@/lib/content";
import { isAdmin } from "@/lib/auth";
import { EditLink } from "@/components/EditLink";
import { PostCard } from "@/components/PostCard";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const admin = await isAdmin();
  const posts = await listPosts({ includeDrafts: admin });

  return (
    <section>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="font-serif text-3xl tracking-tight">Writing</h1>
        <EditLink href="/admin/blog" />
      </div>

      {posts.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">
          No posts yet{admin ? " — create one from the admin dashboard." : "."}
        </p>
      ) : (
        <div className="divide-y divide-stone-200 dark:divide-stone-800">
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </section>
  );
}
