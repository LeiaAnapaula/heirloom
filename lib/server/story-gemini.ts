import { GoogleGenAI } from "@google/genai";
import { fold, holdsName, maskAnySpelling, maskName } from "../safety";
import {
  SAFETY_SYSTEM_PROMPT,
  STORY_SCHEMA,
  STORY_SYSTEM_PROMPT,
  VERDICT_SCHEMA,
  buildStoryMessage,
  numberLines,
  readVerdicts,
  screenStory,
  type GeneratedScreens,
  type ScreenOutline,
  type StoryProfile,
} from "../story";

/**
 * Live stories from Gemini, for when there is no Claude key. Off unless the server opts in with
 * GEMINI_STORIES=on (app/api/story storyWriter): Google's Gemini API terms do not allow it in
 * apps meant for children, so it is for made-up demo profiles only. Server only: app/api/story
 * reads the key and it never reaches the browser.
 *
 * Privacy first. The key is on Google's free tier, where Google may use what it is sent to
 * improve its models, so the child's real first name never goes to Google. The story is written
 * for a stand-in name (Tavi, Nilo, Pemba...), picked without looking at the real name, spoken to
 * as "you", and the real name goes back in here, before the same validation and safety checks
 * the Claude path uses. Google sees only the stand-in, the child's age and interests, and lines
 * with the name masked. The name is looked for in any spelling (lib/safety.ts holdsName): "soren"
 * in an interest is Søren too. As a last guard, a request that still holds it is never sent.
 * Every request sends store: false, so Google keeps no copy for later retrieval.
 *
 * Speed. Each model gets one try with a short deadline and no automatic retries, then the next
 * model if the first is overloaded, rate limited, failing, slow, cut off, or answers with nothing
 * usable. The worst case, story plus safety check, is 32 seconds: inside the browser's 45 second
 * wait in StoryLoader.
 */

export type GeminiStory = { screens: GeneratedScreens["screens"]; fallback: string[]; model: string };

/**
 * A Gemini story that could not be written. `kind` is "unavailable" when every model failed
 * (overloaded, rate limited, slow, no answer) and "invalid" when the answer was unusable. The
 * message is safe to log: a status code or a step, never the API's own text, which can echo the request.
 */
export class GeminiStoryError extends Error {
  readonly kind: "unavailable" | "invalid";
  constructor(kind: "unavailable" | "invalid", message: string) {
    super(message);
    this.kind = kind;
  }
}

/**
 * A model that answered, but with nothing we can use: an unfinished status, no text, text that
 * is not JSON, or an answer that broke off. Worth trying the next model, like an outage. `what`
 * is safe to log: a status word, "empty", "unreadable" or "cut off", never the answer itself.
 */
class NoAnswer extends Error {
  readonly what: string;
  constructor(what: string) {
    super(what);
    this.what = what;
  }
}

type Attempt = { model: string; timeoutMs: number; thinking?: "low" };

// Flash writes the better story; flash-lite answers in about a second when flash is busy.
// Story 13 + 9 seconds, safety check 6 + 4: 32 seconds at most, all four tried.
const STORY_MODELS: Attempt[] = [
  { model: "gemini-3.8-flash", timeoutMs: 13_000, thinking: "low" },
  { model: "gemini-3.5-flash-lite", timeoutMs: 9_000 },
];
const SAFETY_MODELS: Attempt[] = [
  { model: "gemini-3.8-flash", timeoutMs: 6_000, thinking: "low" },
  { model: "gemini-3.5-flash-lite", timeoutMs: 4_000 },
];

// Short names that are not English words. The first that fits is used.
const STAND_INS = ["Tavi", "Nilo", "Pemba", "Suvi", "Kito"];

// The unfinished statuses an interaction can report, logged by name. Anything else logs as "unfinished".
const STATUSES = ["in_progress", "requires_action", "failed", "cancelled", "incomplete", "budget_exceeded", "queued"];

/** Added to the story prompt: the stand-in name says nothing about who the child is. */
const YOU_RULE = "Speak to the child as you, and never call the child he, she, him or her.";

/**
 * A first name to write the story for. It is picked only from what Google sees anyway (the
 * interests with the child's name taken out, and the outline), never from the name itself:
 * otherwise which stand-in Google gets would give away letters of the name (Octavia skipping
 * Tavi). It must not appear anywhere in those, so putting the real name back touches nothing else.
 */
export function standInFor(interests: string[], outline: ScreenOutline[]): string | null {
  const seen = fold([...interests, JSON.stringify(outline)].join(" "));
  return STAND_INS.find((s) => !seen.includes(fold(s))) ?? null;
}

/** True when the stand-in is in a line other than as a whole word, in any spelling: "Tavis", "Távi", "ｔａｖｉ". */
function hasTrace(line: string, standIn: string): boolean {
  return fold(maskName(line, standIn, " ")).includes(fold(standIn));
}

/**
 * The generated story with the stand-in swapped for the child's real name. Traces first, on the
 * model's own lines: a screen where the stand-in shows up other than as a whole word ("Tavis")
 * is left out, so it plays as written. Then whole-word swaps only, so a real name that holds the
 * stand-in (Octavia holds Tavi) comes through whole and is never taken for a trace.
 */
export function putNameBack(raw: unknown, standIn: string, name: string): unknown {
  const screens = typeof raw === "object" && raw !== null ? (raw as { screens?: unknown }).screens : undefined;
  if (!Array.isArray(screens)) return raw;
  return {
    screens: screens.flatMap((screen: unknown) => {
      const narration = typeof screen === "object" && screen !== null ? (screen as { narration?: unknown }).narration : undefined;
      if (!Array.isArray(narration)) return [screen];
      if (narration.some((line: unknown) => typeof line === "string" && hasTrace(line, standIn))) return [];
      const lines = narration.map((line: unknown) => (typeof line === "string" ? maskName(line, standIn, name) : line));
      return [{ ...(screen as object), narration: lines }];
    }),
  };
}

/** An interest with the child's name swapped for `mask` in any spelling, even split up: "mary ann" for Maryann. */
const hideName = (interest: string, name: string, mask: string) => maskAnySpelling(interest, name, mask, { gapsAnywhere: true });

export type GeminiPlan = { ok: true; standIn: string; stranger: StoryProfile } | { ok: false; why: string };

/**
 * What Gemini would be asked for this child, or why nothing would be sent. Pure and free: no
 * model call. The route asks it first, so a story turned down here never counts against the cap.
 */
export function planGeminiStory(profile: StoryProfile, outline: ScreenOutline[]): GeminiPlan {
  // The interests as Google will see them, before the stand-in fills the places the name was.
  const standIn = standInFor(
    profile.interests.map((i) => hideName(i, profile.name, "")),
    outline,
  );
  if (!standIn) return { ok: false, why: "no stand-in name fits" };
  // A child named Tavi (or Tavi Rose) cannot hide behind Tavi, and picking another would say why: send nothing.
  if (holdsName(profile.name, standIn)) return { ok: false, why: "the stand-in is the child's own name" };
  // Everything Google sees about the child: a made-up name, the age, the interests.
  const stranger: StoryProfile = {
    name: standIn,
    age: profile.age,
    interests: profile.interests.map((i) => hideName(i, profile.name, standIn)),
  };
  // A name the episode itself says (Will, May, Star) would still go out with the outline.
  if (holdsName(buildStoryMessage(stranger, outline), profile.name)) return { ok: false, why: "held back a request that held the child's name" };
  return { ok: true, standIn, stranger };
}

/** What went wrong with one call, safe to log: an HTTP status, "timeout", "connection" or what a NoAnswer says. Null for anything else (a bug). */
function failureOf(err: unknown): string | null {
  if (err instanceof NoAnswer) return err.what;
  const { status, name } = (typeof err === "object" && err !== null ? err : {}) as { status?: unknown; name?: unknown };
  if (typeof status === "number") return String(status);
  if (name === "APIConnectionTimeoutError" || name === "TimeoutError") return "timeout";
  if (name === "APIConnectionError") return "connection";
  return null;
}

/** Overloaded, rate limited, failing, slow or dropped: worth trying the next model. A bad request is not. */
const worthAnotherModel = (failure: string) =>
  failure === "timeout" || failure === "connection" || failure === "408" || failure === "429" || /^5\d\d$/.test(failure);

/**
 * The error once no model gave an answer, from how the last one failed. Text that is not JSON is
 * an unusable answer ("invalid"); an unfinished or empty answer and API errors are "unavailable".
 */
function gaveUp(last: unknown, failure: string): GeminiStoryError {
  if (last instanceof NoAnswer) {
    if (failure === "unreadable") return new GeminiStoryError("invalid", "unreadable output");
    return new GeminiStoryError("unavailable", `no answer (${failure})`);
  }
  return new GeminiStoryError("unavailable", `API error (${failure})`);
}

/** `realName` is the child's real name: if it is anywhere in `input`, the request is never sent. */
type Ask = { system: string; input: string; schema: object; maxTokens: number; realName: string };

/**
 * `work`, or a TimeoutError once `ms` have passed, whichever comes first. The SDK's own timeout_ms
 * can lose its timer when garbage collection runs while an answer's body stalls, and then the call
 * hangs for minutes. This deadline is held by our own timer, so it always fires.
 */
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("deadline"), { name: "TimeoutError" })), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * An answer that broke off after its headers, which the SDK passes on unwrapped: the connection
 * dropped mid-body (fetch's TypeError "terminated"), the body was cut-off JSON (SyntaxError), or
 * a 200 that was not JSON at all (status 200). A NoAnswer, so the next model is tried. Null for anything else.
 */
function brokenAnswer(err: unknown): NoAnswer | null {
  const { status, name, message, cause } = (typeof err === "object" && err !== null ? err : {}) as Record<string, unknown>;
  if (status === 200 || name === "SyntaxError") return new NoAnswer("unreadable");
  const code = typeof cause === "object" && cause !== null ? (cause as { code?: unknown }).code : undefined;
  const dropped = (typeof code === "string" && code.startsWith("UND_ERR")) || message === "terminated" || message === "fetch failed";
  return name === "TypeError" && dropped ? new NoAnswer("cut off") : null;
}

/**
 * One request to one model: one try, its own deadline, nothing stored at Google. Returns the
 * answer's JSON. Throws NoAnswer for an unfinished, empty, unreadable or cut-off answer. The last
 * thing before a request leaves: if it holds the child's real name, it does not leave.
 */
async function askOnce(client: GoogleGenAI, attempt: Attempt, ask: Ask): Promise<unknown> {
  if (holdsName(ask.input, ask.realName)) {
    console.error("[story] held back a Gemini request that held the child's name");
    throw new GeminiStoryError("invalid", "held back a request that held the child's name");
  }
  const call = client.interactions.create(
    {
      model: attempt.model,
      system_instruction: ask.system,
      input: ask.input,
      response_format: { type: "text", mime_type: "application/json", schema: ask.schema },
      generation_config: { max_output_tokens: ask.maxTokens, ...(attempt.thinking ? { thinking_level: attempt.thinking } : {}) },
      store: false,
    },
    // The SDK's own timeout too, as a best effort: it also closes the connection when it fires.
    { timeout_ms: attempt.timeoutMs, retries: { strategy: "none" } },
  );
  const interaction = await withDeadline(call, attempt.timeoutMs).catch((err: unknown) => {
    throw brokenAnswer(err) ?? err;
  });
  const status = interaction.status;
  if (status && status !== "completed") throw new NoAnswer(STATUSES.includes(status) ? status : "unfinished");
  if (!interaction.output_text) throw new NoAnswer("empty");
  try {
    return JSON.parse(interaction.output_text);
  } catch {
    throw new NoAnswer("unreadable");
  }
}

/** Each model in turn until one answers with JSON. Logs only the model and how each one failed. */
async function askFirstAvailable(client: GoogleGenAI, attempts: Attempt[], ask: Ask): Promise<{ json: unknown; model: string }> {
  let last: unknown = null;
  let failure = "no model";
  for (const attempt of attempts) {
    try {
      return { json: await askOnce(client, attempt, ask), model: attempt.model };
    } catch (err) {
      const f = failureOf(err);
      if (f === null) throw err;
      last = err;
      failure = f;
      console.error(`[story] ${attempt.model} failed (${f})`);
      if (!(err instanceof NoAnswer) && !worthAnotherModel(f)) break;
    }
  }
  throw gaveUp(last, failure);
}

/** The safety classifier: one verdict per numbered line, names already masked. Throws on any failure (checkLines then fails closed). */
async function classify(client: GoogleGenAI, lines: string[], realName: string): Promise<boolean[]> {
  const answer = await askFirstAvailable(client, SAFETY_MODELS, {
    system: SAFETY_SYSTEM_PROMPT,
    input: numberLines(lines),
    schema: VERDICT_SCHEMA,
    maxTokens: 2048,
    realName,
  });
  return readVerdicts(answer.json, lines.length);
}

/**
 * Write this child's story with Gemini: the same prompt, outline and checks as Claude, for a
 * stand-in name. Validation and safety run with the real profile once the name is back in.
 * Throws GeminiStoryError when no model answers or nothing usable is left.
 */
export async function writeWithGemini(apiKey: string, profile: StoryProfile, outline: ScreenOutline[]): Promise<GeminiStory> {
  const plan = planGeminiStory(profile, outline);
  if (!plan.ok) throw new GeminiStoryError("invalid", plan.why);
  const { standIn, stranger } = plan;

  const client = new GoogleGenAI({ apiKey });
  const story = await askFirstAvailable(client, STORY_MODELS, {
    system: `${STORY_SYSTEM_PROMPT}\n${YOU_RULE}`,
    input: buildStoryMessage(stranger, outline),
    schema: STORY_SCHEMA,
    maxTokens: 8192,
    realName: profile.name,
  });

  const raw = putNameBack(story.json, standIn, profile.name);
  const screened = await screenStory(raw, outline, profile, (lines) => classify(client, lines, profile.name));
  if (!screened.ok) throw new GeminiStoryError("invalid", screened.why);
  return { screens: screened.screens, fallback: screened.fallback, model: story.model };
}
