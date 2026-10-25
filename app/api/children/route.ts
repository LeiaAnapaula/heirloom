import { NextResponse } from "next/server";
import { cleanChildInput } from "@/lib/account-types";
import { accounts } from "@/lib/server/accounts";
import { currentParentId, sameOriginJson } from "@/lib/server/session";

/** Add a child to the signed-in parent's account: first name, age, interests. Nothing else. */
export async function POST(req: Request) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const pid = await currentParentId();
  if (!pid) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const input = cleanChildInput(await req.json().catch(() => null));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const child = await accounts().addChild(pid, input);
  if (!child) return NextResponse.json({ error: "An account can have up to 4 children." }, { status: 400 });
  return NextResponse.json(child, { status: 201 });
}
