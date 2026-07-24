"use client";

import { useTransition } from "react";
import { deleteCommentAction } from "@/app/actions";

export function DeleteCommentButton({
  slug,
  commentId,
  createdAt,
}: {
  slug: string;
  commentId: string;
  createdAt: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm("Delete this comment? This cannot be undone.")) return;
        startTransition(() =>
          deleteCommentAction(slug, commentId, createdAt),
        );
      }}
      className="text-xs text-red-600 transition-colors hover:underline disabled:opacity-50 dark:text-red-400"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
