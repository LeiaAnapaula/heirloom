import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { episodes } from "@/content/episodes/lost-star";
import { textHash } from "@/lib/hash";
import { checkLines, maskName } from "@/lib/safety";
import {
  STORY_SYSTEM_PROMPT,
  buildOutline,
  buildStoryMessage,
  salvageGenerated,
  validateGenerated,
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
 * Runs on Node, the default runtime (Cache Components does not allow a `runtime` export).
 * The API key is read here and never reaches the browser. The child's name is sent to
 * Claude once, for the story, and is never logged.
 */

export const maxDuration = 120;

const MODEL = "claude-opus-5-5";
// Server-side fallback: if the model declines, the API retries on its default substitute.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const CACHE_DIR = path.join(process.cwd(), ".cache", "story");
const MAX_BODY_CHARS = 4096;

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
 * up to 30 letters and spaces, and an episode that exists.
 */
function parseRequest(body: unknown): { profile: StoryProfile; episodeId: string } | null {
  if (!isRecord(body) || !onlyKeys(body, ["profile", "episodeId"])) return null;
  const { profile, episodeId } = body;
  if (typeof episodeId !== "string" || !Object.hasOwn(episodes, episodeId)) return null;
  if (!isRecord(profile) || !onlyKeys(profile, ["name", "age", "interests"])) return null;

  const { name, age, interests } = profile;
  if (typeof name !== "string") return null;
  const cleanName = squish(name);
  if (cleanName.length > 20 || !NAME.test(cleanName)) return null;
  if (typeof age !== "number" || !Number.isInteger(age) || age < 3 || age > 8) return null;
  if (!Array.isArray(interests) || interests.length < 1 || interests.length > 3) return null;

  const cleanInterests: string[] = [];
  for (const interest of interests) {
    if (typeof interest !== "string") return null;
    const clean = squish(interest);
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

const cacheFile = (key: string) => path.join(CACHE_DIR, `${textHash(key)}.json`);
// A second hash stored inside the file, so two keys that share a file name never mix up children.
const keyCheck = (key: string) => textHash(`check|${key}`);

async function readDisk(key: string): Promise<StoryResult | null> {
  try {
    const data: unknown = JSON.parse(await readFile(cacheFile(key), "utf8"));
    if (!isRecord(data) || data.check !== keyCheck(key)) return null;
    if (!Array.isArray(data.screens) || !Array.isArray(data.fallback) || typeof data.model !== "string") return null;
    return { screens: data.screens as StoryResult["screens"], fallback: data.fallback as string[], model: data.model };
  } catch {
    return null;
  }
}

async function writeDisk(key: string, result: StoryResult): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile(key), JSON.stringify({ check: keyCheck(key), ...result }, null, 2));
  } catch {
    // A read-only disk only costs us the cache.
  }
}

// ---------------------------------------------------------------- Claude

const STORY_SCHEMA = {
  type: "object",
  properties: {
    screens: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          narration: { type: "array", items: { type: "string" }, minItems: 1 },
        },
        required: ["id", "narration"],
        additionalProperties: false,
      },
    },
  },
  required: ["screens"],
  additionalProperties: false,
} as const;

const VERDICT_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { index: { type: "integer" }, safe: { type: "boolean" } },
        required: ["index", "safe"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

const SAFETY_SYSTEM = [
  "You check lines from a storybook before a 5-year-old hears them.",
  "For each numbered line, answer one question: is it safe and appropriate for a 5-year-old, yes or no?",
  "A line is unsafe if it is scary, violent, romantic, about real brands, characters or people, asks for personal information, or is confusing.",
  "[name] stands for the child's first name.",
  "Return one verdict for every line: index is the line's number, safe is true for yes and false for no.",
].join("\n");

/** One Claude call for all lines. Masked names only. Throws on refusal or no answer (checkLines then fails closed). */
async function classify(client: Anthropic, lines: string[]): Promise<boolean[]> {
  const message = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: SAFETY_SYSTEM,
    output_config: { format: betaJSONSchemaOutputFormat(VERDICT_SCHEMA), effort: "low" },
    messages: [{ role: "user", content: lines.map((line, i) => `${i + 1}. ${line}`).join("\n") }],
  });
  if (message.stop_reason === "refusal" || !message.parsed_output) throw new StoryFailure("classifier gave no verdicts");

  // A line answered twice counts as safe only if every answer said so; a line never answered is unsafe.
  const answers = new Map<number, boolean>();
  for (const v of message.parsed_output.verdicts) {
    const i = v.index - 1;
    answers.set(i, (answers.get(i) ?? true) && v.safe === true);
  }
  return lines.map((_, i) => answers.get(i) === true);
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

  // Strict check first. If it fails, keep the screens that pass on their own.
  const strict = validateGenerated(message.parsed_output, outline, profile);
  const checked = strict.ok
    ? { value: strict.value, dropped: [] as string[] }
    : salvageGenerated(message.parsed_output, outline, profile);
  if (!checked) throw new StoryFailure("output failed validation");

  // Safety: blocklist, then one classifier call. Any unsafe line sends its whole screen back to the written version.
  const screens = checked.value.screens;
  const lines = screens.flatMap((s) => s.narration.map((t) => maskName(t, profile.name)));
  const verdicts = await checkLines(lines, (pending) => classify(client, pending));
  let k = 0;
  const safe = screens.filter((s) => {
    const ok = verdicts.slice(k, k + s.narration.length).every((v) => v.safe);
    k += s.narration.length;
    return ok;
  });

  // Re-run the per-screen check so `fallback` lists every id not generated, in outline order.
  const final = salvageGenerated({ screens: safe }, outline, profile);
  if (!final) throw new StoryFailure("nothing passed the safety check");
  return { screens: final.value.screens, fallback: final.dropped, model: message.model };
}

// ---------------------------------------------------------------- handler

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_CHARS) return json({ error: "bad-request" }, 400);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad-request" }, 400);
  }
  const req = parseRequest(body);
  if (!req) return json({ error: "bad-request" }, 400);

  const outline = buildOutline(episodes[req.episodeId]);
  const key = cacheKey(req.episodeId, outline, req.profile);

  // A cached story already passed every check, so it needs no key.
  const hit = memory.get(key) ?? (await readDisk(key));
  if (hit) {
    memory.set(key, hit);
    return json(hit, 200);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json({ error: "no-story-key" }, 503);

  let pending = inflight.get(key);
  if (!pending) {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 90_000 });
    pending = generate(client, req.profile, outline)
      .then(async (result) => {
        memory.set(key, result);
        await writeDisk(key, result);
        return result;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  try {
    return json(await pending, 200);
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
    console.error("[story] unexpected failure");
    return json({ error: "story-failed" }, 500);
  }
}
