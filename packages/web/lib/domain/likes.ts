import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSecureParam, SSM_PARAMS } from "@/lib/db/ssm";
import {
  getReaderPostLikes as storeReaderPostLikes,
  togglePostLike as storeTogglePostLike,
  toggleCommentLike as storeToggleCommentLike,
} from "@dakotajp/storage";

/**
 * Reader identity for anonymous likes — the request-scoped, Next-only half.
 *
 * Each reader gets a signed, httpOnly cookie holding a random ID; the persisted
 * like/dedupe logic lives in @dakotajp/storage and receives that id. Clearing
 * cookies mints a fresh identity — an accepted limit for anonymous likes.
 */

const READER_COOKIE = "rid";
const READER_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

// Pass-through reads/stats that need no reader identity.
export type { Stats } from "@dakotajp/storage";
export { STATS_PK, getPostStats, getAllPostStats } from "@dakotajp/storage";

async function secretKey(): Promise<Uint8Array | null> {
  const secret = await getSecureParam(SSM_PARAMS.sessionSecret);
  return secret ? new TextEncoder().encode(secret) : null;
}

/** The reader's ID from their signed cookie, or null if absent/unverified. */
export async function getReaderId(): Promise<string | null> {
  const token = (await cookies()).get(READER_COOKIE)?.value;
  if (!token) return null;
  const key = await secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    return typeof payload.rid === "string" ? payload.rid : null;
  } catch {
    return null;
  }
}

/** Read the reader's ID, minting + setting the cookie on first like. */
async function ensureReaderId(): Promise<string | null> {
  const existing = await getReaderId();
  if (existing) return existing;
  const key = await secretKey();
  if (!key) return null;

  const rid = randomUUID();
  const token = await new SignJWT({ rid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(key);
  (await cookies()).set(READER_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: READER_TTL_SECONDS,
  });
  return rid;
}

export async function getReaderPostLikes(slug: string): Promise<Set<string>> {
  return storeReaderPostLikes(await getReaderId(), slug);
}

export async function togglePostLike(
  slug: string,
): Promise<{ liked: boolean; likes: number }> {
  return storeTogglePostLike(await ensureReaderId(), slug);
}

export async function toggleCommentLike(
  slug: string,
  commentId: string,
  createdAt: string,
): Promise<{ liked: boolean; likes: number }> {
  return storeToggleCommentLike(await ensureReaderId(), slug, commentId, createdAt);
}
