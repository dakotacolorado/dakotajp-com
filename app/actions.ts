"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  verifyPassword,
  createSession,
  destroySession,
  isAdmin,
} from "@/lib/auth";
import { savePage, createPost, updatePost, deletePost } from "@/lib/content";
import { addComment } from "@/lib/comments";
import { slugify } from "@/lib/slug";

type State = { error?: string } | undefined;

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

// --- auth ------------------------------------------------------------------

export async function loginAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const password = String(formData.get("password") ?? "");
  if (!password) return { error: "Password is required." };

  const ok = await verifyPassword(password);
  if (!ok) return { error: "Incorrect password." };

  const created = await createSession();
  if (!created) {
    return { error: "Auth is not configured yet. Run set-admin-password." };
  }
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await destroySession();
  redirect("/");
}

// --- pages (About / Resume) ------------------------------------------------

export async function savePageAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  await assertAdmin();
  const key = String(formData.get("key") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  if (!key || !title) return { error: "Title is required." };

  await savePage(key, { title, body });
  revalidatePath(key === "about" ? "/" : `/${key}`);
  redirect(key === "about" ? "/" : `/${key}`);
}

// --- posts -----------------------------------------------------------------

export async function createPostAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const published = formData.get("published") === "on";
  if (!title) return { error: "Title is required." };

  const slug = slugify(title);
  if (!slug) return { error: "Title must contain letters or numbers." };

  try {
    await createPost({ slug, title, body, published });
  } catch {
    return { error: "A post with a similar title already exists." };
  }
  revalidatePath("/blog");
  redirect(`/blog/${slug}`);
}

export async function updatePostAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const published = formData.get("published") === "on";
  if (!slug || !title) return { error: "Title is required." };

  await updatePost(slug, { title, body, published });
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  redirect(`/blog/${slug}`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (slug) {
    await deletePost(slug);
    revalidatePath("/blog");
  }
  redirect("/admin/blog");
}

// --- comments (public, no login) -------------------------------------------

export async function addCommentAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const slug = String(formData.get("slug") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!slug) return { error: "Missing post." };
  if (!username) return { error: "Please enter a name." };
  if (!message) return { error: "Please enter a comment." };
  if (username.length > 80) return { error: "Name is too long." };
  if (message.length > 1000) return { error: "Comment is too long." };

  await addComment(slug, { username, message });
  revalidatePath(`/blog/${slug}`);
  return {};
}
