import { NextResponse } from "next/server";
import { endSession, sameOriginJson } from "@/lib/server/session";

export async function POST(req: Request) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  await endSession();
  return NextResponse.json({ ok: true });
}
