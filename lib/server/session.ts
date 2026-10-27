import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { accounts } from "./accounts";
import { signToken, verifyToken } from "./auth-crypto";
import { caller, dataDir, forgetLimit, overLimit } from "./guard";

export { sameOriginJson } from "./guard";

const COOKIE = "primer_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

let secret: string | null = null;

/**
 * The key that signs session cookies. In production it must come from SESSION_SECRET.
 * On a laptop we make one the first time and keep it in .data/ (gitignored), so
 * nobody has to set anything up to try accounts. The story cache keys its file names
 * with it too (app/api/story), so there is only one secret to keep.
 */
export async function sessionSecret(): Promise<string> {
  if (secret) return secret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) return (secret = process.env.SESSION_SECRET);
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (32+ characters) is required in production");
  const file = path.join(dataDir(), "session-secret");
  try {
    secret = (await fs.readFile(file, "utf8")).trim();
  } catch {
    secret = randomBytes(32).toString("base64url");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, secret, { mode: 0o600 });
  }
  return secret;
}

/** Throws (before anything is created) when sign-in can't work, e.g. production without SESSION_SECRET. */
export async function sessionsReady(): Promise<boolean> {
  try {
    await sessionSecret();
    return true;
  } catch (e) {
    console.error(`[auth] ${e instanceof Error ? e.message : "sessions unavailable"}`);
    return false;
  }
}

export async function startSession(parentId: string) {
  const v = (await accounts().sessionVersion(parentId)) ?? 0;
  const token = signToken({ pid: parentId, v, exp: Date.now() + MAX_AGE_S * 1000 }, await sessionSecret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, // page scripts can't read it
    sameSite: "lax", // other sites can't ride along on it
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

/**
 * Sign out everywhere: the cookie goes, and the parent's session version moves on, so a
 * copy of the old cookie (another device, a shared computer) stops working too.
 */
export async function endSession() {
  const pid = await currentParentId();
  if (pid) await accounts().bumpSession(pid);
  (await cookies()).delete(COOKIE);
}

/** The signed-in parent's id, or null. A deleted account or a signed-out session is null. */
export async function currentParentId(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const payload = verifyToken(token, await sessionSecret());
  if (!payload) return null;
  const v = await accounts().sessionVersion(payload.pid);
  return v !== null && v === payload.v ? payload.pid : null;
}

/**
 * Speed bumps for password guessing. Per email from one address (so a stranger can't lock a
 * parent out from elsewhere), and per address across all emails (so spraying is slow too).
 */
export function tooManyTries(req: Request, email: string): boolean {
  const from = caller(req);
  return overLimit(`login|${from}|${email}`, 8, 10 * 60 * 1000) || overLimit(`login|${from}`, 30, 10 * 60 * 1000);
}
export function clearTries(req: Request, email: string) {
  forgetLimit(`login|${caller(req)}|${email}`);
}
export function tooManySignups(req: Request): boolean {
  return overLimit(`signup|${caller(req)}`, 10, 60 * 60 * 1000);
}
