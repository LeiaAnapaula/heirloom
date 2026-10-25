import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canListen, isYes, listenFor, matchesWord, normalizeSpeech, parseLastNumber, parseNumber, stopListening } from "@/lib/listen";
import { lostStar } from "@/content/episodes/lost-star";
import type { ReadAloudInteraction, YesInteraction } from "@/lib/episode";

describe("normalizeSpeech", () => {
  it.each([
    ["go", "go"],
    ["  Go!  ", "go"],
    ["GO, GO.", "go go"],
    ["go-go", "go go"],
    ["It's FIVE", "its five"],
    ["don’t", "dont"],
    ["Héllo", "hello"],
    ["\tHOME\n", "home"],
    ["uh-huh", "uh huh"],
    ["4 planets", "4 planets"],
    ["...", ""],
    ["", ""],
  ])("%j becomes %j", (input, out) => {
    expect(normalizeSpeech(input)).toBe(out);
  });
});

describe("matchesWord", () => {
  describe("go", () => {
    it.each(["go", "Go", "GO!", " go ", "go go", "go go go", "let's go", "gooo", "goooh", "goh", "gow", "goes", "I said go"])(
      "accepts %j",
      (heard) => expect(matchesWord(heard, "go")).toBe(true),
    );
    it.each(["no", "so", "dog", "hello", "phone", "hum", "comb", "", "   ", "going", "ago", "togo", "yo", "g", "o"])(
      "rejects %j",
      (heard) => expect(matchesWord(heard, "go")).toBe(false),
    );
  });

  describe("home", () => {
    it.each(["home", "HOME", "home!", "hom", "homes", "homey", "hoome", "hoooome", "go home", "I'm home"])(
      "accepts %j",
      (heard) => expect(matchesWord(heard, "home")).toBe(true),
    );
    it.each(["no", "so", "dog", "hello", "phone", "hum", "comb", "", "come", "some", "dome", "him", "ham", "hmm"])(
      "rejects %j",
      (heard) => expect(matchesWord(heard, "home")).toBe(false),
    );
  });

  it("accept entries count exactly, but get no fuzzy room of their own", () => {
    expect(matchesWord("hume", "home", ["hume"])).toBe(true);
    expect(matchesWord("hum", "home", ["hume"])).toBe(false);
    expect(matchesWord("huume", "home", ["hume"])).toBe(true); // stretched accept entry
  });

  it("multi-word entries match as a phrase inside what was heard", () => {
    expect(matchesWord("go go", "go", ["go go"])).toBe(true);
    expect(matchesWord("yes please", "yes please")).toBe(true);
    expect(matchesWord("oh yes please book", "yes please")).toBe(true);
    expect(matchesWord("please yes", "yes please")).toBe(false);
    expect(matchesWord("uh-huh", "uh huh")).toBe(true);
    expect(matchesWord("huh", "uh huh")).toBe(false);
  });

  it("is false for an empty word or empty speech", () => {
    expect(matchesWord("go", "")).toBe(false);
    expect(matchesWord("", "go", ["goh"])).toBe(false);
    expect(matchesWord("!!", "go")).toBe(false);
  });

  it("works for other short words the next episodes will use", () => {
    expect(matchesWord("sun", "sun")).toBe(true);
    expect(matchesWord("son", "sun")).toBe(true);
    expect(matchesWord("suns", "sun")).toBe(true);
    expect(matchesWord("fun", "sun")).toBe(false);
    expect(matchesWord("so", "sun")).toBe(false);
  });

  // Every spelling the episode lists as close enough must actually be accepted.
  const readScreens = lostStar.screens.filter((s) => s.interaction.type === "readAloud");
  it("the episode has read-aloud screens", () => expect(readScreens.length).toBeGreaterThan(0));
  for (const screen of readScreens) {
    const { word, accept } = screen.interaction as ReadAloudInteraction;
    describe(`episode word "${word}"`, () => {
      it("accepts the word itself, in any case", () => {
        expect(matchesWord(word, word, accept)).toBe(true);
        expect(matchesWord(word.toUpperCase(), word, accept)).toBe(true);
      });
      it.each(accept)("accepts %j", (entry) => {
        expect(matchesWord(entry, word, accept)).toBe(true);
        expect(matchesWord(`${entry}!`, word, accept)).toBe(true);
      });
      it.each(["no", "so", "dog", "hello", "phone", "hum", "comb", ""])("rejects %j", (heard) => {
        expect(matchesWord(heard, word, accept)).toBe(false);
      });
    });
  }

  const yes = lostStar.screens.find((s) => s.interaction.type === "yes")?.interaction as YesInteraction | undefined;
  it("accepts every yes on the first page, and not no", () => {
    expect(yes).toBeDefined();
    for (const entry of yes!.accept) {
      expect(yes!.accept.some((w) => matchesWord(entry, w))).toBe(true);
    }
    for (const heard of ["no", "nope", "no thank you", "nah", ""]) {
      expect(yes!.accept.some((w) => matchesWord(heard, w))).toBe(false);
    }
  });
});

describe("parseNumber", () => {
  it.each([
    ["1", 1],
    ["4", 4],
    ["10", 10],
    ["one", 1],
    ["two", 2],
    ["three", 3],
    ["four", 4],
    ["Five!", 5],
    ["six", 6],
    ["seven", 7],
    ["eight", 8],
    ["nine", 9],
    ["ten", 10],
    ["FOUR.", 4],
    ["number four", 4],
    ["it's five", 5],
    ["4 planets", 4],
    ["4planets", 4],
    ["I think there are four", 4],
    ["I want to say four", 4],
    ["one two three four", 1],
    ["twelve and 3", 3],
    ["15 or 5", 5],
  ])("%j is %d", (heard, n) => {
    expect(parseNumber(heard)).toBe(n);
  });

  it.each([
    ["won", 1],
    ["to", 2],
    ["too", 2],
    ["tree", 3],
    ["free", 3],
    ["for", 4],
    ["fore", 4],
    ["number for", 4],
    ["it's for", 4],
    ["fife", 5],
    ["sicks", 6],
    ["ate", 8],
    ["nein", 9],
  ])("soundalike %j is %d", (heard, n) => {
    expect(parseNumber(heard)).toBe(n);
  });

  it.each(["", "hello", "planets", "0", "zero", "eleven", "12", "100", "lots"])("%j has no number", (heard) => {
    expect(parseNumber(heard)).toBeNull();
  });
});

describe("listening in Node", () => {
  it("has no engine, so screens fall back to tap", async () => {
    expect(canListen()).toBe(false);
    await expect(listenFor(["go"], { timeoutMs: 100 })).resolves.toEqual({ status: "unavailable", reason: "unsupported" });
    expect(() => stopListening()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The engine, against a fake recognizer. Each test loads a fresh copy of the module
// so session memory (like a refused microphone) does not leak between tests.
// ---------------------------------------------------------------------------

type Handler<E = void> = ((e: E) => void) | null;
type FakeResult = { transcript: string }[] & { isFinal: boolean };

class FakeRecognizer {
  static instances: FakeRecognizer[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 1;
  continuous = true;
  processLocally = false;
  onstart: Handler = null;
  onaudiostart: Handler = null;
  onresult: Handler<{ resultIndex: number; results: FakeResult[] }> = null;
  onerror: Handler<{ error: string }> = null;
  onend: Handler = null;
  starts = 0;
  aborted = false;

  constructor() {
    FakeRecognizer.instances.push(this);
  }
  start() {
    this.starts++;
    queueMicrotask(() => this.onstart?.());
  }
  abort() {
    this.aborted = true;
    queueMicrotask(() => {
      this.onerror?.({ error: "aborted" });
      this.onend?.();
    });
  }
  // test helpers
  hear(alternatives: string[], isFinal: boolean) {
    const result = Object.assign(alternatives.map((transcript) => ({ transcript })), { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
  stopOnItsOwn() {
    this.onend?.();
  }
}

const FakeClass = Object.assign(FakeRecognizer, {
  available: undefined as undefined | ((o: { langs: string[]; processLocally: boolean }) => Promise<string>),
});

describe("listenFor with a speech engine", () => {
  let listen: typeof import("@/lib/listen");
  const flush = () => vi.advanceTimersByTimeAsync(0);
  const latest = () => FakeRecognizer.instances[FakeRecognizer.instances.length - 1];

  beforeEach(async () => {
    vi.useFakeTimers();
    FakeRecognizer.instances = [];
    FakeClass.available = undefined;
    vi.stubGlobal("window", { isSecureContext: true, webkitSpeechRecognition: FakeClass });
    vi.resetModules();
    listen = await import("@/lib/listen");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("sets up the recognizer for one short answer in US English", async () => {
    expect(listen.canListen()).toBe(true);
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    const rec = latest();
    expect(rec).toMatchObject({ lang: "en-US", interimResults: true, maxAlternatives: 5, continuous: false, starts: 1 });
    listen.stopListening();
    await expect(p).resolves.toEqual({ status: "silence" });
  });

  it("matches on an interim result without waiting for the final", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().hear(["go"], false);
    await expect(p).resolves.toEqual({ status: "match", heard: "go" });
    expect(latest().aborted).toBe(true);
  });

  it("tests every alternative, not just the top one", async () => {
    const p = listen.listenFor(["home"], { timeoutMs: 5000 });
    await flush();
    latest().hear(["phone", "comb", "Home"], true);
    await expect(p).resolves.toEqual({ status: "match", heard: "Home" });
  });

  it("accepts a test function", async () => {
    const p = listen.listenFor((h) => listen.parseNumber(h) === 4, { timeoutMs: 5000 });
    await flush();
    latest().hear(["number for"], false);
    await expect(p).resolves.toEqual({ status: "match", heard: "number for" });
  });

  it("a final result that does not match is nomatch with what was heard", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().hear(["dog", "doug"], true);
    await expect(p).resolves.toEqual({ status: "nomatch", heard: "dog" });
  });

  it("passes interim text along", async () => {
    const seen: string[] = [];
    const p = listen.listenFor(["home"], { timeoutMs: 5000, onInterim: (h) => seen.push(h) });
    await flush();
    latest().hear(["ho"], false);
    latest().hear(["home"], false);
    await p;
    expect(seen).toEqual(["ho", "home"]);
  });

  it("is silence when nothing is heard before the time runs out", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    await vi.advanceTimersByTimeAsync(4999);
    expect(latest().aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toEqual({ status: "silence" });
    expect(latest().aborted).toBe(true);
  });

  it("is nomatch with the interim text when something was heard but never finished", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().hear(["dough"], false);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ status: "nomatch", heard: "dough" });
  });

  it("maps no-speech to silence", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().fail("no-speech");
    await expect(p).resolves.toEqual({ status: "silence" });
  });

  it("remembers a refused microphone for the session and never asks again", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().fail("not-allowed");
    await expect(p).resolves.toEqual({ status: "unavailable", reason: "denied" });
    expect(listen.canListen()).toBe(false);
    const count = FakeRecognizer.instances.length;
    await expect(listen.listenFor(["go"], { timeoutMs: 5000 })).resolves.toEqual({ status: "unavailable", reason: "denied" });
    expect(FakeRecognizer.instances.length).toBe(count);
  });

  it("treats service-not-allowed as refused too", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().fail("service-not-allowed");
    await expect(p).resolves.toEqual({ status: "unavailable", reason: "denied" });
    expect(listen.canListen()).toBe(false);
  });

  it.each(["audio-capture", "network"])("reports %s as an error, and tries again next time", async (error) => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().fail(error);
    await expect(p).resolves.toEqual({ status: "unavailable", reason: "error" });
    expect(listen.canListen()).toBe(true);
    const again = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    latest().hear(["go"], true);
    await expect(again).resolves.toEqual({ status: "match", heard: "go" });
  });

  it("restarts once when the engine stops early, inside the same window", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    const rec = latest();
    await vi.advanceTimersByTimeAsync(1000);
    rec.stopOnItsOwn();
    expect(rec.starts).toBe(2);
    await flush();
    rec.hear(["go"], false);
    await expect(p).resolves.toEqual({ status: "match", heard: "go" });
  });

  it("only restarts once", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    const rec = latest();
    rec.stopOnItsOwn();
    await flush();
    rec.stopOnItsOwn();
    await expect(p).resolves.toEqual({ status: "silence" });
    expect(rec.starts).toBe(2);
  });

  it("the restart does not extend the window", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    await vi.advanceTimersByTimeAsync(3000);
    latest().stopOnItsOwn();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(p).resolves.toEqual({ status: "silence" });
  });

  it("a new listen stops the previous one, which resolves silence", async () => {
    const first = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    const firstRec = latest();
    const second = listen.listenFor(["home"], { timeoutMs: 5000 });
    await expect(first).resolves.toEqual({ status: "silence" });
    expect(firstRec.aborted).toBe(true);
    await flush();
    expect(FakeRecognizer.instances.length).toBe(2);
    latest().hear(["home"], true);
    await expect(second).resolves.toEqual({ status: "match", heard: "home" });
  });

  it("stops on an abort signal", async () => {
    const stop = new AbortController();
    const p = listen.listenFor(["go"], { timeoutMs: 5000, signal: stop.signal });
    await flush();
    stop.abort();
    await expect(p).resolves.toEqual({ status: "silence" });
    expect(latest().aborted).toBe(true);
  });

  it("an already aborted signal never starts the microphone", async () => {
    const stop = new AbortController();
    stop.abort();
    await expect(listen.listenFor(["go"], { timeoutMs: 5000, signal: stop.signal })).resolves.toEqual({ status: "silence" });
    await flush();
    expect(FakeRecognizer.instances.length).toBe(0);
  });

  it("ignores late events once it has answered", async () => {
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    const rec = latest();
    rec.hear(["go"], false);
    await expect(p).resolves.toEqual({ status: "match", heard: "go" });
    expect(rec.onresult).toBeNull();
    expect(rec.onerror).toBeNull();
  });

  it("prefers on-device recognition when the browser has it", async () => {
    const available = vi.fn(async () => "available");
    FakeClass.available = available;
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    expect(available).toHaveBeenCalledWith({ langs: ["en-US"], processLocally: true });
    expect(latest().processLocally).toBe(true);
    listen.stopListening();
    await p;
  });

  it("stays with the default engine when on-device is not ready", async () => {
    FakeClass.available = async () => "downloadable";
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await flush();
    expect(latest().processLocally).toBe(false);
    listen.stopListening();
    await p;
  });

  it("waits no more than 300ms to hear about on-device", async () => {
    FakeClass.available = () => new Promise<string>(() => {});
    const p = listen.listenFor(["go"], { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(299);
    expect(latest().starts).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(latest().starts).toBe(1);
    expect(latest().processLocally).toBe(false);
    listen.stopListening();
    await p;
  });

  it("never listens on an insecure page", async () => {
    vi.stubGlobal("window", { isSecureContext: false, webkitSpeechRecognition: FakeClass });
    expect(listen.canListen()).toBe(false);
    await expect(listen.listenFor(["go"], { timeoutMs: 5000 })).resolves.toEqual({ status: "unavailable", reason: "unsupported" });
  });
});

describe("parseLastNumber", () => {
  it.each([
    ["four", 4],
    ["one two three four", 4],
    ["one, two, three, four, five!", 5],
    ["I want to say four", 4],
    ["4 planets", 4],
    ["it's for", 4],
    ["to", 2],
    ["", null],
    ["lots", null],
  ])("%s -> %s", (heard, n) => {
    expect(parseLastNumber(heard)).toBe(n);
  });
});

describe("tighter matching (review)", () => {
  it.each(["good", "gold", "goat", "got", "gone"])("does not read %j as GO", (heard) => {
    expect(matchesWord(heard, "go")).toBe(false);
  });
  it.each(["hope", "hole", "hose", "hoe", "hone"])("does not read %j as HOME", (heard) => {
    expect(matchesWord(heard, "home")).toBe(false);
  });
  it.each(["hom", "homes", "homey", "hume", "hoome"])("still accepts %j as HOME", (heard) => {
    expect(matchesWord(heard, "home", ["hume"])).toBe(true);
  });
  it("counts on through a soundalike at the end of a count", () => {
    expect(parseLastNumber("one two three for")).toBe(4);
    expect(parseLastNumber("one, two, three, four, fife")).toBe(5);
    expect(parseLastNumber("three to")).toBe(3);
  });
  it("hears yes, but not a sentence with no or not in it", () => {
    const accept = ["yes", "yeah", "sure", "ok", "okay", "i will", "uh huh"];
    for (const h of ["yes", "yeah!", "sure", "I will", "okay book"]) expect(isYes(h, accept)).toBe(true);
    for (const h of ["I'm not sure", "no I will not", "not okay", "no", "nope", "I don't know"]) expect(isYes(h, accept)).toBe(false);
  });
});
