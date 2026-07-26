"use client";

import { useActionState, useEffect, useRef } from "react";
import { addCommentAction } from "@/app/actions";

export function CommentForm({ slug }: { slug: string }) {
  const [state, formAction, pending] = useActionState(
    addCommentAction,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Success resolves to {} with no error.
  useEffect(() => {
    if (state && !state.error) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="slug" value={slug} />
      <input
        name="username"
        placeholder="Your name"
        maxLength={80}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      <textarea
        name="message"
        placeholder="Write a comment…"
        rows={3}
        maxLength={1000}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
      />
      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
      >
        {pending ? "Posting…" : "Post comment"}
      </button>
    </form>
  );
}
