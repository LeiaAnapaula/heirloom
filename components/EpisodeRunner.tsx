"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "framer-motion";
import Book, { OPEN_MS, TURN_MS } from "./Book";
import Page, { Caption } from "./Page";
import Scene, { type Mood } from "./Scene";
import Starfield from "./Starfield";
import { StarSprite } from "./art/sprites";
import MagicPencil from "./MagicPencil";
import ReadAloud from "./ReadAloud";
import YesButton from "./YesButton";
import { allLines, resolveLine, withName, type Episode, type Line, type Screen } from "@/lib/episode";
import type { InteractionContext } from "@/lib/interaction";
import { MIA, type ChildProfile } from "@/lib/profile";
import { play, preload, stop as stopVoice, unlockAudio } from "@/lib/voice";

type Phase = "closed" | "glowing" | "opening" | "intro" | "interact" | "success" | "end";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// How long each celebration needs on screen before the page may turn, so a quick
// "You did it!" never cuts off the rocket mid-flight.
const CELEBRATION_MS: Record<NonNullable<Screen["onSuccess"]["effect"]>, number> = {
  turn: 400,
  liftoff: 3000,
  swoop: 900,
  sparkle: 1400,
  fall: 900,
  home: 5000,
};

/** Every line a screen might speak, so its audio can be warmed before the page turns. */
function screenLines(episode: Episode, screen: Screen | undefined, name: string): Line[] {
  return screen ? allLines({ ...episode, screens: [screen] }).map((l) => resolveLine(l, name)) : [];
}

/**
 * Has this page had a tap or key press yet? Browsers won't speak before one. Read from the
 * browser as an external store so the sleeping-book gate appears without an extra render pass.
 */
function subscribeToTaps(onChange: () => void) {
  window.addEventListener("pointerdown", onChange, true);
  window.addEventListener("keydown", onChange, true);
  return () => {
    window.removeEventListener("pointerdown", onChange, true);
    window.removeEventListener("keydown", onChange, true);
  };
}
function hasBeenTapped(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

export default function EpisodeRunner({ episode, profile = MIA }: { episode: Episode; profile?: ChildProfile }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("closed");
  const [caption, setCaption] = useState<Line | null>(null);
  const [wordIndex, setWordIndex] = useState(-1);
  const [mood, setMood] = useState<Mood>("idle");
  const [screenGen, setScreenGen] = useState(0); // which generation the mounted interaction belongs to

  // Every screen gets a new generation number. Async work from an old screen
  // checks it and quietly stops, so nothing from page 2 can talk over page 3.
  const gen = useRef(0);
  const phaseRef = useRef<Phase>("closed");
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const screens = episode.screens;
  const screen = screens[Math.min(index, screens.length - 1)];

  const narrate = useCallback(
    async (lines: Line[]) => {
      const g = gen.current;
      for (const raw of lines) {
        if (gen.current !== g) return;
        const line = resolveLine(raw, profile.name);
        setCaption(line);
        setWordIndex(0);
        await play(line, { onWord: (i) => gen.current === g && setWordIndex(i) });
      }
      if (gen.current === g) setWordIndex(-1);
    },
    [profile.name],
  );

  const runScreen = useCallback(
    async (i: number, afterTurn: boolean) => {
      const g = ++gen.current;
      stopVoice();
      preload(screenLines(episode, screens[i + 1], profile.name));
      setScreenGen(g);
      setIndex(i);
      setMood("idle");
      setCaption(null);
      setPhaseBoth("intro");
      await wait(afterTurn ? TURN_MS : 250);
      if (gen.current !== g) return;
      await narrate(screens[i].narration);
      if (gen.current !== g) return;
      setPhaseBoth("interact");
    },
    [episode, narrate, profile.name, screens],
  );

  const succeed = useCallback(async () => {
    if (phaseRef.current !== "interact") return;
    const g = gen.current;
    const i = index;
    setPhaseBoth("success");
    setMood("celebrate");
    const started = Date.now();
    const { narration, effect } = screens[i].onSuccess;
    await narrate(narration);
    await wait(Math.max(900, (effect ? CELEBRATION_MS[effect] : 0) - (Date.now() - started)));
    if (gen.current !== g) return;
    if (i + 1 < screens.length) {
      runScreen(i + 1, true);
    } else {
      gen.current++;
      setCaption(null);
      setPhaseBoth("end");
    }
  }, [index, narrate, runScreen, screens]);

  // What this screen's interaction may do. A new object per screen, so nothing leaks between pages.
  const ctx = useMemo<InteractionContext>(
    () => ({
      name: profile.name,
      narrate,
      log: () => {}, // skill scores arrive in M7
      succeed: () => void succeed(),
      alive: () => gen.current === screenGen,
      help: screen.onHelp.narration,
    }),
    [narrate, profile.name, screen, screenGen, succeed],
  );

  // The book wakes up: it sits closed, glows, then opens on its own.
  const wake = useCallback(async () => {
    const g = ++gen.current;
    preload(screenLines(episode, screens[0], profile.name));
    await wait(500);
    if (gen.current !== g) return;
    setPhaseBoth("glowing");
    await wait(1900);
    if (gen.current !== g) return;
    setPhaseBoth("opening");
    await wait(OPEN_MS);
    if (gen.current !== g) return;
    runScreen(0, false);
  }, [episode, profile.name, runScreen, screens]);

  // Opened from the title screen, the tap there already woke the narrator.
  // Opened directly (a reload, a shared link), the child taps the sleeping book first.
  const tapped = useSyncExternalStore(subscribeToTaps, hasBeenTapped, () => true);

  useEffect(() => {
    if (!tapped) return;
    wake();
    return () => {
      // gen is a counter, not a DOM node: bumping it is exactly how we cancel.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      gen.current++;
      stopVoice();
    };
  }, [tapped, wake]);

  const restart = () => {
    gen.current++;
    stopVoice();
    setIndex(0);
    setCaption(null);
    setMood("idle");
    runScreen(0, true);
  };

  const asleep = !tapped && phase === "closed";
  const opened = phase !== "closed" && phase !== "glowing";
  const ended = phase === "end";

  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center gap-5 overflow-hidden">
      <Starfield />

      <Link
        href="/"
        aria-label="Close the book"
        className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full text-mist/60 transition-colors hover:text-moon"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </Link>

      <Book opened={opened} glowing={phase === "glowing" || asleep} turnKey={ended ? "end" : index}>
        {ended ? (
          <EndPage title={withName(episode.next.title, profile.name)} onAgain={restart} />
        ) : (
          <Page art={<Scene art={screen.art} mood={mood} />} caption={<Caption line={caption} wordIndex={wordIndex} />}>
            {(phase === "intro" || phase === "interact" || phase === "success") && (
              <Interaction key={`${screen.id}-${screenGen}`} screen={screen} active={phase === "interact"} ctx={ctx} onNext={succeed} />
            )}
          </Page>
        )}
      </Book>

      <Progress count={screens.length} index={ended ? screens.length : index} visible={opened} />

      {asleep && (
        // The tap itself wakes the book (see subscribeToTaps); unlocking audio has to happen inside it.
        <button onClick={unlockAudio} className="absolute inset-0 z-10 flex items-end justify-center pb-[6dvh]" aria-label="Wake up the book">
          <motion.span
            className="text-xl font-semibold text-moon/90"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          >
            Tap the book to wake it up
          </motion.span>
        </button>
      )}
    </main>
  );
}

/** Picks the interaction a screen asks for. Screens without one yet keep the M2 "Next" stand-in. */
function Interaction({ screen, active, ctx, onNext }: { screen: Screen; active: boolean; ctx: InteractionContext; onNext: () => void }) {
  const i = screen.interaction;
  switch (i.type) {
    case "yes":
      return <YesButton config={i} active={active} ctx={ctx} />;
    case "readAloud":
      return <ReadAloud config={i} active={active} ctx={ctx} />;
    case "trace":
      return <MagicPencil config={i} active={active} ctx={ctx} />;
    default:
      return active ? <NextStandIn onNext={onNext} /> : null;
  }
}

/** M2 stand-in for interactions that arrive in M6. */
function NextStandIn({ onNext }: { onNext: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-[9%] flex justify-center">
      <button onClick={onNext} className="glow-button rounded-full px-10 py-4 text-2xl font-bold">
        Next
      </button>
    </div>
  );
}

function EndPage({ title, onAgain }: { title: string; onAgain: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center">
      <StarSprite className="h-[22%]" />
      <p className="text-[clamp(2rem,5vw,4.5rem)] font-semibold text-gold">The End</p>
      <p className="text-[clamp(1rem,1.8vw,1.5rem)] font-medium text-mist">Next time: {title}</p>
      <div className="mt-2 flex gap-4">
        <button onClick={onAgain} className="glow-button rounded-full px-8 py-3 text-xl font-bold">
          Read it again
        </button>
        <Link href="/parent" className="rounded-full px-6 py-3 text-xl font-semibold text-moon ring-1 ring-gold/50 transition-colors hover:bg-gold/10">
          For grown-ups
        </Link>
      </div>
    </div>
  );
}

function Progress({ count, index, visible }: { count: number; index: number; visible: boolean }) {
  return (
    <motion.ol
      aria-label={`Page ${Math.min(index + 1, count)} of ${count}`}
      className="flex gap-3"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="h-4 w-4">
          <StarSprite
            glow={i === index}
            className="h-full w-full transition-all duration-500"
            style={{ opacity: i <= index ? 1 : 0.25, filter: i <= index ? "none" : "grayscale(1)" }}
          />
        </li>
      ))}
    </motion.ol>
  );
}
