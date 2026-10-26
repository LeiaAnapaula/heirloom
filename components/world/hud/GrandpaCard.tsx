"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { GRANDPA, MOMENTS, momentOf, type Moment, type MomentId } from "../config";
import { actions, hud, useHud } from "../store";
import { Icon } from "./icons";
import Portrait from "./Portrait";
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

/** A calm, unhurried device voice, a little lower and slower than usual so it sounds like an older man. */
const RATE = 0.85;
const PITCH = 0.8;
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
  /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|princess|deranged|hysterical|fred|grandma|eddy|flo\b|reed|rocko|sandy|shelley/i;
/** Apple's own "Grandpa" voice first (an older man, on Macs, iPhones and iPads), then deep, calm men's voices. */
const GRANDPA_VOICES = ["Grandpa (English (US))", "Grandpa (English (UK))", "Grandpa", "Daniel", "Arthur", "Aaron", "Google UK English Male", "Microsoft Guy", "Microsoft Ryan", "Alex", "Tom"];

function pickVoice(): SpeechSynthesisVoice | null {
  const english = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en") && !ODD_VOICES.test(v.name));
  if (!english.length) return null;
  for (const name of GRANDPA_VOICES) {
    const v = english.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return english.find((v) => /enhanced|premium|natural/i.test(v.name)) ?? english.find((v) => v.default) ?? english[0];
}

/** The Grandpa voice already sounds his age; the others are lowered and slowed to get close. */
function isGrandpaVoice(v: SpeechSynthesisVoice | null): boolean {
  return !!v && v.name.startsWith("Grandpa");
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
        u.rate = isGrandpaVoice(voice) ? 0.9 : RATE;
        u.pitch = isGrandpaVoice(voice) ? 1 : PITCH;
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

  /** Read the current moment's line. Stops by itself when the camera sets off somewhere else. */
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
    let wasFlying = hud.get().flying;
    unsubscribe = hud.subscribe(() => {
      const s = hud.get();
      if (s.moment !== id || (s.flying && !wasFlying)) finish();
      wasFlying = s.flying;
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

const [firstName, ...rest] = GRANDPA.name.split(" ");
const otherNames = rest.join(" ");

export default function GrandpaCard() {
  const momentId = useHud((s) => s.moment);
  const speaking = useHud((s) => s.speaking);
  const ready = useHud((s) => s.status === "ready");
  const speech = useSyncExternalStore(noSubscribe, hasSpeech, () => true);
  const [teller] = useState(createStoryteller);
  const [run, setRun] = useState<Run>(IDLE);
  const [open, setOpen] = useState(false); // phones: the chip opens to show the line
  const bodyId = useId();
  const [scroller, more] = useMoreBelow<HTMLDivElement>(momentId);

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
  const showRead = !!readLabel && !!moment && !touring;

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
  const words = "font-display text-[17px] leading-[1.55] roomy:[@media(min-height:821px)]:text-[18px]";

  return (
    <Panel
      className={`flex w-full flex-col p-2 compact:max-h-[33svh] roomy:max-h-[min(62svh,560px)] roomy:max-w-[380px] roomy:p-4 lg:max-w-none ${open ? "compact:pb-2.5" : ""}`}
      aria-label={`${GRANDPA.name}, telling ${GRANDPA.title}`}
      role="region"
    >
      {/* Phones: a small chip. Tap Grandpa to open his words. */}
      <div className="flex shrink-0 items-center gap-1.5 roomy:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${GRANDPA.name}'s words`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl text-left"
        >
          <span className="relative shrink-0">
            <Portrait speaking={speaking} className="h-11 w-11" />
            <span
              aria-hidden
              className="absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full bg-paper text-pine shadow-[0_0_0_1.5px_rgb(44_58_50/0.25)]"
            >
              <Chevron open={open} className="h-3 w-3" />
            </span>
          </span>
          {/* The name wraps onto two lines when the chip is narrow, only "Grandpa" stays when it is
              narrower, and on the smallest phones the portrait says it alone; with room, the current
              part shows under it. */}
          <span className="@container min-w-0 flex-1">
            <span className="line-clamp-2 font-display text-[16px] leading-[1.1] font-semibold @max-[72px]:text-[13.5px] @max-[50px]:sr-only">
              {firstName}
              <span className="@max-[72px]:hidden"> {otherNames}</span>
            </span>
            <span className="hidden truncate text-[12.5px] leading-snug font-bold text-pine/65 @min-[112px]:block">
              {part ?? moment?.label ?? GRANDPA.title}
            </span>
          </span>
        </button>
        <HudButton primary round onClick={toggleTour} disabled={!ready} aria-label={playLabel} className="motion-reduce:transition-none">
          {touring ? <StopIcon className="h-5 w-5" /> : <Icon.play className="h-5 w-5" />}
        </HudButton>
      </div>

      {/* Tablets and computers: the full card. */}
      <div className="hidden shrink-0 items-center gap-3 roomy:flex">
        <Portrait speaking={speaking} className="h-[60px] w-[60px]" />
        <div className="min-w-0">
          <p className="font-display text-[19px] leading-tight font-semibold">{GRANDPA.name}</p>
          <p className="mt-0.5 text-[13px] leading-snug font-bold text-pine/65">Telling: {GRANDPA.title}</p>
        </div>
      </div>

      <div id={bodyId} className={`${open ? "flex" : "hidden"} min-h-0 flex-col roomy:flex`}>
        <div
          ref={scroller}
          className={`mt-2 min-h-0 overflow-y-auto overscroll-contain roomy:mt-3 ${
            more ? "[mask-image:linear-gradient(to_bottom,#000_calc(100%-32px),transparent)]" : ""
          }`}
        >
          <div>
            {moment ? (
              <>
                <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-wood compact:hidden">
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
                <blockquote className={`${words} text-pine roomy:mt-1.5`} style={SOFT}>
                  &ldquo;{moment.line}&rdquo;
                </blockquote>
              </>
            ) : (
              <p className={words} style={SOFT}>
                Tap a number to hear Grandpa&rsquo;s story.
              </p>
            )}
          </div>
        </div>

        <div className={`mt-2.5 flex shrink-0 flex-wrap items-center gap-2 roomy:mt-3 ${showRead || touring ? "" : "compact:hidden"}`}>
          <HudButton primary onClick={toggleTour} disabled={!ready} className="gap-1.5! px-3! motion-reduce:transition-none compact:hidden">
            {touring ? <StopIcon className="h-5 w-5" /> : <Icon.play className="h-5 w-5" />}
            <span>{touring ? "Stop" : "Play the story"}</span>
            {touring && <span className="sr-only"> the story</span>}
          </HudButton>
          {showRead && (
            <HudButton onClick={toggleLine} active={reading} className="gap-1.5! px-3! motion-reduce:transition-none">
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

/** Fraunces at its softest, for Grandpa's words. */
const SOFT = { fontVariationSettings: '"SOFT" 100' };

/**
 * True while the box has more to scroll to below, so the last line can fade out as a hint.
 * A new `page` (the next moment) starts again from the top.
 */
function useMoreBelow<T extends HTMLElement>(page: unknown) {
  const ref = useRef<T>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    ref.current?.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);
  return [ref, more] as const;
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
