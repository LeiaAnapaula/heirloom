import { NextResponse } from "next/server";
import { cleanEmail } from "@/lib/account-types";
import { accounts } from "@/lib/server/accounts";
import { readJson } from "@/lib/server/guard";
import { clearTries, sameOriginJson, sessionsReady, startSession, tooManyTries } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  if (!(await sessionsReady())) return NextResponse.json({ error: "Accounts are not set up on this server yet." }, { status: 503 });
  const body = (await readJson(req, 4096)) as { email?: unknown; password?: unknown } | null;
  const email = cleanEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  if (tooManyTries(req, email)) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes, then try again." }, { status: 429 });
  }
  const parent = await accounts().verifyLogin(email, password);
  // Same answer for a wrong email and a wrong password, so nobody can probe which emails exist.
  if (!parent) return NextResponse.json({ error: "That email and password don't match." }, { status: 401 });
  clearTries(req, email);
  await startSession(parent.id);
  return NextResponse.json({ ok: true });
}
