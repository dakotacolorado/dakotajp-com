import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/domain/auth";
import { getPost } from "@/lib/domain/content";
import { PostForm } from "@/components/admin/PostForm";
import { VersionHistory } from "@/components/admin/VersionHistory";

export const dynamic = "force-dynamic";

export default async function EditPost({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!(await isAdmin())) redirect("/admin/login");

  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Edit post</h1>
      <PostForm
        mode="edit"
        slug={post.slug}
        title={post.title}
        body={post.body}
        published={post.published}
        publishedAt={post.publishedAt}
        tags={post.tags}
      />
      <VersionHistory type="POST" id={post.slug} />
    </div>
  );
}
