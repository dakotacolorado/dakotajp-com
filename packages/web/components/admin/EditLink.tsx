import Link from "next/link";
import { isAdmin } from "@/lib/server/auth";

/** An inline "Edit" link that only renders for the logged-in admin. */
export async function EditLink({ href }: { href: string }) {
  if (!(await isAdmin())) return null;
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-md border border-amber-500 px-3 py-1 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
    >
      ✎ Edit
    </Link>
  );
}
