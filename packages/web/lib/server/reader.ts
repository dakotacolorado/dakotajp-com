import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSecureParam, SSM_PARAMS } from "@/lib/db/ssm";

/**
 * Reader identity for anonymous likes: a signed httpOnly cookie holding a
 * random id. Callers pass the result into `storage`, which never reads
 * request-scoped state itself (ADR 0001).
 *
 * Clearing cookies mints a fresh identity — accepted for anonymous likes.
 */

const READER_COOKIE = "rid";
const READER_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

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

/**
 * The reader's ID, minting and setting the cookie if they don't have one yet.
 * Use on a write (a like); use `getReaderId` on a read, so merely viewing a
 * page never sets a cookie.
 */
export async function ensureReaderId(): Promise<string | null> {
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
