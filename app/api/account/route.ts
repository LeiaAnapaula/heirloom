import { NextResponse } from "next/server";
import { accounts } from "@/lib/server/accounts";
import { currentParentId, endSession, sameOriginJson } from "@/lib/server/session";

/** The signed-in parent and their children, or { guest: true }. Being a guest is normal, not an error. */
export async function GET() {
  const pid = await currentParentId();
  const view = pid ? await accounts().view(pid) : null;
  return NextResponse.json(view ?? { guest: true }, { headers: { "Cache-Control": "no-store" } });
}

/** Delete the account and everything about every child in it. No soft delete. */
export async function DELETE(req: Request) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const pid = await currentParentId();
  if (!pid) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  await accounts().deleteParent(pid);
  await endSession();
  return NextResponse.json({ ok: true });
}
