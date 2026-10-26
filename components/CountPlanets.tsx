"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Planet, Rocket, type PlanetHue } from "./art/sprites";
import type { CountInteraction } from "@/lib/episode";
import type { InteractionProps } from "@/lib/interaction";
import { playSfx } from "@/lib/sfx";
import { canListen, listenFor, parseLastNumber, stopListening } from "@/lib/listen";
import type { Attempt } from "@/lib/profile";

const LISTEN_MS = 6000;
const SETTLE_MS = 300; // let the book's own voice fade before listening
// With no microphone the buttons carry the page. If no tap comes, the book counts with the child anyway.
const TAP_ONLY_MS = 8000;
const MAX_HINTS = 2;
const INTRO_START_MS = 1200; // once the page turn has settled
const INTRO_STEP_MS = 700;
const FLASH_MS = 1600;

type Slot = { hue: PlanetHue; x: number; y: number; w: number; ring?: boolean };

/**
 * Where the planets sit, in % of the spread: center x, center y, and width.
 * A gentle arc that dips through the middle and leaves the spine (47 to 53%) clear.
 * Counting goes left to right, so a planet that arrives later is always the last on the right.
 */
const SLOTS: Slot[] = [
  { hue: "rose", x: 14, y: 44, w: 11 },
  { hue: "teal", x: 34, y: 53, w: 10.5, ring: true },
  { hue: "violet", x: 61.5, y: 55, w: 11.5 },
  { hue: "amber", x: 75.5, y: 50, w: 9.5 },
  { hue: "sky", x: 88.5, y: 43, w: 9 },
];

type Mode = Attempt["mode"];
type Answer = { n: number | null; mode?: Mode };
type Flash = { n: number; right: boolean; key: number };

/**
 * Screen 4: a rocket glides past, the planets light up one by one, and the child says
 * how many or taps a big number. A miss is never a dead end: the book dims the planets
 * and counts them with the child, then asks again. After two hints it counts once more
 * and the story goes on.
 */
export default function CountPlanets({ config, active, ctx }: InteractionProps<CountInteraction>) {
  const reduce = useReducedMotion() ?? false;
  const first = Math.min(config.steps[0]?.answer ?? 0, SLOTS.length);
  const [shown, setShown] = useState(first);
  const [lit, setLit] = useState(0);
  const [turn, setTurn] = useState(false);
  const [listening, setListening] = useState(false);
  const [countAt, setCountAt] = useState<number | null>(null); // null unless counting together
  const [flash, setFlash] = useState<Flash | null>(null);
  const [arrived, setArrived] = useState(-1); // the planet that just joined, for its sparkle
  const started = useRef(false);
  const tapRef = useRef<((n: number) => void) | null>(null);
  const flashKey = useRef(0);
  const sleep = useSleep();

  // A living 3D world for this page, built and verified by Gemini 4 Argon (scripts/build-world.mts).
  // Used only when it was verified for this lesson's number; otherwise the drawn planets stay.
  const [world, setWorld] = useState<string | null>(null);
  const [worldReady, setWorldReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const added = useRef(first);
  useEffect(() => {
    let live = true;
    fetch("/worlds/current.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { planets?: number; path?: string } | null) => {
        if (live && j?.path && j.planets === first) setWorld(j.path);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [first]);
  useEffect(() => {
    type World = { highlight(i: number, on: boolean): void; addPlanet(): void };
    const w = (frame.current?.contentWindow as (Window & { __world?: World }) | null)?.__world;
    if (!worldReady || !w) return;
    try {
      while (added.current < shown) {
        w.addPlanet();
        added.current++;
      }
      for (let i = 0; i < shown; i++) w.highlight(i, i < lit);
    } catch {
      // the world is decoration; counting still works without it
    }
  }, [worldReady, lit, shown]);

  // While the question is read, the first planets light up one at a time.
  useEffect(() => {
    const ids = Array.from({ length: first }, (_, i) =>
      setTimeout(() => {
        if (!started.current) setLit((l) => Math.max(l, i + 1));
      }, INTRO_START_MS + i * INTRO_STEP_MS),
    );
    return () => ids.forEach(clearTimeout);
  }, [first]);

  useEffect(() => {
    if (!active) return;
    started.current = true;
    let cancelled = false;
    let micOff = !canListen();
    let abort: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const live = () => !cancelled && ctx.alive();

    // One turn: the child may say a number or tap one. Whichever comes first wins.
    // A cancelled run can settle late (React's dev double-run does this), so it must
    // never touch state the live run owns.
    const answer = (expected: number) =>
      new Promise<Answer>((resolve) => {
        let settled = false;
        const onTap = (n: number) => {
          settle({ n, mode: "tap" });
          abort?.abort();
          stopListening();
        };
        const settle = (a: Answer) => {
          if (settled) return;
          settled = true;
          if (tapRef.current === onTap) tapRef.current = null;
          clearTimeout(timer);
          if (!cancelled) setListening(false);
          resolve(a);
        };
        const waitForTap = () => {
          timer = setTimeout(() => settle({ n: null }), TAP_ONLY_MS);
        };
        tapRef.current = onTap;
        if (micOff) return waitForTap();

        abort = new AbortController();
        const signal = abort.signal;
        setListening(true);
        playSfx("listen");
        // Match only the right number, and only as the last number said: interim results
        // arrive mid-count ("one, two..."), so judging the first number heard would be unfair.
        // A finished phrase with another number is a wrong answer; the book counts together.
        // The short wait lets the narrator's question and the ding fade before the microphone opens.
        const hear = async () => {
          await new Promise((r) => setTimeout(r, SETTLE_MS));
          if (settled || cancelled) return { status: "silence" } as const;
          return listenFor((h) => parseLastNumber(h) === expected, { timeoutMs: LISTEN_MS, signal });
        };
        void hear().then((heard) => {
          if (heard.status === "match") return settle({ n: expected, mode: "voice" });
          if (heard.status === "nomatch") return settle({ n: parseLastNumber(heard.heard), mode: "voice" });
          if (heard.status === "silence") return settle({ n: null });
          // No microphone after all: the buttons alone, from now on.
          micOff = true;
          if (settled || cancelled) return;
          setListening(false);
          waitForTap();
        });
      });

    // Dim the planets, then light each one as the book says its number.
    const countTogether = async (count: number) => {
      setCountAt(0);
      setLit(0);
      await sleep(reduce ? 300 : 800);
      for (let i = 0; i < count; i++) {
        if (!live()) return;
        setLit(i + 1);
        setCountAt(i + 1);
        const line = config.numbers[i];
        await (line ? ctx.narrate([line]) : sleep(700));
      }
      await sleep(400);
    };

    (async () => {
      if (config.steps.length === 0) return ctx.succeed();
      let count = first;
      setLit(count);

      for (let s = 0; s < config.steps.length; s++) {
        const step = config.steps[s];
        const askedAt = performance.now();
        let hints = 0;
        let mode: Mode = undefined;
        let correct = false;

        for (;;) {
          setCountAt(null);
          setFlash(null);
          setTurn(true);
          const got = await answer(step.answer);
          if (!live()) return;
          setTurn(false);
          mode = got.mode ?? mode;
          if (got.n !== null && got.n >= 1 && got.n <= config.max) {
            const key = ++flashKey.current;
            setFlash({ n: got.n, right: got.n === step.answer, key });
            void sleep(FLASH_MS).then(() => setFlash((f) => (f?.key === key ? null : f)));
          }
          if (got.n === step.answer) {
            correct = true;
            break;
          }
          // Not yet. Count together, then it is the child's turn again.
          // After two hints, count once more and move on: no one gets stuck here.
          await ctx.narrate(ctx.help);
          if (!live()) return;
          await countTogether(count);
          if (!live()) return;
          if (hints === MAX_HINTS) break;
          hints++;
        }

        ctx.log({ skill: step.skill, correct, hintsUsed: hints, ms: Math.round(performance.now() - askedAt), mode });

        const next = config.steps[s + 1];
        if (!next) return ctx.succeed(); // the runner says the last line
        await ctx.narrate(step.correct);
        if (!live()) return;

        const more = Math.min(next.answer, SLOTS.length);
        if (more > count) {
          // One more planet drifts in, still dark, then lights with a sparkle.
          setShown(more);
          await sleep(reduce ? 250 : 800);
          if (!live()) return;
          setLit(more);
          setArrived(more - 1);
          await sleep(reduce ? 300 : 1000);
          if (!live()) return;
        }
        count = more;
        setShown(more);
        setLit(more);
        await ctx.narrate(next.ask);
        if (!live()) return;
      }
    })();

    return () => {
      cancelled = true;
      tapRef.current = null;
      clearTimeout(timer);
      abort?.abort();
      stopListening();
      setTurn(false);
      setListening(false);
    };
    // ctx, config and sleep are stable for the life of this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const tap = (n: number) => tapRef.current?.(n);

  return (
    <div className="@container absolute inset-0">
      <Flyby reduce={reduce} />

      {world && (
        <iframe
          ref={frame}
          src={world}
          title={`${shown} planets`}
          onLoad={() => setWorldReady(true)}
          className="pointer-events-none absolute inset-0 h-full w-full border-0"
        />
      )}
      <div role="img" aria-label={`${shown} planets`} className={`absolute inset-0 ${world ? "hidden" : ""}`}>
        {SLOTS.slice(0, shown).map((slot, i) => (
          <PlanetSlot
            key={slot.hue}
            slot={slot}
            index={i}
            lit={i < lit}
            late={i >= first}
            sparkle={i === arrived}
            label={countAt !== null && i < lit ? i + 1 : null}
            reduce={reduce}
          />
        ))}
      </div>

      <NumberRow max={config.max} turn={turn} listening={listening} flash={flash} countAt={countAt} onTap={tap} reduce={reduce} />
    </div>
  );
}

/** A small rocket glides past above the planets while the question is read. */
function Flyby({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-0 top-[25%] w-[9%] -translate-y-1/2"
      style={{ aspectRatio: "2 / 1" }}
      // x is in % of the rocket's own width, so 1125% carries it off the right edge.
      initial={reduce ? { x: "240%", opacity: 0 } : { x: "-115%" }}
      animate={reduce ? { opacity: [0, 1, 1, 0] } : { x: "1125%" }}
      transition={reduce ? { duration: 4, delay: 0.6, times: [0, 0.2, 0.8, 1] } : { duration: 7, delay: 0.5, ease: "linear" }}
    >
      {/* The sprite points up; turned a quarter right, it flies nose first. */}
      <div className="absolute left-1/4 top-[-50%] h-[200%] w-1/2 rotate-90">
        <Rocket className="h-full w-full" flame />
      </div>
    </motion.div>
  );
}

function PlanetSlot({
  slot,
  index,
  lit,
  late,
  sparkle,
  label,
  reduce,
}: {
  slot: Slot;
  index: number;
  lit: boolean;
  late: boolean;
  sparkle: boolean;
  label: number | null;
  reduce: boolean;
}) {
  return (
    <motion.div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.w}%`, aspectRatio: "1" }}
      initial={late ? { opacity: 0, scale: reduce ? 1 : 0.4 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduce ? 0.4 : 0.9, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* A slow drift, each planet on its own rhythm, so the sky breathes. */}
      <motion.div
        className="h-full w-full"
        animate={reduce ? undefined : { y: ["0%", "-4%", "0%"] }}
        transition={{ duration: 6 + index * 0.8, delay: index * 0.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.div
          className="h-full w-full"
          animate={{ scale: lit && !reduce ? [1, 1.1, 1] : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <Planet className="h-full w-full" hue={slot.hue} lit={lit} ring={slot.ring} />
        </motion.div>
      </motion.div>

      {sparkle && <Sparkle reduce={reduce} />}

      <AnimatePresence>
        {label !== null && (
          <motion.span
            key="n"
            aria-hidden
            className="absolute left-1/2 top-[104%] -translate-x-1/2 text-[clamp(1.3rem,2.4cqw,2.2rem)] font-bold leading-none text-gold [text-shadow:0_0_14px_rgba(245,201,105,0.55)]"
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.35 }}
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MOTES = 8;

/** Starlight bursts softly around a planet that just joined. */
function Sparkle({ reduce }: { reduce: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.span
        className="absolute inset-[-20%] rounded-full"
        style={{ background: "radial-gradient(closest-side, rgba(255,233,176,0.7), rgba(245,201,105,0) 75%)" }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
        animate={{ opacity: [0, 1, 0], scale: reduce ? 1 : [0.6, 1.25, 1.5] }}
        transition={{ duration: 1.3, ease: "easeOut" }}
      />
      {!reduce &&
        Array.from({ length: MOTES }, (_, i) => {
          const a = (i / MOTES) * Math.PI * 2 + 0.4;
          const r = i % 2 ? 340 : 430; // in % of the mote's own size
          return (
            <motion.svg
              key={i}
              viewBox="-10 -10 20 20"
              className="absolute left-[44%] top-[44%] h-[12%] w-[12%]"
              initial={{ x: "0%", y: "0%", opacity: 0, scale: 0.3 }}
              animate={{ x: `${Math.cos(a) * r}%`, y: `${Math.sin(a) * r}%`, opacity: [0, 1, 0], scale: [0.3, 1, 0.5] }}
              transition={{ duration: 1.2, delay: (i % 3) * 0.06, ease: "easeOut" }}
            >
              <path d="M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10 Z" fill="#fff1c4" />
            </motion.svg>
          );
        })}
    </div>
  );
}

/** The big round numbers. They glow when it is the child's turn. */
function NumberRow({
  max,
  turn,
  listening,
  flash,
  countAt,
  onTap,
  reduce,
}: {
  max: number;
  turn: boolean;
  listening: boolean;
  flash: Flash | null;
  countAt: number | null;
  onTap: (n: number) => void;
  reduce: boolean;
}) {
  // With an even count, a wider gap sits on the spine so no button falls into the fold.
  const fold = max % 2 === 0 ? max / 2 : -1;
  return (
    <div className="absolute inset-x-0 top-[85%] flex -translate-y-1/2 justify-center">
      <div className="relative flex items-center gap-[clamp(10px,1.8cqw,24px)]">
        {listening && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-x-[clamp(12px,1.8cqw,26px)] -inset-y-[clamp(8px,1.2cqw,16px)] rounded-full ring-2 ring-gold/45"
            animate={reduce ? { opacity: 0.7 } : { opacity: [0.2, 0.85, 0.2] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <Fragment key={n}>
            {n === fold + 1 && <span aria-hidden className="w-[clamp(12px,3cqw,44px)]" />}
            <NumberButton
              n={n}
              turn={turn}
              counting={countAt === n}
              right={flash?.n === n && flash.right}
              wrong={flash?.n === n && !flash.right}
              onTap={onTap}
              reduce={reduce}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function NumberButton({
  n,
  turn,
  counting,
  right,
  wrong,
  onTap,
  reduce,
}: {
  n: number;
  turn: boolean;
  counting: boolean;
  right: boolean;
  wrong: boolean;
  onTap: (n: number) => void;
  reduce: boolean;
}) {
  const look = right
    ? "glow-button border-gold"
    : turn
      ? "border-gold/85 bg-dusk/85 text-gold animate-[primer-breathe_3.2s_ease-in-out_infinite] motion-reduce:animate-none motion-reduce:shadow-[0_0_28px_6px_rgba(245,201,105,0.35)]"
      : counting
        ? "border-gold/80 bg-dusk/85 text-gold shadow-[0_0_28px_6px_rgba(245,201,105,0.35)]"
        : "border-gold/30 bg-dusk/60 text-moon/55";
  return (
    <motion.button
      type="button"
      onClick={() => onTap(n)}
      disabled={!turn}
      className={`grid size-[clamp(80px,8.4cqw,112px)] shrink-0 place-items-center rounded-full border-[3px] text-[clamp(2rem,4cqw,3.2rem)] font-bold leading-none tabular-nums transition-[color,background-color,border-color,box-shadow] duration-300 disabled:cursor-default ${look}`}
      animate={{ scale: reduce ? 1 : right ? [1, 1.18, 1.06] : wrong ? [1, 0.9, 1] : 1 }}
      transition={{ duration: right ? 0.7 : 0.45, ease: "easeOut" }}
    >
      {n}
    </motion.button>
  );
}

/** An awaitable setTimeout. Sleeps still pending when the page goes away never wake. */
function useSleep() {
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);
  return useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.current.delete(id);
          resolve();
        }, ms);
        timers.current.add(id);
      }),
    [],
  );
}
