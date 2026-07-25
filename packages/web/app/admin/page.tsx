import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/domain/auth";
import { listPosts } from "@/lib/domain/content";
import { getAllPostStats } from "@/lib/domain/likes";
import { listRecentComments, countCommentsSince } from "@/lib/domain/comments";
import { formatDate } from "@/lib/util/date";
import { logoutAction } from "@/app/actions";
import { DeleteCommentButton } from "@/components/admin/DeleteCommentButton";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

// Kept out of the component body so the render stays pure (react-hooks/purity).
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const [posts, stats, recentComments, last24h, last7d] = await Promise.all([
    listPosts({ includeDrafts: true }),
    getAllPostStats(),
    listRecentComments(10),
    countCommentsSince(isoDaysAgo(1)),
    countCommentsSince(isoDaysAgo(7)),
  ]);
  const published = posts.filter((p) => p.published).length;
  const drafts = posts.length - published;

  // Total is the free sum of the per-post commentCount counters (from #1).
  const totalComments = [...stats.values()].reduce(
    (sum, s) => sum + s.commentCount,
    0,
  );
  const newestComment = recentComments[0]?.createdAt;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
          >
            Log out
          </button>
        </form>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Session
        </h2>
        <div className="rounded-md border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p>
            Signed in as <span className="font-medium">admin</span>.
          </p>
          <p className="text-gray-500">
            {posts.length} post{posts.length === 1 ? "" : "s"} · {published}{" "}
            published · {drafts} draft{drafts === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Pages
        </h2>
        <div className="flex flex-col gap-2">
          <Link
            href="/admin/pages/about"
            className="rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            Edit <span className="font-medium">About</span> (landing page)
          </Link>
          <Link
            href="/admin/pages/resume"
            className="rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
          >
            Edit <span className="font-medium">Resume</span>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Blog
          </h2>
          <Link
            href="/admin/blog/new"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            New post
          </Link>
        </div>
        <Link
          href="/admin/blog"
          className="block rounded-md border border-gray-200 px-4 py-3 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-900"
        >
          Manage posts →
        </Link>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Comments
        </h2>
        <div className="mb-3 rounded-md border border-gray-200 p-4 text-sm dark:border-gray-800">
          <p className="text-gray-500">
            {totalComments} total · {last24h} in last 24h · {last7d} in last 7
            days
            {newestComment && <> · newest {formatDate(newestComment)}</>}
          </p>
        </div>

        {recentComments.length === 0 ? (
          <p className="text-sm text-gray-500">No comments yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
            {recentComments.map((c) => (
              <li
                key={`${c.slug}:${c.id}`}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium">{c.username}</span>
                    <span className="text-xs text-gray-500">
                      {formatDate(c.createdAt)}
                    </span>
                    <Link
                      href={`/blog/${c.slug}`}
                      className="text-xs text-gray-500 hover:underline"
                    >
                      on {c.slug}
                    </Link>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-gray-400">
                    {c.message}
                  </p>
                </div>
                <DeleteCommentButton
                  slug={c.slug}
                  commentId={c.id}
                  createdAt={c.createdAt}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
