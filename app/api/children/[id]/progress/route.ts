import { NextResponse } from "next/server";
import { episodes } from "@/content/episodes/lost-star";
import { accounts } from "@/lib/server/accounts";
import { readJson } from "@/lib/server/guard";
import { currentParentId, sameOriginJson } from "@/lib/server/session";
import { MAX_ATTEMPT_MS, SKILL_IDS, type Attempt, type SkillId } from "@/lib/profile";

const MODES = new Set(["voice", "tap", "trace"]);

function cleanProgress(body: unknown): { skills: Record<SkillId, number>; episodeId: string; attempts: Attempt[] } | null {
  if (!body || typeof body !== "object") return null;
  const { skills, episodeId, attempts } = body as Record<string, unknown>;
  if (typeof episodeId !== "string" || !Object.hasOwn(episodes, episodeId)) return null;
  if (!skills || typeof skills !== "object" || !Array.isArray(attempts) || attempts.length > 60) return null;
  const s = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) {
    const v = (skills as Record<string, unknown>)[id];
    if (typeof v !== "number" || !(v >= 0 && v <= 1)) return null;
    s[id] = v;
  }
  const list: Attempt[] = [];
  for (const raw of attempts) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const a = raw as Record<string, unknown>;
    if (!SKILL_IDS.includes(a.skill as SkillId) || typeof a.correct !== "boolean") return null;
    const hints = Number(a.hintsUsed);
    const ms = Number(a.ms);
    list.push({
      skill: a.skill as SkillId,
      correct: a.correct,
      hintsUsed: Number.isInteger(hints) && hints >= 0 && hints <= 2 ? hints : 0,
      ms: Number.isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), MAX_ATTEMPT_MS) : 0,
      mode: MODES.has(a.mode as string) ? (a.mode as Attempt["mode"]) : undefined,
      // the child's guess on the gravity page, as words; capped and kept with this child only
      note: typeof a.note === "string" ? a.note.slice(0, 80) : undefined,
    });
  }
  return { skills: s, episodeId, attempts: list };
}

/** Save what a child learned in one episode, so it follows them to any device the parent signs in on. */
export async function POST(req: Request, ctx: RouteContext<"/api/children/[id]/progress">) {
  if (!sameOriginJson(req)) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const pid = await currentParentId();
  if (!pid) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const progress = cleanProgress(await readJson(req, 32_768));
  if (!progress) return NextResponse.json({ error: "Bad progress." }, { status: 400 });
  const { id } = await ctx.params;
  const child = await accounts().saveProgress(pid, id, progress);
  return child ? NextResponse.json(child) : NextResponse.json({ error: "Not found." }, { status: 404 });
}
