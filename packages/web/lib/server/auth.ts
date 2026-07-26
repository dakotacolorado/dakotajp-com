import "server-only";
import { cookies } from "next/headers";
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSecureParam, SSM_PARAMS } from "@/lib/db/ssm";

/**
 * Single-admin authentication. The password hash and the JWT signing secret
 * both live in SSM; `proxy.ts` does not verify sessions, this module does.
 */

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface Session {
  admin: true;
}

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = scryptSync(password, salt, expected.length);
  return (
    derived.length === expected.length && timingSafeEqual(derived, expected)
  );
}

// --- session tokens --------------------------------------------------------

async function getSecretKey(): Promise<Uint8Array | null> {
  const secret = await getSecureParam(SSM_PARAMS.sessionSecret);
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/** Verify a plaintext password against the stored hash in SSM. */
export async function verifyPassword(password: string): Promise<boolean> {
  const stored = await getSecureParam(SSM_PARAMS.passwordHash);
  if (!stored) return false;
  return verifyPasswordHash(password, stored);
}

/** Mint a session JWT and write it to the response cookie. */
export async function createSession(): Promise<boolean> {
  const key = await getSecretKey();
  if (!key) return false;

  const token = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return true;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Returns the session if the cookie holds a valid, unexpired token. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const key = await getSecretKey();
  if (!key) return null;

  try {
    const { payload } = await jwtVerify(token, key);
    if (payload.admin === true) return { admin: true };
    return null;
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  return (await getSession()) !== null;
}
