import { redirect } from "next/navigation";
import Link from "next/link";
import { isAdmin } from "@/lib/auth";
import { listPosts } from "@/lib/content";
import { DeletePostButton } from "@/components/DeletePostButton";

export const dynamic = "force-dynamic";

export default async function ManageBlog() {
  if (!(await isAdmin())) redirect("/admin/login");

  const posts = await listPosts({ includeDrafts: true });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Manage blog</h1>
        <Link
          href="/admin/blog/new"
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          New post
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="text-gray-600 dark:text-gray-400">No posts yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
          {posts.map((post) => (
            <li
              key={post.slug}
              className="flex items-center justify-between py-3"
            >
              <div className="flex items-center gap-2">
                <Link
                  href={`/blog/${post.slug}`}
                  className="font-medium hover:underline"
                >
                  {post.title}
                </Link>
                {!post.published && (
                  <span className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    Draft
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href={`/admin/blog/${post.slug}/edit`}
                  className="text-sm hover:underline"
                >
                  Edit
                </Link>
                <DeletePostButton slug={post.slug} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
