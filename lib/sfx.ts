import type { Screen } from "./episode";

/**
 * The book's little sounds: a rocket rumble, magic sparkle, page turns, a success chime,
 * a tiny ding that says "I'm listening", and a whoosh. The wavs in public/sfx are made
 * from scratch by `npm run sfx` (scripts/make-sfx.mjs).
 *
 * Effects play through Web Audio, so they layer over the narrator and over each other
 * without cutting anything off, at a gentle volume that keeps the voice on top. Where Web
 * Audio is missing, a plain audio element plays the file instead.
 *
 * Fire and forget: nothing here throws, waits, or holds the story up. A sound that cannot
 * start promptly is skipped, never played late. It only plays; nothing here listens or records.
 * Safe to import on the server: nothing touches window until a function runs in the browser.
 */

export type SfxName = "rumble" | "sparkle" | "page-turn" | "chime" | "listen" | "whoosh";
export type SfxOptions = {
  /** 0..1. Defaults to about 0.45, under the narrator, who plays at full volume. */
  volume?: number;
};

export const SFX_NAMES: readonly SfxName[] = ["rumble", "sparkle", "page-turn", "chime", "listen", "whoosh"];

const DEFAULT_VOLUME = 0.45;
// Every file peaks at the same level, but a pure ding sounds louder than a soft rumble.
// These even them out by ear, on top of the volume asked for.
const TRIM: Record<SfxName, number> = {
  rumble: 1,
  sparkle: 0.7,
  "page-turn": 0.8,
  chime: 0.75,
  listen: 0.55,
  whoosh: 0.85,
};
const LATE_MS = 1200; // a sound still not ready by then is skipped: late is worse than silent
const REPEAT_MS = 80; // the same sound asked for twice this close (a double render) plays once
const MUTE_FADE_S = 0.04; // muting fades this fast, so a long rumble never clicks off
const FILE_RATE = 44100; // what make-sfx writes, so decoding before the first tap needs no resampling

type Effect = NonNullable<Screen["onSuccess"]["effect"]>;
type LiveClass = new () => AudioContext;
type OfflineClass = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
type AudioWindow = {
  AudioContext?: LiveClass;
  webkitAudioContext?: LiveClass;
  OfflineAudioContext?: OfflineClass;
  webkitOfflineAudioContext?: OfflineClass;
};

let live: AudioContext | null = null;
let master: GainNode | null = null; // every sound goes through this, so mute is one fade
let liveFailed = false; // the browser refused us a context: audio elements from now on
let offline: OfflineAudioContext | null = null; // decodes before the first tap
let muted = false;
let preloading: Promise<void> | null = null;

const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<AudioBuffer | null>>();
const lastAsked = new Map<SfxName, number>();
const warmed = new Map<SfxName, HTMLAudioElement>(); // fallback only: keeps the files cached
const sounding = new Set<HTMLAudioElement>(); // fallback only: so mute can hush them

const inBrowser = () => typeof window !== "undefined";
const audioWindow = () => window as unknown as AudioWindow;
const fileUrl = (name: SfxName) => `/sfx/${name}.wav`;

/**
 * Call synchronously inside a tap handler (the "Open the book" or "Yes!" tap), next to
 * unlockAudio(). Phones only let a page make sound after a tap; this wakes the sound
 * engine with that tap and starts loading every effect. Safe to call on every tap.
 */
export function unlockSfx(): void {
  if (!inBrowser()) return;
  try {
    const c = liveContext();
    if (!c) return;
    if (c.state !== "running") {
      // Older iOS only wakes Web Audio once a sound starts inside the tap: one silent sample.
      const blank = c.createBufferSource();
      blank.buffer = c.createBuffer(1, 1, c.sampleRate);
      blank.connect(c.destination);
      blank.start(0);
      void Promise.resolve(c.resume()).catch(() => {});
    }
    void preloadSfx();
  } catch {
    // Unlocking is a courtesy. playSfx still tries, and the story never waits on a sound.
  }
}

/**
 * Fetch and decode every effect so the first play is instant. Fine to call before any tap
 * (on mount, say). Never rejects; if something fails, a later call or play tries again.
 */
export function preloadSfx(): Promise<void> {
  if (!inBrowser()) return Promise.resolve();
  if (!hasWebAudio()) {
    for (const name of SFX_NAMES) warm(name);
    return Promise.resolve();
  }
  preloading ??= Promise.all(SFX_NAMES.map((name) => load(name))).then((got) => {
    if (got.some((buffer) => !buffer)) preloading = null;
  });
  return preloading;
}

/**
 * Play one effect. Overlaps anything already sounding, never interrupts the narrator,
 * and returns at once. Decodes on demand if preloadSfx has not finished.
 */
export function playSfx(name: SfxName, opts: SfxOptions = {}): void {
  if (!inBrowser() || muted) return;
  try {
    const asked = Date.now();
    const before = lastAsked.get(name);
    if (before !== undefined && asked - before < REPEAT_MS) return;
    lastAsked.set(name, asked);
    const volume = level(name, opts.volume);
    if (volume <= 0) return;

    const c = liveContext();
    if (!c) {
      playElement(name, volume);
      return;
    }
    const ready = buffers.get(name);
    if (ready && c.state === "running") {
      start(c, ready, volume);
      return;
    }
    // Still decoding, or the engine is still waking: start the moment both are ready,
    // unless that is too late to still match what the child saw.
    const deadline = asked + LATE_MS;
    Promise.all([load(name), wake(c, deadline)])
      .then(([buffer, awake]) => {
        if (muted || Date.now() > deadline) return;
        if (buffer && awake) start(c, buffer, volume);
        else if (!buffer) playElement(name, volume);
      })
      .catch(() => {});
  } catch {
    // A sound effect is never worth an error.
  }
}

/** Silence every effect (fading out any that are playing), or let them play again. */
export function setSfxMuted(value: boolean): void {
  muted = value;
  if (!inBrowser()) return;
  try {
    if (live && master) {
      const gain = master.gain;
      const target = value ? 0 : 1;
      const now = live.currentTime;
      gain.cancelScheduledValues(now);
      if (live.state === "running") {
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(target, now + MUTE_FADE_S);
      } else {
        gain.value = target;
      }
    }
    if (value) {
      for (const audio of sounding) audio.pause();
      sounding.clear();
    }
  } catch {
    // Muting is best effort; `muted` already stops every new sound.
  }
}

// The page turn belongs to every turn, so the "turn" effect adds nothing of its own.
// The feather falls in a hush while the narrator explains.
const EFFECT_SFX: Record<Effect, SfxName | null> = {
  turn: null,
  liftoff: "rumble",
  swoop: "whoosh",
  sparkle: "sparkle",
  fall: null,
  home: "sparkle",
};

/** The sound that goes with a screen's success effect, or null when it has none. */
export function sfxForEffect(effect: Effect | undefined): SfxName | null {
  return effect ? EFFECT_SFX[effect] : null;
}

// The engine

function hasWebAudio(): boolean {
  const w = audioWindow();
  return !liveFailed && Boolean(w.AudioContext ?? w.webkitAudioContext);
}

/** The one live AudioContext, made on first need. Null without Web Audio. */
function liveContext(): AudioContext | null {
  if (live || liveFailed || !inBrowser()) return live;
  const w = audioWindow();
  const Live = w.AudioContext ?? w.webkitAudioContext;
  if (!Live) return null;
  try {
    live = new Live();
    master = live.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(live.destination);
  } catch {
    live = null;
    master = null;
    liveFailed = true;
  }
  return live;
}

/**
 * Where to decode: the live context once there is one, and before that an offline one,
 * so preloading on mount never starts a live context the browser would refuse before a tap.
 * A buffer decoded offline plays in the live context just the same.
 */
function decoder(): BaseAudioContext | null {
  if (live) return live;
  if (!offline) {
    const w = audioWindow();
    const Offline = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
    try {
      if (Offline) offline = new Offline(1, 1, FILE_RATE);
    } catch {
      offline = null;
    }
  }
  return offline ?? liveContext();
}

/** decodeAudioData as a promise. Older Safari only answers through the callbacks. */
function decode(c: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const answer = c.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
    answer?.then(resolve, reject);
  });
}

/** Fetch and decode one sound, once. A failure is forgotten so a later play can try again. */
function load(name: SfxName): Promise<AudioBuffer | null> {
  const ready = buffers.get(name);
  if (ready) return Promise.resolve(ready);
  const pending = loading.get(name);
  if (pending) return pending;
  const c = decoder();
  if (!c) return Promise.resolve(null);
  const next = fetch(fileUrl(name))
    .then((res) => {
      if (!res.ok) throw new Error(`sfx ${name}: ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => decode(c, data))
    .then((buffer) => {
      buffers.set(name, buffer);
      return buffer;
    })
    .catch(() => null)
    .finally(() => loading.delete(name));
  loading.set(name, next);
  return next;
}

/** True once the live context is running; false if it still is not by the deadline. */
function wake(c: AudioContext, deadline: number): Promise<boolean> {
  if (c.state === "running") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const settle = () => {
      clearTimeout(timer);
      resolve(c.state === "running");
    };
    const timer = setTimeout(settle, Math.max(0, deadline - Date.now()));
    // Before any tap, Chrome leaves this pending and Safari may refuse. The timer answers either way.
    try {
      Promise.resolve(c.resume()).then(settle, settle);
    } catch {
      settle();
    }
  });
}

function level(name: SfxName, volume: number | undefined): number {
  const v = volume === undefined || !Number.isFinite(volume) ? DEFAULT_VOLUME : Math.min(1, Math.max(0, volume));
  return v * TRIM[name];
}

function start(c: AudioContext, buffer: AudioBuffer, volume: number): void {
  if (!master) return;
  const source = c.createBufferSource();
  const gain = c.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(master);
  source.onended = () => {
    source.disconnect();
    gain.disconnect();
  };
  source.start(0);
}

// The fallback, for browsers without Web Audio

function warm(name: SfxName): void {
  if (warmed.has(name)) return;
  try {
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = fileUrl(name);
    audio.load();
    warmed.set(name, audio);
  } catch {
    // Warming is only a head start.
  }
}

/** A fresh element per play, so effects can still overlap. */
function playElement(name: SfxName, volume: number): void {
  if (muted) return;
  try {
    const audio = new Audio(fileUrl(name));
    audio.volume = Math.min(1, volume);
    const done = () => {
      sounding.delete(audio);
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    sounding.add(audio);
    const started = audio.play() as Promise<void> | undefined;
    started?.catch(done);
  } catch {
    // No sound this time; the story carries on.
  }
}
