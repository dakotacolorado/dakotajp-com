"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPostAction, updatePostAction } from "@/app/actions";
import { MarkdownField } from "@/components/MarkdownField";

/** ISO timestamp → the `yyyy-mm-dd` a date input expects. */
function toDateInput(iso?: string): string {
  return (iso ?? new Date().toISOString()).slice(0, 10);
}

export function PostForm({
  mode,
  slug,
  title = "",
  body = "",
  published = false,
  publishedAt,
  tags = [],
}: {
  mode: "create" | "edit";
  slug?: string;
  title?: string;
  body?: string;
  published?: boolean;
  publishedAt?: string;
  tags?: string[];
}) {
  const action = mode === "create" ? createPostAction : updatePostAction;
  const [state, formAction, pending] = useActionState(action, undefined);
  const inputClass =
    "rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" && <input type="hidden" name="slug" value={slug} />}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input name="title" defaultValue={title} className={inputClass} />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Publish date</span>
          <input
            type="date"
            name="publishedAt"
            defaultValue={toDateInput(publishedAt)}
            className={inputClass}
          />
          <span className="text-xs text-gray-500">
            What the site sorts and displays. Backdating is fine.
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tags</span>
          <input
            name="tags"
            defaultValue={tags.join(", ")}
            placeholder="aws, dynamodb"
            className={inputClass}
          />
          <span className="text-xs text-gray-500">Comma separated.</span>
        </label>
      </div>

      <MarkdownField name="body" label="Body (Markdown)" defaultValue={body} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={published} />
        <span>Published (unchecked = draft, hidden from visitors)</span>
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
          {pending ? "Saving…" : mode === "create" ? "Create post" : "Save changes"}
        </button>
        <Link
          href="/admin/blog"
          className="rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
