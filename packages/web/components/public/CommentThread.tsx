import { MAX_DEPTH, type CommentNode } from "@dakotajp/core";
import { formatDate } from "@/lib/util/date";
import { LikeButton } from "@/components/public/LikeButton";
import { DeleteCommentButton } from "@/components/admin/DeleteCommentButton";
import { ReplyForm } from "@/components/public/ReplyForm";

/** Renders a comment tree. Indents until MAX_DEPTH, then renders flat. */
export function CommentThread({
  nodes,
  slug,
  admin,
  readerLikes,
  depth = 0,
}: {
  nodes: CommentNode[];
  slug: string;
  admin: boolean;
  readerLikes: Set<string>;
  depth?: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      {nodes.map(({ comment: c, children }) => (
        <div key={c.id}>
          {c.isDeleted ? (
            <p className="text-sm italic text-stone-400 dark:text-stone-600">
              [deleted]
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.username}</span>
                <span className="text-xs text-stone-500">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                {c.message}
              </p>
              <div className="mt-1.5 flex items-center gap-4">
                <LikeButton
                  kind="comment"
                  slug={slug}
                  commentId={c.id}
                  createdAt={c.createdAt}
                  initialLikes={c.likes}
                  initiallyLiked={readerLikes.has(`c#${c.id}`)}
                />
                {admin && (
                  <DeleteCommentButton
                    slug={slug}
                    commentId={c.id}
                    createdAt={c.createdAt}
                  />
                )}
              </div>
              <div className="mt-1.5">
                <ReplyForm slug={slug} parentId={c.id} />
              </div>
            </>
          )}

          {children.length > 0 && (
            <div
              className={
                depth < MAX_DEPTH
                  ? "mt-4 border-l border-stone-200 pl-4 dark:border-stone-800"
                  : "mt-4"
              }
            >
              <CommentThread
                nodes={children}
                slug={slug}
                admin={admin}
                readerLikes={readerLikes}
                depth={depth + 1}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
