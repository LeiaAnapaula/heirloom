"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, type CSSProperties } from "react";
import type { ArtId } from "@/lib/episode";
import { Rocket, Sparkle, StarSprite } from "./art/sprites";

export type Mood = "idle" | "celebrate";

/**
 * The illustration for a screen: a painted background from public/art, plus any
 * characters that react when the child succeeds (the rocket lifts off, the star flies home).
 * Interactive pieces (planets, pencil, feather) belong to their interaction components.
 */
export default function Scene({ art, mood }: { art: ArtId; mood: Mood }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(/art/${art}.svg)` }} />
      {art === "book-wakes" && <BookWakesStage />}
      {art === "launch-pad" && <LaunchStage mood={mood} />}
      {art === "star-home" && <StarHomeStage mood={mood} />}
    </div>
  );
}

/* All stage geometry is in percent of the spread, which the Book keeps at 3:2. */
const SPREAD_ASPECT = 3 / 2;

/** A box on the spread: centered on x, top edge at `top`, `h` tall, with the given width/height ratio. */
function box(x: number, top: number, h: number, ratio = 1): CSSProperties {
  const w = (h * ratio) / SPREAD_ASPECT;
  return { position: "absolute", left: `${x - w / 2}%`, top: `${top}%`, width: `${w}%`, height: `${h}%` };
}

/** Same, but centered on (x, y). */
function boxAround(x: number, y: number, h: number, ratio = 1): CSSProperties {
  return box(x, y - h / 2, h, ratio);
}

/* ------------------------------------------------------------- Book wakes */

/** Where the falling star's trail ends in the background painting. */
const FALLEN = { x: 60, y: 62, h: 7 };

/** Screen 1: a tiny star twinkles where the falling star landed. Decorative only. */
function BookWakesStage() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* `initial` keeps the server markup the same whether or not motion is reduced. */}
      <motion.div
        style={boxAround(FALLEN.x, FALLEN.y, FALLEN.h)}
        initial={{ scale: 1, opacity: 0.9, rotate: 0 }}
        animate={reduce ? undefined : { scale: [1, 1.18, 0.94, 1.08, 1], opacity: [0.9, 1, 0.8, 1, 0.9], rotate: [0, 8, -4, 4, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <StarSprite className="h-full w-full" />
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------- Launch pad */

/** The rocket's box: centered on x, standing from `top` down to the pad. Its fins touch y 115 of 120. */
const ROCKET = { x: 22, top: 39, h: 40 };
const PAD_Y = ROCKET.top + (ROCKET.h * 115) / 120;
const RUMBLE_S = 0.9;
const LIFT_S = 1.9;

// Smoke that billows out along the pad: warm where the flame lights it, cool and slow further out.
// dx is how far it drifts in % of the spread's width, rise in % of its height, size its height in %.
type Puff = { dx: number; rise: number; size: number; delay: number; life: number; warm?: boolean; front?: boolean };
const PUFFS: Puff[] = [
  { dx: -1.4, rise: 0.5, size: 4.5, delay: 0.12, life: 2.4, warm: true },
  { dx: 1.6, rise: 0.4, size: 5, delay: 0.2, life: 2.4, warm: true },
  { dx: -4, rise: 0.9, size: 6.5, delay: 0.35, life: 3.2 },
  { dx: 4.4, rise: 1, size: 7, delay: 0.42, life: 3.2 },
  { dx: 0.3, rise: 0.6, size: 6, delay: 0.5, life: 2.8, warm: true, front: true },
  { dx: -7.4, rise: 1.6, size: 8.5, delay: 0.62, life: 3.8 },
  { dx: 8, rise: 1.9, size: 9, delay: 0.7, life: 3.8 },
  { dx: -2.6, rise: 1.2, size: 8, delay: 0.78, life: 3.6, front: true },
  { dx: 3, rise: 1.4, size: 8.5, delay: 0.86, life: 3.6, front: true },
  { dx: -0.4, rise: 2.4, size: 9.5, delay: 0.95, life: 3.8, front: true },
  { dx: -10.6, rise: 2.8, size: 11, delay: 1.0, life: 4.6 },
  { dx: 11.2, rise: 3.2, size: 11.5, delay: 1.08, life: 4.6 },
  { dx: 0.6, rise: 4.4, size: 10, delay: 1.2, life: 4.4, front: true },
  { dx: -5.8, rise: 2.2, size: 10, delay: 1.3, life: 4.4, front: true },
  { dx: 6.4, rise: 2.6, size: 10.5, delay: 1.4, life: 4.4, front: true },
  { dx: -13.4, rise: 1.4, size: 9, delay: 1.5, life: 4.2 },
  { dx: 13.8, rise: 1.6, size: 9, delay: 1.55, life: 4.2 },
];
// Puffs are wider than tall: smoke spreads along the ground before it rises.
const PUFF_RATIO = 1.5;
const SMOKE_COOL =
  "radial-gradient(closest-side, rgba(240,235,246,0.8), rgba(206,202,228,0.5) 42%, rgba(169,184,232,0.14) 72%, rgba(169,184,232,0))";
const SMOKE_WARM =
  "radial-gradient(closest-side, rgba(255,240,206,0.9), rgba(245,214,150,0.5) 42%, rgba(245,201,105,0.12) 72%, rgba(245,201,105,0))";

/** Screen 2: the rocket on its pad. On celebrate it rumbles, smoke billows, and it lifts off. */
function LaunchStage({ mood }: { mood: Mood }) {
  const go = mood === "celebrate";
  const reduce = !!useReducedMotion();
  const rocketBox = box(ROCKET.x, ROCKET.top, ROCKET.h, 60 / 120);

  // Up and out of the top of the spread, flame and all.
  const away = { y: "-235%", transition: { delay: RUMBLE_S, duration: LIFT_S, ease: [0.5, 0, 0.88, 0.4] as const } };
  const fade = { opacity: 0, transition: { delay: 0.7, duration: 1.1, ease: "easeInOut" as const } };
  const rest = { y: "0%", opacity: 1, transition: { duration: 0 } };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Contact shadow that grounds the rocket; it melts away once the rocket leaves. */}
      <motion.div
        style={{ ...boxAround(ROCKET.x, PAD_Y + 0.6, 3, 5), background: "radial-gradient(closest-side, rgba(5,8,26,0.55), rgba(5,8,26,0))" }}
        animate={{ opacity: go ? 0 : 1 }}
        transition={go ? { delay: RUMBLE_S + 0.4, duration: 0.8 } : { duration: 0 }}
      />
      {go && <PadLight reduce={reduce} />}
      {go && !reduce && <Smoke front={false} />}

      <div style={rocketBox}>
        <motion.div className="h-full w-full" animate={go ? (reduce ? fade : away) : rest}>
          <motion.div
            className="h-full w-full"
            animate={
              go && !reduce
                ? {
                    x: ["0%", "-3%", "3%", "-3.5%", "3%", "-3%", "3.5%", "-2.5%", "2.5%", "-2%", "1.5%", "-1%", "0.5%", "0%"],
                    rotate: [0, -0.8, 0.7, -0.8, 0.8, -0.6, 0.7, -0.5, 0.5, -0.4, 0.3, -0.2, 0.1, 0],
                  }
                : { x: "0%", rotate: 0 }
            }
            transition={go && !reduce ? { duration: RUMBLE_S + 0.5, ease: "linear" } : { duration: 0 }}
          >
            <Rocket className="h-full w-full" flame={go} />
          </motion.div>
        </motion.div>
      </div>

      {go && !reduce && <Smoke front />}
    </div>
  );
}

/** The engine's warm light on the pad and the smoke. */
function PadLight({ reduce }: { reduce: boolean }) {
  return (
    <motion.div
      style={{
        ...boxAround(ROCKET.x, PAD_Y - 1, 16, 2.2),
        background: "radial-gradient(closest-side, rgba(255,227,163,0.55), rgba(245,201,105,0.22) 45%, rgba(245,201,105,0))",
      }}
      initial={{ opacity: 0 }}
      animate={reduce ? { opacity: [0, 0.8, 0] } : { opacity: [0, 0.85, 1, 0.75, 0] }}
      transition={reduce ? { duration: 2, times: [0, 0.3, 1] } : { duration: RUMBLE_S + LIFT_S, times: [0, 0.12, 0.35, 0.55, 1] }}
    />
  );
}

function Smoke({ front }: { front: boolean }) {
  return (
    <>
      {PUFFS.filter((p) => !!p.front === front).map((p, i) => {
        // Transforms are relative to the puff's own size, so turn spread % into puff %.
        const x = (p.dx / ((p.size * PUFF_RATIO) / SPREAD_ASPECT)) * 100;
        const y = (-p.rise / p.size) * 100;
        return (
          <motion.div
            key={i}
            style={{ ...boxAround(ROCKET.x, PAD_Y - 1.2, p.size, PUFF_RATIO), background: p.warm ? SMOKE_WARM : SMOKE_COOL }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{
              opacity: [0, p.warm ? 0.9 : 0.82, p.warm ? 0.5 : 0.62, 0],
              scale: [0.3, 1, 1.45, 1.75],
              x: ["0%", `${x * 0.55}%`, `${x * 0.9}%`, `${x}%`],
              y: ["0%", `${y * 0.3}%`, `${y * 0.75}%`, `${y}%`],
            }}
            transition={{ duration: p.life, delay: p.delay, times: [0, 0.16, 0.55, 1], ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------- Star home */

/** The star in the child's hands, the gap in the constellation it returns to, and how small it gets there. */
const STAR_HELD = { x: 50, y: 66, h: 13 };
const STAR_SKY = { y: 24, scale: 0.26 };
const HANDS = { x: 50, top: 64, h: 20, ratio: 170 / 100 };
const RISE_S = 3.4;

// Slow at both ends, like something being let go and then arriving.
const riseEase = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;
const riseTimeAt = (progress: number) => Math.acos(1 - 2 * progress) / Math.PI;

// Sparkles shed along the way up: where (0 at the hands, 1 in the sky), how far off the path, how big.
const TRAIL = [
  { at: 0.05, dx: -1.4, h: 3.4 },
  { at: 0.11, dx: 1.6, h: 2.6 },
  { at: 0.18, dx: -0.6, h: 3 },
  { at: 0.25, dx: 1.2, h: 3.6 },
  { at: 0.32, dx: -1.7, h: 2.4 },
  { at: 0.39, dx: 0.5, h: 3.2 },
  { at: 0.46, dx: -1, h: 2.6 },
  { at: 0.53, dx: 1.5, h: 3 },
  { at: 0.6, dx: -0.4, h: 2.4 },
  { at: 0.67, dx: 1, h: 2.6 },
  { at: 0.74, dx: -1.2, h: 2.2 },
  { at: 0.81, dx: 0.6, h: 2 },
  { at: 0.88, dx: -0.5, h: 1.8 },
];
const BURST = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4 + Math.PI / 8);

/** Screen 6: the star rests in cupped hands. On celebrate it rises home and settles, twinkling. */
function StarHomeStage({ mood }: { mood: Mood }) {
  const go = mood === "celebrate";
  const reduce = !!useReducedMotion();
  const climb = ((STAR_HELD.y - STAR_SKY.y) / STAR_HELD.h) * 100;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <Hands glow={!go} reduce={reduce} />

      {/* The star, held. It breathes; on celebrate it rises to its place in the sky. */}
      <motion.div
        style={boxAround(STAR_HELD.x, STAR_HELD.y, STAR_HELD.h)}
        animate={
          !go
            ? { y: "0%", scale: 1, opacity: 1 }
            : reduce
              ? { opacity: 0, transition: { duration: 0.9 } }
              : { y: `-${climb}%`, scale: STAR_SKY.scale, transition: { duration: RISE_S, ease: riseEase } }
        }
        transition={{ duration: 0 }}
      >
        <motion.div
          className="h-full w-full"
          initial={{ scale: 1, opacity: 1 }}
          animate={
            reduce
              ? undefined
              : go
                ? { scale: [1, 1.22, 0.92, 1.1, 1], opacity: [1, 1, 0.82, 1, 1] }
                : { scale: [1, 1.05, 1], opacity: [0.94, 1, 0.94] }
          }
          transition={
            go
              ? { delay: RISE_S + 0.2, duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }
          }
        >
          <StarSprite className="h-full w-full" />
        </motion.div>
      </motion.div>

      {go && reduce && (
        <motion.div
          style={boxAround(STAR_HELD.x, STAR_SKY.y, STAR_HELD.h * STAR_SKY.scale)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.9 }}
        >
          <StarSprite className="h-full w-full" />
        </motion.div>
      )}

      {go && !reduce && (
        <>
          {TRAIL.map((s, i) => (
            <motion.div
              key={i}
              style={boxAround(STAR_HELD.x + s.dx, STAR_HELD.y - s.at * (STAR_HELD.y - STAR_SKY.y), s.h)}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: [0, 1, 0], scale: [0.2, 1, 0.3], y: ["0%", "40%", "120%"], rotate: [0, 30, 60] }}
              transition={{ delay: riseTimeAt(s.at) * RISE_S, duration: 1.3, ease: "easeOut" }}
            >
              <Sparkle className="h-full w-full" />
            </motion.div>
          ))}
          <Arrival />
        </>
      )}
    </div>
  );
}

/** A ring of light and a scatter of glints where the star arrives. */
function Arrival() {
  const at = { x: STAR_HELD.x, y: STAR_SKY.y };
  return (
    <>
      <motion.div
        style={{
          ...boxAround(at.x, at.y, 14),
          background: "radial-gradient(closest-side, rgba(255,241,196,0) 55%, rgba(255,227,163,0.5) 72%, rgba(245,201,105,0) 100%)",
        }}
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.2, 1, 1.5] }}
        transition={{ delay: RISE_S - 0.05, duration: 1.1, ease: "easeOut" }}
      />
      {BURST.map((angle, i) => {
        const reach = i % 2 ? 260 : 380; // in % of the glint's own size
        return (
          <motion.div
            key={i}
            style={boxAround(at.x, at.y, i % 2 ? 1.8 : 2.4)}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0.3, 1, 0.4],
              x: ["0%", `${Math.cos(angle) * reach}%`],
              y: ["0%", `${Math.sin(angle) * reach}%`],
            }}
            transition={{ delay: RISE_S, duration: 1.2, ease: "easeOut" }}
          >
            <Sparkle className="h-full w-full" />
          </motion.div>
        );
      })}
    </>
  );
}

// The left hand, palm up, seen from above as if they were the reader's own hands.
// The right hand is its mirror image; the pinky edges meet at x 85.
const PALM = "M85 44V100H48C44 90 36 82 31.5 72C27.5 62 27.2 52 29.2 47C30.4 44 33 42.6 36 42.6Z";
const THUMB = "M44 84C34 80 24 70 20 58C17 50 17 42.5 21.5 40C26 37.6 29.4 41.6 30.6 47C32.4 55 36.4 63 43 70Z";
// Index to pinky. Each finger tapers and leans toward the middle, the way cupped fingers curl.
const FINGERS = [
  "M29 52C29.5 40 31 28 33.3 21C35 14.6 45.5 14.6 45.8 21.2C45.6 30 44.6 42 43.8 52Z",
  "M43.4 52C43.6 38 44.6 24 46.1 15.6C47.4 9 58.6 9 59 15.8C59.2 26 58.6 40 58 52Z",
  "M57.8 52C58 40 58.8 28 60 19C61 12.6 71.8 12.6 72.4 19.2C72.8 28 72.4 40 72 52Z",
  "M71.8 52C72 44 72.6 34 73.8 27C74.8 20.6 84.6 20.4 85 27V52Z",
];

/**
 * Two cupped hands, painted as one soft silhouette in a neutral lavender-cream (never a
 * particular skin tone), rim-lit in gold by the star they hold. viewBox 0 0 170 100.
 */
function Hands({ glow, reduce }: { glow: boolean; reduce: boolean }) {
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const id = (n: string) => `h${raw}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;
  const hand = (
    <>
      <path d={PALM} fill={url("skin")} />
      <ellipse cx="40" cy="70" rx="9" ry="14" transform="rotate(-24 40 70)" fill={url("mound")} />
      <path d={THUMB} fill={url("skin")} />
      <path d="M30.6 47C32.4 55 36.4 63 43 70" fill="none" stroke="#4e4688" strokeWidth="2" strokeLinecap="round" opacity="0.22" />
      {FINGERS.map((d) => (
        <path key={d} d={d} fill={url("skin")} />
      ))}
      {/* Fingers part at the tips and press together toward the palm. */}
      <g mask={url("tips")}>
        {FINGERS.map((d) => (
          <path key={d} d={d} fill={url("edge")} />
        ))}
      </g>
      {/* Where the two palms meet, a soft valley of shadow. */}
      <path d="M83.6 48C84.4 48 85 48 85 48V100H80C81 80 82.4 62 83.6 48Z" fill={url("seam")} />
    </>
  );
  return (
    <div style={box(HANDS.x, HANDS.top, HANDS.h, HANDS.ratio)}>
      <svg viewBox="0 0 170 100" className="h-full w-full" overflow="visible">
        <defs>
          {/* One paint for palm and fingers, so they flow into each other; it fades out at the wrists. */}
          <linearGradient id={id("skin")} x1="0" y1="10" x2="0" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ece2e6" />
            <stop offset="0.38" stopColor="#c6bbd6" />
            <stop offset="0.64" stopColor="#968bbd" />
            <stop offset="0.8" stopColor="#6a619c" />
            <stop offset="0.92" stopColor="#4a4386" stopOpacity="0.5" />
            <stop offset="1" stopColor="#3b3478" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={id("seam")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b3478" stopOpacity="0" />
            <stop offset="1" stopColor="#3b3478" stopOpacity="0.2" />
          </linearGradient>
          <radialGradient id={id("mound")}>
            <stop offset="0" stopColor="#e9dfe5" stopOpacity="0.5" />
            <stop offset="1" stopColor="#e9dfe5" stopOpacity="0" />
          </radialGradient>
          {/* Each finger darkens toward its outer side, which is what separates one from the next. */}
          <linearGradient id={id("edge")} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#4e4688" stopOpacity="0.55" />
            <stop offset="0.42" stopColor="#4e4688" stopOpacity="0" />
            <stop offset="0.78" stopColor="#ffd98a" stopOpacity="0" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={id("fade")} x1="0" y1="14" x2="0" y2="54" gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#ffffff" />
            <stop offset="1" stopColor="#000000" />
          </linearGradient>
          <mask id={id("tips")} maskUnits="userSpaceOnUse" x="0" y="0" width="170" height="100">
            <rect width="170" height="100" fill={url("fade")} />
          </mask>
          <radialGradient id={id("warm")} cx="85" cy="22" r="72" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.75" />
            <stop offset="0.45" stopColor="#f5c969" stopOpacity="0.3" />
            <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
          </radialGradient>
          {/* A clip may only hold shapes, so both hands' outlines go in flat. */}
          <clipPath id={id("both")}>
            {[PALM, THUMB, ...FINGERS].flatMap((d) => [
              <path key={d} d={d} />,
              <path key={`${d}-mirror`} d={d} transform="translate(170 0) scale(-1 1)" />,
            ])}
          </clipPath>
        </defs>
        <g>{hand}</g>
        <g transform="translate(170 0) scale(-1 1)">{hand}</g>
        {/* The star's warm light on the hands; it softens once the star has gone. */}
        <motion.rect
          x="0"
          y="0"
          width="170"
          height="100"
          fill={url("warm")}
          clipPath={url("both")}
          initial={false}
          animate={{ opacity: glow ? 1 : 0.3 }}
          transition={{ duration: reduce ? 0.6 : 2.4, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}
