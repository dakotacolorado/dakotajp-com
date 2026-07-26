"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  verifyPassword,
  createSession,
  destroySession,
  isAdmin,
} from "@/lib/server/auth";
import type { EntityType } from "@dakotajp/core";
import {
  savePage,
  createPost,
  updatePost,
  deletePost,
  rollbackToVersion,
  addComment,
  deleteComment,
} from "@dakotajp/storage";
import { togglePostLike, toggleCommentLike } from "@/lib/server/likes";
import { enqueueSummary } from "@/lib/services/summary-queue";
import { slugify } from "@/lib/util/slug";

type State = { error?: string } | undefined;

async function assertAdmin() {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

/**
 * A `<input type="date">` submits `yyyy-mm-dd`. Anchor it to midnight UTC so
 * the stored instant matches what the site renders (see `lib/date.ts`).
 * Anything unparseable falls back to now rather than poisoning the sort order.
 */
function parsePublishedAt(raw: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

const MAX_TAGS = 8;

/** "AWS, dynamodb, ,aws" → ["aws", "dynamodb"] */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const tag of raw.split(",")) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (clean && clean.length <= 32) seen.add(clean);
    if (seen.size >= MAX_TAGS) break;
  }
  return [...seen];
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
    await createPost({
      slug,
      title,
      body,
      published,
      publishedAt: parsePublishedAt(String(formData.get("publishedAt") ?? "")),
      tags: parseTags(String(formData.get("tags") ?? "")),
    });
  } catch {
    return { error: "A post with a similar title already exists." };
  }
  // Kick off async AI summarization (best-effort; the storage write already
  // committed above).
  await enqueueSummary(slug);
  revalidatePath("/");
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

  await updatePost(slug, {
    title,
    body,
    published,
    publishedAt: parsePublishedAt(String(formData.get("publishedAt") ?? "")),
    tags: parseTags(String(formData.get("tags") ?? "")),
  });
  await enqueueSummary(slug);
  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  redirect(`/blog/${slug}`);
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const slug = String(formData.get("slug") ?? "");
  if (slug) {
    await deletePost(slug);
    revalidatePath("/");
    revalidatePath("/blog");
  }
  redirect("/admin/blog");
}

// --- versioning (rollback, admin only) -------------------------------------

export async function rollbackAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const type = String(formData.get("type") ?? "") as EntityType;
  const id = String(formData.get("id") ?? "");
  const version = Number(formData.get("version") ?? 0);
  if ((type !== "PAGE" && type !== "POST") || !id || !version) return;

  await rollbackToVersion(type, id, version);

  if (type === "PAGE") {
    revalidatePath(id === "about" ? "/" : `/${id}`);
    redirect(`/admin/pages/${id}`);
  } else {
    revalidatePath("/");
    revalidatePath("/blog");
    revalidatePath(`/blog/${id}`);
    redirect(`/admin/blog/${id}/edit`);
  }
}

// --- comments (public, no login) -------------------------------------------

export async function addCommentAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const slug = String(formData.get("slug") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "").trim() || undefined;

  if (!slug) return { error: "Missing post." };
  if (!username) return { error: "Please enter a name." };
  if (!message) return { error: "Please enter a comment." };
  if (username.length > 80) return { error: "Name is too long." };
  if (message.length > 1000) return { error: "Comment is too long." };

  await addComment(slug, { username, message, parentId });
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin");
  return {};
}

/** Admin moderation: delete a single comment. */
export async function deleteCommentAction(
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<void> {
  await assertAdmin();
  await deleteComment(slug, commentId, `${createdAt}#${commentId}`);
  revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin");
  revalidatePath("/blog");
  revalidatePath("/");
}

// --- likes (public, anonymous) ---------------------------------------------

export async function togglePostLikeAction(
  slug: string,
): Promise<{ liked: boolean; likes: number }> {
  const result = await togglePostLike(slug);
  // Counts feed the sortable lists, so refresh them too.
  revalidatePath("/");
  revalidatePath("/blog");
  revalidatePath(`/blog/${slug}`);
  return result;
}

export async function toggleCommentLikeAction(
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<{ liked: boolean; likes: number }> {
  const result = await toggleCommentLike(slug, commentId, createdAt);
  revalidatePath(`/blog/${slug}`);
  return result;
}
