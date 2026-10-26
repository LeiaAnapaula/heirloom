"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { GRANDPA, MOMENTS, momentOf, type Moment, type MomentId } from "../config";
import { actions, hud, useHud } from "../store";
import { Icon } from "./icons";
import { HudButton, Panel } from "./ui";

/**
 * Grandpa's portrait card: who is telling the story, what he says at the moment
 * the camera is at, and two ways to hear it. "Read this part" reads the current
 * line; "Play the story" is a guided tour that flies to each moment in order and
 * reads it, and steps aside the moment the child takes over.
 *
 * Grandpa's own recording plays when the family made one. Otherwise the device
 * reads it, and the button says "Read it aloud", never that it is his voice.
 */

/** A calm, unhurried device voice. */
const RATE = 0.9;
const PITCH = 0.95;
/** The quiet beat between one part of the story and the next. */
const PAUSE_MS = 700;

type Run = { kind: "idle" } | { kind: "line"; moment: MomentId } | { kind: "tour"; index: number };
const IDLE: Run = { kind: "idle" };

function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

const noSubscribe = () => () => {};

/** About how long a grown-up takes to read the line out loud, for when the device cannot. */
function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(14000, Math.max(2200, words * 400));
}

/** Novelty and robot voices some systems ship. None of them should tell a bedtime story. */
const ODD_VOICES =
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|princess|deranged|hysterical|fred|grandpa|grandma|eddy|flo\b|reed|rocko|sandy|shelley/i;
const CALM_VOICES = ["Daniel", "Arthur", "Aaron", "Google UK English Male", "Microsoft Guy", "Microsoft Ryan", "Alex", "Tom", "Samantha"];

function pickVoice(): SpeechSynthesisVoice | null {
  const english = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en") && !ODD_VOICES.test(v.name));
  if (!english.length) return null;
  for (const name of CALM_VOICES) {
    const v = english.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return english.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? english.find((v) => v.default) ?? english[0];
}

/** One line at a time: Grandpa's recording, else the device voice, else a quiet reading pause. */
function createNarrator() {
  let halt: (() => void) | null = null;
  let audio: HTMLAudioElement | null = null;
  // Held here so the browser cannot tidy the utterance away mid-line (an old Chrome habit).
  let utterance: SpeechSynthesisUtterance | null = null;

  function stop() {
    const h = halt;
    halt = null;
    h?.();
  }

  /** Resolves true when the line was read to the end, false when it was stopped. */
  function say(m: Moment, sound: (on: boolean) => void): Promise<boolean> {
    stop();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const tidy: (() => void)[] = [];
      const silence: (() => void)[] = [];
      const settle = (finished: boolean) => {
        if (settled) return;
        settled = true;
        if (halt === myHalt) halt = null;
        tidy.splice(0).forEach((f) => f());
        sound(false);
        resolve(finished);
      };
      const myHalt = () => {
        silence.splice(0).forEach((f) => f());
        settle(false);
      };
      halt = myHalt;

      const quietly = () => {
        const t = window.setTimeout(() => settle(true), readingMs(m.line));
        tidy.push(() => window.clearTimeout(t));
      };

      const aloud = () => {
        const synth = window.speechSynthesis;
        synth.cancel();
        synth.resume();
        const u = new SpeechSynthesisUtterance(m.line);
        const voice = pickVoice();
        if (voice) {
          u.voice = voice;
          u.lang = voice.lang;
        } else {
          u.lang = "en-US";
        }
        u.rate = RATE;
        u.pitch = PITCH;
        let started = false;
        u.onstart = () => {
          started = true;
        };
        u.onend = () => settle(true);
        // A voice that refuses before it starts (no permission, no voices) becomes a quiet pause instead.
        u.onerror = () => {
          if (settled) return;
          if (started) settle(true);
          else {
            sound(false);
            quietly();
          }
        };
        utterance = u;
        synth.speak(u);
        sound(true);
        // A stuck voice never holds the story up.
        const guard = window.setTimeout(() => settle(true), readingMs(m.line) * 2 + 4000);
        tidy.push(() => {
          window.clearTimeout(guard);
          u.onstart = u.onend = u.onerror = null;
          if (utterance === u) utterance = null;
        });
        silence.push(() => synth.cancel());
      };

      const recording = (src: string) => {
        const el = (audio ??= new Audio());
        const onEnded = () => settle(true);
        const onFail = () => {
          el.removeEventListener("ended", onEnded);
          el.removeEventListener("error", onFail);
          if (settled) return;
          sound(false);
          if (hasSpeech()) aloud();
          else quietly();
        };
        el.addEventListener("ended", onEnded);
        el.addEventListener("error", onFail);
        tidy.push(() => {
          el.removeEventListener("ended", onEnded);
          el.removeEventListener("error", onFail);
        });
        silence.push(() => el.pause());
        el.src = src;
        el.currentTime = 0;
        el.play().then(() => {
          if (!settled) sound(true);
        }, onFail);
      };

      if (m.audio) recording(m.audio);
      else if (hasSpeech()) aloud();
      else quietly();
    });
  }

  return { say, stop };
}

/**
 * Runs whatever is being read: one line, or the whole tour. Lives outside React
 * so the tour's waiting and listening never fight with renders.
 */
function createStoryteller() {
  const narrator = createNarrator();
  let end: (() => void) | null = null;
  let report: (r: Run) => void = () => {};

  function stop() {
    const e = end;
    end = null;
    e?.();
    narrator.stop();
    report(IDLE);
  }

  /** Read the current moment's line. Stops by itself if the camera goes somewhere else. */
  function line(id: MomentId, onRun: (r: Run) => void) {
    stop();
    report = onRun;
    let over = false;
    let unsubscribe = () => {};
    const finish = () => {
      if (over) return;
      over = true;
      unsubscribe();
      if (end === finish) end = null;
      narrator.stop();
      report(IDLE);
    };
    end = finish;
    unsubscribe = hud.subscribe(() => {
      if (hud.get().moment !== id) finish();
    });
    report({ kind: "line", moment: id });
    void narrator.say(momentOf(id), actions.setSpeaking).then(finish);
  }

  /** Fly to each moment in order, read it, rest a beat, go on. */
  function tour(onRun: (r: Run) => void) {
    stop();
    report = onRun;
    unlockSpeech();

    let over = false;
    let phase: "fly" | "read" = "fly";
    let expected: MomentId = MOMENTS[0].id;
    let wake: (() => void) | null = null;
    let timer = 0;
    const nap = () => new Promise<void>((r) => (wake = r));
    const rouse = () => {
      const w = wake;
      wake = null;
      w?.();
    };

    let unsubscribe = () => {};
    const finish = (natural: boolean) => {
      if (over) return;
      over = true;
      unsubscribe();
      window.clearTimeout(timer);
      if (end === halt) end = null;
      narrator.stop();
      rouse();
      report(IDLE);
      if (natural) actions.notify("That was Grandpa's story. Now it's your turn to build!");
    };
    const halt = () => finish(false);
    end = halt;

    // The child takes over by going somewhere the tour did not ask for.
    unsubscribe = hud.subscribe(() => {
      if (over) return;
      const s = hud.get();
      if (phase === "fly") {
        if (!s.flying) {
          if (s.moment === expected) rouse();
          else finish(false);
        }
      } else if (s.flying || s.moment !== expected) {
        finish(false);
      }
    });

    void (async () => {
      for (let i = 0; i < MOMENTS.length; i++) {
        const m = MOMENTS[i];
        expected = m.id;
        phase = "fly";
        report({ kind: "tour", index: i });
        const arrived = nap();
        actions.flyTo(m.id);
        if (!hud.get().flying) return finish(false); // no world to fly through yet
        await arrived;
        if (over) return;
        phase = "read";
        await narrator.say(m, actions.setSpeaking);
        if (over) return;
        const rested = nap();
        timer = window.setTimeout(rouse, PAUSE_MS);
        await rested;
        if (over) return;
      }
      finish(true);
    })();
  }

  function dispose() {
    report = () => {};
    stop();
  }

  return { line, tour, stop, dispose };
}

/** iPhones only let a page speak after a tap. A silent word during the tap opens the way for the tour. */
function unlockSpeech() {
  if (!hasSpeech()) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export default function GrandpaCard() {
  const momentId = useHud((s) => s.moment);
  const speaking = useHud((s) => s.speaking);
  const ready = useHud((s) => s.status === "ready");
  const speech = useSyncExternalStore(noSubscribe, hasSpeech, () => true);
  const [teller] = useState(createStoryteller);
  const [run, setRun] = useState<Run>(IDLE);
  const [open, setOpen] = useState(false); // phones: the chip opens to show the line
  const bodyId = useId();

  useEffect(() => () => teller.dispose(), [teller]);

  // Chrome fills in its voice list a moment after the page starts; ask early so it is there on the first tap.
  useEffect(() => {
    if (!hasSpeech()) return;
    const synth = window.speechSynthesis;
    const warm = () => void synth.getVoices();
    warm();
    synth.addEventListener?.("voiceschanged", warm);
    return () => synth.removeEventListener?.("voiceschanged", warm);
  }, []);

  const moment = momentId ? momentOf(momentId) : null;
  const touring = run.kind === "tour";
  const reading = run.kind === "line";
  const number = moment ? MOMENTS.indexOf(moment) + 1 : 0;
  // Grandpa's recording, the device voice, or nothing to read with.
  const readLabel = moment?.audio ? "Hear Grandpa" : speech ? "Read it aloud" : null;
  const part = touring ? `Part ${run.index + 1} of ${MOMENTS.length}` : null;

  const toggleTour = () => {
    if (touring) return teller.stop();
    setOpen(true);
    teller.tour(setRun);
  };
  const toggleLine = () => {
    if (reading) return teller.stop();
    if (momentId) teller.line(momentId, setRun);
  };

  const playLabel = touring ? "Stop the story" : "Play the story";

  return (
    <Panel
      className={`flex w-full flex-col p-2 max-sm:max-h-[33svh] sm:max-h-[min(62svh,560px)] sm:max-w-[380px] sm:p-4 lg:max-w-none ${open ? "max-sm:pb-3" : ""}`}
      aria-label={`${GRANDPA.name}, telling ${GRANDPA.title}`}
      role="region"
    >
      {/* Phones: a small chip. Tap Grandpa to open his words. */}
      <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl pr-1 text-left"
        >
          <Portrait speaking={speaking} className="h-11 w-11" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[16px] leading-tight font-semibold">{GRANDPA.name}</span>
            <span className="block truncate text-[12.5px] leading-snug font-bold text-pine/65">
              {part ?? moment?.label ?? GRANDPA.title}
            </span>
          </span>
          <Chevron open={open} className="h-5 w-5 shrink-0 text-pine/60" />
          <span className="sr-only">{open ? "Hide Grandpa's words" : "Show Grandpa's words"}</span>
        </button>
        <HudButton primary round onClick={toggleTour} disabled={!ready} aria-label={playLabel}>
          {touring ? <StopIcon className="h-5 w-5" /> : <Icon.play className="h-5 w-5" />}
        </HudButton>
      </div>

      {/* Tablets and computers: the full card. */}
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <Portrait speaking={speaking} className="h-[60px] w-[60px]" />
        <div className="min-w-0">
          <p className="font-display text-[19px] leading-tight font-semibold">{GRANDPA.name}</p>
          <p className="mt-0.5 text-[13px] leading-snug font-bold text-pine/65">Telling: {GRANDPA.title}</p>
        </div>
      </div>

      <div id={bodyId} className={`${open ? "flex" : "hidden"} min-h-0 flex-col sm:flex`}>
        <div className="mt-2.5 min-h-0 overflow-y-auto overscroll-contain sm:mt-3">
          {moment ? (
            <>
              <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-wood">
                <span
                  aria-hidden
                  className="grid h-[20px] w-[20px] place-items-center rounded-full bg-honey text-[11.5px] text-pine shadow-[0_0_0_2px_#fff8e6]"
                >
                  {number}
                </span>
                <span>
                  <span className="sr-only">Part {number}: </span>
                  {moment.label}
                </span>
              </p>
              <blockquote
                className={`mt-1.5 font-display text-[17px] leading-[1.55] text-pine sm:text-[18px] ${speaking ? "text-pine" : "text-pine/95"}`}
                style={{ fontVariationSettings: '"SOFT" 100' }}
              >
                &ldquo;{moment.line}&rdquo;
              </blockquote>
            </>
          ) : (
            <p className="font-display text-[17px] leading-[1.5] sm:text-[18px]" style={{ fontVariationSettings: '"SOFT" 100' }}>
              Tap a number to hear Grandpa&rsquo;s story.
            </p>
          )}
        </div>

        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-2">
          <HudButton primary onClick={toggleTour} disabled={!ready} className="max-sm:hidden">
            {touring ? <StopIcon className="h-5 w-5" /> : <Icon.play className="h-5 w-5" />}
            <span>{touring ? "Stop" : "Play the story"}</span>
            {touring && <span className="sr-only"> the story</span>}
          </HudButton>
          {readLabel && moment && !touring && (
            <HudButton onClick={toggleLine} active={reading}>
              {reading ? <StopIcon className="h-5 w-5" /> : <Icon.speaker className="h-5 w-5" />}
              <span>{reading ? "Stop reading" : readLabel}</span>
            </HudButton>
          )}
          {touring && <TourProgress index={run.index} />}
        </div>
      </div>
    </Panel>
  );
}

/** Which part of the story the tour is on: small dots and "Part 2 of 4". */
function TourProgress({ index }: { index: number }) {
  return (
    <p className="flex min-h-11 items-center gap-2 px-1 text-[13px] font-bold text-pine/70">
      <span aria-hidden className="flex gap-1">
        {MOMENTS.map((m, i) => (
          <span
            key={m.id}
            className={`h-2 w-2 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
              i < index ? "bg-river" : i === index ? "bg-honey shadow-[0_0_0_1.5px_#2c3a32]" : "bg-pine/20"
            }`}
          />
        ))}
      </span>
      <span>
        Part {index + 1} of {MOMENTS.length}
      </span>
    </p>
  );
}

/** Grandpa, drawn small and warm: white hair and mustache under a flat cap, a moss cardigan. */
function Portrait({ className = "", speaking }: { className?: string; speaking: boolean }) {
  return (
    <span aria-hidden className={`relative block shrink-0 ${className}`}>
      {speaking && <span className="absolute -inset-1.5 rounded-full bg-honey/45 motion-safe:animate-pulse" />}
      <span
        className={`relative block h-full w-full overflow-hidden rounded-full border-[3px] bg-[#f6e2b5] transition-colors duration-300 motion-reduce:transition-none ${
          speaking ? "border-honey" : "border-wood"
        }`}
      >
        <svg viewBox="0 0 64 64" className="h-full w-full">
          {/* a soft sky behind him */}
          <circle cx="50" cy="12" r="9" fill="#fff3d6" opacity=".8" />
          {/* cardigan, shirt, buttons */}
          <path d="M5 66c1-13 11-20 27-20s26 7 27 20z" fill="#6f8e5f" />
          <path d="M25 46.5 32 58l7-11.5c-2.2-.6-4.5-.9-7-.9s-4.8.3-7 .9z" fill="#eef1e8" />
          <path d="M25 46.5 32 58M39 46.5 32 58" stroke="#56724a" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="32" cy="61.5" r="1.4" fill="#8a5a3b" />
          {/* neck and ears */}
          <path d="M27.5 40h9v7.5c-1.4 1.3-2.9 2-4.5 2s-3.1-.7-4.5-2z" fill="#d9a07a" />
          <ellipse cx="19.6" cy="32" rx="2.6" ry="3.6" fill="#e5ad88" />
          <ellipse cx="44.4" cy="32" rx="2.6" ry="3.6" fill="#e5ad88" />
          {/* face */}
          <ellipse cx="32" cy="31" rx="12.4" ry="13.6" fill="#ecbd97" />
          {/* white hair at the temples */}
          <path d="M19.4 24.5c-1.6 3-1.6 6.4-.4 9.4l2.6-.6c-.7-2.7-.5-5.6.6-8.3z" fill="#f7f4ee" />
          <path d="M44.6 24.5c1.6 3 1.6 6.4.4 9.4l-2.6-.6c.7-2.7.5-5.6-.6-8.3z" fill="#f7f4ee" />
          {/* flat cap */}
          <path d="M18.6 25.2C17.8 15.6 24.4 10.5 32.6 10.5c8.4 0 14.6 4.6 13.4 13.6-4.6-2.4-21.6-2.8-27.4 1.1z" fill="#8a5a3b" />
          <path d="M17 25.4c5.6-4.4 24.4-4.6 30.4-.9-.6 1.6-2.2 2-4 1.6-6.4-1.5-16.4-1.4-22.6.4-1.7.5-3.2.1-3.8-1.1z" fill="#6b4329" />
          <path d="M24 14.5c3-1.8 8-2.4 12-1.4" stroke="#a8734e" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          {/* kind, smiling eyes under soft white brows */}
          <path d="M23.4 28.6c1.6-1.2 4-1.3 5.6-.2M35 28.4c1.6-1.1 4-1 5.6.2" stroke="#f7f4ee" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M24.4 32.6c1.4-1.5 3.4-1.5 4.8 0M34.8 32.6c1.4-1.5 3.4-1.5 4.8 0" stroke="#2c3a32" strokeWidth="1.7" strokeLinecap="round" fill="none" />
          <path d="M22.6 32.4l-1.3.6M41.4 32.4l1.3.6" stroke="#c98d68" strokeWidth="1" strokeLinecap="round" />
          {/* rosy cheeks and a round nose */}
          <circle cx="24" cy="37.4" r="2.6" fill="#c8574a" opacity=".22" />
          <circle cx="40" cy="37.4" r="2.6" fill="#c8574a" opacity=".22" />
          <ellipse cx="32" cy="36" rx="2.7" ry="2.3" fill="#dc9f7b" />
          {/* a big white mustache and a small smile */}
          <path
            d="M23.6 41.4c1.4-3.4 5.6-4 8.4-2 2.8-2 7-1.4 8.4 2-2.4 1.6-5.4 1.2-8.4-.4-3 1.6-6 2-8.4.4z"
            fill="#f7f4ee"
            stroke="#ddd6c8"
            strokeWidth=".6"
          />
          <path d="M29.2 43.8c1.8 1.3 3.8 1.3 5.6 0" stroke="#9a5644" strokeWidth="1.4" strokeLinecap="round" fill="none" />
        </svg>
      </span>
    </span>
  );
}

function StopIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" />
    </svg>
  );
}

function Chevron({ open, className = "h-5 w-5" }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`${className} transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
