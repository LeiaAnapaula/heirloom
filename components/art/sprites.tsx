"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId, type CSSProperties } from "react";

/**
 * The cast, painted in SVG so it stays crisp on a tablet. Each sprite keeps a fixed
 * viewBox, props and anchor point, so scenes can move them around without caring how they look.
 *
 * House style: painterly-flat. Soft gradients instead of outlines, a warm key light from
 * the upper left, cool night light in the shadows. Paint ids are unique per instance, so a
 * page can hold many planets without their gradients clashing.
 */

type SpriteProps = { className?: string; style?: CSSProperties };

/** CSS-safe ids for one sprite instance's gradients and clips. */
function usePaint() {
  const base = "p" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return {
    id: (name: string) => `${base}-${name}`,
    url: (name: string) => `url(#${base}-${name})`,
  };
}

/* ------------------------------------------------------------------ Rocket */

// The hull, nose to base. Paths are written out (not computed) so server and browser
// always render identical markup.
const HULL = "M30 5C41 14.5 46.4 33 46.2 52C46 66 44.6 80 41.6 92Q30 95.6 18.4 92C15.4 80 14 66 13.8 52C13.6 33 19 14.5 30 5Z";
const FIN_L = "M16.2 58C10.4 66 6.6 78.5 5.6 95L4.9 112.4C4.8 115.2 6.8 116.2 8.4 114.2L18.8 100.6V86Z";
const FIN_R = "M43.8 58C49.6 66 53.4 78.5 54.4 95L55.1 112.4C55.2 115.2 53.2 116.2 51.6 114.2L41.2 100.6V86Z";

/**
 * Points up. viewBox 0 0 60 120; the nozzle is at (30, 100) and the fin tips rest on
 * the ground at y 115. `flame` lights the engine (it flickers unless motion is reduced).
 */
export function Rocket({ className, style, flame = false }: SpriteProps & { flame?: boolean }) {
  const p = usePaint();
  return (
    <svg viewBox="0 0 60 120" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <linearGradient id={p.id("hull")} x1="0" x2="1">
          <stop offset="0" stopColor="#ded5c2" />
          <stop offset="0.2" stopColor="#fffaee" />
          <stop offset="0.5" stopColor="#f4ecd8" />
          <stop offset="0.8" stopColor="#c7c0d6" />
          <stop offset="1" stopColor="#8b86aa" />
        </linearGradient>
        <linearGradient id={p.id("gold")} x1="0" x2="1">
          <stop offset="0" stopColor="#e2a54a" />
          <stop offset="0.28" stopColor="#ffe3a3" />
          <stop offset="0.62" stopColor="#f5c969" />
          <stop offset="1" stopColor="#b5752b" />
        </linearGradient>
        <linearGradient id={p.id("seam")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3478" stopOpacity="0.28" />
          <stop offset="1" stopColor="#3b3478" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={p.id("fin-l")} x1="0.1" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#f7c56c" />
          <stop offset="0.5" stopColor="#df9440" />
          <stop offset="1" stopColor="#b5652f" />
        </linearGradient>
        <linearGradient id={p.id("fin-r")} x1="0.9" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#d99a4a" />
          <stop offset="0.5" stopColor="#b06a33" />
          <stop offset="1" stopColor="#7f4429" />
        </linearGradient>
        <linearGradient id={p.id("steel")} x1="0" x2="1">
          <stop offset="0" stopColor="#58557a" />
          <stop offset="0.3" stopColor="#b9b4cc" />
          <stop offset="0.7" stopColor="#6f6a8e" />
          <stop offset="1" stopColor="#3a375c" />
        </linearGradient>
        <radialGradient id={p.id("sheen")}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={p.id("rim")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b52a6" />
          <stop offset="1" stopColor="#1e2a5e" />
        </linearGradient>
        <radialGradient id={p.id("glass")} cx="0.5" cy="0.62" r="0.62">
          <stop offset="0" stopColor="#fff4d2" />
          <stop offset="0.45" stopColor="#f5c969" />
          <stop offset="1" stopColor="#b36f2a" />
        </radialGradient>
        <radialGradient id={p.id("lamp")}>
          <stop offset="0.45" stopColor="#f5c969" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <clipPath id={p.id("hull-clip")}>
          <path d={HULL} />
        </clipPath>
      </defs>

      {flame && <EngineFlame paint={p} />}

      {/* Fins first, so the hull sits in front of their roots. */}
      <path d={FIN_L} fill={p.url("fin-l")} />
      <path d="M18.8 88V100.6L8.4 114.2C10.6 107 14 98.5 18.8 88Z" fill="#8e4a2a" opacity="0.35" />
      <path d={FIN_R} fill={p.url("fin-r")} />
      <path d="M55.1 112.4C55.2 115.2 53.2 116.2 51.6 114.2C53.4 113 54.2 104 54 95.5C54.6 101 55.2 107 55.1 112.4Z" fill="#a9b8e8" opacity="0.35" />

      {/* Engine bell. */}
      <path d="M22.5 90H37.5L40 99.2H20Z" fill={p.url("steel")} />
      <rect x="19.4" y="98.4" width="21.2" height="2.2" rx="1.1" fill={p.url("steel")} />
      <ellipse cx="30" cy="100.4" rx="9.6" ry="1" fill={flame ? "#ffe9b0" : "#1b1838"} />

      {/* Hull, with its gold nose cone and band. */}
      <path d={HULL} fill={p.url("hull")} />
      <g clipPath={p.url("hull-clip")}>
        <path d="M0 0H60V27Q30 33.5 0 27Z" fill={p.url("gold")} />
        <path d="M0 27Q30 33.5 60 27V33Q30 39.5 0 33Z" fill={p.url("seam")} />
        <path d="M0 77Q30 82 60 77V81Q30 86 0 81Z" fill={p.url("gold")} />
        <ellipse cx="20.5" cy="56" rx="2.4" ry="27" fill={p.url("sheen")} opacity="0.55" />
        <path d="M41 16C45.6 29 46.8 41 46.6 53C46.4 66 45 80 42 92" fill="none" stroke="#a9b8e8" strokeWidth="2.2" opacity="0.5" />
        <ellipse cx="24.6" cy="18" rx="1.5" ry="7.5" transform="rotate(16 24.6 18)" fill={p.url("sheen")} opacity="0.6" />
      </g>

      {/* Porthole: a warm lamp glows inside. */}
      <circle cx="30" cy="47" r="12" fill={p.url("lamp")} />
      <circle cx="30" cy="47" r="7.8" fill={p.url("rim")} />
      <circle cx="30" cy="47" r="5.8" fill={p.url("glass")} />
      <path d="M26.2 45.6A4.4 4.4 0 0 1 31.4 42.4A5.6 5.6 0 0 0 26.2 45.6Z" fill="#ffffff" opacity="0.7" />

      {/* A small star emblem below the window. */}
      <path d="M30 60.2C30.3 62.6 30.9 63.2 33.2 63.5C30.9 63.8 30.3 64.4 30 66.8C29.7 64.4 29.1 63.8 26.8 63.5C29.1 63.2 29.7 62.6 30 60.2Z" fill="#e9ad4f" />
    </svg>
  );
}

function EngineFlame({ paint: p }: { paint: ReturnType<typeof usePaint> }) {
  const reduce = useReducedMotion();
  return (
    <g>
      <defs>
        <radialGradient id={p.id("flame-glow")}>
          <stop offset="0" stopColor="#ffe3a3" stopOpacity="0.7" />
          <stop offset="0.5" stopColor="#f5c969" stopOpacity="0.25" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={p.id("flame-out")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3a3" />
          <stop offset="0.45" stopColor="#f5c969" />
          <stop offset="0.8" stopColor="#d99a2b" stopOpacity="0.55" />
          <stop offset="1" stopColor="#d99a2b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={p.id("flame-in")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.6" stopColor="#fff1c4" />
          <stop offset="1" stopColor="#fff1c4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.ellipse
        cx="30"
        cy="108"
        rx="17"
        ry="15"
        fill={p.url("flame-glow")}
        initial={{ opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { opacity: [0.75, 1, 0.8, 0.95, 0.75] }}
        transition={reduce ? { duration: 0.3 } : { duration: 0.7, repeat: Infinity, ease: "linear" }}
      />
      {/* Grows out of the nozzle, then flickers around the nozzle mouth. */}
      <motion.g style={{ originY: 0 }} initial={{ scaleY: 0.2, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}>
        <motion.g
          style={{ originY: 0 }}
          initial={{ scaleY: 1, scaleX: 1 }}
          animate={reduce ? undefined : { scaleY: [1, 0.86, 1.1, 0.93, 1.05, 1], scaleX: [1, 1.05, 0.95, 1.03, 0.97, 1] }}
          transition={{ duration: 0.45, repeat: Infinity, ease: "linear" }}
        >
          <path d="M20.6 100.2C20.2 108 24.6 117 30 129C35.4 117 39.8 108 39.4 100.2Z" fill={p.url("flame-out")} />
          <path d="M24.4 100.2C24.2 105.4 26.6 111.4 30 119C33.4 111.4 35.8 105.4 35.6 100.2Z" fill={p.url("flame-in")} />
        </motion.g>
      </motion.g>
    </g>
  );
}

/* -------------------------------------------------------------------- Star */

// A soft five-point star centered on (50, 51), tips rounded, plus the ten bevel facets
// that give it a gentle, carved-light shape. Each facet carries how much it faces the light.
const STAR =
  "M46.91 21.55Q50 15 53.09 21.55L58.64 33.35Q60.29 36.84 64.12 37.33L77.05 38.97Q84.24 39.88 78.96 44.84L69.46 53.76Q66.64 56.41 67.37 60.2L69.81 73.01Q71.16 80.12 64.81 76.64L53.39 70.36Q50 68.5 46.61 70.36L35.19 76.64Q28.84 80.12 30.19 73.01L32.63 60.2Q33.36 56.41 30.54 53.76L21.04 44.84Q15.76 39.88 22.95 38.97L35.88 37.33Q39.71 36.84 41.36 33.35Z";
const STAR_FACETS: [string, number][] = [
  ["M50 51L50 15L60.29 36.84Z", -0.6],
  ["M50 51L60.29 36.84L84.24 39.88Z", 0.95],
  ["M50 51L84.24 39.88L66.64 56.41Z", -0.95],
  ["M50 51L66.64 56.41L71.16 80.12Z", -0.15],
  ["M50 51L71.16 80.12L50 68.5Z", 0.1],
  ["M50 51L50 68.5L28.84 80.12Z", -0.96],
  ["M50 51L28.84 80.12L33.36 56.41Z", 0.96],
  ["M50 51L33.36 56.41L15.76 39.88Z", -0.58],
  ["M50 51L15.76 39.88L39.71 36.84Z", 0.58],
  ["M50 51L39.71 36.84L50 15Z", 0.6],
];
// Long, fine rays: the twinkle a bright star makes in the eye.
const RAYS = "M50 -14L51.2 50L50 114L48.8 50ZM-14 50L50 48.8L114 50L50 51.2Z";
const RAYS_SOFT = "M50 22L50.8 50L50 78L49.2 50ZM22 50L50 49.2L78 50L50 50.8Z";

/** The lost star. viewBox 0 0 100 100, centered. With `glow`, its halo spills past the box. */
export function StarSprite({ className, style, glow = true }: SpriteProps & { glow?: boolean }) {
  const p = usePaint();
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <radialGradient id={p.id("halo")}>
          <stop offset="0" stopColor="#fff1c4" stopOpacity="0.7" />
          <stop offset="0.22" stopColor="#f5c969" stopOpacity="0.32" />
          <stop offset="0.55" stopColor="#f5c969" stopOpacity="0.09" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={p.id("ray")} cx="50" cy="50" r="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff6dc" stopOpacity="0.95" />
          <stop offset="0.4" stopColor="#f5c969" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={p.id("body")} x1="0.2" y1="0" x2="0.75" y2="1">
          <stop offset="0" stopColor="#fff2c6" />
          <stop offset="0.5" stopColor="#f7cf72" />
          <stop offset="1" stopColor="#e9a945" />
        </linearGradient>
        <radialGradient id={p.id("core")} cx="50" cy="49" r="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fffdf3" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fffdf3" stopOpacity="0" />
        </radialGradient>
        <clipPath id={p.id("clip")}>
          <path d={STAR} />
        </clipPath>
      </defs>
      {glow && (
        <g>
          <circle cx="50" cy="50" r="76" fill={p.url("halo")} />
          <path d={RAYS} fill={p.url("ray")} />
          <path d={RAYS_SOFT} fill={p.url("ray")} opacity="0.6" transform="rotate(45 50 50)" />
        </g>
      )}
      <path d={STAR} fill={p.url("body")} />
      <g clipPath={p.url("clip")}>
        {STAR_FACETS.map(([d, light]) => (
          <path key={d} d={d} fill={light > 0 ? "#fffbea" : "#c47f2c"} opacity={Math.abs(light) * (light > 0 ? 0.34 : 0.3)} />
        ))}
        <circle cx="50" cy="49" r="20" fill={p.url("core")} />
      </g>
    </svg>
  );
}

/* ----------------------------------------------------------------- Sparkle */

/** A four-point glint for trails and bursts. viewBox 0 0 40 40, centered; the halo may overflow. */
export function Sparkle({ className, style }: SpriteProps) {
  const p = usePaint();
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <radialGradient id={p.id("halo")}>
          <stop offset="0" stopColor="#ffe9b0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={p.id("fill")} cx="20" cy="20" r="18" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.35" stopColor="#fff1c4" />
          <stop offset="1" stopColor="#f5c969" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="16" fill={p.url("halo")} />
      <path d="M20 1C21 14 26 19 39 20C26 21 21 26 20 39C19 26 14 21 1 20C14 19 19 14 20 1Z" fill={p.url("fill")} />
    </svg>
  );
}

/* ------------------------------------------------------------------ Planet */

// highlight, body, shadow, atmosphere
const PLANET_HUES = {
  rose: ["#f8c9bd", "#d9788a", "#6c3358", "#ffd9cc"],
  teal: ["#bdeee4", "#4fb3b0", "#1c4c66", "#cffff6"],
  violet: ["#d2c6f6", "#7f6fcb", "#2c2566", "#e2d9ff"],
  amber: ["#ffe7b0", "#e5a64a", "#78461f", "#fff1cc"],
  sky: ["#d6e1fb", "#7f98dc", "#283a7c", "#e8efff"],
} satisfies Record<string, [string, string, string, string]>;
export type PlanetHue = keyof typeof PLANET_HUES;

// The ring is drawn in its own tilted frame: the half above y 50 passes behind the planet.
const RING = "M0 50A50 12.5 0 1 0 100 50A50 12.5 0 1 0 0 50ZM9.5 50A40.5 8.6 0 1 1 90.5 50A40.5 8.6 0 1 1 9.5 50Z";
const RING_GAP = "M5.6 50A44.4 10.6 0 1 0 94.4 50A44.4 10.6 0 1 0 5.6 50ZM7 50A43 10 0 1 1 93 50A43 10 0 1 1 7 50Z";

/**
 * viewBox 0 0 100 100. `lit` makes it glow; unlit planets sit quietly in the night's shadow.
 * `ring` adds a tilted ring that passes behind and in front of the planet.
 */
export function Planet({
  className,
  style,
  hue = "teal",
  lit = false,
  ring = false,
}: SpriteProps & { hue?: PlanetHue; lit?: boolean; ring?: boolean }) {
  const p = usePaint();
  const [hi, mid, lo, air] = PLANET_HUES[hue];
  const fade = { transition: "opacity 600ms ease" };
  const ringPaint = (
    <>
      <path d={RING} fill={p.url("ring")} fillRule="evenodd" />
      <path d={RING_GAP} fill={lo} fillRule="evenodd" opacity="0.45" />
    </>
  );
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <radialGradient id={p.id("glow")}>
          <stop offset="0.5" stopColor={air} stopOpacity="0.5" />
          <stop offset="0.72" stopColor={hi} stopOpacity="0.16" />
          <stop offset="1" stopColor={hi} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={p.id("body")} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor={hi} />
          <stop offset="0.48" stopColor={mid} />
          <stop offset="1" stopColor={lo} />
        </radialGradient>
        <radialGradient id={p.id("shade")} cx="0.34" cy="0.3" r="0.92">
          <stop offset="0.5" stopColor="#0a0f2a" stopOpacity="0" />
          <stop offset="0.82" stopColor="#0a0f2a" stopOpacity="0.32" />
          <stop offset="1" stopColor="#0a0f2a" stopOpacity="0.6" />
        </radialGradient>
        <radialGradient id={p.id("spec")}>
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.38" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={p.id("ring")} x1="0" x2="1">
          <stop offset="0" stopColor={hi} stopOpacity="0.25" />
          <stop offset="0.3" stopColor={air} stopOpacity="0.9" />
          <stop offset="0.7" stopColor={hi} stopOpacity="0.75" />
          <stop offset="1" stopColor={mid} stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={p.id("quiet")} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0" stopColor="#1e2a5e" />
          <stop offset="1" stopColor="#0d1333" />
        </linearGradient>
        <clipPath id={p.id("ball")}>
          <circle cx="50" cy="50" r="34" />
        </clipPath>
        <clipPath id={p.id("back")}>
          <rect x="-10" y="0" width="120" height="50" />
        </clipPath>
        <clipPath id={p.id("front")}>
          <rect x="-10" y="50" width="120" height="50" />
        </clipPath>
      </defs>

      <circle cx="50" cy="50" r="58" fill={p.url("glow")} style={{ ...fade, opacity: lit ? 1 : 0 }} />

      {ring && (
        <g transform="rotate(-16 50 50)" style={{ ...fade, opacity: lit ? 1 : 0.4 }}>
          <g clipPath={p.url("back")}>{ringPaint}</g>
        </g>
      )}

      <circle cx="50" cy="50" r="34" fill={p.url("body")} />
      {/* Soft cloud bands, tilted with the ring. */}
      <g clipPath={p.url("ball")}>
        <g transform="rotate(-16 50 50)">
          <ellipse cx="44" cy="36" rx="46" ry="3.2" fill={hi} opacity="0.22" />
          <ellipse cx="52" cy="47" rx="50" ry="6.5" fill={hi} opacity="0.1" />
          <ellipse cx="46" cy="58" rx="50" ry="5" fill={lo} opacity="0.2" />
          <ellipse cx="56" cy="67" rx="44" ry="2.2" fill={hi} opacity="0.16" />
        </g>
      </g>
      <circle cx="50" cy="50" r="34" fill={p.url("shade")} />
      {/* Light on the near rim, and a cool kiss of night on the far one. */}
      <path d="M50 16A34 34 0 0 0 16 50A34 34 0 0 1 50 17.6A32.5 32.5 0 0 1 50 16Z" fill={air} opacity="0.55" />
      <path d="M84 50A34 34 0 0 1 50 84A33 33 0 0 0 83 50.4Z" fill="#a9b8e8" opacity="0.3" />
      <ellipse cx="38" cy="35" rx="11" ry="7" transform="rotate(-35 38 35)" fill={p.url("spec")} />

      {ring && (
        <g transform="rotate(-16 50 50)" style={{ ...fade, opacity: lit ? 1 : 0.4 }}>
          <g clipPath={p.url("front")}>{ringPaint}</g>
        </g>
      )}

      {/* Asleep: the night settles over it. */}
      <circle cx="50" cy="50" r="34.5" fill={p.url("quiet")} style={{ ...fade, opacity: lit ? 0 : 0.66 }} />
    </svg>
  );
}

/* ----------------------------------------------------------------- Feather */

/** viewBox 0 0 40 120, quill pointing down; the quill tip is at (20, 116). */
export function Feather({ className, style }: SpriteProps) {
  const p = usePaint();
  return (
    <svg viewBox="0 0 40 120" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <linearGradient id={p.id("lit")} x1="1" y1="0.2" x2="0" y2="0.6">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="0.6" stopColor="#f7f0dc" />
          <stop offset="1" stopColor="#d6d6ea" />
        </linearGradient>
        <linearGradient id={p.id("shade")} x1="0" y1="0.2" x2="1" y2="0.7">
          <stop offset="0" stopColor="#efe6cf" />
          <stop offset="0.55" stopColor="#ddd5c6" />
          <stop offset="1" stopColor="#aeb4d8" />
        </linearGradient>
        <linearGradient id={p.id("quill")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3e3b4" />
          <stop offset="1" stopColor="#c9a764" />
        </linearGradient>
        <linearGradient id={p.id("sheen")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5c969" stopOpacity="0" />
          <stop offset="0.55" stopColor="#f5c969" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Left vane, in the light, with one soft split. */}
      <path
        d="M21.2 4C15 10.4 10.6 22 9.4 36C8.6 45 8.6 52.6 9.2 59.8Q12.2 61.6 15.4 64Q12.4 62.4 9.8 61.6C11.2 73.6 14.8 85 20.4 95.2C21.2 70 21.6 36 21.2 4Z"
        fill={p.url("lit")}
      />
      {/* Right vane, a touch cooler, with two splits. */}
      <path
        d="M21.2 4C27.4 12.4 31.4 24.6 32.2 38.6Q29.4 40.6 25.6 44.6Q29 42.6 32.2 42.4C32 53 30.6 62 28.4 69.6Q25.8 71 23.2 74Q25.6 72.6 27.6 72.4C25.8 80 23.6 87 21 93.4C21.2 66 21.6 36 21.2 4Z"
        fill={p.url("shade")}
      />
      {/* Barbs: fine, pale lines sweeping up and out from the shaft. */}
      <g fill="none" strokeLinecap="round" opacity="0.5">
        <path d="M21 22C17.6 19 14.8 17.4 13 17" stroke="#d6cfbd" strokeWidth="0.5" />
        <path d="M21 36C16.6 32.6 13 31 10.4 30.8" stroke="#d6cfbd" strokeWidth="0.5" />
        <path d="M20.8 50C16.6 47 13 45.6 9.4 45.6" stroke="#d6cfbd" strokeWidth="0.5" />
        <path d="M20.6 74C17.6 71.4 15 70.2 12.4 70" stroke="#d6cfbd" strokeWidth="0.5" />
        <path d="M21.2 28C24.6 25 27.4 23.6 29.8 23.4" stroke="#c4bfc6" strokeWidth="0.5" />
        <path d="M21 56C24.2 53 27 51.6 30.4 51.4" stroke="#c4bfc6" strokeWidth="0.5" />
        <path d="M20.8 82C22.8 80 24.4 79 26 78.6" stroke="#c4bfc6" strokeWidth="0.5" />
      </g>
      {/* A warm sheen along the shaft. */}
      <path d="M18.4 20C18.6 46 19 72 19.6 94L22.8 92C22.4 70 22.4 44 22.6 20Z" fill={p.url("sheen")} />
      {/* Shaft and bare quill, tapering to the tip. */}
      <path d="M21 4.5C21.6 36 21.2 70 20.8 96L20.2 96C20.4 70 20.6 36 21 4.5Z" fill="#e9d9ab" />
      <path d="M20.8 95C20.9 102 20.6 109.6 20 116C19.4 109.6 19.4 102 20 95Z" fill={p.url("quill")} />
    </svg>
  );
}

/* ------------------------------------------------------------------ Pencil */

const PENCIL_STAR =
  "M19.4 1.77Q20 0.5 20.6 1.77L21.68 4.07Q22 4.75 22.74 4.84L25.26 5.16Q26.66 5.34 25.63 6.3L23.78 8.04Q23.23 8.55 23.37 9.29L23.85 11.78Q24.11 13.16 22.88 12.48L20.66 11.26Q20 10.9 19.34 11.26L17.12 12.48Q15.89 13.16 16.15 11.78L16.63 9.29Q16.77 8.55 16.22 8.04L14.37 6.3Q13.34 5.34 14.74 5.16L17.26 4.84Q18 4.75 18.32 4.07Z";

/** The magic pencil. viewBox 0 0 40 120; the glowing tip is at (20, 118). */
export function Pencil({ className, style }: SpriteProps) {
  const p = usePaint();
  return (
    <svg viewBox="0 0 40 120" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <linearGradient id={p.id("face-l")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a4290" />
          <stop offset="1" stopColor="#2c2766" />
        </linearGradient>
        <linearGradient id={p.id("face-c")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7c70c8" />
          <stop offset="1" stopColor="#4c4396" />
        </linearGradient>
        <linearGradient id={p.id("face-r")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5a51a6" />
          <stop offset="1" stopColor="#363074" />
        </linearGradient>
        <linearGradient id={p.id("brass")} x1="0" x2="1">
          <stop offset="0" stopColor="#b5752b" />
          <stop offset="0.4" stopColor="#ffe3a3" />
          <stop offset="0.7" stopColor="#f5c969" />
          <stop offset="1" stopColor="#c98a35" />
        </linearGradient>
        <linearGradient id={p.id("wood")} x1="0" x2="1">
          <stop offset="0" stopColor="#d9c39a" />
          <stop offset="0.45" stopColor="#f7ecd2" />
          <stop offset="1" stopColor="#e3cfa6" />
        </linearGradient>
        <linearGradient id={p.id("tip")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f5c969" />
          <stop offset="1" stopColor="#fff8e1" />
        </linearGradient>
        <radialGradient id={p.id("glow")}>
          <stop offset="0" stopColor="#fff1c4" stopOpacity="0.9" />
          <stop offset="0.4" stopColor="#f5c969" stopOpacity="0.4" />
          <stop offset="1" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Star cap, softly lit. */}
      <circle cx="20" cy="7.5" r="11" fill={p.url("glow")} opacity="0.7" />
      <path d={PENCIL_STAR} fill="#ffe3a3" />
      <path d="M20 0.5L20 10.9L16 12.6Z" fill="#fff8e1" opacity="0.45" />

      {/* Brass ferrule with fine ridges. */}
      <rect x="12.6" y="13.4" width="14.8" height="10.6" rx="1.6" fill={p.url("brass")} />
      <g fill="#8a5a22" opacity="0.28">
        <rect x="12.6" y="16.2" width="14.8" height="0.8" />
        <rect x="12.6" y="20.4" width="14.8" height="0.8" />
      </g>

      {/* Lacquered body: three faces of a hexagonal pencil. */}
      <path d="M12 24H16.4V91.4L12 90Z" fill={p.url("face-l")} />
      <path d="M16.4 24H23.6V92L16.4 91.4Z" fill={p.url("face-c")} />
      <path d="M23.6 24H28V90L23.6 92Z" fill={p.url("face-r")} />
      <rect x="17.6" y="26" width="1.4" height="62" rx="0.7" fill="#ffffff" opacity="0.22" />
      <rect x="12" y="24" width="16" height="1.6" fill="#1e2a5e" opacity="0.35" />
      <path d="M12 84.6L28 84.6L28 86.4L12 86.4Z" fill={p.url("brass")} opacity="0.9" />

      {/* Sharpened wood, scalloped where the lacquer was cut away. */}
      <path d="M12 90C13.6 91.6 14.8 91.6 16.4 91.4C18.4 92.6 21.6 92.6 23.6 92C25.2 91.6 26.4 91.6 28 90L22.7 110H17.3Z" fill={p.url("wood")} />
      <path d="M12 90C13.6 91.6 14.8 91.6 16.4 91.4L18.6 110H17.3Z" fill="#b89a6a" opacity="0.35" />

      {/* The magic tip, glowing. */}
      <circle cx="20" cy="117" r="9" fill={p.url("glow")} />
      <path d="M17.3 110H22.7L20 118Z" fill={p.url("tip")} />
    </svg>
  );
}
