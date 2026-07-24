"use client";

import { useActionState } from "react";
import Link from "next/link";
import { savePageAction } from "@/app/actions";

export function PageEditor({
  pageKey,
  title,
  body,
  cancelHref,
}: {
  pageKey: string;
  title: string;
  body: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(savePageAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="key" value={pageKey} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          name="title"
          defaultValue={title}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Content (Markdown)</span>
        <textarea
          name="body"
          defaultValue={body}
          rows={22}
          className="rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gray-900 px-4 py-2 font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
