import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { signToken, verifyToken } from "./auth-crypto";

const COOKIE = "primer_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

let secret: string | null = null;

/**
 * The key that signs session cookies. In production it must come from SESSION_SECRET.
 * On a laptop we make one the first time and keep it in .data/ (gitignored), so
 * nobody has to set anything up to try accounts.
 */
async function sessionSecret(): Promise<string> {
  if (secret) return secret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return (secret = process.env.SESSION_SECRET);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ characters) is required in production");
  const file = path.join(process.cwd(), ".data", "session-secret");
  try {
    secret = (await fs.readFile(file, "utf8")).trim();
  } catch {
    secret = randomBytes(32).toString("base64url");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, secret, { mode: 0o600 });
  }
  return secret;
}

export async function startSession(parentId: string) {
  const token = signToken({ pid: parentId, exp: Date.now() + MAX_AGE_S * 1000 }, await sessionSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // page scripts can't read it
    sameSite: "lax", // other sites can't ride along on it
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/** The signed-in parent's id, or null. */
export async function currentParentId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token, await sessionSecret())?.pid ?? null;
}

/**
 * Changes only come from our own pages: the request must be JSON and, when the browser
 * says where it came from, from this same host. Together with sameSite cookies this
 * stops other sites from submitting forms on a parent's behalf.
 */
export function sameOriginJson(req: Request): boolean {
  if (!req.headers.get("content-type")?.includes("application/json")) return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

// A small speed bump for password guessing: 8 tries per email per 10 minutes, per server instance.
const tries = new Map<string, { count: number; until: number }>();
export function tooManyTries(key: string, now = Date.now()): boolean {
  const t = tries.get(key);
  if (!t || t.until < now) {
    tries.set(key, { count: 1, until: now + 10 * 60 * 1000 });
    return false;
  }
  t.count++;
  return t.count > 8;
}
export function clearTries(key: string) {
  tries.delete(key);
}
