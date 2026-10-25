import { createHash } from "node:crypto";
import path from "node:path";

/**
 * Small shared protections for the API routes: where files may be written, request size
 * limits, same-origin checks, and a per-caller speed limit.
 */

/** Strong file-name hash. (lib/hash.ts is a fast 32-bit hash for the browser; never use it for cache keys an outsider can choose.) */
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Hosts like Vercel give the app a read-only disk except /tmp, and /tmp is wiped whenever
 * the server restarts. Fine for caches; for accounts it means a demo deploy forgets everyone
 * on restart, which is why the README says to use a hosted database for real sign-ups.
 */
function writableRoot(): string {
  return process.env.VERCEL ? path.join("/tmp", "primer") : process.cwd();
}
export const cacheDir = (...parts: string[]) => path.join(writableRoot(), ".cache", ...parts);
export const dataDir = (...parts: string[]) => path.join(writableRoot(), ".data", ...parts);

/** Read a JSON body without ever holding more than `maxBytes` of it. Null if too big or not JSON. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Only our own pages may call: the request is JSON (a form on another site can't send that
 * without the browser asking first) and, when the browser says where it came from, it is us.
 */
export function sameOriginJson(req: Request): boolean {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return false;
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.get("host");
  } catch {
    return false;
  }
}

/** Who is calling, as far as a demo can tell: the first forwarded address, else one shared bucket. */
export function caller(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

const buckets = new Map<string, number[]>();

/**
 * True when `key` has already made `limit` calls in the last `windowMs`. Counts this call.
 * Per server instance and in memory: a speed bump for a demo, not a wall. Production would
 * use a shared store (for example Redis) so every instance sees the same counts.
 */
export function overLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) if (times.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return recent.length > limit;
}

export function forgetLimit(key: string) {
  buckets.delete(key);
}
