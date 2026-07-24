import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth";
import { listPosts } from "@/lib/content";
import { logoutAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getSession();
  if (!session) redirect("/admin/login");

  const posts = await listPosts({ includeDrafts: true });
  const published = posts.filter((p) => p.published).length;
  const drafts = posts.length - published;

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
    </div>
  );
}
