import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/content";
import { listComments } from "@/lib/comments";
import { getPostStats, getReaderPostLikes } from "@/lib/likes";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import {
  COMMENT_SORT_OPTIONS,
  DEFAULT_COMMENT_SORT,
  normalizeCommentSort,
  sortComments,
} from "@/lib/sorting";
import { Markdown } from "@/components/Markdown";
import { EditLink } from "@/components/EditLink";
import { CommentForm } from "@/components/CommentForm";
import { LikeButton } from "@/components/LikeButton";
import { SortControl } from "@/components/SortControl";

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
    description: post.summary ?? post.excerpt,
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
  const sortedComments = sortComments(comments, sort);

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

      <Markdown>{post.body}</Markdown>

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
            Comments {comments.length > 0 && `(${comments.length})`}
          </h2>
          {comments.length > 1 && (
            <SortControl
              basePath={`/blog/${slug}`}
              current={sort}
              defaultValue={DEFAULT_COMMENT_SORT}
              options={COMMENT_SORT_OPTIONS}
            />
          )}
        </div>

        <div className="mb-8 flex flex-col gap-5">
          {sortedComments.length === 0 ? (
            <p className="text-sm text-stone-500">
              No comments yet. Be the first.
            </p>
          ) : (
            sortedComments.map((c) => (
              <div key={c.id}>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-sm font-medium">{c.username}</span>
                  <span className="text-xs text-stone-500">
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
                  {c.message}
                </p>
                <div className="mt-1.5">
                  <LikeButton
                    kind="comment"
                    slug={slug}
                    commentId={c.id}
                    createdAt={c.createdAt}
                    initialLikes={c.likes}
                    initiallyLiked={readerLikes.has(`c#${c.id}`)}
                  />
                </div>
              </div>
            ))
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
