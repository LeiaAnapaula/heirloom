/**
 * Listening, behind one small interface. Screens ask "did the child say this?" and get
 * an outcome back; they never see which speech engine answered. Today it is the
 * browser's Web Speech API. Later it can be Whisper or Deepgram without touching a screen.
 *
 * Privacy: we never record or store audio. Speech becomes text in the browser, the text
 * is matched, and then it is discarded. Browser speech services may send the audio to
 * the browser vendor to be transcribed (Chrome does), so we ask for on-device
 * recognition whenever the browser offers it.
 *
 * The matching helpers at the bottom are pure and run anywhere (the tests run them in
 * Node). Only listenFor touches the browser, and only when it is called.
 */

export type ListenOutcome =
  | { status: "match"; heard: string }
  | { status: "nomatch"; heard: string }
  | { status: "silence" }
  | { status: "unavailable"; reason: "unsupported" | "denied" | "error" };

export type ListenOptions = {
  /** How long to listen once the microphone is open. */
  timeoutMs: number;
  /** Called with what the recognizer thinks it heard so far, on every result. */
  onInterim?: (heard: string) => void;
  /** Aborting it stops listening, like stopListening(). Resolves "silence". */
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

// Just the parts of the Web Speech API we use. TypeScript's DOM types do not ship the
// recognizer itself, and Safari only has the webkit-prefixed one.
type Alternative = { readonly transcript: string };
type Result = { readonly isFinal: boolean; readonly length: number; readonly [i: number]: Alternative };
type ResultList = { readonly length: number; readonly [i: number]: Result };
type Recognizer = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  processLocally?: boolean;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
type RecognizerClass = {
  new (): Recognizer;
  available?: (options: { langs: string[]; processLocally: boolean }) => Promise<string>;
};

const ON_DEVICE_WAIT_MS = 300; // never hold a child up longer than this to ask about on-device
const SHUTDOWN_WAIT_MS = 250; // how long a new listen waits for the old recognizer to let go
const PROMPT_GRACE_MS = 12000; // room for a grown-up to answer the microphone prompt
const RESTART_MIN_MS = 400; // not worth restarting a recognizer with less time than this left

let current: { end: (outcome: ListenOutcome) => void } | null = null;
let lastShutdown: Promise<void> = Promise.resolve();
let denied = false; // the microphone was refused: remembered so we never ask twice in a session
let onDeviceCheck: Promise<boolean> | null = null;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function engine(): RecognizerClass | null {
  if (typeof window === "undefined") return null;
  // Microphones only work on https or localhost; a plain-http LAN address can never listen.
  if (window.isSecureContext === false) return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * True when this browser can listen right now. False on the server, in browsers without
 * speech recognition, and once the microphone has been refused this session.
 * Screens use it to show tap mode straight away instead of waiting for a failure.
 */
export function canListen(): boolean {
  return engine() !== null && !denied;
}

/** Stop whatever is listening. Its listenFor resolves "silence". Safe to call any time. */
export function stopListening(): void {
  current?.end({ status: "silence" });
}

/**
 * Listen for one short answer.
 *
 * `expected` is a list of words (any one matches, via matchesWord) or your own test of
 * the transcript. Every alternative the recognizer offers is tested on every result,
 * interim ones included, so "go" matches the instant it is heard.
 *
 * Resolves, never rejects:
 * - "match" as soon as anything matches
 * - "nomatch" with the best transcript when the recognizer is sure and nothing matched,
 *   or when time runs out after hearing something
 * - "silence" when nothing was heard in time, or when stopped
 * - "unavailable" when there is no engine, the microphone was refused, or it failed
 *
 * Only one recognizer runs at a time: starting a new listen stops the previous one.
 */
export function listenFor(expected: string[] | ((heard: string) => boolean), opts: ListenOptions): Promise<ListenOutcome> {
  const Engine = engine();
  if (!Engine) return Promise.resolve({ status: "unavailable", reason: "unsupported" });
  if (denied) return Promise.resolve({ status: "unavailable", reason: "denied" });

  stopListening();
  const { signal, timeoutMs } = opts;
  if (signal?.aborted) return Promise.resolve({ status: "silence" });

  const test = typeof expected === "function" ? expected : (heard: string) => expected.some((w) => matchesWord(heard, w));
  const matches = (heard: string) => {
    try {
      return test(heard);
    } catch {
      return false;
    }
  };

  return new Promise<ListenOutcome>((resolve) => {
    let rec: Recognizer | null = null;
    let done = false;
    let ended = false; // the recognizer fired onend by itself
    let restarted = false;
    let heard = ""; // the latest transcript, interim or final
    let deadline = 0; // when the listening window closes; 0 until the microphone opens
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    let capTimer: ReturnType<typeof setTimeout> | undefined;

    const quiet = (): ListenOutcome => (heard ? { status: "nomatch", heard } : { status: "silence" });

    const end = (outcome: ListenOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(windowTimer);
      clearTimeout(capTimer);
      signal?.removeEventListener("abort", onAbort);
      if (current === session) current = null;
      if (rec) lastShutdown = shutDown(rec, ended);
      resolve(outcome);
    };
    const session = { end };
    const onAbort = () => end({ status: "silence" });
    current = session;
    signal?.addEventListener("abort", onAbort, { once: true });

    // The window starts when the microphone actually opens, not when we ask for it,
    // so time spent on a permission prompt is not counted against the child.
    const openWindow = () => {
      if (done || deadline) return;
      clearTimeout(capTimer);
      deadline = Date.now() + timeoutMs;
      windowTimer = setTimeout(() => end(quiet()), timeoutMs);
    };

    void (async () => {
      await lastShutdown;
      if (done) return;

      let r: Recognizer;
      try {
        r = new Engine();
        r.lang = "en-US";
        r.interimResults = true;
        r.maxAlternatives = 5;
        r.continuous = false;
      } catch {
        return end({ status: "unavailable", reason: "unsupported" });
      }
      await preferOnDevice(Engine, r);
      if (done) return;

      r.onstart = openWindow;
      r.onaudiostart = openWindow;

      r.onresult = (e) => {
        openWindow(); // in case this engine never said it started
        const tops: string[] = [];
        const candidates: string[] = [];
        let final = e.results.length > 0;
        for (let i = 0; i < e.results.length; i++) {
          const result = e.results[i];
          if (!result.isFinal) final = false;
          for (let j = 0; j < result.length; j++) {
            const text = result[j].transcript.trim();
            if (j === 0) tops.push(text);
            if (text) candidates.push(text);
          }
        }
        // Chrome can split one short utterance across results, so also test them joined.
        const joined = tops.join(" ").replace(/\s+/g, " ").trim();
        if (joined) {
          heard = joined;
          try {
            opts.onInterim?.(joined);
          } catch {
            // a listener's mistake must not stop the listening
          }
        }
        for (const text of [joined, ...candidates]) {
          if (text && matches(text)) return end({ status: "match", heard: text });
        }
        if (final) end(quiet());
      };

      r.onerror = (e) => {
        switch (e.error) {
          case "no-speech":
          case "aborted":
            return end(quiet());
          case "not-allowed":
          case "service-not-allowed":
            denied = true;
            return end({ status: "unavailable", reason: "denied" });
          default: // "audio-capture", "network", "language-not-supported", ...
            return end({ status: "unavailable", reason: "error" });
        }
      };

      r.onend = () => {
        if (done) return;
        // Safari sometimes stops on its own after a moment. Give it one more go
        // inside the same window before deciding the child said nothing.
        const left = deadline ? deadline - Date.now() : timeoutMs;
        if (!heard && !restarted && left > RESTART_MIN_MS) {
          restarted = true;
          try {
            r.start();
            return;
          } catch {
            // could not restart; fall through
          }
        }
        ended = true;
        end(quiet());
      };

      rec = r;
      try {
        r.start();
      } catch {
        return end({ status: "unavailable", reason: "error" });
      }
      // If the microphone never opens (a prompt nobody answers), still move on.
      capTimer = setTimeout(() => end(quiet()), timeoutMs + PROMPT_GRACE_MS);
    })();
  });
}

/** Detach, abort, and resolve once the recognizer has let go of the microphone (or soon). */
function shutDown(rec: Recognizer, alreadyEnded: boolean): Promise<void> {
  rec.onstart = null;
  rec.onaudiostart = null;
  rec.onresult = null;
  rec.onerror = null;
  if (alreadyEnded) {
    rec.onend = null;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, SHUTDOWN_WAIT_MS);
    rec.onend = () => {
      clearTimeout(timer);
      resolve();
    };
    try {
      rec.abort();
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

/**
 * Ask for on-device recognition when the browser can do it, so audio stays on the device.
 * Feature-detected, asked once per session, and never waited on for more than 300ms.
 */
async function preferOnDevice(Engine: RecognizerClass, rec: Recognizer): Promise<void> {
  if (!("processLocally" in rec) || typeof Engine.available !== "function") return;
  if (!onDeviceCheck) {
    try {
      onDeviceCheck = Engine.available({ langs: ["en-US"], processLocally: true }).then(
        (status) => status === "available",
        () => false,
      );
    } catch {
      onDeviceCheck = Promise.resolve(false);
    }
  }
  const local = await Promise.race([onDeviceCheck, wait(ON_DEVICE_WAIT_MS).then(() => false)]);
  if (!local) return;
  try {
    rec.processLocally = true;
  } catch {
    // older engines may refuse; the cloud service still works
  }
}

// ---------------------------------------------------------------------------
// Matching (pure)
// ---------------------------------------------------------------------------

/** Lowercase, no accents, no punctuation, single spaces: "It's GO!" becomes "its go". */
export function normalizeSpeech(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "gooo" becomes "go", "hoooome" becomes "home". */
function unstretch(s: string): string {
  return s.replace(/(.)\1+/g, "$1");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Close enough to a single-token word, the way a young reader or a recognizer gets it wrong. */
function nearWord(token: string, word: string): boolean {
  if (word.length === 2) {
    // "goh", "gow", "goes": short tokens that begin with the word
    return token.length <= 4 && token.startsWith(word);
  }
  // "hom", "homes", "hume": one letter off, with the same first sound
  return word.length >= 3 && token[0] === word[0] && levenshtein(token, word) <= 1;
}

/**
 * Did the child say `word`? Generous on purpose, because young readers stretch, clip and
 * mumble, and recognizers mishear them. `accept` lists extra spellings that count
 * exactly (from the episode data, e.g. "goh" for "go").
 *
 * True when the whole phrase or any token equals the word or an accept entry, a stretched
 * token does ("gooo"), a 3+ letter word is one letter off with the same first letter
 * ("hom", "homes"), or a 2-letter word starts a token of up to 4 letters ("goh").
 * False for "no", "so", "dog", "hello", "phone", "hum", "comb", and "".
 */
export function matchesWord(heard: string, word: string, accept: string[] = []): boolean {
  const said = normalizeSpeech(heard);
  const target = normalizeSpeech(word);
  if (!said || !target) return false;

  const exact = [target, ...accept.map(normalizeSpeech)].filter(Boolean);
  const padded = ` ${said} `;
  if (exact.some((t) => padded.includes(` ${t} `))) return true;

  const stretched = new Set(exact.map(unstretch));
  const fuzzy = !target.includes(" ");
  for (const token of said.split(" ")) {
    const flat = unstretch(token);
    if (stretched.has(flat)) return true;
    if (fuzzy && (nearWord(token, target) || nearWord(flat, target))) return true;
  }
  return false;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

// What recognizers write when a child says a number on its own.
const NUMBER_SOUNDALIKES: Record<string, number> = {
  won: 1,
  wun: 1,
  to: 2,
  too: 2,
  tu: 2,
  tree: 3,
  free: 3,
  for: 4,
  fore: 4,
  fower: 4,
  fife: 5,
  sicks: 6,
  sics: 6,
  sevin: 7,
  ate: 8,
  ait: 8,
  nein: 9,
};

/**
 * The first number from 1 to 10 in what the child said, as digits or words:
 * "4", "four", "number four", "it's five", "4 planets". Soundalikes count ("for" is 4,
 * "to" is 2) but only when no real number was said, so "I want to say four" is 4.
 * Null when there is no number.
 */
/**
 * The last number in a phrase. A child counting out loud ("one, two, three, four!") means
 * the last one, and an answer can arrive after filler ("I want to say four"). Real number
 * words beat soundalikes, so "to" in that sentence does not count as 2.
 */
export function parseLastNumber(heard: string): number | null {
  const tokens = normalizeSpeech(heard).match(/\d+|[a-z]+/g) ?? [];
  let real: number | null = null;
  let alike: number | null = null;
  for (const t of tokens) {
    const n = /^\d+$/.test(t) ? Number(t) : NUMBER_WORDS[t];
    if (n !== undefined && n >= 1 && n <= 10) real = n;
    else if (t in NUMBER_SOUNDALIKES) alike = NUMBER_SOUNDALIKES[t];
  }
  return real ?? alike;
}

export function parseNumber(heard: string): number | null {
  const tokens = normalizeSpeech(heard).match(/\d+|[a-z]+/g) ?? [];
  for (const t of tokens) {
    const n = /^\d+$/.test(t) ? Number(t) : NUMBER_WORDS[t];
    if (n !== undefined && n >= 1 && n <= 10) return n;
  }
  for (const t of tokens) {
    if (t in NUMBER_SOUNDALIKES) return NUMBER_SOUNDALIKES[t];
  }
  return null;
}
