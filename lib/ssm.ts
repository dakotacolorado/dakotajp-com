import {
  SSMClient,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";

/**
 * Reads SecureString parameters from SSM Parameter Store, with a short in-memory
 * cache so warm Lambda invocations don't re-fetch on every request.
 *
 * Server-only. Never import into a Client Component.
 */

const region = process.env.AWS_REGION ?? "us-east-1";
const client = new SSMClient({ region });

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map<string, { value: string; expires: number }>();

export async function getSecureParam(name: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(name);
  if (hit && hit.expires > now) return hit.value;

  try {
    const res = await client.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
    );
    const value = res.Parameter?.Value ?? null;
    if (value !== null) {
      cache.set(name, { value, expires: now + CACHE_TTL_MS });
    }
    return value;
  } catch (err) {
    // Missing parameter (e.g. before the admin password is set) — treat as null
    // rather than throwing, so public pages keep working.
    if (
      err &&
      typeof err === "object" &&
      "name" in err &&
      (err as { name?: string }).name === "ParameterNotFound"
    ) {
      return null;
    }
    throw err;
  }
}

export const SSM_PARAMS = {
  passwordHash: "/dakotajp/admin-password-hash",
  sessionSecret: "/dakotajp/session-secret",
} as const;
