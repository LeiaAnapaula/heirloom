import { NextResponse } from "next/server";
import { cleanChildInput } from "@/lib/account-types";
import { accounts } from "@/lib/server/accounts";
import { readJson } from "@/lib/server/guard";
import { currentParentId, sameOriginJson } from "@/lib/server/session";

export async function PATCH(req: Request, ctx: RouteContext<"/api/children/[id]">) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const pid = await currentParentId();
  if (!pid) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const input = cleanChildInput(await readJson(req, 2048));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
  const { id } = await ctx.params;
  const child = await accounts().updateChild(pid, id, input);
  return child ? NextResponse.json(child) : NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function DELETE(req: Request, ctx: RouteContext<"/api/children/[id]">) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const pid = await currentParentId();
  if (!pid) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  return (await accounts().removeChild(pid, id))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Not found." }, { status: 404 });
}
