import { createHmac } from "node:crypto";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Gemini SDK, mocked: every request lands here, so the tests can see exactly what Google would receive.
const sdk = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: sdk.create };
  },
}));

// The Claude SDK, mocked the same way, for what the route caches from a Claude story.
const claude = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => {
  class AnthropicError extends Error {}
  class APIError extends AnthropicError {}
  return {
    default: class {
      static APIError = APIError;
      static AnthropicError = AnthropicError;
      beta = { messages: { parse: claude.parse } };
    },
  };
});

// The route caches stories on disk and keys them with the session secret: in these tests both live
// in a fresh temp folder, never the project's .cache or .data.
vi.mock("@/lib/server/guard", async (importOriginal) => {
  const guard = await importOriginal<typeof import("@/lib/server/guard")>();
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const root = mkdtempSync(path.join(tmpdir(), "primer-story-test-"));
  return {
    ...guard,
    cacheDir: (...parts: string[]) => path.join(root, "cache", ...parts),
    dataDir: (...parts: string[]) => path.join(root, "data", ...parts),
  };
});

import { POST } from "@/app/api/story/route";
import { lostStar } from "@/content/episodes/lost-star";
import { textHash } from "@/lib/hash";
import { hasTerm, holdsName } from "@/lib/safety";
import { cacheDir, dataDir, forgetLimit, sha256 } from "@/lib/server/guard";
import { sessionSecret } from "@/lib/server/session";
import { GeminiStoryError, planGeminiStory, putNameBack, standInFor, writeWithGemini } from "@/lib/server/story-gemini";
import { SAFETY_SYSTEM_PROMPT, STORY_SYSTEM_PROMPT, buildOutline, buildStoryMessage, type StoryProfile } from "@/lib/story";

const outline = buildOutline(lostStar);
const CHARLES: StoryProfile = { name: "Charles", age: 5, interests: ["robots"] };
const FLASH = "gemini-3.8-flash";
const LITE = "gemini-3.5-flash-lite";

// A name, and the same name as a parent might type it in an interest. None of these may reach Google.
const OTHER_SPELLINGS: [string, string][] = [
  ["Zoë", "zoe"],
  ["Søren", "soren"],
  ["Bjørn", "BJORN"],
  ["Łucja", "lucja"],
  ["Paweł", "pawel"],
  ["Aslı", "asli"],
  ["Işıl", "ISIL"],
  ["Mary Ann", "maryann"],
  ["Maryann", "mary ann"],
  ["Anne-Marie", "anne marie"],
  ["O'Neil", "oneil"],
  ["Mia", "ｍｉａ"],
  ["Kaʻiulani", "kaiulani"],
];

// Names that Unicode normalization changes: typed in pieces, they are a different string from the composed name.
const IN_PIECES: [string, string][] = [
  ["a Korean name typed as separate jamo", "지우"],
  ["a polytonic Greek name with its accents as separate marks", "Ἀθηνᾶ"],
];

type Params = { model: string; system_instruction: string; input: string; store?: boolean; response_format?: unknown };
type Options = { timeout_ms?: number; retries?: unknown };

/** A good story for whatever name the model was given, the way Gemini would write it. */
function story(name: string) {
  return {
    screens: [
      {
        id: "wake",
        narration: [`Hello, ${name}.`, "A little star fell out of the sky, right beside a friendly robot, and only you can bring it home.", "Will you help me?"],
      },
      { id: "go", narration: ["The robot beeps and points at the rocket.", "To start the rocket, read the word on the button."] },
      { id: "go:success", narration: [`You did it, ${name}! The rocket hums like a happy robot.`] },
      { id: "steer", narration: ["To steer, we draw the letter S, for Star.", "Watch the magic pencil."] },
      { id: "steer:success", narration: [`Wheee! You steered the rocket, ${name}!`] },
      { id: "count", narration: [`How many planets do you see, ${name}?`] },
      { id: "count:success", narration: [`Five planets! Great counting, ${name}.`] },
      { id: "moon", narration: ["We made it to the Moon, and there is our star!", "If you drop a feather on the Moon, what do you think happens?"] },
      { id: "moon:success", narration: [`The Moon pulls gently, ${name}. That's called gravity.`] },
      { id: "home", narration: ["The robot holds up the little star.", "Read the magic word to send it back to the sky."] },
      { id: "home:success", narration: [`Thank you, ${name}.`, "Tomorrow, the star wants to show you Saturn's rings."] },
    ],
  };
}

const answer = (data: unknown) => ({ id: "test", status: "completed", output_text: JSON.stringify(data) });
const isSafetyCall = (p: Params) => p.system_instruction === SAFETY_SYSTEM_PROMPT;
const linesSent = (p: Params) => p.input.split("\n").map((l) => l.replace(/^\d+\. /, ""));

/** A working Gemini: writes the story for the name it was given, and judges each line with `safe`. */
function healthy(safe: (line: string) => boolean | undefined = () => true) {
  return async (p: Params) => {
    if (!isSafetyCall(p)) return answer(story(JSON.parse(p.input).child.name));
    const verdicts = linesSent(p).flatMap((line, i) => {
      const verdict = safe(line);
      return verdict === undefined ? [] : [{ index: i + 1, safe: verdict }];
    });
    return answer({ verdicts });
  };
}

// API errors as the SDK throws them: a status, or a name for a timeout. The text must never reach the logs.
const apiError = (status: number) => Object.assign(new Error(`${status} SECRET-DETAIL`), { status });
const timedOut = () => Object.assign(new Error("SECRET-DETAIL"), { name: "APIConnectionTimeoutError" });

const calls = () => sdk.create.mock.calls as [Params, Options][];
const modelsCalled = () => calls().map(([p]) => p.model);
const storyCalls = () => calls().filter(([p]) => !isSafetyCall(p)).map(([p]) => p);
let logs: string[] = [];

beforeEach(() => {
  sdk.create.mockReset();
  claude.parse.mockReset();
  logs = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void logs.push(args.join(" ")));
  // Each test starts with fresh speed limits for the shared buckets.
  forgetLimit("story|all");
  forgetLimit("story|local");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(() => {
  rmSync(cacheDir(), { recursive: true, force: true });
  rmSync(dataDir(), { recursive: true, force: true });
});

describe("writeWithGemini: privacy", () => {
  it("never sends the child's real name to Google, only a stand-in, the age and the interests", async () => {
    sdk.create.mockImplementation(healthy());
    const result = await writeWithGemini("test-key", CHARLES, outline);

    expect(JSON.stringify(calls())).not.toMatch(/charles/i);
    const [storyCall, safetyCall] = calls().map(([p]) => p);
    expect(JSON.parse(storyCall.input).child).toEqual({ name: "Tavi", age: 5, interests: ["robots"] });
    expect(storyCall.system_instruction).toContain(STORY_SYSTEM_PROMPT);
    expect(storyCall.system_instruction).toContain("never call the child he, she, him or her");
    // The safety check reads the lines with the name masked.
    expect(safetyCall.input).toContain("[name]");
    expect(safetyCall.input).not.toContain("Tavi");

    // The child hears their own name.
    expect(result.screens[0].narration[0]).toBe("Hello, Charles.");
    expect(JSON.stringify(result)).not.toContain("Tavi");
    expect(result).toMatchObject({ fallback: [], model: FLASH });
  });

  it("keeps a child's name out of the interests too", async () => {
    sdk.create.mockImplementation(healthy());
    await writeWithGemini("test-key", { name: "Robin", age: 6, interests: ["robin birds"] }, outline);
    expect(JSON.stringify(calls())).not.toMatch(/robin/i);
  });

  it("sends store: false, structured JSON, one try and a short timeout on every request", async () => {
    sdk.create.mockImplementation(healthy());
    await writeWithGemini("test-key", CHARLES, outline);
    expect(calls()).toHaveLength(2);
    for (const [params, options] of calls()) {
      expect(params.store).toBe(false);
      expect(params.response_format).toMatchObject({ type: "text", mime_type: "application/json" });
      expect(options.retries).toEqual({ strategy: "none" });
      expect(options.timeout_ms).toBeGreaterThan(0);
    }
  });

  it("picks the stand-in from the interests and the outline only, never from the name", () => {
    expect(standInFor(["robots"], outline)).toBe("Tavi");
    expect(standInFor(["tavi river"], outline)).toBe("Nilo");
    expect(standInFor(["tavi river", "nilo boats"], outline)).toBe("Pemba");
  });

  it("gives Octavia and Mia the same stand-in, so which one Google sees says nothing about the name", async () => {
    sdk.create.mockImplementation(healthy());
    await writeWithGemini("test-key", { name: "Octavia", age: 5, interests: ["robots"] }, outline);
    await writeWithGemini("test-key", { name: "Mia", age: 5, interests: ["robots"] }, outline);
    expect(storyCalls().map((p) => JSON.parse(p.input).child.name)).toEqual(["Tavi", "Tavi"]);
  });

  it("gives Octavia her whole name back, with no stray Tavi and no screen dropped", async () => {
    sdk.create.mockImplementation(healthy());
    const result = await writeWithGemini("test-key", { name: "Octavia", age: 5, interests: ["robots"] }, outline);
    expect(result.fallback).toEqual([]);
    expect(result.screens).toHaveLength(outline.length);
    expect(result.screens[0].narration[0]).toBe("Hello, Octavia.");
    const text = result.screens.flatMap((s) => s.narration).join(" ");
    expect(hasTerm(text, "Tavi")).toBe(false);
    expect(text).not.toContain("Tavi");
    expect(JSON.stringify(calls())).not.toMatch(/octavia/i);
  });

  it("looks for traces of the stand-in before the real name goes in, then swaps whole words only", () => {
    const back = putNameBack(
      {
        screens: [
          { id: "go:success", narration: ["You did it, Tavi! Tavi's rocket flies."] },
          { id: "steer:success", narration: ["Go, Tavis!"] },
          { id: "count:success", narration: ["Great counting, TAVI."] },
        ],
      },
      "Tavi",
      "Octavia",
    );
    // The screen with a stray trace of the stand-in is left out, so it plays as written. Octavia is not a trace.
    expect(back).toEqual({
      screens: [
        { id: "go:success", narration: ["You did it, Octavia! Octavia's rocket flies."] },
        { id: "count:success", narration: ["Great counting, Octavia."] },
      ],
    });
    expect(putNameBack({ screens: [{ id: "go:success", narration: ["You did it, Tavi!"] }] }, "Tavi", "Zoë")).toEqual({
      screens: [{ id: "go:success", narration: ["You did it, Zoë!"] }],
    });
  });

  it("sends nothing at all for a child whose name is the stand-in", async () => {
    sdk.create.mockImplementation(healthy());
    for (const name of ["Tavi", "Tavi Rose"]) {
      await expect(writeWithGemini("test-key", { name, age: 5, interests: ["robots"] }, outline)).rejects.toMatchObject({ kind: "invalid" });
    }
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it.each(IN_PIECES)("never sends %s to Google, in either form", async (_, composed) => {
    sdk.create.mockImplementation(healthy());
    const inPieces = composed.normalize("NFD");
    expect(inPieces).not.toBe(composed);
    const result = await writeWithGemini("test-key", { name: inPieces, age: 5, interests: ["robots"] }, outline);

    const sent = JSON.stringify(calls());
    expect(sent).not.toContain(composed);
    expect(sent).not.toContain(inPieces);
    expect(holdsName(sent, composed)).toBe(false);
    expect(calls().find(([p]) => isSafetyCall(p))?.[0].input).toContain("[name]");
    // The child still hears their name, composed.
    expect(result.screens[0].narration[0]).toBe(`Hello, ${composed}.`);
  });

  it.each(OTHER_SPELLINGS)("swaps %s for the stand-in when an interest spells it %j", async (name, typed) => {
    sdk.create.mockImplementation(healthy());
    const result = await writeWithGemini("test-key", { name, age: 5, interests: [`${typed} kites`] }, outline);

    expect(calls()).toHaveLength(2);
    expect(JSON.parse(storyCalls()[0].input).child.interests).toEqual(["Tavi kites"]);
    const sent = JSON.stringify(calls());
    expect(holdsName(sent, name)).toBe(false);
    expect(holdsName(sent, typed)).toBe(false);
    // The child hears their own name, spelled their way.
    expect(result.screens[0].narration[0]).toBe(`Hello, ${name}.`);
  });

  it("sends nothing for a child whose name the episode itself says, in any spelling", async () => {
    sdk.create.mockImplementation(healthy());
    // The written story asks "Will you help me?", so Will's name would leave with the outline.
    for (const name of ["Will", "WÍLL"]) {
      expect(planGeminiStory({ name, age: 5, interests: ["robots"] }, outline)).toEqual({
        ok: false,
        why: "held back a request that held the child's name",
      });
      await expect(writeWithGemini("test-key", { name, age: 5, interests: ["robots"] }, outline)).rejects.toMatchObject({ kind: "invalid" });
    }
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("masks the name in any spelling before the safety check, so a line where the model wrote Zoe for Zoë still plays", async () => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => {
      if (isSafetyCall(p)) return works(p);
      const written = story(JSON.parse(p.input).child.name);
      written.screens[1].narration[0] = "Zoe the robot beeps and points at the rocket.";
      return answer(written);
    });
    const result = await writeWithGemini("test-key", { name: "Zoë", age: 5, interests: ["robots"] }, outline);

    expect(result.fallback).toEqual([]);
    expect(modelsCalled()).toEqual([FLASH, FLASH]);
    const safetyInput = calls().find(([p]) => isSafetyCall(p))?.[0].input ?? "";
    expect(safetyInput).toContain("[name] the robot beeps");
    expect(safetyInput).not.toMatch(/zo[eë]/i);
  });
});

describe("writeWithGemini: models", () => {
  it("falls back from gemini-3.8-flash to gemini-3.5-flash-lite on a 503, for the story and the safety check", async () => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => (p.model === FLASH ? Promise.reject(apiError(503)) : works(p)));
    const result = await writeWithGemini("test-key", CHARLES, outline);

    expect(result.model).toBe(LITE);
    expect(result.fallback).toEqual([]);
    expect(modelsCalled()).toEqual([FLASH, LITE, FLASH, LITE]);
    // Logs name the model and the status, never the error's text.
    expect(logs).toContain("[story] gemini-3.8-flash failed (503)");
    expect(logs.join("\n")).not.toContain("SECRET-DETAIL");
  });

  it("falls back on a rate limit and on a timeout too", async () => {
    const works = healthy();
    for (const failure of [() => apiError(429), timedOut]) {
      sdk.create.mockReset();
      sdk.create.mockImplementation(async (p: Params) => (p.model === FLASH ? Promise.reject(failure()) : works(p)));
      expect((await writeWithGemini("test-key", CHARLES, outline)).model).toBe(LITE);
    }
    expect(logs).toContain("[story] gemini-3.8-flash failed (timeout)");
  });

  it.each([
    ["an unfinished answer", { id: "test", status: "incomplete", output_text: '{ "screens": [' }, "incomplete"],
    ["a failed answer", { id: "test", status: "failed" }, "failed"],
    ["a status it does not know", { id: "test", status: "SECRET-DETAIL", output_text: "{}" }, "unfinished"],
    ["no text", { id: "test", status: "completed", output_text: "" }, "empty"],
    ["text that is not JSON", { id: "test", status: "completed", output_text: "SECRET-DETAIL {" }, "unreadable"],
  ])("tries gemini-3.5-flash-lite when gemini-3.8-flash gives %s, for the story and the safety check", async (_, bad, what) => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => (p.model === FLASH ? bad : works(p)));
    const result = await writeWithGemini("test-key", CHARLES, outline);

    expect(result.model).toBe(LITE);
    expect(result.fallback).toEqual([]);
    expect(modelsCalled()).toEqual([FLASH, LITE, FLASH, LITE]);
    expect(logs).toContain(`[story] gemini-3.8-flash failed (${what})`);
    expect(logs.join("\n")).not.toContain("SECRET-DETAIL");
  });

  it("gives up as unavailable, and says why, when no model gives an answer", async () => {
    sdk.create.mockResolvedValue({ id: "test", status: "incomplete", output_text: "SECRET-DETAIL" });
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({
      kind: "unavailable",
      message: "no answer (incomplete)",
    });
    expect(modelsCalled()).toEqual([FLASH, LITE]);
    expect(logs).toEqual(["[story] gemini-3.8-flash failed (incomplete)", "[story] gemini-3.5-flash-lite failed (incomplete)"]);
  });

  it("does not try another model after a bad request", async () => {
    sdk.create.mockRejectedValue(apiError(400));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ kind: "unavailable", message: "API error (400)" });
    expect(modelsCalled()).toEqual([FLASH]);
  });

  it("gives up as unavailable when both models are overloaded", async () => {
    sdk.create.mockRejectedValue(apiError(503));
    const failure = writeWithGemini("test-key", CHARLES, outline);
    await expect(failure).rejects.toBeInstanceOf(GeminiStoryError);
    await expect(failure).rejects.toMatchObject({ kind: "unavailable", message: "API error (503)" });
    expect(modelsCalled()).toEqual([FLASH, LITE]);
  });

  it("finishes well inside the browser's 45 second wait, even when every model is slow", async () => {
    const works = healthy();
    // The story's flash call times out, lite answers, and both safety models time out.
    sdk.create.mockImplementation(async (p: Params) => (p.model === FLASH || isSafetyCall(p) ? Promise.reject(timedOut()) : works(p)));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ kind: "invalid" });
    expect(calls()).toHaveLength(4);
    const worstCase = calls().reduce((sum, [, options]) => sum + (options.timeout_ms ?? Infinity), 0);
    expect(worstCase).toBeLessThanOrEqual(35_000);
  });

  it("moves on to gemini-3.5-flash-lite on its own deadline when a call never settles", async () => {
    // The SDK's own timeout can be lost (a stalled body and one garbage collection): a call that never settles.
    vi.useFakeTimers();
    const works = healthy();
    sdk.create.mockImplementation((p: Params) => (p.model === FLASH ? new Promise(() => {}) : works(p)));
    const result = writeWithGemini("test-key", CHARLES, outline);
    await vi.advanceTimersByTimeAsync(13_000 + 6_000);

    await expect(result).resolves.toMatchObject({ model: LITE, fallback: [] });
    expect(modelsCalled()).toEqual([FLASH, LITE, FLASH, LITE]);
    expect(logs).toContain("[story] gemini-3.8-flash failed (timeout)");
  });

  it("is done within 32 seconds, story and safety check, even when calls never settle", async () => {
    vi.useFakeTimers();
    const works = healthy();
    // The slowest way through: flash never answers, lite answers the story just inside its 9 seconds,
    // and neither safety model ever answers.
    sdk.create.mockImplementation((p: Params) => {
      if (p.model === FLASH || isSafetyCall(p)) return new Promise(() => {});
      return new Promise((resolve) => setTimeout(() => resolve(works(p)), 8_999));
    });
    let settled = false;
    const result = writeWithGemini("test-key", CHARLES, outline).finally(() => (settled = true));
    result.catch(() => {});

    await vi.advanceTimersByTimeAsync(31_998);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(result).rejects.toMatchObject({ message: "nothing passed the safety check" });
    expect(modelsCalled()).toEqual([FLASH, LITE, FLASH, LITE]);
  });

  it.each([
    [
      "a connection that drops halfway through the answer",
      () => new TypeError("terminated", { cause: Object.assign(new Error("SECRET-DETAIL"), { code: "UND_ERR_SOCKET" }) }),
      "cut off",
    ],
    ["an answer cut off in the middle of its JSON", () => new SyntaxError("SECRET-DETAIL in JSON at position 25"), "unreadable"],
    ["a 200 answer that is not JSON at all", () => Object.assign(new Error("200 SECRET-DETAIL"), { status: 200 }), "unreadable"],
  ])("tries gemini-3.5-flash-lite after %s, for the story and the safety check", async (_, broken, what) => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => (p.model === FLASH ? Promise.reject(broken()) : works(p)));
    const result = await writeWithGemini("test-key", CHARLES, outline);

    expect(result.model).toBe(LITE);
    expect(result.fallback).toEqual([]);
    expect(modelsCalled()).toEqual([FLASH, LITE, FLASH, LITE]);
    expect(logs).toContain(`[story] gemini-3.8-flash failed (${what})`);
    expect(logs.join("\n")).not.toContain("SECRET-DETAIL");
  });

  it("still treats any other error as a bug: no second model", async () => {
    sdk.create.mockRejectedValue(new RangeError("a bug"));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toBeInstanceOf(RangeError);
    expect(modelsCalled()).toEqual([FLASH]);
  });

  it("calls a story invalid when every model's answer is unreadable", async () => {
    sdk.create.mockResolvedValue({ id: "test", status: "completed", output_text: "Once upon a time" });
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ kind: "invalid", message: "unreadable output" });
    expect(modelsCalled()).toEqual([FLASH, LITE]);
  });
});

describe("writeWithGemini: safety check", () => {
  it("sends a screen with an unsafe line back to the written version", async () => {
    sdk.create.mockImplementation(healthy((line) => !line.includes("magic pencil")));
    const result = await writeWithGemini("test-key", CHARLES, outline);
    expect(result.fallback).toEqual(["steer"]);
    expect(result.screens.map((s) => s.id)).not.toContain("steer");
    expect(result.screens).toHaveLength(outline.length - 1);
  });

  it("fails closed when the classifier skips a line: every screen plays as written", async () => {
    sdk.create.mockImplementation(healthy((line) => (line.includes("robot beeps") ? undefined : true)));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ message: "nothing passed the safety check" });
  });

  it("fails closed when the classifier numbers the lines from 0", async () => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) =>
      isSafetyCall(p) ? answer({ verdicts: linesSent(p).map((_, i) => ({ index: i, safe: true })) }) : works(p),
    );
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ message: "nothing passed the safety check" });
  });

  it("fails closed when the classifier fails: every screen plays as written", async () => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => (isSafetyCall(p) ? Promise.reject(apiError(503)) : works(p)));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({
      kind: "invalid",
      message: "nothing passed the safety check",
    });
  });

  it("fails closed when the classifier's answer is unreadable", async () => {
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => (isSafetyCall(p) ? { id: "test", status: "completed", output_text: "{ yes" } : works(p)));
    await expect(writeWithGemini("test-key", CHARLES, outline)).rejects.toMatchObject({ message: "nothing passed the safety check" });
  });
});

describe("POST /api/story", () => {
  const ask = (profile: StoryProfile, from?: string) =>
    POST(
      new Request("http://localhost:3001/api/story", {
        method: "POST",
        headers: { "content-type": "application/json", ...(from ? { "x-forwarded-for": from } : {}) },
        body: JSON.stringify({ profile, episodeId: "lost-star" }),
      }),
    );
  /** No Claude key, a Gemini key, and the server's opt-in. */
  const geminiOn = () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_STORIES", "on");
  };
  const cacheFiles = () => {
    try {
      return readdirSync(cacheDir("story"));
    } catch {
      return [];
    }
  };
  const readCached = (file: string) => readFileSync(path.join(cacheDir("story"), file), "utf8");

  it("says written, quietly, when there is neither key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await ask({ name: "Quillon", age: 5, interests: ["robots"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ story: "written", reason: "no-story-key" });
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("says written with only GEMINI_API_KEY: Gemini stories need GEMINI_STORIES=on, exactly", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    sdk.create.mockImplementation(healthy());
    for (const flag of ["", "ON", "true", "1", "yes", " on"]) {
      vi.stubEnv("GEMINI_STORIES", flag);
      const res = await ask({ name: "Quillon", age: 5, interests: ["robots"] });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ story: "written", reason: "no-story-key" });
    }
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it("asks Gemini when the server opts in, and caches the story without the child's name", async () => {
    geminiOn();
    sdk.create.mockImplementation(healthy());
    const before = cacheFiles();
    const res = await ask(CHARLES);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ fallback: [], model: FLASH });
    expect(body.screens[0].narration[0]).toBe("Hello, Charles.");
    expect(JSON.stringify(calls())).not.toMatch(/charles/i);

    const added = cacheFiles().filter((f) => !before.includes(f));
    expect(added).toHaveLength(1);
    const cached = readCached(added[0]);
    expect(cached).not.toMatch(/charles/i);
    expect(cached).toContain("{name}");
  });

  it("names cache files with an HMAC of the server's secret, so they cannot be matched against guessed names", async () => {
    geminiOn();
    sdk.create.mockImplementation(healthy());
    const child: StoryProfile = { name: "Philippa", age: 6, interests: ["robots"] };
    const before = cacheFiles();
    expect((await ask(child, "10.7.0.1")).status).toBe(200);
    const [file] = cacheFiles().filter((f) => !before.includes(f));

    // What someone reading .cache/story could compute without the secret: the key as the route builds it.
    const version = textHash(STORY_SYSTEM_PROMPT + buildStoryMessage({ name: "{name}", age: 0, interests: [] }, outline));
    const key = `lost-star|${version}|philippa|6|robots`;
    expect(file).not.toBe(`${sha256(key)}.json`);
    const { check } = JSON.parse(readCached(file)) as { check: string };
    expect(check).not.toBe(sha256(`check|${key}`));

    // With the secret, the server finds its own file again.
    const secret = await sessionSecret();
    expect(file).toBe(`${createHmac("sha256", secret).update(`story-cache|file|${key}`).digest("hex")}.json`);
    expect(check).toBe(createHmac("sha256", secret).update(`story-cache|check|${key}`).digest("hex"));
    sdk.create.mockReset();
    expect((await ask(child, "10.7.0.2")).status).toBe(200);
    expect(sdk.create).not.toHaveBeenCalled();
  });

  it.each(IN_PIECES)("keeps %s, in either form, out of Google's requests and the cache", async (_, composed) => {
    geminiOn();
    sdk.create.mockImplementation(healthy());
    const inPieces = composed.normalize("NFD");
    const res = await ask({ name: inPieces, age: 5, interests: ["robots"] }, `10.8.0.${composed.length}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.screens[0].narration[0]).toBe(`Hello, ${composed}.`);

    const sent = JSON.stringify(calls());
    const cached = cacheFiles().map(readCached).join("\n");
    for (const form of [composed, inPieces]) {
      expect(sent).not.toContain(form);
      expect(cached).not.toContain(form);
    }
    expect(holdsName(sent, composed)).toBe(false);
    expect(holdsName(cached, composed)).toBe(false);
  });

  it("caps new stories for everyone together, counting only the stories it starts writing", async () => {
    geminiOn();
    // A story already in the cache.
    sdk.create.mockImplementation(healthy());
    const cachedChild: StoryProfile = { name: "Cachella", age: 5, interests: ["kites"] };
    expect((await ask(cachedChild, "10.9.0.1")).status).toBe(200);
    forgetLimit("story|all");

    // 19 new stories, each "from" its own address (anyone can make up X-Forwarded-For). Gemini is down, so none is cached.
    sdk.create.mockRejectedValue(apiError(503));
    for (let i = 0; i < 19; i++) {
      const res = await ask({ name: `Kid${String.fromCharCode(97 + i)}`, age: 5, interests: ["kites"] }, `10.9.1.${i}`);
      expect(res.status).toBe(502);
    }

    // The 20th: two requests for the same child at once share one story, and count once.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    const works = healthy();
    sdk.create.mockReset();
    sdk.create.mockImplementation(async (p: Params) => {
      await held;
      return works(p);
    });
    const twentieth: StoryProfile = { name: "Twenty", age: 5, interests: ["kites"] };
    const first = ask(twentieth, "10.9.2.1");
    await vi.waitFor(() => expect(sdk.create).toHaveBeenCalledTimes(1));
    const joined = ask(twentieth, "10.9.2.2");
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    expect((await first).status).toBe(200);
    expect((await joined).status).toBe(200);
    expect(storyCalls()).toHaveLength(1);

    // The 21st new story is refused, whoever asks.
    const refused = await ask({ name: "Twentyone", age: 5, interests: ["kites"] }, "10.9.3.1");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "story-busy" });

    // A story already written still plays, from memory and from another address.
    const again = await ask(cachedChild, "10.9.3.2");
    expect(again.status).toBe(200);
    expect((await again.json()).screens[0].narration[0]).toBe("Hello, Cachella.");
  });

  it("answers quickly with an error the browser turns into the written story when Gemini is down", async () => {
    geminiOn();
    sdk.create.mockRejectedValue(apiError(503));
    const res = await ask({ name: "Dorotea", age: 4, interests: ["trains"] });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "story-unavailable" });
    expect(logs).toContain("[story] Gemini API error (503)");
    expect(logs.join("\n")).not.toContain("SECRET-DETAIL");
  });

  it("calls it unavailable when no model gives an answer", async () => {
    geminiOn();
    sdk.create.mockResolvedValue({ id: "test", status: "failed" });
    const res = await ask({ name: "Ottilie", age: 4, interests: ["trains"] }, "10.6.0.1");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "story-unavailable" });
    expect(logs).toContain("[story] Gemini no answer (failed)");
  });

  it("swaps a name spelled another way in an interest, so Google, the safety check and the cache never see it", async () => {
    geminiOn();
    const works = healthy();
    // The model weaves the interest into a line, word for word.
    sdk.create.mockImplementation(async (p: Params) => {
      if (isSafetyCall(p)) return works(p);
      const { child } = JSON.parse(p.input);
      const written = story(child.name);
      written.screens[1].narration[0] = `The robot beeps and points at the ${child.interests[0]}.`;
      return answer(written);
    });
    const before = cacheFiles();
    const res = await ask({ name: "Søren", age: 6, interests: ["soren boats"] }, "10.11.0.1");
    expect(res.status).toBe(200);
    expect((await res.json()).screens[1].narration[0]).toBe("The robot beeps and points at the Søren boats.");

    expect(JSON.parse(storyCalls()[0].input).child.interests).toEqual(["Tavi boats"]);
    expect(JSON.stringify(calls())).not.toMatch(/s[oø]ren/i);
    const cached = cacheFiles().filter((f) => !before.includes(f)).map(readCached).join("\n");
    expect(cached).toContain("{name} boats");
    expect(cached).not.toMatch(/s[oø]ren/i);
  });

  it("keeps a Gemini story off the disk when the model spells the name another way on its own", async () => {
    geminiOn();
    const works = healthy();
    sdk.create.mockImplementation(async (p: Params) => {
      if (isSafetyCall(p)) return works(p);
      const written = story(JSON.parse(p.input).child.name);
      written.screens[1].narration[0] = "The robot beeps and points at the soren boats.";
      return answer(written);
    });
    const before = cacheFiles();
    const child: StoryProfile = { name: "Søren", age: 7, interests: ["boats"] };
    expect((await ask(child, "10.11.0.2")).status).toBe(200);
    expect(calls().find(([p]) => isSafetyCall(p))?.[0].input).toContain("[name] boats");
    expect(JSON.stringify(calls())).not.toMatch(/s[oø]ren/i);
    expect(cacheFiles().filter((f) => !before.includes(f))).toEqual([]);
  });

  it("does not count a story Gemini turns down before asking, so held-back names never use up the cap", async () => {
    geminiOn();
    sdk.create.mockImplementation(healthy());
    const turnedDown: StoryProfile[] = [
      { name: "Will", age: 5, interests: ["kites"] }, // the episode itself says "Will you help me?"
      { name: "Tavi", age: 5, interests: ["kites"] }, // the stand-in's own name
      { name: "Rowan", age: 5, interests: ["tavi nilo", "pemba suvi", "kito"] }, // every stand-in used up
    ];
    // More of them than the cap for everyone, and more from one address than its own cap.
    for (let i = 0; i < 21; i++) {
      const res = await ask(turnedDown[i % turnedDown.length], i < 7 ? "10.12.0.1" : `10.12.1.${i}`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ story: "written", reason: "kept-private" });
    }
    expect(sdk.create).not.toHaveBeenCalled();

    // The next child, from that same address, still gets a live story.
    const res = await ask({ name: "Charlotte", age: 5, interests: ["kites"] }, "10.12.0.1");
    expect(res.status).toBe(200);
    expect((await res.json()).screens[0].narration[0]).toBe("Hello, Charlotte.");
  });
});

describe("POST /api/story with Claude", () => {
  const ask = (profile: StoryProfile, from: string) =>
    POST(
      new Request("http://localhost:3001/api/story", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": from },
        body: JSON.stringify({ profile, episodeId: "lost-star" }),
      }),
    );
  const cacheFiles = () => {
    try {
      return readdirSync(cacheDir("story"));
    } catch {
      return [];
    }
  };
  type ClaudeRequest = { system: string; messages: { content: string }[] };
  /** Claude writes a good story for `name`, with one line spelling it `written`, and calls every line safe. */
  const claudeWrites = (name: string, written: string) =>
    claude.parse.mockImplementation(async (req: ClaudeRequest) => {
      if (req.system === SAFETY_SYSTEM_PROMPT) {
        const count = req.messages[0].content.split("\n").length;
        return { stop_reason: "end_turn", parsed_output: { verdicts: Array.from({ length: count }, (_, i) => ({ index: i + 1, safe: true })) } };
      }
      const s = story(name);
      s.screens[2].narration[0] = `You did it, ${written}! The rocket hums like a happy robot.`;
      return { stop_reason: "end_turn", model: "claude-opus-5-5", parsed_output: s };
    });

  it.each([
    ["Zoë", "Zoe"],
    ["Işıl", "IŞIL"],
  ])("keeps the story of %s in memory only when Claude spells the name %s", async (name, written) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-claude-key");
    claudeWrites(name, written);
    const before = cacheFiles();
    const res = await ask({ name, age: 5, interests: ["robots"] }, `10.13.0.${name.length}`);
    expect(res.status).toBe(200);
    expect((await res.json()).screens[2].narration[0]).toBe(`You did it, ${written}! The rocket hums like a happy robot.`);
    expect(cacheFiles().filter((f) => !before.includes(f))).toEqual([]);

    // The classifier never saw that spelling either.
    const safetyCall = claude.parse.mock.calls.map(([req]) => req as ClaudeRequest).find((req) => req.system === SAFETY_SYSTEM_PROMPT);
    expect(holdsName(safetyCall?.messages[0].content ?? "", name)).toBe(false);

    // The same child again is served from memory, with no new Claude call.
    claude.parse.mockClear();
    expect((await ask({ name, age: 5, interests: ["robots"] }, "10.13.1.1")).status).toBe(200);
    expect(claude.parse).not.toHaveBeenCalled();
  });

  it("caches a Claude story that spells the name the child's way, with the name masked", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-claude-key");
    claudeWrites("Zoë", "Zoë");
    const before = cacheFiles();
    expect((await ask({ name: "Zoë", age: 6, interests: ["robots"] }, "10.13.2.1")).status).toBe(200);
    const added = cacheFiles().filter((f) => !before.includes(f));
    expect(added).toHaveLength(1);
    const cached = readFileSync(path.join(cacheDir("story"), added[0]), "utf8");
    expect(cached).toContain("You did it, {name}!");
    expect(holdsName(cached, "Zoë")).toBe(false);
  });
});
