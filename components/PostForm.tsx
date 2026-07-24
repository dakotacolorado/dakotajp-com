"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createPostAction, updatePostAction } from "@/app/actions";
import { MarkdownField } from "@/components/MarkdownField";

export function PostForm({
  mode,
  slug,
  title = "",
  body = "",
  published = false,
}: {
  mode: "create" | "edit";
  slug?: string;
  title?: string;
  body?: string;
  published?: boolean;
}) {
  const action = mode === "create" ? createPostAction : updatePostAction;
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {mode === "edit" && <input type="hidden" name="slug" value={slug} />}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Title</span>
        <input
          name="title"
          defaultValue={title}
          className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
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
