"use client";

import { deletePostAction } from "@/app/actions";

export function DeletePostButton({ slug }: { slug: string }) {
  return (
    <form
      action={deletePostAction}
      onSubmit={(e) => {
        if (!confirm("Delete this post? This cannot be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className="text-sm text-red-600 hover:underline dark:text-red-400"
      >
        Delete
      </button>
    </form>
  );
}
