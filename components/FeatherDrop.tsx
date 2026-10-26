"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Feather, Rocket, StarSprite } from "./art/sprites";
import type { FeatherInteraction, Line } from "@/lib/episode";
import type { InteractionProps } from "@/lib/interaction";
import { playSfx } from "@/lib/sfx";
import { canListen, listenFor, stopListening, type ListenOutcome } from "@/lib/listen";

// Where things sit, in % of the spread.
const HOVER = { x: 42, y: 34 }; // the feather's center while it hovers
const FEATHER_H = 16; // its height
const TIP = 116 / 120; // the quill tip, as a fraction of the sprite's height
const GROUND_Y = 76; // where the tip comes to rest on the Moon
// How far it falls, in % of its own height (what a CSS translate percentage means).
const FALL = ((GROUND_Y - (HOVER.y + FEATHER_H * (TIP - 0.5))) / FEATHER_H) * 100;
const FALL_S = 3.4;
const BOB = 6; // hover bob, in % of its own height
const TILT = -8; // degrees: a feather rarely hangs perfectly straight
const LIE_DOWN = -74;

const CHIP_MS = 2500;
const CHIP_CHARS = 40;
const THINK_MS = 2500; // no microphone: a quiet moment to think of a guess anyway
const REMIND_MS = 9000;

// The Moon has no air, so nothing slows the feather or pushes it sideways. It falls
// straight, from rest, with distance growing as time squared (d = g t^2 / 2).
// That is exactly an ease-in quadratic.
const freeFall = (t: number) => t * t;

type Stage = "hover" | "falling" | "landed";

/**
 * Screen 5, the gravity moment. The child guesses out loud what a dropped feather will
 * do (any answer is a good answer, kept as text for the grown-ups), then taps the
 * feather and watches it fall the way it really would on the Moon.
 */
export default function FeatherDrop({ config, active, ctx }: InteractionProps<FeatherInteraction>) {
  const reduce = useReducedMotion() ?? false;
  const [stage, setStage] = useState<Stage>("hover");
  const [ready, setReady] = useState(false); // the book has said "tap the feather"
  const [listening, setListening] = useState(false);
  const [chip, setChip] = useState<string | null>(null);

  const y = useMotionValue(0);
  const yPct = useTransform(y, (v) => `${v}%`);
  const tilt = useMotionValue(TILT);
  const opacity = useMotionValue(1);

  const dropped = useRef(false);
  const guess = useRef("");
  const interim = useRef(""); // what we heard so far, in case a tap cuts the guess short
  const hints = useRef(0);
  const askedAt = useRef(0);
  const speaking = useRef<Promise<void>>(Promise.resolve());
  const abort = useRef<AbortController | null>(null);
  const chipKey = useRef(0);
  const running = useRef<{ stop: () => void }[]>([]);
  const sleep = useSleep();

  // Stop any motion still in flight if the page goes away mid-fall.
  useEffect(() => {
    const anims = running.current;
    return () => anims.forEach((a) => a.stop());
  }, []);

  // A slow, magical hover until the feather is dropped.
  useEffect(() => {
    if (reduce || dropped.current) return;
    const bob = animate(y, [0, -BOB, 0], { duration: 4.4, repeat: Infinity, ease: "easeInOut" });
    return () => bob.stop();
  }, [reduce, y]);

  const showChip = useCallback(
    (text: string, hold: boolean) => {
      const key = ++chipKey.current;
      setChip(clip(text));
      if (hold) void sleep(CHIP_MS).then(() => chipKey.current === key && setChip(null));
    },
    [sleep],
  );

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const live = () => !cancelled && !dropped.current && ctx.alive();
    askedAt.current = performance.now();

    const say = (lines: Line[]) => (speaking.current = ctx.narrate(lines));

    // Any words at all are a guess. listenFor tests every interim result, so a test that
    // accepted anything would stop at the first word. This one never matches, which lets
    // the recognizer hear the whole sentence and hand it back as "nomatch".
    const listen = async (): Promise<ListenOutcome> => {
      if (!canListen()) return { status: "unavailable", reason: "unsupported" };
      const controller = new AbortController();
      abort.current = controller;
      setListening(true);
      playSfx("listen");
      await new Promise((r) => setTimeout(r, 300)); // let the question and the ding fade first
      if (cancelled || controller.signal.aborted) {
        setListening(false);
        return { status: "silence" };
      }
      const heard = await listenFor(() => false, {
        timeoutMs: config.guessMs,
        signal: controller.signal,
        onInterim: (text) => {
          interim.current = text;
          if (!cancelled) showChip(text, false);
        },
      });
      // A cancelled run (React's dev double-run) can land here late: leave the live run's state alone.
      if (!cancelled) setListening(false);
      const words = heard.status === "match" || heard.status === "nomatch" ? tidy(heard.heard) : "";
      if (words) {
        guess.current = words;
        if (!cancelled) showChip(words, true);
      } else if (!cancelled) {
        setChip(null);
      }
      return heard;
    };

    (async () => {
      let heard = await listen();
      if (!live()) return;
      if (heard.status === "silence" || (heard.status === "nomatch" && !guess.current)) {
        hints.current = 1;
        await say(ctx.help);
        if (!live()) return;
        heard = await listen();
        if (!live()) return;
      }
      // A beat to enjoy the guess, or with no microphone, to think one, before finding out.
      await sleep(guess.current ? 900 : heard.status === "unavailable" ? THINK_MS : 300);
      if (!live()) return;
      await say(config.tapNow);
      if (!live()) return;
      setReady(true);
      // Still waiting? One gentle reminder, then the glowing feather simply waits.
      await sleep(REMIND_MS);
      if (!live()) return;
      await say(config.tapNow);
    })();

    return () => {
      cancelled = true;
      abort.current?.abort();
      stopListening();
      setListening(false);
    };
    // ctx, config, sleep and showChip are stable for the life of this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const drop = async () => {
    if (!active || dropped.current) return;
    dropped.current = true;
    const ms = Math.round(performance.now() - askedAt.current);
    abort.current?.abort();
    stopListening();
    setListening(false);
    setReady(false);
    setStage("falling");
    // A soft sparkle answers the tap. Then the fall itself is silent: on the Moon there is no air to carry a sound.
    playSfx("sparkle", { volume: 0.3 });

    if (reduce) {
      const out = animate(opacity, 0, { duration: 0.25 });
      running.current.push(out);
      await out;
      y.set(FALL);
      const back = animate(opacity, 1, { duration: 0.45 });
      running.current.push(back);
      await back;
    } else {
      const fall = animate(y, FALL, { duration: FALL_S, ease: freeFall });
      running.current.push(fall);
      await fall;
    }
    if (!ctx.alive()) return;
    setStage("landed");
    // It lands on its quill, then tips over slowly. Still no air, so still no flutter.
    if (!reduce) running.current.push(animate(tilt, LIE_DOWN, { duration: 1.6, delay: 0.15, ease: freeFall }));

    await speaking.current; // let any line already being read finish first
    if (!ctx.alive()) return;
    const note = guess.current || tidy(interim.current);
    ctx.log({ skill: config.skill, correct: true, hintsUsed: hints.current, ms, mode: note ? "voice" : "tap", note });
    // The chime and "The Moon pulls gently" come as the quill touches down, while it tips over,
    // so the child hears why it fell so slowly at the moment it lands.
    ctx.cheer();
    ctx.succeed();
  };

  return (
    <div className="@container absolute inset-0">
      {/* The rocket, landed on the left. */}
      <div aria-hidden className="absolute bottom-[21%] left-[16%] h-[30%] -translate-x-1/2" style={{ aspectRatio: "60 / 120" }}>
        <div className="absolute inset-x-[-12%] bottom-[-3%] h-[8%] rounded-[50%] bg-ink/45 blur-[3px]" />
        <Rocket className="relative h-full w-full" />
      </div>

      {/* The lost star, resting in its crater. */}
      <div aria-hidden className="absolute left-[66%] top-[78%] h-[13%] -translate-x-1/2 -translate-y-1/2" style={{ aspectRatio: "1" }}>
        <motion.div
          className="h-full w-full"
          animate={reduce ? undefined : { scale: [1, 1.07, 1], opacity: [0.9, 1, 0.9] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <StarSprite className="h-full w-full" />
        </motion.div>
      </div>

      {/* The feather. */}
      <div
        className="absolute -translate-x-1/2 -translate-y-1/2"
        style={{ left: `${HOVER.x}%`, top: `${HOVER.y}%`, height: `${FEATHER_H}%`, aspectRatio: "40 / 120" }}
      >
        <motion.div className="absolute inset-0" style={{ y: yPct, opacity }}>
          <Halo ready={ready} faded={stage !== "hover"} gone={stage === "landed"} reduce={reduce} />
          <motion.div className="absolute inset-0" style={{ rotate: tilt, transformOrigin: `50% ${TIP * 100}%` }}>
            <Feather className="h-full w-full drop-shadow-[0_0_10px_rgba(247,240,220,0.45)]" />
          </motion.div>
          <button
            type="button"
            aria-label="Drop the feather"
            onClick={() => void drop()}
            disabled={!active || stage !== "hover"}
            className="absolute left-1/2 top-1/2 h-[max(96px,120%)] w-[max(96px,330%)] -translate-x-1/2 -translate-y-1/2 rounded-full disabled:cursor-default"
          />
        </motion.div>
      </div>

      {stage === "landed" && !reduce && <DustPuff />}

      {/* The child's guess, in their own words, on a small pane of glass. */}
      <AnimatePresence>
        {(listening || chip) && (
          <motion.div
            key="guess"
            aria-live="polite"
            className="pointer-events-none absolute right-[61.5%] top-[30%] max-w-[32%] -translate-y-1/2 rounded-2xl bg-moon/10 px-[1em] py-[0.5em] text-center text-[clamp(1rem,1.9cqw,1.5rem)] font-semibold leading-snug text-moon shadow-[0_8px_30px_rgba(10,15,42,0.35)] ring-1 ring-moon/20 backdrop-blur-md [text-wrap:balance]"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {chip ? <span>&ldquo;{chip}&rdquo;</span> : <Dots reduce={reduce} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Soft moonlight around the hovering feather; a gold pulse once it is time to tap. It dims as the
 * feather falls and goes out when it lands, since the feather then tips over out of its circle.
 */
function Halo({ ready, faded, gone, reduce }: { ready: boolean; faded: boolean; gone: boolean; reduce: boolean }) {
  // A circle 1.2 feathers wide: the box is a third as wide as it is tall, hence 360%.
  const circle = "pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[360%] -translate-x-1/2 -translate-y-1/2 rounded-full";
  return (
    <>
      <motion.div
        key={ready ? "gold" : "moon"}
        aria-hidden
        className={circle}
        style={{
          background: ready
            ? "radial-gradient(closest-side, rgba(255,227,163,0.55), rgba(245,201,105,0.18) 60%, rgba(245,201,105,0) 100%)"
            : "radial-gradient(closest-side, rgba(247,240,220,0.32), rgba(247,240,220,0.08) 60%, rgba(247,240,220,0) 100%)",
        }}
        animate={{ opacity: gone ? 0 : faded ? 0.35 : reduce ? 0.85 : [0.55, 0.95, 0.55] }}
        transition={faded || reduce ? { duration: 0.6 } : { duration: ready ? 1.6 : 4.4, repeat: Infinity, ease: "easeInOut" }}
      />
      {ready && (
        <motion.div
          aria-hidden
          className={`${circle} border-2 border-gold/80`}
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 0.9 } : { opacity: [0.45, 1, 0.45], scale: [0.94, 1.06, 0.94] }}
          transition={reduce ? { duration: 0.4 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
    </>
  );
}

// Each mote: sideways distance and peak height, in % of its own size.
const DUST = [
  { dx: -520, up: 260 },
  { dx: -340, up: 380 },
  { dx: -160, up: 300 },
  { dx: 170, up: 340 },
  { dx: 350, up: 280 },
  { dx: 540, up: 220 },
];

/**
 * A tiny puff where the quill touches down. With no air to hold it up, lunar dust
 * flies out in clean little arcs and drops straight back, instead of billowing.
 */
function DustPuff() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute h-[6%] w-[14%] -translate-x-1/2 -translate-y-full"
      style={{ left: `${HOVER.x}%`, top: `${GROUND_Y}%` }}
    >
      <motion.div
        className="absolute inset-x-[15%] bottom-0 h-[35%] rounded-[50%] bg-moon/50 blur-[2px]"
        initial={{ opacity: 0.6, scaleX: 0.3 }}
        animate={{ opacity: 0, scaleX: 1 }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />
      {DUST.map((d, i) => (
        <motion.span
          key={i}
          className="absolute bottom-0 left-1/2 aspect-square h-[18%] rounded-full bg-moon/80"
          initial={{ x: "-50%", y: "0%", opacity: 0.9 }}
          animate={{ x: `${d.dx - 50}%`, y: ["0%", `${-d.up}%`, "0%"], opacity: [0.9, 0.75, 0] }}
          transition={{
            x: { duration: 1.1, ease: "linear" },
            y: { duration: 1.1, times: [0, 0.45, 1], ease: ["easeOut", "easeIn"] },
            opacity: { duration: 1.1, ease: "easeIn" },
          }}
        />
      ))}
    </div>
  );
}

/** Three soft dots: the book is listening. */
function Dots({ reduce }: { reduce: boolean }) {
  return (
    <span className="flex items-center gap-[0.35em] py-[0.3em]" aria-label="Listening">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-[0.45em] rounded-full bg-moon/80"
          animate={reduce ? { opacity: 0.7 } : { opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}

/** One line of plain text, capped so a long ramble cannot flood the parent page. */
function tidy(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Short enough for the glass chip: cut at a word, with an ellipsis. */
function clip(s: string): string {
  const t = tidy(s);
  if (t.length <= CHIP_CHARS) return t;
  const cut = t.slice(0, CHIP_CHARS);
  const space = cut.lastIndexOf(" ");
  return `${space > CHIP_CHARS * 0.6 ? cut.slice(0, space) : cut}…`;
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
