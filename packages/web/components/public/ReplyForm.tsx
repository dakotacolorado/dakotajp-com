"use client";

import { useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions";

export function ReplyForm({
  slug,
  parentId,
}: {
  slug: string;
  parentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="text-xs text-stone-500 transition-colors hover:text-stone-800 dark:hover:text-stone-200"
      >
        Reply
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await addCommentAction(undefined, formData);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="parentId" value={parentId} />
      <input
        name="username"
        placeholder="Your name"
        maxLength={80}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      <textarea
        name="message"
        placeholder="Write a reply…"
        rows={2}
        maxLength={1000}
        className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm dark:border-stone-700 dark:bg-stone-900"
      />
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-50 hover:bg-stone-700 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          {pending ? "Posting…" : "Post reply"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-xs hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-900"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
