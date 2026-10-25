import { NextResponse } from "next/server";
import { CONSENT_VERSION, cleanEmail, passwordProblem } from "@/lib/account-types";
import { accounts } from "@/lib/server/accounts";
import { sameOriginJson, startSession } from "@/lib/server/session";

/** A parent creates an account and agrees to the consent notice. Children come next. */
export async function POST(req: Request) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown; consent?: unknown } | null;
  const email = cleanEmail(body?.email);
  if (!email) return NextResponse.json({ error: "Please enter a real email address." }, { status: 400 });
  const problem = passwordProblem(body?.password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  if (body?.consent !== CONSENT_VERSION) {
    return NextResponse.json({ error: "Please read and agree to the note for parents." }, { status: 400 });
  }
  const made = await accounts().createParent(email, body!.password as string, CONSENT_VERSION);
  if ("error" in made) {
    return NextResponse.json({ error: "There's already an account with that email. Try signing in." }, { status: 409 });
  }
  await startSession(made.id);
  return NextResponse.json({ ok: true });
}
