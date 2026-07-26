"use client";

import { useState, useTransition } from "react";
import { togglePostLikeAction, toggleCommentLikeAction } from "@/app/actions";

type Props =
  | {
      kind: "post";
      slug: string;
      initialLikes: number;
      initiallyLiked: boolean;
    }
  | {
      kind: "comment";
      slug: string;
      commentId: string;
      createdAt: string;
      initialLikes: number;
      initiallyLiked: boolean;
    };

export function LikeButton(props: Props) {
  const [likes, setLikes] = useState(props.initialLikes);
  const [liked, setLiked] = useState(props.initiallyLiked);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (pending) return;
    const nextLiked = !liked;
    setLiked(nextLiked); // optimistic
    setLikes((n) => Math.max(0, n + (nextLiked ? 1 : -1)));

    startTransition(async () => {
      try {
        const res =
          props.kind === "post"
            ? await togglePostLikeAction(props.slug)
            : await toggleCommentLikeAction(
                props.slug,
                props.commentId,
                props.createdAt,
              );
        setLiked(res.liked);
        setLikes(res.likes);
      } catch {
        setLiked(!nextLiked); // revert
        setLikes((n) => Math.max(0, n + (nextLiked ? -1 : 1)));
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={`inline-flex items-center gap-1.5 text-sm transition-colors ${
        liked
          ? "text-rose-600 dark:text-rose-400"
          : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill={liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M12 21s-6.5-4.35-9.33-8.02C.9 10.42 1.4 6.9 4.2 5.6c1.9-.88 3.98-.2 5.1 1.34L12 9.9l2.7-2.96c1.12-1.54 3.2-2.22 5.1-1.34 2.8 1.3 3.3 4.82 1.53 7.38C18.5 16.65 12 21 12 21z" />
      </svg>
      <span className="tabular-nums">{likes}</span>
    </button>
  );
}
