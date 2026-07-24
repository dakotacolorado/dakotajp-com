import { notFound } from "next/navigation";
import { getPost } from "@/lib/content";
import { listComments } from "@/lib/comments";
import { isAdmin } from "@/lib/auth";
import { Markdown } from "@/components/Markdown";
import { EditLink } from "@/components/EditLink";
import { CommentForm } from "@/components/CommentForm";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
      <div className="mb-2 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{post.title}</h1>
        <EditLink href={`/admin/blog/${slug}/edit`} />
      </div>
      <p className="mb-8 text-sm text-gray-500">
        {formatDate(post.createdAt)}
        {!post.published && " · Draft"}
      </p>

      <Markdown>{post.body}</Markdown>

      <hr className="my-10 border-gray-200 dark:border-gray-800" />

      <section>
        <h2 className="mb-4 text-xl font-semibold">
          Comments {comments.length > 0 && `(${comments.length})`}
        </h2>

        <div className="mb-8 flex flex-col gap-4">
          {comments.length === 0 ? (
            <p className="text-sm text-gray-500">
              No comments yet. Be the first!
            </p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-gray-200 p-4 dark:border-gray-800"
              >
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-medium">{c.username}</span>
                  <span className="text-xs text-gray-500">
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{c.message}</p>
              </div>
            ))
          )}
        </div>

        <div className="rounded-md bg-gray-50 p-4 dark:bg-gray-900">
          <h3 className="mb-3 text-sm font-semibold">Leave a comment</h3>
          <CommentForm slug={slug} />
        </div>
      </section>
    </article>
  );
}
