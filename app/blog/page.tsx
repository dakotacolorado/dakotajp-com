import Link from "next/link";
import { listPosts } from "@/lib/content";
import { isAdmin } from "@/lib/auth";
import { EditLink } from "@/components/EditLink";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function BlogPage() {
  const admin = await isAdmin();
  const posts = await listPosts({ includeDrafts: admin });

  return (
    <section>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Blog</h1>
        <EditLink href="/admin/blog" />
      </div>

      {posts.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">
          No posts yet{admin ? " — create one from the admin dashboard." : "."}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {posts.map((post) => (
            <li key={post.slug} className="py-4">
              <Link href={`/blog/${post.slug}`} className="group block">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-medium group-hover:underline">
                    {post.title}
                  </h2>
                  {!post.published && (
                    <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Draft
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  {formatDate(post.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
