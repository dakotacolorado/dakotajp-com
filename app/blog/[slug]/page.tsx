import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPost } from "@/lib/content";
import { listComments } from "@/lib/comments";
import { isAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/date";
import { Markdown } from "@/components/Markdown";
import { EditLink } from "@/components/EditLink";
import { CommentForm } from "@/components/CommentForm";

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
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPost(slug);

  // Drafts are visible only to the admin.
  const admin = await isAdmin();
  if (!post || (!post.published && !admin)) notFound();

  const comments = await listComments(slug);

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

      <section className="mt-16 border-t border-stone-200 pt-8 dark:border-stone-800">
        <h2 className="mb-5 text-xs font-medium uppercase tracking-[0.12em] text-stone-500">
          Comments {comments.length > 0 && `(${comments.length})`}
        </h2>

        <div className="mb-8 flex flex-col gap-5">
          {comments.length === 0 ? (
            <p className="text-sm text-stone-500">
              No comments yet. Be the first.
            </p>
          ) : (
            comments.map((c) => (
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
