"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Line, ReadAloudInteraction } from "@/lib/episode";
import type { InteractionProps } from "@/lib/interaction";
import { playSfx } from "@/lib/sfx";
import { canListen, listenFor, matchesWord, stopListening } from "@/lib/listen";

const LISTEN_MS = 5000; // quiet time before a gentle hint, by voice or by tap
const MAX_HINTS = 2;
const SETTLE_MS = 300; // let the narrator's voice fade before the microphone opens
const FLASH_STEP_MS = 110; // letters light up one after another on success

const GOLD = "#f5c969";
const MOON = "#f7f0dc";
const MOON_DIM = "rgba(247,240,220,0.5)";
const GLOW_ON = "0 0 18px rgba(245,201,105,0.9)";
const GLOW_OFF = "0 0 0px rgba(245,201,105,0)";

const PILL_CALM = "0 0 0 2px rgba(245,201,105,0.5), 0 0 30px 4px rgba(245,201,105,0.18), inset 0 1px 0 rgba(255,241,201,0.2)";
const PILL_BRIGHT = "0 0 0 3px rgba(245,201,105,0.9), 0 0 56px 14px rgba(245,201,105,0.42), inset 0 1px 0 rgba(255,241,201,0.3)";

type Mode = "waiting" | "listening" | "tap" | "helping" | "done";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A word on the page, read aloud by the child. The book listens (it never listens while
 * it is speaking, so it cannot answer for her), sounds the word out after five quiet
 * seconds or a wrong word, and after two hints says it together and moves on.
 * Without a microphone, the word becomes a button: she reads it, then taps it.
 */
export default function ReadAloud({ config, active, ctx }: InteractionProps<ReadAloudInteraction>) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<Mode>("waiting");
  const [lit, setLit] = useState<number[]>([]);
  const [won, setWon] = useState(false);

  // The read loop runs across many awaits; it reads the latest props through refs
  // so a re-render never restarts it.
  const ctxRef = useRef(ctx);
  const configRef = useRef(config);
  const tapRef = useRef<(() => void) | null>(null);
  const answered = useRef(false);
  useEffect(() => {
    ctxRef.current = ctx;
    configRef.current = config;
  });

  useEffect(() => {
    if (!active || answered.current) return;
    let cancelled = false;
    let phase: Mode = "waiting";
    let stop: AbortController | null = null;
    let tapWaiter: ((tapped: boolean) => void) | null = null;
    let hintsUsed = 0;
    let tappedAnswer = false;
    const startedAt = performance.now();
    const alive = () => !cancelled && ctxRef.current.alive();
    const enter = (m: Mode) => {
      phase = m;
      setMode(m);
    };

    // With a microphone, the first tap asks for the sound-it-out hint. After that hint, a tap
    // is the child's answer too, so a shy or nonverbal reader can always move on. In tap mode
    // (no microphone) a tap is the answer. Taps while the book is speaking are ignored.
    const onTap = () => {
      if (phase === "tap") tapWaiter?.(true);
      else if (phase === "listening") {
        if (hintsUsed > 0) tappedAnswer = true;
        stop?.abort();
      }
    };
    tapRef.current = onTap;

    const waitForTap = (ms: number) =>
      new Promise<boolean>((resolve) => {
        const timer = Number.isFinite(ms) ? setTimeout(() => tapWaiter?.(false), ms) : undefined;
        tapWaiter = (tapped) => {
          clearTimeout(timer);
          tapWaiter = null;
          resolve(tapped);
        };
      });

    // Narrate line by line, lighting the letters each line names ("G..." lights the G).
    const say = async (lines: Line[]) => {
      enter("helping");
      for (const line of lines) {
        if (!alive()) return;
        setLit(line.highlight ?? []);
        await ctxRef.current.narrate([line]);
      }
      if (alive()) setLit([]);
    };

    const answer = async (correct: boolean, how: "voice" | "tap") => {
      if (answered.current) return;
      answered.current = true;
      const { skill, word } = configRef.current;
      // A tap can't show the word was read, so it never counts as reading with no help:
      // it scores like a read after a hint, and tomorrow's plan practices the word again.
      const hints = how === "tap" ? Math.max(hintsUsed, 1) : hintsUsed;
      ctxRef.current.log({ skill, correct, hintsUsed: hints, ms: Math.round(performance.now() - startedAt), mode: how });
      enter("done");
      if (correct) {
        setWon(true);
        await wait(word.length * FLASH_STEP_MS + 450);
      }
      if (alive()) ctxRef.current.succeed();
    };

    (async () => {
      let voice = canListen();
      while (alive()) {
        const { word, accept, giveUp } = configRef.current;
        let how: "voice" | "tap" | null = null;

        if (voice) {
          // The book has just spoken (and "home" ends its own sentence on the last page),
          // so give its voice a moment to fade before the microphone opens.
          playSfx("listen"); // "your turn", softly; the settle below keeps it out of the microphone
          await wait(SETTLE_MS);
          if (!alive()) return;
          enter("listening");
          stop = new AbortController();
          const heard = await listenFor((h) => matchesWord(h, word, accept), { timeoutMs: LISTEN_MS, signal: stop.signal });
          stop = null;
          if (!alive()) return;
          if (tappedAnswer) how = "tap";
          else if (heard.status === "unavailable") {
            // No microphone after all: switch to tap mode. This is not the child's miss.
            voice = false;
            continue;
          }
          else if (heard.status === "match") how = "voice";
        } else {
          enter("tap");
          // After two hints the timer stops; the glowing word waits for her tap.
          const tapped = await waitForTap(hintsUsed < MAX_HINTS ? LISTEN_MS : Infinity);
          if (!alive()) return;
          if (tapped) how = "tap";
          else if (hintsUsed >= MAX_HINTS) continue;
        }

        if (how) return answer(true, how);

        if (hintsUsed < MAX_HINTS) {
          hintsUsed++;
          await say(ctxRef.current.help);
          continue;
        }

        // Two hints and still no word: say it together, cheer, and move on.
        await say(giveUp);
        if (!alive()) return;
        return answer(false, "voice");
      }
    })();

    return () => {
      cancelled = true;
      if (tapRef.current === onTap) tapRef.current = null;
      stop?.abort();
      tapWaiter?.(false);
      stopListening();
      if (!answered.current) {
        setMode("waiting");
        setLit([]);
      }
    };
  }, [active]);

  const letters = config.word.toUpperCase().split("");
  const listening = mode === "listening";
  const tapReady = mode === "tap";
  const interactive = active && (listening || tapReady);
  const anyLit = lit.length > 0;

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className="absolute"
        style={{ left: `${config.place.x}%`, top: `${config.place.y}%`, transform: "translate(-50%, -50%)" }}
      >
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.94 }}
          animate={{ opacity: 1, scale: won && !reduceMotion ? 1.06 : 1 }}
          transition={{ duration: won ? 0.5 : 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            onClick={() => tapRef.current?.()}
            disabled={!active || mode === "done"}
            aria-label={letters.join("")}
            className="pointer-events-auto relative flex items-center rounded-full px-[0.5em] pb-[0.14em] pt-[0.2em] font-bold leading-none tracking-[0.04em] disabled:cursor-default"
            style={{
              fontSize: "clamp(3.5rem, min(9vw, 14dvh), 8rem)",
              background: "radial-gradient(120% 140% at 50% 0%, #2c3680 0%, #1e2a5e 55%, #121a40 100%)",
            }}
            initial={false}
            animate={{
              boxShadow:
                tapReady && !reduceMotion ? [PILL_CALM, PILL_BRIGHT, PILL_CALM] : tapReady || won ? PILL_BRIGHT : PILL_CALM,
            }}
            transition={tapReady && !reduceMotion ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.5 }}
            whileTap={interactive && !reduceMotion ? { scale: 0.96 } : undefined}
          >
            {/* Warm light fills the pill when the word is read. */}
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{ background: "radial-gradient(90% 120% at 50% 40%, rgba(245,201,105,0.38) 0%, rgba(245,201,105,0) 75%)" }}
              initial={false}
              animate={{ opacity: won ? 1 : 0 }}
              transition={{ duration: 0.6 }}
            />

            <ListeningRing on={listening} reduceMotion={!!reduceMotion} />

            {letters.map((ch, i) => {
              const on = lit.includes(i);
              return (
                <motion.span
                  key={i}
                  aria-hidden
                  className="relative inline-block"
                  initial={false}
                  animate={
                    won
                      ? {
                          color: [MOON, "#fff4cf", GOLD],
                          textShadow: [GLOW_OFF, GLOW_ON, GLOW_ON],
                          scale: reduceMotion ? 1 : [1, 1.22, 1],
                        }
                      : {
                          color: on ? GOLD : anyLit ? MOON_DIM : MOON,
                          textShadow: on ? GLOW_ON : GLOW_OFF,
                          scale: on && !reduceMotion ? 1.08 : 1,
                        }
                  }
                  transition={
                    won
                      ? { delay: reduceMotion ? 0 : (i * FLASH_STEP_MS) / 1000, duration: reduceMotion ? 0.2 : 0.45 }
                      : { duration: 0.25 }
                  }
                >
                  {ch}
                </motion.span>
              );
            })}
          </motion.button>

          {/* What the book is doing: an ear while it listens, a fingertip when the word wants a tap. */}
          <div className="pointer-events-none absolute left-1/2 top-full mt-3 h-12 w-12 -translate-x-1/2">
            <AnimatePresence>
              {listening && (
                <motion.div
                  key="ear"
                  className="absolute inset-0 text-gold"
                  initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                  animate={{ opacity: reduceMotion ? 0.9 : [0.55, 1, 0.55], y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                  transition={reduceMotion ? { duration: 0.3 } : { opacity: { duration: 2, repeat: Infinity, ease: "easeInOut" }, y: { duration: 0.4 } }}
                >
                  <EarGlyph />
                </motion.div>
              )}
              {tapReady && (
                <motion.div
                  key="tap"
                  className="absolute inset-0 text-gold"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.2 } }}
                >
                  <TapGlyph reduceMotion={!!reduceMotion} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      <span className="sr-only" aria-live="polite">
        {listening ? "Listening." : tapReady ? `Read the word out loud, then tap ${letters.join("")}.` : ""}
      </span>
    </div>
  );
}

/** A soft gold ring that breathes outward around the word while the book listens. */
function ListeningRing({ on, reduceMotion }: { on: boolean; reduceMotion: boolean }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.span
          key="ring"
          aria-hidden
          className="pointer-events-none absolute -inset-[0.12em] rounded-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.25 } }}
        >
          <span className="absolute inset-0 rounded-full border-2 border-gold/45" />
          {!reduceMotion && (
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-gold/80"
              animate={{ scale: [1, 1.14], opacity: [0.75, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
          )}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function EarGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 3.2-2.2 4.3-3.4 5.6-1 1.1-1 2.4-1.6 3.6A3 3 0 0 1 7 17" />
      <path d="M9.5 9.2a2.5 2.5 0 0 1 5 0c0 1.5-1.5 1.9-1.5 3.3" />
      <path d="M19.8 6.5a7 7 0 0 1 0 5" opacity="0.6" />
    </svg>
  );
}

/** A fingertip with ripples: "tap here". */
function TapGlyph({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className="h-full w-full" aria-hidden overflow="visible">
      <circle cx="24" cy="24" r="6" fill="currentColor" />
      {[0, 1].map((k) =>
        reduceMotion ? (
          <circle key={k} cx="24" cy="24" r={12 + k * 7} fill="none" stroke="currentColor" strokeWidth="1.6" opacity={0.5 - k * 0.2} />
        ) : (
          <motion.circle
            key={k}
            cx="24"
            cy="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            initial={{ r: 8, opacity: 0.8 }}
            animate={{ r: [8, 22], opacity: [0.8, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: k * 0.9 }}
          />
        ),
      )}
    </svg>
  );
}
