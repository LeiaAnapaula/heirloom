"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MOMENTS, buildOf, type MomentId } from "../config";
import { actions, hud, useHud, type Piece } from "../store";
import { BuildPicture, Icon } from "./icons";
import { Panel } from "./ui";

/**
 * The timeline tracker: Grandpa's story as numbered stops on a little river,
 * numbered like the honey markers floating in the world. The river fills in
 * between places the child has been. After the story, the things the child
 * built join the path as stops of their own, newest last.
 *
 * It measures the room it has and picks one of two looks: stops with their
 * names underneath, or (on phones and narrow screens) numbers and pictures
 * only, with the current name shown once below.
 */

const PAD = 24; // the panel's padding, left and right together
const WIDE = { min: 78, max: 104 }; // a stop with its name underneath
const TIGHT = { min: 44, max: 56 }; // a number or picture only, still a full finger wide
const MAX_BUILDS = 3; // the newest few; older ones fold into a "+N"
const NAMES_FROM = 480; // narrower than this (phones, the middle of a small laptop): numbers only

type Layout = { wide: boolean; shown: number; slot: number };

/** The roomiest look that fits: names if at least two builds can keep them, otherwise numbers only. */
function fit(width: number, builds: number): Layout {
  for (const wide of width >= NAMES_FROM ? [true, false] : [false]) {
    const size = wide ? WIDE : TIGHT;
    const least = wide ? Math.min(builds, 2) : 0;
    for (let shown = Math.min(builds, MAX_BUILDS); shown >= least; shown--) {
      const stops = MOMENTS.length + shown + (builds > shown ? 1 : 0);
      const slot = Math.min(size.max, Math.floor((width - PAD) / stops));
      if (slot >= size.min) return { wide, shown, slot };
    }
  }
  return { wide: false, shown: 0, slot: TIGHT.min };
}

function buildName(p: Piece, owner: string): string {
  return `${owner} ${buildOf(p.kind).noun}`;
}

export default function Timeline() {
  const moment = useHud((s) => s.moment);
  const visited = useHud((s) => s.visited);
  const flying = useHud((s) => s.flying);
  const pieces = useHud((s) => s.pieces);
  const selected = useHud((s) => s.selected);
  const childName = useHud((s) => s.childName);
  const [pending, setPending] = useState<MomentId | null>(null);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Watch how much room the timeline area has (it changes with the screen and the side panels).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The "on the way" glow lasts as long as the flight.
  useEffect(
    () =>
      hud.subscribe(() => {
        if (!hud.get().flying) setPending(null);
      }),
    [],
  );

  const been = useMemo(() => new Set(visited), [visited]);
  const { wide, shown, slot } = fit(width, pieces.length);
  const owner = childName.trim() ? `${childName.trim()}'s` : "Your";
  const recent = useMemo(() => {
    const seen = new Map<string, number>();
    const named = pieces.map((p) => {
      const n = (seen.get(p.kind) ?? 0) + 1;
      seen.set(p.kind, n);
      return { piece: p, nth: n };
    });
    return shown > 0 ? named.slice(-shown) : [];
  }, [pieces, shown]);
  const folded = pieces.length - recent.length;
  const kindCount = useMemo(() => {
    const c = new Map<string, number>();
    for (const p of pieces) c.set(p.kind, (c.get(p.kind) ?? 0) + 1);
    return c;
  }, [pieces]);
  const hasBuildStops = recent.length > 0 || folded > 0;

  const go = (id: MomentId) => {
    if (flying) return;
    setPending(id);
    actions.flyTo(id);
  };

  // Phones and narrow screens name one stop, once, under the track.
  const target = flying && pending ? pending : moment;
  const picked = pieces.find((p) => p.id === selected);
  let caption: { text: string; n?: number; quiet?: boolean };
  if (target) {
    const i = MOMENTS.findIndex((m) => m.id === target);
    caption = { text: MOMENTS[i].label, n: i + 1 };
  } else if (picked) caption = { text: buildName(picked, owner) };
  else caption = { text: "Tap a number to go there", quiet: true };

  return (
    <div ref={box} className="flex w-full min-w-0 justify-center">
      <Panel className={`max-w-full px-3 ${wide ? "pt-2 pb-2.5" : "pt-1.5 pb-2"}`}>
        <nav aria-label="Story path">
          <ol className="flex items-start">
            {MOMENTS.map((m, i) => {
              const isCurrent = moment === m.id;
              const isVisited = been.has(m.id);
              const isPending = flying && pending === m.id;
              const soft = flying && !isPending;
              const next = MOMENTS[i + 1];
              return (
                <li key={m.id} className="relative flex shrink-0 justify-center" style={{ width: slot }}>
                  {next ? (
                    <RiverBit width={slot} filled={isVisited && been.has(next.id)} up={i % 2 === 0} />
                  ) : (
                    hasBuildStops && <PlankBit />
                  )}
                  <button
                    type="button"
                    onClick={() => go(m.id)}
                    aria-current={isCurrent ? "step" : undefined}
                    aria-disabled={flying || undefined}
                    aria-label={`${i + 1}. ${m.label}${isVisited ? ", visited" : ""}`}
                    title={wide ? undefined : m.label}
                    className={`relative z-10 flex flex-col items-center rounded-2xl ${wide ? "w-full px-0.5 pb-0.5" : "w-11"} ${
                      soft ? "cursor-default" : ""
                    } ${flying ? "" : "group"}`}
                  >
                    <span className="grid h-11 w-11 place-items-center">
                      <StopBadge n={i + 1} current={isCurrent} visited={isVisited} pending={isPending} soft={soft} small={!wide} />
                    </span>
                    {wide && (
                      <span
                        className={`line-clamp-2 text-center text-[12.5px] leading-[1.15] font-bold transition-colors duration-200 motion-reduce:transition-none ${
                          soft ? "text-pine/45" : isCurrent ? "text-pine" : "text-pine/70 group-hover:text-pine"
                        }`}
                      >
                        {m.label}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}

            {folded > 0 && (
              <li className="relative flex shrink-0 justify-center" style={{ width: slot }}>
                {recent.length > 0 && <PlankBit />}
                <span className="relative z-10 mt-[9px] grid h-[26px] min-w-[34px] place-items-center rounded-full bg-white px-2 text-[13px] font-extrabold text-pine/70 shadow-[0_0_0_2px_rgb(138_90_59/0.3)]">
                  <span aria-hidden>+{folded}</span>
                  <span className="sr-only">
                    {folded} more {folded === 1 ? "thing" : "things"} you built before these
                  </span>
                </span>
              </li>
            )}

            {recent.map(({ piece, nth }, i) => {
              const name = buildName(piece, owner);
              const isPicked = selected === piece.id;
              const many = (kindCount.get(piece.kind) ?? 0) > 1;
              return (
                <li key={piece.id} className="relative flex shrink-0 justify-center" style={{ width: slot }}>
                  {i < recent.length - 1 && <PlankBit />}
                  <button
                    type="button"
                    onClick={() => actions.select(isPicked ? null : piece.id)}
                    aria-pressed={isPicked}
                    aria-label={many ? `${name}, number ${nth}` : name}
                    title={wide ? undefined : name}
                    className={`group relative z-10 flex flex-col items-center rounded-2xl ${wide ? "w-full px-0.5 pb-0.5" : "w-11"}`}
                  >
                    <span className="grid h-11 w-11 place-items-center">
                      <span
                        className={`grid place-items-center rounded-full bg-white transition-shadow duration-200 motion-reduce:transition-none ${
                          wide ? "h-[34px] w-[34px]" : "h-[32px] w-[32px]"
                        } ${
                          isPicked
                            ? "shadow-[0_0_0_3px_#e3a83d,0_0_0_5px_#2c3a32]"
                            : "shadow-[0_0_0_2px_rgb(138_90_59/0.35),0_2px_6px_rgb(20_30_24/0.2)] group-hover:shadow-[0_0_0_2px_#8a5a3b,0_2px_6px_rgb(20_30_24/0.2)]"
                        }`}
                      >
                        <BuildPicture kind={piece.kind} className={wide ? "h-[26px] w-[26px]" : "h-6 w-6"} />
                      </span>
                    </span>
                    {wide && (
                      <span
                        className={`line-clamp-2 text-center text-[12.5px] leading-[1.15] font-bold ${
                          isPicked ? "text-pine" : "text-pine/70 group-hover:text-pine"
                        }`}
                      >
                        {name}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>

          {!wide && (
            <p
              className={`mt-0.5 flex items-center justify-center gap-1.5 truncate px-1 text-center text-[14px] leading-5 font-bold ${
                caption.quiet ? "text-pine/60" : "text-pine"
              }`}
            >
              {caption.n !== undefined && (
                <span aria-hidden className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-honey text-[11px] font-extrabold text-pine">
                  {caption.n}
                </span>
              )}
              <span className="truncate">{caption.text}</span>
            </p>
          )}
        </nav>
      </Panel>
    </div>
  );
}

/**
 * One numbered stop, drawn like the markers in the world: honey with a white ring.
 * Where you are now gets a pine ring; places you have been get leaf green and a check.
 */
function StopBadge({
  n,
  current,
  visited,
  pending,
  soft,
  small,
}: {
  n: number;
  current: boolean;
  visited: boolean;
  pending: boolean;
  soft: boolean; // the camera is flying somewhere else: quieter, but still solid so the river does not show through
  small: boolean;
}) {
  const look = current
    ? "bg-honey text-pine scale-110 shadow-[0_0_0_3px_#2c3a32,0_0_0_7px_rgb(227_168_61/0.4)]"
    : visited
      ? "bg-leaf text-white shadow-[0_0_0_3px_#fff8e6,0_2px_6px_rgb(20_30_24/0.25)]"
      : "bg-honey text-pine shadow-[0_0_0_3px_#fff8e6,0_2px_6px_rgb(20_30_24/0.3)]";
  return (
    <span className="relative grid place-items-center">
      {/* On the way there: a soft honey glow breathes behind the badge (the badge itself stays solid). */}
      {pending && <span aria-hidden className="absolute -inset-[7px] rounded-full bg-honey/50 motion-safe:animate-pulse" />}
      <span
        className={`relative grid place-items-center rounded-full font-extrabold transition-[transform,background-color,box-shadow,filter] duration-300 motion-reduce:transition-none ${
          small ? "h-[30px] w-[30px] text-[15px]" : "h-[34px] w-[34px] text-[16px]"
        } ${look} ${soft ? "brightness-105 saturate-[.4]" : ""}`}
      >
        {n}
        {visited && (
          <span className="absolute -top-1.5 -right-1.5 grid h-[17px] w-[17px] place-items-center rounded-full bg-white text-leaf shadow-[0_0_0_1.5px_rgb(111_142_95/0.55)]">
            <Icon.check className="h-[11px] w-[11px] [stroke-width:3.5]" />
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The river between two stops, from this stop's middle to the next one's, with a
 * gentle bend up or down so the path reads as water. River blue flows in once
 * both ends are places the child has been.
 */
function RiverBit({ width, filled, up }: { width: number; filled: boolean; up: boolean }) {
  const d = `M0 7 Q${width / 2} ${up ? 1 : 13} ${width} 7`;
  return (
    <svg
      aria-hidden
      width={width}
      height={14}
      viewBox={`0 0 ${width} 14`}
      className="pointer-events-none absolute top-[15px] left-1/2 overflow-visible"
    >
      <path d={d} fill="none" stroke="rgb(44 58 50 / 0.16)" strokeWidth={6} strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="#5f8296"
        strokeWidth={6}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1 1"
        strokeDashoffset={filled ? 0 : 1}
        className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
      />
    </svg>
  );
}

/** The dashed plank line from the end of Grandpa's story to the child's own builds. */
function PlankBit() {
  return <span aria-hidden className="pointer-events-none absolute top-[20.5px] left-1/2 w-full border-t-[3px] border-dashed border-wood/45" />;
}
