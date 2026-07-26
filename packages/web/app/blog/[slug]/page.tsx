import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/domain/content";
import { listComments } from "@/lib/domain/comments";
import { getPostStats, getReaderPostLikes } from "@/lib/domain/likes";
import { isAdmin } from "@/lib/domain/auth";
import { formatDate } from "@/lib/util/date";
import {
  COMMENT_SORT_OPTIONS,
  DEFAULT_COMMENT_SORT,
  normalizeCommentSort,
} from "@/lib/domain/sorting";
import { buildThread } from "@/lib/domain/comment-tree";
import { Markdown } from "@/components/ui/Markdown";
import { EditLink } from "@/components/admin/EditLink";
import { CommentForm } from "@/components/public/CommentForm";
import { LikeButton } from "@/components/public/LikeButton";
import { CommentThread } from "@/components/public/CommentThread";
import { SortControl } from "@/components/public/SortControl";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.blurb,
  };
}

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sort?: string }>;
}) {
  const [{ slug }, { sort: rawSort }] = await Promise.all([
    params,
    searchParams,
  ]);
  const post = await getPost(slug);

  // Drafts are visible only to the admin.
  const admin = await isAdmin();
  if (!post || (!post.published && !admin)) notFound();

  const [stats, readerLikes, comments] = await Promise.all([
    getPostStats(slug),
    getReaderPostLikes(slug),
    listComments(slug),
  ]);
  const sort = normalizeCommentSort(rawSort);
  const thread = buildThread(comments, sort);
  // Tombstones stay in the tree as nodes but don't count as "real" comments.
  const visibleCount = comments.filter((c) => !c.deleted).length;

  return (
    <article>
      <header className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h1 className="font-serif text-3xl leading-tight tracking-tight">
            {post.title}
          </h1>
          <EditLink href={`/admin/blog/${slug}/edit`} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-[0.08em] text-stone-500">
          <span>{formatDate(post.publishedAt)}</span>
          {!post.published && (
            <span className="text-amber-700 dark:text-amber-400">Draft</span>
          )}
          {post.tags.map((tag) => (
            <span key={tag} className="lowercase tracking-wide">
              #{tag}
            </span>
          ))}
        </div>
      </header>

      <Markdown>{post.body ?? ""}</Markdown>

      <div className="mt-10 border-t border-stone-200 pt-6 dark:border-stone-800">
        <LikeButton
          kind="post"
          slug={slug}
          initialLikes={stats.likes}
          initiallyLiked={readerLikes.has("post")}
        />
      </div>

      <section className="mt-12">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
            Comments {visibleCount > 0 && `(${visibleCount})`}
          </h2>
          {visibleCount > 1 && (
            <SortControl
              basePath={`/blog/${slug}`}
              current={sort}
              defaultValue={DEFAULT_COMMENT_SORT}
              options={COMMENT_SORT_OPTIONS}
            />
          )}
        </div>

        <div className="mb-8">
          {thread.length === 0 ? (
            <p className="text-sm text-stone-500">
              No comments yet. Be the first.
            </p>
          ) : (
            <CommentThread
              nodes={thread}
              slug={slug}
              admin={admin}
              readerLikes={readerLikes}
            />
          )}
        </div>

        <div className="rounded-md border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
          <h3 className="mb-3 text-sm font-medium">Leave a comment</h3>
          <CommentForm slug={slug} />
        </div>
      </section>
    </article>
  );
}
