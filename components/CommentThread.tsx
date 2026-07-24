import type { CommentNode } from "@/lib/comment-tree";
import { MAX_DEPTH } from "@/lib/comment-tree";
import { formatDate } from "@/lib/date";
import { LikeButton } from "@/components/LikeButton";
import { DeleteCommentButton } from "@/components/DeleteCommentButton";
import { ReplyForm } from "@/components/ReplyForm";

/**
 * Renders a comment tree recursively. Nesting indents until MAX_DEPTH, after
 * which deeper replies render flat (no further indent) so a phone thread stays
 * readable. Tombstoned nodes show "[deleted]" but keep their replies.
 */
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
      {nodes.map((node) => (
        <div key={node.id}>
          {node.deleted ? (
            <p className="text-sm italic text-stone-400 dark:text-stone-600">
              [deleted]
            </p>
          ) : (
            <>
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-sm font-medium">{node.username}</span>
                <span className="text-xs text-stone-500">
                  {formatDate(node.createdAt)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                {node.message}
              </p>
              <div className="mt-1.5 flex items-center gap-4">
                <LikeButton
                  kind="comment"
                  slug={slug}
                  commentId={node.id}
                  createdAt={node.createdAt}
                  initialLikes={node.likes}
                  initiallyLiked={readerLikes.has(`c#${node.id}`)}
                />
                {admin && (
                  <DeleteCommentButton
                    slug={slug}
                    commentId={node.id}
                    createdAt={node.createdAt}
                  />
                )}
              </div>
              <div className="mt-1.5">
                <ReplyForm slug={slug} parentId={node.id} />
              </div>
            </>
          )}

          {node.children.length > 0 && (
            <div
              className={
                depth < MAX_DEPTH
                  ? "mt-4 border-l border-stone-200 pl-4 dark:border-stone-800"
                  : "mt-4"
              }
            >
              <CommentThread
                nodes={node.children}
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
