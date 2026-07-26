import Link from "next/link";
import { isAdmin } from "@/lib/server/auth";
import { logoutAction } from "@/app/actions";

/** Shown on every page, only for a valid admin session. */
export async function AdminBar() {
  if (!(await isAdmin())) return null;

  return (
    <div className="bg-amber-500 text-black">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-2 text-sm">
        <span className="font-medium">Admin mode</span>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="hover:underline">
            Dashboard
          </Link>
          <Link href="/admin/blog" className="hover:underline">
            Blog
          </Link>
          <form action={logoutAction}>
            <button type="submit" className="hover:underline">
              Log out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
