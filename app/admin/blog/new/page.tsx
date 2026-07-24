import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { PostForm } from "@/components/PostForm";

export const dynamic = "force-dynamic";

export default async function NewPost() {
  if (!(await isAdmin())) redirect("/admin/login");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">New post</h1>
      <PostForm mode="create" />
    </div>
  );
}
