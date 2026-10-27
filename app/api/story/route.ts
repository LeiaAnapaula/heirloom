import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { episodes } from "@/content/episodes/lost-star";
import { textHash } from "@/lib/hash";
import { cacheDir, caller, overLimit, readJson, sameOriginJson } from "@/lib/server/guard";
import { sessionSecret } from "@/lib/server/session";
import { GeminiStoryError, planGeminiStory, writeWithGemini } from "@/lib/server/story-gemini";
import { holdsName, maskName } from "@/lib/safety";
import {
  SAFETY_SYSTEM_PROMPT,
  STORY_SCHEMA,
  STORY_SYSTEM_PROMPT,
  VERDICT_SCHEMA,
  buildOutline,
  buildStoryMessage,
  numberLines,
  readVerdicts,
  screenStory,
  type GeneratedScreens,
  type ScreenOutline,
  type StoryProfile,
} from "@/lib/story";

/**
 * POST /api/story
 * In:  { profile: { name, age, interests }, episodeId }
 * Out: { screens, fallback, model }: generated narration that passed validation and safety,
 *      plus the outline ids that play as written instead.
 *
 * Who writes: Claude when ANTHROPIC_API_KEY is set, else Gemini only when the server opts in
 * with GEMINI_STORIES=on and GEMINI_API_KEY is set (lib/server/story-gemini.ts, for made-up
 * demo profiles only, see storyWriter), else nobody and the written story plays.
 *
 * Runs on Node, the default runtime (Cache Components does not allow a `runtime` export).
 * The API keys are read here and never reach the browser. The child's name is sent to
 * Claude once, for the story, and is never logged. Gemini never receives it at all.
 */

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
// Server-side fallback: if the model declines, the API retries on its default substitute.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const CACHE_DIR = cacheDir("story");
const MAX_BODY_BYTES = 4096;
const HOUR_MS = 60 * 60 * 1000;
// Each new story is two Opus calls: at most a few per caller per hour, in this demo.
const NEW_STORIES_PER_HOUR = 6;
// And at most this many for everyone together. The per-caller count trusts X-Forwarded-For,
// which anyone can make up, so this is the cap that actually protects the key's quota.
const ALL_NEW_STORIES_PER_HOUR = 20;

type StoryResult = { screens: GeneratedScreens["screens"]; fallback: string[]; model: string };

/** Generation failed in a way that is not an API error: refusal, unreadable or unsafe output. */
class StoryFailure extends Error {}

const memory = new Map<string, StoryResult>();
// Two requests for the same child at once (React dev mode runs effects twice) share one generation.
const inflight = new Map<string, Promise<StoryResult>>();

const json = (data: unknown, status: number) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

// ---------------------------------------------------------------- request validation

const NAME = /^\p{L}+(?:[ '\u2019-]\p{L}+)*$/u;
const INTEREST = /^\p{L}+(?: \p{L}+)*$/u;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const onlyKeys = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const squish = (s: string) => s.trim().replace(/\s+/g, " ");

/**
 * Strict: exactly these fields, nothing else. A first name of 1 to 20 letters (spaces,
 * hyphens, apostrophes allowed between letters), age 3 to 8, one to three interests of
 * up to 30 letters and spaces, and an episode that exists. Names and interests are put in
 * one Unicode form (NFC) before they are checked, the same form generated lines are tidied
 * into, so masking the name always finds it.
 */
function parseRequest(body: unknown): { profile: StoryProfile; episodeId: string } | null {
  if (!isRecord(body) || !onlyKeys(body, ["profile", "episodeId"])) return null;
  const { profile, episodeId } = body;
  if (typeof episodeId !== "string" || !Object.hasOwn(episodes, episodeId)) return null;
  if (!isRecord(profile) || !onlyKeys(profile, ["name", "age", "interests"])) return null;

  const { name, age, interests } = profile;
  if (typeof name !== "string") return null;
  const cleanName = squish(name).normalize("NFC");
  if (cleanName.length > 20 || !NAME.test(cleanName)) return null;
  if (typeof age !== "number" || !Number.isInteger(age) || age < 3 || age > 8) return null;
  if (!Array.isArray(interests) || interests.length < 1 || interests.length > 3) return null;

  const cleanInterests: string[] = [];
  for (const interest of interests) {
    if (typeof interest !== "string") return null;
    const clean = squish(interest).normalize("NFC");
    if (clean.length > 30 || !INTEREST.test(clean)) return null;
    cleanInterests.push(clean);
  }
  return { profile: { name: cleanName, age, interests: cleanInterests }, episodeId };
}

// ---------------------------------------------------------------- cache

/** Episode, a version stamp of the prompt and outline (edits invalidate), then name|age|interests. */
function cacheKey(episodeId: string, outline: ScreenOutline[], p: StoryProfile): string {
  const version = textHash(STORY_SYSTEM_PROMPT + buildStoryMessage({ name: "{name}", age: 0, interests: [] }, outline));
  const interests = p.interests.map((i) => i.toLowerCase()).sort().join(",");
  return `${episodeId}|${version}|${p.name.toLowerCase()}|${p.age}|${interests}`;
}

/**
 * Where a story is cached, and the check stored inside it. Both are an HMAC of the key with the
 * server's secret (the one that signs sign-in cookies), never a plain hash: a plain hash of
 * "episode|version|name|age|interests" lets anyone who can read .cache/story find a child's name
 * by trying common names. Null when the server has no secret (production without SESSION_SECRET):
 * then stories are simply not cached on disk.
 */
async function diskSlot(key: string): Promise<{ file: string; check: string } | null> {
  let secret: string;
  try {
    secret = await sessionSecret();
  } catch {
    return null;
  }
  // The "story-cache|" prefix keeps these apart from cookie signatures, which sign base64 text with no "|".
  const keyed = (text: string) => createHmac("sha256", secret).update(`story-cache|${text}`).digest("hex");
  return { file: path.join(CACHE_DIR, `${keyed(`file|${key}`)}.json`), check: keyed(`check|${key}`) };
}

/**
 * Stories are cached with the child's name masked, so no first name is ever written to disk,
 * and the name is filled back in on the way out. Deleting an account does not remove cached
 * stories: they hold no name, under file names only this server's secret can link to a child.
 * The mask is exact (case aside), so "angel" in a story never turns into a child named Ángel.
 */
const mask = (r: StoryResult, name: string): StoryResult => ({
  ...r,
  screens: r.screens.map((s) => ({ ...s, narration: s.narration.map((t) => maskName(t, name, "{name}")) })),
});
/** True when a masked story still holds the name in another spelling: "Zoe" for Zoë, "IŞIL" for Işıl. */
const stillNamed = (r: StoryResult, name: string) =>
  r.screens.some((s) => s.narration.some((t) => holdsName(t.replaceAll("{name}", " "), name)));
const unmask = (r: StoryResult, name: string): StoryResult => ({
  ...r,
  screens: r.screens.map((s) => ({ ...s, narration: s.narration.map((t) => t.replaceAll("{name}", name)) })),
});

async function readDisk(key: string): Promise<StoryResult | null> {
  try {
    const slot = await diskSlot(key);
    if (!slot) return null;
    const data: unknown = JSON.parse(await readFile(slot.file, "utf8"));
    if (!isRecord(data) || data.check !== slot.check) return null;
    if (!Array.isArray(data.screens) || !Array.isArray(data.fallback) || typeof data.model !== "string") return null;
    return { screens: data.screens as StoryResult["screens"], fallback: data.fallback as string[], model: data.model };
  } catch {
    return null;
  }
}

async function writeDisk(key: string, result: StoryResult): Promise<void> {
  try {
    const slot = await diskSlot(key);
    if (!slot) return;
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(slot.file, JSON.stringify({ check: slot.check, ...result }, null, 2));
  } catch {
    // A read-only disk only costs us the cache.
  }
}

// ---------------------------------------------------------------- Claude

/** One Claude call for all lines. Masked names only. Throws on refusal or no answer (checkLines then fails closed). */
async function classify(client: Anthropic, lines: string[]): Promise<boolean[]> {
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: SAFETY_SYSTEM_PROMPT,
    output_config: { format: betaJSONSchemaOutputFormat(VERDICT_SCHEMA), effort: "low" },
    messages: [{ role: "user", content: numberLines(lines) }],
  });
  if (message.stop_reason === "refusal" || !message.parsed_output) throw new StoryFailure("classifier gave no verdicts");
  // A line answered twice counts as safe only if every answer said so. Numbering that is not
  // exactly 1 to the line count (from 0, a line skipped) throws, so every line is unsafe.
  return readVerdicts(message.parsed_output, lines.length);
}

async function generate(client: Anthropic, profile: StoryProfile, outline: ScreenOutline[]): Promise<StoryResult> {
  const message = await client.beta.messages.parse({
    model: MODEL,
    // Opus 5.5 always thinks, and thinking counts against max_tokens: leave room so the JSON is never cut off.
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: STORY_SYSTEM_PROMPT,
    output_config: { format: betaJSONSchemaOutputFormat(STORY_SCHEMA), effort: "medium" },
    messages: [{ role: "user", content: buildStoryMessage(profile, outline) }],
  });
  if (message.stop_reason === "refusal") throw new StoryFailure("refusal");
  if (!message.parsed_output) throw new StoryFailure("no structured output");

  // Validation (strict, else the screens that pass on their own), then the blocklist and one
  // classifier call. Any unsafe line sends its whole screen back to the written version.
  const screened = await screenStory(message.parsed_output, outline, profile, (pending) => classify(client, pending));
  if (!screened.ok) throw new StoryFailure(screened.why);
  return { screens: screened.screens, fallback: screened.fallback, model: message.model };
}

// ---------------------------------------------------------------- who writes

type Writer = {
  write: (profile: StoryProfile, outline: ScreenOutline[]) => Promise<StoryResult>;
  /** False when the writer would turn this story down itself, before any model call. */
  willAsk: (profile: StoryProfile, outline: ScreenOutline[]) => boolean;
};

/**
 * Claude when its key is set. Else Gemini, but only when the server says GEMINI_STORIES=on
 * (exactly "on") and its key is set: Google's Gemini API terms do not allow it in apps meant
 * for children, the free tier may use what it gets to improve Google's models, and the parent
 * consent names only Anthropic. So Gemini stories are off unless someone turns them on for
 * made-up demo profiles, and GEMINI_API_KEY alone (the World Builder scripts use it) never
 * does. Else null: the written story plays.
 */
function storyWriter(): Writer | null {
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (claudeKey) {
    return {
      write: (profile, outline) => generate(new Anthropic({ apiKey: claudeKey, maxRetries: 1, timeout: 90_000 }), profile, outline),
      willAsk: () => true,
    };
  }
  const geminiKey = process.env.GEMINI_API_KEY;
  if (process.env.GEMINI_STORIES === "on" && geminiKey) {
    return {
      write: (profile, outline) => writeWithGemini(geminiKey, profile, outline),
      // Gemini sends nothing when the child's name could not stay private (Will, Tavi...).
      willAsk: (profile, outline) => planGeminiStory(profile, outline).ok,
    };
  }
  return null;
}

/**
 * True when a new story may not start now: this caller has had its few, or everyone together
 * has had theirs. Only asked for a story that would start a model call, never a cached one, one
 * already being written, or one the writer turns down before asking, so none of those counts.
 */
const tooManyNewStories = (request: Request) =>
  overLimit(`story|${caller(request)}`, NEW_STORIES_PER_HOUR, HOUR_MS) || overLimit("story|all", ALL_NEW_STORIES_PER_HOUR, HOUR_MS);

// ---------------------------------------------------------------- handler

export async function POST(request: Request): Promise<Response> {
  // Only the book itself may ask: same-origin JSON, a small body, and a speed limit on new stories.
  if (!sameOriginJson(request)) return json({ error: "bad-request" }, 400);
  const req = parseRequest(await readJson(request, MAX_BODY_BYTES));
  if (!req) return json({ error: "bad-request" }, 400);

  const outline = buildOutline(episodes[req.episodeId]);
  const key = cacheKey(req.episodeId, outline, req.profile);

  // A cached story already passed every check, so it needs no key.
  const hit = memory.get(key) ?? (await readDisk(key));
  if (hit) {
    memory.set(key, hit);
    return json(unmask(hit, req.profile.name), 200);
  }

  const writer = storyWriter();
  // No key is a normal setup (the written story plays), not a failure, so it is a quiet 200.
  if (!writer) return json({ story: "written", reason: "no-story-key" }, 200);
  // A story the writer turns down before any model call costs nothing, so it is quiet and not counted.
  if (!writer.willAsk(req.profile, outline)) return json({ story: "written", reason: "kept-private" }, 200);
  if (!inflight.has(key) && tooManyNewStories(request)) return json({ error: "story-busy" }, 429);

  let pending = inflight.get(key);
  if (!pending) {
    pending = writer
      .write(req.profile, outline)
      .then(async (result) => {
        const masked = mask(result, req.profile.name);
        memory.set(key, masked);
        // The last check before the disk: a line that still holds the name keeps the story in memory only.
        if (!stillNamed(masked, req.profile.name)) await writeDisk(key, masked);
        return masked;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    return json(unmask(await pending, req.profile.name), 200);
  } catch (err) {
    // Status and kind only: error details can echo the request, which holds the child's name.
    if (err instanceof Anthropic.APIError) {
      console.error(`[story] Claude API error (${err.status ?? "connection"})`);
      return json({ error: "story-unavailable" }, 502);
    }
    if (err instanceof StoryFailure) {
      console.error(`[story] ${err.message}`);
      return json({ error: "story-invalid" }, 502);
    }
    if (err instanceof Anthropic.AnthropicError) {
      console.error("[story] could not read Claude's reply");
      return json({ error: "story-invalid" }, 502);
    }
    if (err instanceof GeminiStoryError) {
      console.error(`[story] Gemini ${err.message}`);
      return json({ error: err.kind === "unavailable" ? "story-unavailable" : "story-invalid" }, 502);
    }
    console.error("[story] unexpected failure");
    return json({ error: "story-failed" }, 500);
  }
}
