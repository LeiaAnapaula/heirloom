import { textHash } from "./hash";

/**
 * The narrator. One soft, steady voice reads every line while the caption follows word by word.
 *
 * For each line it tries, in order:
 *   1. a pre-made mp3 in public/audio, listed in manifest.json (instant and free; `npm run audio`),
 *   2. /api/narrate, which asks ElevenLabs on the server and caches the answer on disk,
 *   3. the browser's own speechSynthesis voice, so the book still reads aloud with no keys at all.
 *
 * It only ever speaks. Nothing here listens, records, or stores audio.
 * Safe to import on the server: nothing touches window until a function runs in the browser.
 */

export type Speakable = { id: string; text: string; say?: string };
export type PlayOptions = { onWord?: (index: number) => void };

type Source = "cached" | "elevenlabs" | "browser" | "unknown";
type Entry = { file: string; hash: string };

const RATE = 0.9;
const PITCH = 1.05;

// One narrator for the whole session: the first of these the device has wins.
const PREFERRED_VOICES = [
  "Ava (Premium)",
  "Ava (Enhanced)",
  "Zoe (Premium)",
  "Samantha (Enhanced)",
  "Ava",
  "Samantha",
  "Karen",
  "Moira",
  "Serena",
  "Google UK English Female",
  "Google US English",
  "Microsoft Aria",
  "Microsoft Jenny",
];

// Joke voices some systems list as English. Never the narrator, even as a last resort.
const NOVELTY =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|junior|organ|pipe organ|ralph|superstar|trinoids|whisper|wobble|zarvox)\b/i;

// A breath of silence, played inside the first tap so iOS lets the shared element speak later.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRoQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YWAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIA=";

let manifest: Promise<Map<string, Entry>> | null = null;
let serverVoice = true; // false once /api/narrate says no (no key, or broken), for the rest of the session
const serverAudio = new Map<string, Promise<string | null>>(); // spoken text to blob URL
const warmed = new Map<string, HTMLAudioElement>();
let warmChain: Promise<unknown> = Promise.resolve();

// iOS only lets an element play without a tap if a tap started it once, so every line reuses this one.
let shared: HTMLAudioElement | null = null;
// Held here so Chrome cannot garbage-collect a speaking utterance and drop its end event.
let utterance: SpeechSynthesisUtterance | null = null;
// The silent unlock utterance. Cancelling it in the same tap could undo the unlock on iOS.
let hushing: SpeechSynthesisUtterance | null = null;
let chosenVoice: Promise<SpeechSynthesisVoice | null> | null = null;

let source: Source = "unknown";
let audioUnlocked = false;
let speechUnlocked = false;

// Every play() takes a turn. stop() ends the turn, which resolves that play() at once.
let turn = 0;
let halt: (() => void) | null = null;

const inBrowser = () => typeof window !== "undefined";
const synth = () => (inBrowser() && "speechSynthesis" in window ? window.speechSynthesis : null);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Display words, split exactly as the caption splits them, so indexes line up. */
const words = (text: string) => text.split(/\s+/);

/** Rough speaking time of a word: a beat, its letters, and a breath after punctuation. */
function weight(word: string): number {
  const letters = word.replace(/[^a-z0-9]/gi, "").length;
  const pause = /[.!?…]["')\]]*$/.test(word) ? 2 : /[,;:]["')\]]*$/.test(word) ? 1 : 0;
  return 1.5 + letters + pause;
}

/**
 * Which display word is being spoken when the line is `progress` (0..1) of the way through.
 * Long words and pauses after punctuation get more of the time, like a real reader.
 */
export function wordIndexAt(progress: number, text: string): number {
  const list = words(text);
  const p = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  let left = p * list.reduce((sum, w) => sum + weight(w), 0);
  for (let i = 0; i < list.length; i++) {
    left -= weight(list[i]);
    if (left < 0) return i;
  }
  return list.length - 1;
}

/** What spoke the last line: a pre-made file, the ElevenLabs route, the browser voice, or nothing yet. */
export function voiceSource(): Source {
  return source;
}

/**
 * Call synchronously inside a tap handler (the "Open the book" or "Yes!" tap).
 * Phones only let a page make sound after a tap; this spends that tap on a silent sound
 * so every later line can play on its own. Safe to call on every tap.
 */
export function unlockAudio(): void {
  if (!inBrowser()) return;
  try {
    if (!audioUnlocked) {
      const audio = sharedAudio();
      if (!audio.paused) {
        audioUnlocked = true;
      } else {
        audio.src = SILENT_WAV;
        audio.play().then(
          () => {
            audioUnlocked = true;
          },
          (err: unknown) => {
            // Cut short by a real line starting right away: the tap still counted.
            if (err instanceof DOMException && err.name === "AbortError") audioUnlocked = true;
          },
        );
      }
    }
    const s = synth();
    if (s) {
      void chooseVoice(s); // voices load slowly; start now
      if (!speechUnlocked && !s.speaking) {
        const hush = new SpeechSynthesisUtterance(" ");
        hush.volume = 0;
        hush.onend = () => {
          speechUnlocked = true;
          if (hushing === hush) hushing = null;
        };
        hush.onerror = (e) => {
          if (e.error !== "not-allowed") speechUnlocked = true;
          if (hushing === hush) hushing = null;
        };
        hushing = hush;
        s.speak(hush);
      }
    }
    void loadManifest();
  } catch {
    // Unlocking is a courtesy. If it fails, play() still falls back gracefully.
  }
}

/**
 * Speak one line (already name-resolved). `say` is spoken when present, `text` is what the
 * caption shows, and onWord gets the index of the display word being read.
 * Never rejects. Resolves when the line is done, or right away when stop() is called.
 */
export async function play(line: Speakable, opts: PlayOptions = {}): Promise<void> {
  if (!inBrowser()) return;
  stop(); // a new line always replaces the old one
  const mine = turn;
  const live = () => mine === turn;
  const stopped = new Promise<void>((resolve) => {
    halt = resolve;
  });
  const spoken = line.say ?? line.text;
  if (!spoken.trim()) return;

  try {
    const found = await Promise.race([findAudio(line.id, spoken), stopped.then(() => null)]);
    if (!live()) return;
    if (found && (await playFile(found.src, found.from, line.text, opts, stopped))) return;
    if (!live()) return;
    const ms = estimateMs(spoken);
    if (await speak(spoken, line.text, ms, opts, stopped)) return;
    if (!live()) return;
    // Nothing could make a sound (no tap yet, or no voices): keep the words up for reading time.
    await readQuietly(line.text, ms, opts, stopped);
  } catch {
    // The story never waits on a broken voice.
  } finally {
    if (live()) halt = null;
  }
}

/** Hush the narrator now. Any play() in progress resolves. */
export function stop(): void {
  turn++;
  const resolve = halt;
  halt = null;
  resolve?.();
  if (!inBrowser()) return;
  if (shared && !shared.paused) shared.pause();
  const s = synth();
  if (s && (utterance || ((s.speaking || s.pending) && !hushing))) s.cancel();
}

/**
 * Get the next lines ready so they start without a pause: fetch the manifest, let the
 * browser download their mp3s, and ask the server voice (one at a time) for any it lacks.
 */
export function preload(lines: Speakable[]): void {
  if (!inBrowser()) return;
  const list = lines.slice();
  loadManifest()
    .then((entries) => {
      for (const line of list) {
        const spoken = line.say ?? line.text;
        if (!spoken.trim()) continue;
        const entry = entries.get(line.id);
        if (entry && entry.hash === textHash(spoken)) warmFile(`/audio/${entry.file}`);
        else if (serverVoice) warmChain = warmChain.then(() => (serverVoice ? fetchServerAudio(spoken) : null));
      }
    })
    .catch(() => {});
}

// Finding the audio

function loadManifest(): Promise<Map<string, Entry>> {
  // no-cache revalidates, so fresh audio from `npm run audio` is picked up on the next visit.
  manifest ??= fetch("/audio/manifest.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : {}))
    .then(readManifest)
    .catch(() => new Map<string, Entry>());
  return manifest;
}

function readManifest(data: unknown): Map<string, Entry> {
  const out = new Map<string, Entry>();
  if (!data || typeof data !== "object") return out;
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    const v = value as Partial<Entry> | null;
    if (v && typeof v.hash === "string" && typeof v.file === "string" && /^[\w.-]+\.mp3$/.test(v.file)) {
      out.set(id, { file: v.file, hash: v.hash });
    }
  }
  return out;
}

async function findAudio(id: string, spoken: string): Promise<{ src: string; from: Source } | null> {
  // A slow network should cost a child a moment, not the whole line.
  const entries = await Promise.race([loadManifest(), sleep(2500).then(() => new Map<string, Entry>())]);
  const entry = entries.get(id);
  if (entry && entry.hash === textHash(spoken)) return { src: `/audio/${entry.file}`, from: "cached" };
  if (!serverVoice) return null;
  // The request keeps going if it is slow, so the next time this line plays it is ready.
  const src = await Promise.race([fetchServerAudio(spoken), sleep(7000).then(() => null)]);
  return src ? { src, from: "elevenlabs" } : null;
}

function fetchServerAudio(text: string): Promise<string | null> {
  let pending = serverAudio.get(text);
  if (!pending) {
    pending = askServer(text);
    serverAudio.set(text, pending);
  }
  return pending;
}

let serverCheck: Promise<boolean> | null = null;

/** One quiet GET per session: is there a server voice at all? Saves a failed POST per line. */
function serverAvailable(): Promise<boolean> {
  serverCheck ??= fetch("/api/narrate", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { available: false }))
    .then((j: { available?: boolean }) => j.available === true)
    .catch(() => false)
    .then((ok) => {
      if (!ok) serverVoice = false;
      return ok;
    });
  return serverCheck;
}

async function askServer(text: string): Promise<string | null> {
  if (!serverVoice || !(await serverAvailable())) return null;
  try {
    const res = await fetch("/api/narrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok && (res.headers.get("Content-Type") ?? "").startsWith("audio/")) {
      return URL.createObjectURL(await res.blob());
    }
    // 400 is about this one line (too long, say). Anything else (501 no key, 502, a missing
    // route) means there is no server voice today, so stop asking.
    if (res.status !== 400) serverVoice = false;
    return null;
  } catch {
    serverVoice = false;
    return null;
  }
}

function sharedAudio(): HTMLAudioElement {
  if (!shared) {
    shared = new Audio();
    shared.preload = "auto";
    shared.setAttribute("playsinline", "");
  }
  return shared;
}

function warmFile(src: string) {
  if (warmed.has(src)) return;
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = src;
  audio.load();
  warmed.set(src, audio);
  if (warmed.size > 48) {
    const oldest = warmed.keys().next().value;
    if (oldest !== undefined) warmed.delete(oldest);
  }
}

// Playing a file

/** True when the file played (or was stopped). False when it never started, so speech takes over. */
function playFile(src: string, from: Source, text: string, opts: PlayOptions, stopped: Promise<void>): Promise<boolean> {
  const audio = sharedAudio();
  const lastWord = words(text).length - 1;

  return new Promise<boolean>((resolve) => {
    let done = false;
    let started = false;
    let last = -1;
    let raf = 0;
    let watchdog = 0;
    const offs: Array<() => void> = [];

    const emit = (i: number) => {
      if (i > last) {
        last = i;
        opts.onWord?.(i);
      }
    };
    const tick = () => {
      const d = audio.duration;
      if (d > 0 && Number.isFinite(d)) emit(wordIndexAt(audio.currentTime / d, text));
    };
    const loop = () => {
      tick();
      raf = requestAnimationFrame(loop);
    };
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      for (const off of offs) off();
      resolve(ok);
    };
    // Never hang: a file that stalls ends the line; one that never started hands it to speech.
    const arm = (ms: number) => {
      clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        audio.pause();
        finish(started);
      }, ms);
    };
    const on = (type: keyof HTMLMediaElementEventMap, fn: () => void) => {
      audio.addEventListener(type, fn);
      offs.push(() => audio.removeEventListener(type, fn));
    };

    on("playing", () => {
      if (!started) {
        started = true;
        source = from;
      }
      cancelAnimationFrame(raf);
      loop();
    });
    on("timeupdate", tick);
    on("durationchange", () => {
      const d = audio.duration;
      if (d > 0 && Number.isFinite(d)) arm((d - audio.currentTime) * 1000 + 2500);
    });
    on("ended", () => {
      emit(lastWord);
      finish(true);
    });
    on("error", () => finish(started));

    arm(6000 + words(text).length * 600);
    void stopped.then(() => finish(true));
    audio.src = src;
    // NotAllowedError (no tap yet) lands here: let the browser voice try instead.
    audio.play().catch(() => finish(started));
  });
}

// The browser voice

/** About how long the browser voice takes to say this, at our rate. */
function estimateMs(spoken: string): number {
  return Math.max(800, (spoken.match(/\S+/g) ?? []).length * 400);
}

/** True when the voice spoke (or was stopped). False when the browser refused to speak. */
async function speak(spoken: string, text: string, ms: number, opts: PlayOptions, stopped: Promise<void>): Promise<boolean> {
  const s = synth();
  if (!s) return false;
  const mine = turn;
  const voice = await Promise.race([chooseVoice(s), stopped.then(() => null)]);
  if (mine !== turn) return true;
  if (s.speaking || s.pending) {
    s.cancel();
    hushing = null;
    await sleep(60); // Safari can drop a line spoken in the same instant as a cancel
    if (mine !== turn) return true;
  }
  s.resume(); // Chrome can stay paused after the tab was hidden

  const u = new SpeechSynthesisUtterance(spoken);
  if (voice) u.voice = voice;
  u.lang = voice?.lang ?? "en-US";
  u.rate = RATE;
  u.pitch = PITCH;
  u.volume = 1;

  const count = words(text).length;
  const budget = (spoken.match(/\S+/g) ?? []).length * 420 + 1500;

  return new Promise<boolean>((resolve) => {
    let done = false;
    let heard = false; // real word boundaries arrived, so the clock steps aside
    let began = 0;
    let last = -1;
    const t0 = Date.now();
    const ceiling = t0 + budget * 2;

    const emit = (i: number) => {
      if (i > last) {
        last = i;
        opts.onWord?.(i);
      }
    };
    // Safari often sends no word boundaries, so follow along by the clock until real ones arrive.
    const clock = window.setInterval(() => {
      if (heard) return;
      const elapsed = Date.now() - (began || t0 + 300);
      if (elapsed >= 0) emit(wordIndexAt(elapsed / ms, text));
    }, 90);
    // Chrome sometimes never sends onend. If the engine still says it is talking, give it a
    // little longer, but never more than twice the estimate.
    const check = () => {
      if (s.speaking && Date.now() < ceiling) {
        watchdog = window.setTimeout(check, 500);
        return;
      }
      emit(count - 1);
      finish(true);
    };
    let watchdog = window.setTimeout(check, budget);

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearInterval(clock);
      clearTimeout(watchdog);
      if (utterance === u) utterance = null;
      resolve(ok);
    };

    u.onstart = () => {
      began = Date.now();
    };
    u.onboundary = (e) => {
      if (e.name && e.name !== "word") return;
      heard = true;
      emit(displayIndex(e.charIndex, spoken, count));
    };
    u.onend = () => {
      emit(count - 1);
      finish(true);
    };
    u.onerror = (e) => {
      // Interrupted means stopped on purpose. Anything else (not allowed, no voice) is a refusal.
      finish(e.error === "interrupted" || e.error === "canceled");
    };

    void stopped.then(() => finish(true));
    utterance = u;
    source = "browser";
    s.speak(u);
  });
}

/**
 * Map a boundary in the spoken text to a display word. When `say` has as many words as
 * `text` they pair up one to one; otherwise the position is mapped proportionally.
 */
function displayIndex(charIndex: number, spoken: string, count: number): number {
  const starts: number[] = [];
  const re = /\S+/g;
  for (let m = re.exec(spoken); m; m = re.exec(spoken)) starts.push(m.index);
  let k = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= charIndex) k = i;
  if (starts.length === 0 || starts.length === count) return Math.min(k, count - 1);
  return Math.min(count - 1, Math.floor((k * count) / starts.length));
}

/** No sound at all: walk the caption along for about as long as the line would take to say. */
function readQuietly(text: string, ms: number, opts: PlayOptions, stopped: Promise<void>): Promise<void> {
  source = "unknown";
  return new Promise<void>((resolve) => {
    const t0 = Date.now();
    let last = -1;
    let id = 0;
    const done = () => {
      clearInterval(id);
      resolve();
    };
    id = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / ms);
      const i = wordIndexAt(p, text);
      if (i > last) {
        last = i;
        opts.onWord?.(i);
      }
      if (p >= 1) done();
    }, 90);
    void stopped.then(done);
  });
}

/** Choose the narrator once and keep it, so the whole book is one voice. Waits up to ~1s for voices. */
function chooseVoice(s: SpeechSynthesis): Promise<SpeechSynthesisVoice | null> {
  if (chosenVoice) return chosenVoice;
  const attempt = new Promise<SpeechSynthesisVoice | null>((resolve) => {
    const ready = s.getVoices();
    if (ready.length) {
      resolve(pickVoice(ready));
      return;
    }
    let settled = false;
    let timer = 0;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s.removeEventListener("voiceschanged", onChange);
      resolve(pickVoice(s.getVoices()));
    };
    const onChange = () => {
      if (s.getVoices().length) settle();
    };
    s.addEventListener("voiceschanged", onChange);
    timer = window.setTimeout(settle, 1000);
  });
  chosenVoice = attempt;
  // If no voices had arrived at all, ask again next line rather than lock in "none".
  void attempt.then((v) => {
    if (!v && s.getVoices().length === 0 && chosenVoice === attempt) chosenVoice = null;
  });
  return attempt;
}

function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  for (const name of PREFERRED_VOICES) {
    const match = english.find((v) => v.name === name) ?? english.find((v) => v.name.startsWith(`${name} `));
    if (match) return match;
  }
  return english.find((v) => !NOVELTY.test(v.name)) ?? english[0] ?? null;
}
