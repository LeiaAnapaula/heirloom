import type { Episode, Line, Screen, Telling } from "./episode";
import { checkLines, hasEmoji, hasLink, hasTerm, maskAnySpelling } from "./safety";

/**
 * The story brain: rewrites an episode's narration for another child (name + interests)
 * while every screen keeps its learning task. The written narration is always the
 * default; a written telling for the child's theme comes next (pickTelling), and generated
 * lines replace it only after validation and the safety check.
 * No SDK here: this module is safe in the browser. Claude or Gemini is called from app/api/story.
 */

/** CLAUDE.md section 10, word for word. */
export const STORY_SYSTEM_PROMPT = [
  "You are the narrator of a magical storybook for a young child.",
  "Write in short, warm, simple sentences a 5-year-old understands.",
  "Always use the child's name. Weave in their interests.",
  "Each line must set up the learning task given for that screen and nothing else.",
  "Never include anything scary, violent, romantic, or about real brands, characters, or people.",
  "Never ask the child for personal information.",
  'Return JSON only: { "screens": [ { "id": string, "narration": string[] } ] }',
].join("\n");

/** The only child data that ever leaves the device. */
export type StoryProfile = { name: string; age: number; interests: string[] };

/**
 * One piece of narration to rewrite. `id` is the screen id for the opening lines, or
 * screen id + ":success" for the celebration. `skill` encodes what the screen teaches
 * ("read:GO", "write:S", "count:...", "idea:gravity", "say:yes"); validation reads it.
 * `current` is the written version, with {name} where the child's name goes.
 */
export type ScreenOutline = { id: string; skill: string; task: string; rules: string[]; lines: number; current: string[] };

export type GeneratedScreens = { screens: { id: string; narration: string[] }[] };

const SUCCESS = ":success";
const MAX_WORDS = 22;
const MAX_CHARS = 160;
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Rules for every screen, sent with the outline. */
const STORY_RULES = [
  "Write narration for every screen below and use each id exactly once.",
  "The pictures do not change. Keep the things that `current` mentions, and weave the child's interests in as friends, details and comparisons, never replacing them.",
  "`current` is the written version for another child. Match its length and warmth, not its words.",
  `Write about as many lines as \`lines\` says, one to three. Each line is one or two short sentences, at most ${MAX_WORDS} words.`,
  "Use the child's name at least twice across the whole story.",
  "Write numbers as words. No digits, emoji, links, or dashes between sentences.",
  "Follow each screen's own rules exactly.",
];

const texts = (lines: Line[]) => lines.map((l) => l.text);

function skillOf(screen: Screen): string {
  const i = screen.interaction;
  switch (i.type) {
    case "yes":
      return "say:yes";
    case "readAloud":
    case "trace":
    case "feather":
      return i.skill;
    case "count":
      return i.steps.map((s) => s.skill).join(" then ");
  }
}

function openingBrief(screen: Screen): { task: string; rules: string[] } {
  const i = screen.interaction;
  switch (i.type) {
    case "yes":
      return {
        task: "Open the story: greet the child by name, say what happened (see current), and ask if they will help.",
        rules: ["End with a question the child can answer with yes."],
      };
    case "readAloud": {
      const word = i.word.toUpperCase();
      return {
        task: "Ask the child to read the word in the picture on their own, and say what reading it will do (see current).",
        rules: [
          `Never say or spell the word "${word}", in any form: the child must read it alone, or the narrator gives the answer away.`,
          'Call it "the word" or "the magic word".',
        ],
      };
    }
    case "trace":
      return {
        task: `Say that we will draw the letter ${i.letter} (see current for why), and invite the child to watch the magic pencil draw it first.`,
        rules: [`Name the letter ${i.letter} as a capital letter.`, "Do not ask the child to draw yet: the pencil shows them first."],
      };
    case "count":
      return {
        task: "Ask the child how many things they see in the picture (see current for what they count).",
        rules: ['Ask "how many" and end with a question mark.', "Never say a number: the child counts on their own."],
      };
    case "feather":
      return {
        task: "Set the scene (see current), then ask what the child thinks will happen if they drop a feather on the Moon.",
        rules: ["Mention the feather and the Moon.", "End with a question that invites a guess. Do not give the answer."],
      };
  }
}

function successBrief(screen: Screen, last: boolean, nextTitle: string): { task: string; rules: string[] } {
  const i = screen.interaction;
  let brief: { task: string; rules: string[] };
  switch (i.type) {
    case "feather":
      brief = {
        task: "Explain simply that the Moon pulls gently, so the feather falls slowly, and that this is called gravity.",
        rules: ["Use the word gravity."],
      };
      break;
    case "readAloud":
      brief = { task: "Celebrate that the child read the word, and what it did (see current).", rules: [] };
      break;
    case "trace":
      brief = { task: "Celebrate the child's drawing, and what it did (see current).", rules: [] };
      break;
    case "count":
      brief = { task: "Celebrate the counting (see current).", rules: ["You may say the final number, as a word."] };
      break;
    case "yes":
      brief = { task: "Celebrate that the child said yes.", rules: [] };
      break;
  }
  if (last) {
    brief.task += ` This ends the story: thank the child by name and say that tomorrow's story is about ${nextTitle}.`;
  }
  return brief;
}

/**
 * What to rewrite, and what each rewrite must set up. Only opening narration and
 * success narration: hints, give-up lines, count numbers and count steps are mechanical
 * and stay as written.
 */
export function buildOutline(episode: Episode): ScreenOutline[] {
  const out: ScreenOutline[] = [];
  episode.screens.forEach((screen, index) => {
    const skill = skillOf(screen);
    if (screen.narration.length > 0) {
      out.push({ id: screen.id, skill, ...openingBrief(screen), lines: screen.narration.length, current: texts(screen.narration) });
    }
    const success = screen.onSuccess.narration;
    if (success.length > 0) {
      const last = index === episode.screens.length - 1;
      out.push({
        id: screen.id + SUCCESS,
        skill,
        ...successBrief(screen, last, episode.next.title),
        lines: success.length,
        current: texts(success),
      });
    }
  });
  return out;
}

/** The user message for /api/story: the child (name, age, interests only) plus the outline. */
export function buildStoryMessage(profile: StoryProfile, outline: ScreenOutline[]): string {
  const child = { name: profile.name, age: profile.age, interests: profile.interests };
  const screens = outline.map((o) => ({ ...o, current: o.current.map((t) => t.replaceAll("{name}", profile.name)) }));
  return JSON.stringify({ child, rules: STORY_RULES, screens });
}

// Letters, accents, spaces and plain punctuation. No digits, symbols, braces or markup.
const ALLOWED = /^[\p{L}\p{M} .,!?'"\u2019\u201C\u201D:;()\u2026-]+$/u;

/** Tidy a generated line: trim, one space between words, dashes between clauses become commas. */
function tidy(line: string): string {
  return line
    .normalize("NFC")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

const endsWithQuestion = (line: string) => /\?["'\u2019\u201D]?$/.test(line);

/** Whole letter as written, case sensitive: "S" in "the letter S," but not the s in "let's". */
const hasLetter = (text: string, letter: string) =>
  new RegExp(`(?:^|[^\\p{L}])${letter.replace(/[^\p{L}]/gu, "")}(?=$|[^\\p{L}])`, "u").test(text);

/** Problems with one screen's lines. Messages name ids and line numbers, never the text. */
function screenErrors(o: ScreenOutline, narration: string[]): string[] {
  const errors: string[] = [];
  const maxLines = Math.max(3, o.lines + 1);
  if (narration.length < 1 || narration.length > maxLines) errors.push(`${o.id}: needs 1 to ${maxLines} lines`);

  narration.forEach((line, n) => {
    const at = `${o.id} line ${n + 1}`;
    if (!line) {
      errors.push(`${at}: empty`);
      return;
    }
    if (line.split(" ").length > MAX_WORDS) errors.push(`${at}: over ${MAX_WORDS} words`);
    if (line.length > MAX_CHARS) errors.push(`${at}: over ${MAX_CHARS} characters`);
    if (hasLink(line)) errors.push(`${at}: has a link`);
    if (hasEmoji(line)) errors.push(`${at}: has an emoji`);
    if (/\d/.test(line)) errors.push(`${at}: has digits`);
    if (!ALLOWED.test(line)) errors.push(`${at}: has unusual characters`);
  });

  const all = narration.join(" ");
  const last = narration[narration.length - 1] ?? "";
  const [kind, arg = ""] = o.skill.split(":");

  if (o.id.endsWith(SUCCESS)) {
    if (o.skill === "idea:gravity" && !hasTerm(all, "gravity")) errors.push(`${o.id}: does not name gravity`);
    return errors;
  }
  if (kind === "read" && (hasTerm(all, arg) || spellsOut(all, arg))) errors.push(`${o.id}: says the word the child must read`);
  if (kind === "write" && !hasLetter(all, arg)) errors.push(`${o.id}: does not name the letter ${arg}`);
  if (kind === "count") {
    if (!hasTerm(all, "how many")) errors.push(`${o.id}: does not ask how many`);
    if (!endsWithQuestion(last)) errors.push(`${o.id}: does not end with a question`);
    if (NUMBER_WORDS.some((w) => hasTerm(all, w))) errors.push(`${o.id}: gives away a number`);
  }
  if (o.skill === "idea:gravity") {
    if (!hasTerm(all, "feather") && !hasTerm(all, "feathers")) errors.push(`${o.id}: does not mention the feather`);
    if (!hasTerm(all, "moon")) errors.push(`${o.id}: does not mention the Moon`);
    if (!endsWithQuestion(last)) errors.push(`${o.id}: does not end with a question`);
    if (GRAVITY_ANSWER.some((w) => hasTerm(all, w))) errors.push(`${o.id}: gives away what the feather does`);
  }
  if (kind === "say" && !endsWithQuestion(last)) errors.push(`${o.id}: does not end with a question`);
  return errors;
}

// The question is the child's to answer: the opening must not say how the feather falls.
const GRAVITY_ANSWER = ["slow", "slowly", "gently", "float", "floats", "floating", "drift", "drifts", "softly"];

/** "G-O", "G O", "g.o.": the reading word spelled out letter by letter gives the answer away too. */
function spellsOut(text: string, word: string): boolean {
  const letters = word.toLowerCase().split("");
  const re = new RegExp(`(^|[^a-z])${letters.join("[\\s.\\-,]+")}(?=$|[^a-z])`, "i");
  return re.test(text.toLowerCase());
}

type Parsed = { screens: Map<string, string[]>; errors: string[] };

/** Shape checks: an object with a screens array of { id, narration: string[] }, known ids, no repeats. */
function parseShape(gen: unknown, outline: ScreenOutline[]): Parsed {
  const errors: string[] = [];
  const screens = new Map<string, string[]>();
  const known = new Set(outline.map((o) => o.id));
  const list = typeof gen === "object" && gen !== null ? (gen as { screens?: unknown }).screens : undefined;
  if (!Array.isArray(list)) return { screens, errors: ["expected { screens: [...] }"] };

  list.forEach((item: unknown, k) => {
    const { id, narration } = (typeof item === "object" && item !== null ? item : {}) as { id?: unknown; narration?: unknown };
    if (typeof id !== "string") errors.push(`screen ${k + 1}: missing id`);
    else if (!known.has(id)) errors.push(`screen ${k + 1}: unknown id`);
    else if (screens.has(id)) errors.push(`${id}: appears more than once`);
    else if (!Array.isArray(narration) || !narration.every((l) => typeof l === "string")) {
      errors.push(`${id}: narration must be a list of strings`);
    } else screens.set(id, narration.map(tidy));
  });
  return { screens, errors };
}

/**
 * Strict check of a whole generated episode: shape, every outline id exactly once,
 * line counts and lengths, the child's name somewhere, each screen's task set up,
 * reading screens never saying the word to read, no links, emoji or digits.
 * On success `value` holds the tidied lines in outline order.
 */
export function validateGenerated(
  gen: unknown,
  outline: ScreenOutline[],
  profile: StoryProfile,
): { ok: true; value: GeneratedScreens } | { ok: false; errors: string[] } {
  const { screens, errors } = parseShape(gen, outline);
  for (const o of outline) {
    const narration = screens.get(o.id);
    if (narration) errors.push(...screenErrors(o, narration));
    else errors.push(`${o.id}: missing`);
  }
  const all = [...screens.values()].flat().join(" ");
  if (!hasTerm(all, profile.name)) errors.push("the child's name never appears");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { screens: outline.map((o) => ({ id: o.id, narration: screens.get(o.id) ?? [] })) } };
}

/**
 * Keep what is good from an imperfect result: screens that pass their own checks stay,
 * the rest (and any missing) are `dropped` and play as written. Returns null when the
 * shape is broken, nothing survives, or the child's name is in none of the kept screens.
 */
export function salvageGenerated(
  gen: unknown,
  outline: ScreenOutline[],
  profile: StoryProfile,
): { value: GeneratedScreens; dropped: string[] } | null {
  const { screens, errors } = parseShape(gen, outline);
  if (errors.length > 0) return null;
  const kept: GeneratedScreens["screens"] = [];
  const dropped: string[] = [];
  for (const o of outline) {
    const narration = screens.get(o.id);
    if (narration && screenErrors(o, narration).length === 0) kept.push({ id: o.id, narration });
    else dropped.push(o.id);
  }
  if (kept.length === 0) return null;
  if (!hasTerm(kept.flatMap((s) => s.narration).join(" "), profile.name)) return null;
  return { value: { screens: kept }, dropped };
}

// ---------------------------------------------------------------- checking a generated story

/** The JSON every story model must return, as a schema for structured output. */
export const STORY_SCHEMA = {
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

/** CLAUDE.md section 11: a second model call answers "safe for a 5-year-old: yes or no" for every line. */
export const SAFETY_SYSTEM_PROMPT = [
  "You check lines from a storybook before a 5-year-old hears them.",
  "For each numbered line, answer one question: is it safe and appropriate for a 5-year-old, yes or no?",
  "A line is unsafe if it is scary, violent, romantic, about real brands, characters or people, asks for personal information, or is confusing.",
  "[name] stands for the child's first name.",
  "Return one verdict for every line: index is the line's number, safe is true for yes and false for no.",
].join("\n");

export const VERDICT_SCHEMA = {
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

/** What the classifier reads: one numbered line each ("1. ..."), with names already masked. */
export const numberLines = (lines: string[]) => lines.map((line, i) => `${i + 1}. ${line}`).join("\n");

/**
 * The classifier's answer as one verdict per line, in order. A line answered twice counts as
 * safe only if every answer said so. Throws (checkLines then fails closed) unless the answer
 * numbers the lines exactly as we did: every index a whole number from 1 to `count`, every
 * line answered, every safe a true or false. A classifier that counts from 0 or skips a line
 * would otherwise lend one line's "safe" to its neighbor.
 */
export function readVerdicts(answer: unknown, count: number): boolean[] {
  const list = typeof answer === "object" && answer !== null ? (answer as { verdicts?: unknown }).verdicts : undefined;
  if (!Array.isArray(list)) throw new Error("classifier gave no verdicts");
  const answers = new Map<number, boolean>();
  for (const v of list) {
    const { index, safe } = (typeof v === "object" && v !== null ? v : {}) as { index?: unknown; safe?: unknown };
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > count) {
      throw new Error("classifier numbered a line we did not send");
    }
    if (typeof safe !== "boolean") throw new Error("classifier gave a verdict that is not yes or no");
    answers.set(index, (answers.get(index) ?? true) && safe);
  }
  // Every index is in 1..count, so `count` different ones means each line was answered.
  if (answers.size !== count) throw new Error("classifier skipped a line");
  return Array.from({ length: count }, (_, i) => answers.get(i + 1) === true);
}

export type ScreenedStory =
  | { ok: true; screens: GeneratedScreens["screens"]; fallback: string[] }
  | { ok: false; why: "output failed validation" | "nothing passed the safety check" };

/**
 * The checks every generated story passes before a child hears it, whichever model wrote it.
 * The strict check first; if it fails, the screens that pass on their own. Then safety: the
 * blocklist, then `classify` on the lines with the child's name masked in any spelling ("Zoe"
 * for Zoë too). Any unsafe line sends its whole screen back to the written version. `fallback`
 * lists every outline id that plays as written, in outline order. Not ok when nothing usable is
 * left; `why` says which step.
 */
export async function screenStory(
  raw: unknown,
  outline: ScreenOutline[],
  profile: StoryProfile,
  classify: (lines: string[]) => Promise<boolean[]>,
): Promise<ScreenedStory> {
  const strict = validateGenerated(raw, outline, profile);
  const checked = strict.ok ? { value: strict.value, dropped: [] as string[] } : salvageGenerated(raw, outline, profile);
  if (!checked) return { ok: false, why: "output failed validation" };

  const screens = checked.value.screens;
  const lines = screens.flatMap((s) => s.narration.map((t) => maskAnySpelling(t, profile.name)));
  const verdicts = await checkLines(lines, classify);
  let k = 0;
  const safe = screens.filter((s) => {
    const ok = verdicts.slice(k, k + s.narration.length).every((v) => v.safe);
    k += s.narration.length;
    return ok;
  });

  // Re-run the per-screen check so `fallback` lists every id not generated, in outline order.
  const final = salvageGenerated({ screens: safe }, outline, profile);
  if (!final) return { ok: false, why: "nothing passed the safety check" };
  return { ok: true, screens: final.value.screens, fallback: final.dropped };
}

// ---------------------------------------------------------------- written tellings

/** An interest as plain words: lowercase, one space between words, no leading "the ". */
const interestWords = (interest: string) =>
  interest.toLowerCase().replace(/[\s-]+/g, " ").trim().replace(/^the /, "");

/** The forms a phrase could take without a plural ending: "ponies" also reads as "pony", "buses" as "bus". */
function singulars(words: string): string[] {
  const out = [words];
  if (words.endsWith("ies")) out.push(`${words.slice(0, -3)}y`);
  if (words.endsWith("es")) out.push(words.slice(0, -2));
  if (words.endsWith("s") && !words.endsWith("ss")) out.push(words.slice(0, -1));
  return out;
}

/**
 * True when two interests name the same thing. Case, extra spaces, a leading "the " and a simple
 * plural do not matter, so "Dinosaur", "dinosaurs" and "the dinosaurs" all match. Whole phrases
 * only: "sea animals" is not "animals".
 */
export function sameInterest(a: string, b: string): boolean {
  const forms = singulars(interestWords(a));
  return forms[0] !== "" && singulars(interestWords(b)).some((f) => forms.includes(f));
}

/**
 * Which story a child hears, from their interests in order: the first interest that matches
 * anything decides. "written" when the written story is already about it (a child who loves
 * space), the matching telling for another love, or null when nothing matches (then the story
 * brain may write one).
 */
export function pickTelling(episode: Episode, interests: string[]): Telling | "written" | null {
  for (const interest of interests) {
    if ((episode.about ?? []).some((a) => sameInterest(a, interest))) return "written";
    const telling = (episode.tellings ?? []).find((t) => t.interests.some((w) => sameInterest(w, interest)));
    if (telling) return telling;
  }
  return null;
}

/**
 * The episode with a written telling's narration swapped in. Line ids become
 * "tell-<telling id>-<outline id>-<i>". Ids the telling leaves out stay as written, and so do
 * hints, give-up lines, count steps and numbers.
 */
export function applyTelling(episode: Episode, telling: Telling): Episode {
  const screens = Object.entries(telling.screens).map(([id, narration]) => ({ id, narration }));
  return applyGenerated(episode, { screens }, [], `tell-${telling.id}`);
}

// ---------------------------------------------------------------- swapping narration in

/**
 * A new Episode with generated narration swapped in. Line ids become
 * "<idPrefix>-<outlineId>-<i>" ("gen-go-0") so cached audio recorded for Mia never plays over
 * new words. Interactions, hints and give-up lines are untouched. Ids in `keepDefault` stay as written.
 */
export function applyGenerated(episode: Episode, gen: GeneratedScreens, keepDefault: string[] = [], idPrefix = "gen"): Episode {
  const keep = new Set(keepDefault);
  const byId = new Map(gen.screens.filter((s) => !keep.has(s.id) && s.narration.length > 0).map((s) => [s.id, s.narration]));
  const swap = (id: string, written: Line[]): Line[] => {
    const lines = byId.get(id);
    return lines ? lines.map((text, i) => ({ id: `${idPrefix}-${id}-${i}`, text })) : written;
  };
  return {
    ...episode,
    screens: episode.screens.map((s) => ({
      ...s,
      narration: swap(s.id, s.narration),
      onSuccess: { ...s.onSuccess, narration: swap(s.id + SUCCESS, s.onSuccess.narration) },
    })),
  };
}

export type NarrationResult = { episode: Episode; source: "generated" | "default"; reason?: string };

/**
 * Browser side: ask /api/story for this child's version of the episode. Any failure
 * (no key on the server, offline, slow, invalid) returns the written episode with
 * source "default" and a short reason, so the book always opens.
 * Sends only name, age and interests, never the whole profile.
 */
export async function getNarration(
  profile: StoryProfile,
  episode: Episode,
  opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<NarrationResult> {
  const fallback = (reason: string): NarrationResult => ({ episode, source: "default", reason });
  if (opts.signal?.aborted) return fallback("cancelled");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);
  const stop = () => controller.abort();
  opts.signal?.addEventListener("abort", stop);

  try {
    const res = await fetch("/api/story", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: { name: profile.name, age: profile.age, interests: profile.interests },
        episodeId: episode.id,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const code = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
      return fallback(typeof code === "string" ? code : `http-${res.status}`);
    }
    const data = (await res.json()) as { screens?: unknown; fallback?: unknown; story?: unknown; reason?: unknown };
    // The server can say "play the written story" (no story key yet) without it being an error.
    if (data.story === "written") return fallback(typeof data.reason === "string" ? data.reason : "written");
    const outline = buildOutline(episode);
    const checked = salvageGenerated({ screens: data.screens }, outline, profile);
    if (!checked) return fallback("invalid");
    const serverFallback = Array.isArray(data.fallback) ? data.fallback.filter((id): id is string => typeof id === "string") : [];
    return { episode: applyGenerated(episode, checked.value, [...serverFallback, ...checked.dropped]), source: "generated" };
  } catch {
    if (opts.signal?.aborted) return fallback("cancelled");
    return fallback(controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", stop);
  }
}
