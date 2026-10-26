"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { buildOf, momentOf } from "../config";
import { useHud } from "../store";
import { BuildPicture, Icon } from "./icons";
import { Panel } from "./ui";

/**
 * Where you are and what you're about to build: a compass, how high you are, the
 * nearest part of Grandpa's story, and a measuring card for the next piece. The
 * engine updates these about six times a second, so each small piece below reads
 * only the one or two numbers it shows.
 *
 * On a big screen it is a card in the top right corner. On a phone it is a small
 * chip that opens into the same card when tapped.
 */

export default function Readouts() {
  return (
    <>
      <StatsChip />
      <Panel role="region" aria-label="Where you are" className="hidden w-full max-w-[280px] p-3 lg:block">
        <StatsCard />
      </Panel>
    </>
  );
}

// ---------- words and numbers ----------

const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

function headingWord(deg: number): string {
  return DIRECTIONS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Meters a child can read: 3.2 when close, whole meters past ten. */
function meters(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}

function away(n: number): string {
  return n < 0.5 ? "right here" : `${meters(n)} m away`;
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/**
 * The heading as an angle that never jumps: 359 to 0 becomes 359 to 360, so the
 * compass turns the short way round instead of spinning all the way back.
 */
function useUnwrapped(deg: number): number {
  const [track, setTrack] = useState({ deg, turn: deg });
  if (track.deg !== deg) {
    const next = { deg, turn: track.turn + ((((deg - track.deg) % 360) + 540) % 360) - 180 };
    setTrack(next);
    return next.turn;
  }
  return track.turn;
}

// ---------- the compass ----------

const CARDINALS = [
  { letter: "N", at: 0 },
  { letter: "E", at: 90 },
  { letter: "S", at: 180 },
  { letter: "W", at: 270 },
] as const;

const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

const TURNING = "motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out";

/**
 * A dial that turns with you. The honey wedge is where you're looking, so the
 * letter at the top is the way you face. Letters stay upright as the ring turns.
 */
function Compass({ small = false }: { small?: boolean }) {
  const heading = useHud((s) => s.readouts.headingDeg);
  const turn = useUnwrapped(heading);
  const glow = useId();
  const size = small ? 38 : 64;
  const radius = small ? 11 : 18.5;
  const letters = small ? CARDINALS.slice(0, 1) : CARDINALS;

  return (
    <div
      aria-hidden
      className="relative shrink-0 rounded-full bg-white/80 shadow-[inset_0_0_0_1.5px_rgb(44_58_50/0.16),0_1px_2px_rgb(20_30_24/0.12)]"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={glow} cx="50" cy="50" r="46" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#e3a83d" stopOpacity="0.75" />
            <stop offset="1" stopColor="#e3a83d" stopOpacity="0.08" />
          </radialGradient>
        </defs>
        <path d="M50 50 L28.4 9.5 A46 46 0 0 1 71.6 9.5 Z" fill={`url(#${glow})`} />
      </svg>

      <div className={`absolute inset-0 ${TURNING}`} style={{ transform: `rotate(${-turn}deg)` }}>
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
          {TICKS.filter((a) => !letters.some((c) => c.at === a)).map((a) => (
            <line
              key={a}
              x1="50"
              y1={a % 90 === 0 ? 4 : 5}
              x2="50"
              y2={a % 90 === 0 ? 11 : 9}
              stroke="#2c3a32"
              strokeOpacity={a % 90 === 0 ? 0.45 : 0.25}
              strokeWidth={a % 90 === 0 ? 3 : 2}
              strokeLinecap="round"
              transform={`rotate(${a} 50 50)`}
            />
          ))}
        </svg>
        {letters.map((c) => (
          <span
            key={c.letter}
            className={`absolute top-1/2 left-1/2 font-ui leading-none font-extrabold ${TURNING} ${c.letter === "N" ? "text-geranium" : "text-pine/80"}`}
            style={{
              fontSize: small ? 9 : 11,
              transform: `translate(-50%, -50%) rotate(${c.at}deg) translateY(${-radius}px) rotate(${turn - c.at}deg)`,
            }}
          >
            {c.letter}
          </span>
        ))}
      </div>

      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <circle cx="50" cy="50" r={small ? 9 : 6.5} fill="#2c3a32" stroke="white" strokeWidth={small ? 4 : 3} />
      </svg>
    </div>
  );
}

// ---------- lines of the card ----------

function Facing({ className = "" }: { className?: string }) {
  const heading = useHud((s) => s.readouts.headingDeg);
  return (
    <p className={className}>
      Facing <span className="whitespace-nowrap">{headingWord(heading)}</span>
    </p>
  );
}

function Height() {
  const height = useHud((s) => s.readouts.heightM);
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[14px] font-bold text-pine/80 tabular-nums">
      <Icon.height className="h-4 w-4 shrink-0 text-river" />
      {meters(Math.max(0, height))} m up
    </p>
  );
}

function Nearest() {
  const moment = useHud((s) => s.readouts.nearest?.moment ?? null);
  const distance = useHud((s) => s.readouts.nearest?.distanceM ?? null);
  if (!moment || distance === null) return null;
  return (
    <p className="flex gap-2 text-[14px] leading-snug">
      <Icon.pin className="mt-px h-[18px] w-[18px] shrink-0 text-river" />
      <span>
        <span className="font-bold">{momentOf(moment).label},</span>{" "}
        <span className="whitespace-nowrap font-bold text-[#395a6b] tabular-nums">{away(distance)}</span>
      </span>
    </p>
  );
}

function Built() {
  const count = useHud((s) => s.pieces.length);
  if (count === 0) return null;
  return (
    <p className="flex items-center gap-2 text-[14px] font-bold tabular-nums">
      <Icon.build className="h-[18px] w-[18px] shrink-0 text-leaf" />
      {plural(count, "thing")} built
    </p>
  );
}

/** A row of little planks to count, as long as the bridge will be. */
function Planks({ count }: { count: number }) {
  return (
    <div aria-hidden className="mt-2 flex h-3 gap-[2px]">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`h-full max-w-2.5 flex-1 rounded-[2px] ${i % 2 ? "bg-[#a8734e]" : "bg-wood"}`} />
      ))}
    </div>
  );
}

/** In build mode: how big the next piece is, and where it would go. */
function Measure() {
  const mode = useHud((s) => s.mode);
  const tool = useHud((s) => s.tool);
  const length = useHud((s) => s.length);
  const valid = useHud((s) => s.ghost.valid);
  const distance = useHud((s) => s.ghost.distanceM);
  if (mode !== "build") return null;

  const build = buildOf(tool);
  const stretch = build.stretch;
  const [w, h] = build.size;

  return (
    <div className="mt-3 rounded-2xl bg-white/60 p-2.5 shadow-[inset_0_0_0_1px_rgb(44_58_50/0.08)]">
      <div className="flex items-center gap-2.5">
        <BuildPicture kind={tool} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 tabular-nums">
          {stretch ? (
            <>
              <p className="text-[18px] leading-tight font-extrabold">{plural(length, stretch.unit)}</p>
              <p className="text-[13px] font-bold text-pine/80">{meters(length * stretch.unitM)} m long</p>
            </>
          ) : (
            <>
              <p className="text-[16px] leading-tight font-extrabold">{build.label}</p>
              <p className="text-[13px] font-bold text-pine/80">
                {meters(w)} m wide, {meters(h)} m tall
              </p>
            </>
          )}
        </div>
      </div>
      {stretch && <Planks count={length} />}
      <p className="mt-2 flex items-center gap-1.5 text-[13px] font-bold tabular-nums">
        {valid ? (
          <>
            <Icon.place className="h-4 w-4 shrink-0 text-river" />
            <span className="text-[#395a6b]">{distance === null ? "Ready to place" : `${meters(distance)} m away`}</span>
          </>
        ) : (
          <>
            <Icon.close className="h-4 w-4 shrink-0 text-geranium" />
            <span className="text-[#933428]">Point at the ground</span>
          </>
        )}
      </p>
    </div>
  );
}

/** While the full-detail world downloads, a thin bar; once it lands, a short "Full detail". */
function Sharpening() {
  const sharpening = useHud((s) => s.sharpening);
  const quality = useHud((s) => s.quality);
  const [seen, setSeen] = useState(quality);
  const [landed, setLanded] = useState(false);
  if (seen !== quality) {
    setSeen(quality);
    setLanded(quality === "full");
  }
  useEffect(() => {
    if (!landed) return;
    const t = window.setTimeout(() => setLanded(false), 2600);
    return () => window.clearTimeout(t);
  }, [landed]);

  if (sharpening !== null) {
    const pct = Math.round(sharpening * 100);
    return (
      <div className="mt-3">
        <p className="text-[12px] font-bold text-pine/80 tabular-nums">Sharper world loading, {pct}%</p>
        <div
          role="progressbar"
          aria-label="Sharper world loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="mt-1 h-1 overflow-hidden rounded-full bg-pine/10"
        >
          <div className="h-full rounded-full bg-river motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
      </div>
    );
  }
  if (landed) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[12px] font-bold text-[#4f6e42] motion-safe:animate-[notice_2.6s_ease_forwards]">
        <Icon.sparkle className="h-3.5 w-3.5 text-leaf" />
        Full detail
      </p>
    );
  }
  return null;
}

/** The whole card: on a big screen in the corner, on a phone when the chip is opened. */
function StatsCard() {
  return (
    <>
      <div className="flex items-center gap-3">
        <Compass />
        <div className="min-w-0">
          <Facing className="text-[16px] leading-tight font-extrabold" />
          <Height />
        </div>
      </div>
      <div className="mt-3 space-y-2 border-t border-pine/10 pt-2.5">
        <Nearest />
        <Built />
      </div>
      <Measure />
      <Sharpening />
    </>
  );
}

// ---------- the phone chip ----------

function ChipLines() {
  const mode = useHud((s) => s.mode);
  return mode === "build" ? <ChipBuild /> : <ChipExplore />;
}

function ChipExplore() {
  const moment = useHud((s) => s.readouts.nearest?.moment ?? null);
  const distance = useHud((s) => s.readouts.nearest?.distanceM ?? null);
  const heading = useHud((s) => s.readouts.headingDeg);
  if (!moment || distance === null) {
    return <ChipText top={`Facing ${headingWord(heading)}`} />;
  }
  return <ChipText top={momentOf(moment).label} bottom={away(distance)} tone="text-[#395a6b]" />;
}

function ChipBuild() {
  const tool = useHud((s) => s.tool);
  const length = useHud((s) => s.length);
  const valid = useHud((s) => s.ghost.valid);
  const distance = useHud((s) => s.ghost.distanceM);
  const build = buildOf(tool);
  const stretch = build.stretch;
  const top = stretch ? plural(length, stretch.unit) : build.label;
  if (!valid) return <ChipText top={top} bottom="Point at ground" tone="text-[#933428]" />;
  const bottom = stretch ? `${meters(length * stretch.unitM)} m long` : distance === null ? "Ready" : `${meters(distance)} m away`;
  return <ChipText top={top} bottom={bottom} tone="text-[#395a6b]" />;
}

function ChipText({ top, bottom, tone = "" }: { top: string; bottom?: string; tone?: string }) {
  return (
    <span className="flex min-w-0 flex-col text-left leading-tight tabular-nums">
      <span className="line-clamp-2 text-[13px] font-extrabold">{top}</span>
      {bottom && <span className={`line-clamp-2 text-[12px] font-bold ${tone}`}>{bottom}</span>}
    </span>
  );
}

function ChipProgress() {
  const sharpening = useHud((s) => s.sharpening);
  if (sharpening === null) return null;
  return (
    <span aria-hidden className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-pine/10">
      <span className="block h-full rounded-full bg-river" style={{ width: `${Math.max(4, Math.round(sharpening * 100))}%` }} />
    </span>
  );
}

function StatsChip() {
  const [open, setOpen] = useState(false);
  const card = useId();
  const chip = useRef<HTMLButtonElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // Grandpa's words come first: when they open, the card gets out of their way.
  const storyOpen = useHud((s) => s.storyOpen);
  const [storySeen, setStorySeen] = useState(storyOpen);
  if (storySeen !== storyOpen) {
    setStorySeen(storyOpen);
    if (storyOpen) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    // A tap anywhere else, the world included, puts the card away.
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // On a phone held upright the card would drop over the story path; it opens below it instead.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = wrap.current;
      const el = panel.current;
      if (!box || !el) return;
      el.style.top = "";
      const path = document.querySelector('nav[aria-label="Story path"]');
      const p = (path?.closest(".hud-panel") ?? path)?.getBoundingClientRect();
      const c = el.getBoundingClientRect();
      if (p && p.width > 0 && c.left < p.right && c.right > p.left && c.top < p.bottom && c.bottom > p.top) {
        el.style.top = `${p.bottom - box.getBoundingClientRect().top + 8}px`;
      }
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return (
    <div
      ref={wrap}
      className="relative lg:hidden"
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        e.stopPropagation();
        setOpen(false);
        chip.current?.focus();
      }}
    >
      <button
        ref={chip}
        type="button"
        aria-expanded={open}
        aria-controls={open ? card : undefined}
        onClick={() => setOpen((o) => !o)}
        // The HUD's focus ring rounds every corner to 14px; keep the chip's own curve.
        style={{ borderRadius: 20 }}
        className="hud-panel pointer-events-auto flex min-h-12 max-w-[150px] items-center gap-2 py-1.5 pr-3 pl-1.5 max-[359px]:max-w-[124px] max-[359px]:gap-1.5 max-[359px]:pr-2.5 transition-transform duration-150 motion-safe:active:scale-95"
      >
        <span className="sr-only">Where you are: </span>
        <Compass small />
        <span className="flex min-w-0 flex-col">
          <ChipLines />
          <ChipProgress />
        </span>
      </button>
      {open && (
        <Panel ref={panel} id={card} role="region" aria-label="Where you are" className="absolute top-[calc(100%+8px)] right-0 z-10 w-[min(272px,calc(100vw-24px))] p-3">
          <StatsCard />
        </Panel>
      )}
    </div>
  );
}
