"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Book, { OPEN_MS, TURN_MS } from "./Book";
import Page, { Caption } from "./Page";
import Scene, { type Mood } from "./Scene";
import Starfield from "./Starfield";
import { StarSprite } from "./art/sprites";
import { resolveLine, withName, type Episode, type Line } from "@/lib/episode";
import { MIA, type ChildProfile } from "@/lib/profile";

type Phase = "closed" | "glowing" | "opening" | "intro" | "interact" | "success" | "end";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Stand-in for the narrator voice until M3: hold each line long enough to read it.
async function speak(line: Line) {
  const words = (line.say ?? line.text).split(/\s+/).length;
  await wait(700 + words * 330);
}

export default function EpisodeRunner({ episode, profile = MIA }: { episode: Episode; profile?: ChildProfile }) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("closed");
  const [caption, setCaption] = useState<Line | null>(null);
  const [wordIndex, setWordIndex] = useState(-1);
  const [mood, setMood] = useState<Mood>("idle");

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
        setWordIndex(-1);
        await speak(line);
      }
    },
    [profile.name],
  );

  const runScreen = useCallback(
    async (i: number, afterTurn: boolean) => {
      const g = ++gen.current;
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
    [narrate, screens],
  );

  const succeed = useCallback(async () => {
    if (phaseRef.current !== "interact") return;
    const g = gen.current;
    const i = index;
    setPhaseBoth("success");
    setMood("celebrate");
    await narrate(screens[i].onSuccess.narration);
    await wait(900);
    if (gen.current !== g) return;
    if (i + 1 < screens.length) {
      runScreen(i + 1, true);
    } else {
      gen.current++;
      setCaption(null);
      setPhaseBoth("end");
    }
  }, [index, narrate, runScreen, screens]);

  // The book wakes up: it sits closed, glows, then opens on its own.
  useEffect(() => {
    const g = ++gen.current;
    (async () => {
      await wait(500);
      if (gen.current !== g) return;
      setPhaseBoth("glowing");
      await wait(1900);
      if (gen.current !== g) return;
      setPhaseBoth("opening");
      await wait(OPEN_MS);
      if (gen.current !== g) return;
      runScreen(0, false);
    })();
    return () => {
      // gen is a counter, not a DOM node: bumping it is exactly how we cancel.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      gen.current++;
    };
  }, [runScreen]);

  const restart = () => {
    gen.current++;
    setIndex(0);
    setCaption(null);
    setMood("idle");
    runScreen(0, true);
  };

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

      <Book opened={opened} glowing={phase === "glowing"} turnKey={ended ? "end" : index}>
        {ended ? (
          <EndPage title={withName(episode.next.title, profile.name)} onAgain={restart} />
        ) : (
          <Page art={<Scene art={screen.art} mood={mood} />} caption={<Caption line={caption} wordIndex={wordIndex} />}>
            {phase === "interact" && <NextStandIn onNext={succeed} />}
          </Page>
        )}
      </Book>

      <Progress count={screens.length} index={ended ? screens.length : index} visible={opened} />
    </main>
  );
}

/** M2 stand-in for the real interactions, which arrive in M4 to M6. */
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
