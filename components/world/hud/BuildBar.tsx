"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type WheelEvent } from "react";
import { BUILDS, buildOf, type Build } from "../config";
import { actions, useHud } from "../store";
import { BuildPicture, Icon } from "./icons";
import { HudButton, Kbd, Panel } from "./ui";

/**
 * The build bar: Explore or Build, a hotbar of the eight things a child can make,
 * the few actions that shape the next piece, and the button that shows Grandpa.
 *
 * It sizes itself by its own width (a container query), not the screen's, because
 * the same bar sits in a wide middle column on a big screen, a narrow one on a small
 * laptop, and a full-width row on a phone.
 *
 *   wide (720px and up)                  narrow
 *   hint line                            [Explore|Build]  hint
 *   [Explore|Build]  Turn  - 8 +  ...    Turn  - 8 +  Place here  Remove
 *   1 2 3 4 5 6 7 8       Show Grandpa   1 2 3 4 > scrolls >   Show Grandpa
 *
 * Keys belong to the engine (B, 1 to 8, R, [ ], X, Enter, Escape). The bar only
 * shows them, and never takes focus on a mouse click, so Enter still places.
 */

const FINE = "(hover: hover) and (pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";

function subscribeTo(query: string) {
  return (onChange: () => void) => {
    const m = window.matchMedia(query);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  };
}
const subscribeFine = subscribeTo(FINE);

/** True on a device with a mouse or trackpad. False on the server and on touch screens. */
function useFinePointer(): boolean {
  return useSyncExternalStore(
    subscribeFine,
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

export default function BuildBar() {
  const mode = useHud((s) => s.mode);
  const tool = useHud((s) => s.tool);
  const length = useHud((s) => s.length);
  const valid = useHud((s) => s.ghost.valid);
  const selected = useHud((s) => s.selected);
  const pieces = useHud((s) => s.pieces);
  const sent = useHud((s) => s.sent);
  const fine = useFinePointer();

  const building = mode === "build";
  const build = buildOf(tool);
  const stretch = build.stretch;
  const count = pieces.length;
  const hasBridge = pieces.some((p) => p.kind === "bridge");

  // A stretchy piece keeps the length the child last gave it, kept inside its own limits.
  useEffect(() => {
    if (stretch && (length < stretch.min || length > stretch.max)) {
      actions.setLength(Math.min(stretch.max, Math.max(stretch.min, length)));
    }
  }, [stretch, length]);

  const hint = hintFor({ building, fine, valid, selected: !!selected, build, hasBridge });

  return (
    <div className="@container w-full max-w-[760px] min-w-0">
      <Panel
        className="w-full p-1.5 font-ui @min-[720px]:p-2"
        // A mouse click on the bar must not leave a button focused, or the next Enter
        // would press that button again instead of placing a piece. Keyboard focus is untouched.
        onMouseDown={(e) => e.preventDefault()}
      >
        <div
          className={`grid items-center gap-x-2 gap-y-1.5 [grid-template-columns:auto_minmax(0,1fr)] ${
            building
              ? "[grid-template-areas:'seg_hint'_'act_act'_'bar_bar'] @min-[720px]:gap-y-1 @min-[720px]:[grid-template-areas:'hint_hint'_'seg_act'_'bar_bar']"
              : "[grid-template-areas:'seg_hint'_'bar_bar']"
          }`}
        >
          <ModeSwitch building={building} />

          <div className={`flex min-w-0 items-center gap-2 [grid-area:hint] ${building ? "@min-[720px]:px-1" : ""}`}>
            {/* In explore mode a tapped piece can still be removed; on a narrow bar the button takes the hint's place. */}
            <Hint hint={hint} building={building} yield={!building && !!selected} />
            {!building && selected && (
              <span className="ml-auto">
                <RemoveButton selected count={count} labelClass="inline" />
              </span>
            )}
          </div>

          {building && (
            <BuildActions stretch={stretch} length={length} selected={!!selected} count={count} noun={build.noun} fine={fine} />
          )}

          <div className="flex min-w-0 items-stretch gap-2 [grid-area:bar]">
            <Hotbar building={building} tool={tool} invite={!building && !hasBridge} />
            <ShowGrandpa count={count} sent={sent} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- what the hint line says ---------------- */

type HintText = { long: string; short: string; tone: "calm" | "aim" | "picked" };

function hintFor(o: { building: boolean; fine: boolean; valid: boolean; selected: boolean; build: Build; hasBridge: boolean }): HintText {
  const tap = o.fine ? "Click" : "Tap";
  if (o.selected) {
    return o.building
      ? { long: "You picked one. Remove this takes it away.", short: `${tap} the trash can to take it away.`, tone: "picked" }
      : { long: "You picked one.", short: "You picked one.", tone: "picked" };
  }
  if (!o.building) {
    return o.hasBridge
      ? { long: `${tap} a picture to build something new.`, short: `${tap} a picture to build.`, tone: "calm" }
      : { long: `Grandpa wished for a bridge. ${tap} it to build one!`, short: "Build Grandpa's bridge!", tone: "calm" };
  }
  if (!o.valid) {
    return o.fine
      ? { long: "Point at the ground.", short: "Point at the ground.", tone: "aim" }
      : { long: "Point the circle at the ground.", short: "Point at the ground.", tone: "aim" };
  }
  return o.fine
    ? { long: `Click the ground to place your ${o.build.noun}. R turns it.`, short: `Click the ground to place it.`, tone: "calm" }
    : { long: "Aim at the ground and tap Place here, or tap the spot.", short: "Aim, then tap Place here.", tone: "calm" };
}

function Hint({ hint, building, yield: give }: { hint: HintText; building: boolean; yield: boolean }) {
  const dot = hint.tone === "aim" ? "bg-geranium" : hint.tone === "picked" ? "bg-leaf" : "bg-honey";
  return (
    <p
      className={`min-w-0 flex-1 items-center gap-2 text-[13px] leading-[1.2] font-semibold text-pine/80 ${give ? "hidden @min-[440px]:flex" : "flex"} ${
        building ? "@min-[720px]:text-[13px] @min-[720px]:leading-4" : "@min-[720px]:text-[14px]"
      }`}
    >
      <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot} transition-colors duration-200 motion-reduce:transition-none`} />
      {/* The long line where there is room for it, a shorter one on phones and small laptops. */}
      <span className="hidden min-w-0 flex-1 @min-[400px]:block">
        <span className={`line-clamp-2 ${building ? "@min-[720px]:line-clamp-1" : ""}`}>{hint.long}</span>
      </span>
      <span className="min-w-0 flex-1 @min-[400px]:hidden">
        <span className="line-clamp-2">{hint.short}</span>
      </span>
    </p>
  );
}

/* ---------------- Explore or Build ---------------- */

function ModeSwitch({ building }: { building: boolean }) {
  return (
    <div role="group" aria-label="Explore or build" className="relative flex rounded-2xl bg-white/40 ring-1 ring-pine/10 [grid-area:seg]">
      <Segment on={!building} label="Explore" onClick={() => actions.setMode("explore")}>
        <Icon.explore className="h-5 w-5 shrink-0" />
      </Segment>
      <Segment on={building} label="Build" onClick={() => actions.setMode("build")}>
        <Icon.build className="h-5 w-5 shrink-0" />
      </Segment>
      <KeySticker k="B" />
    </div>
  );
}

function Segment({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-keyshortcuts="B"
      onClick={onClick}
      className={`inline-flex h-11 items-center gap-1.5 rounded-2xl px-2.5 text-[15px] font-bold transition-[background-color,color] duration-150 select-none motion-reduce:transition-none @min-[340px]:px-3 ${
        on ? "bg-honey text-pine shadow-[inset_0_0_0_2px_rgb(44_58_50/0.85)]" : "text-pine/70 hover:bg-white/75 hover:text-pine"
      }`}
    >
      <span className="hidden @min-[330px]:contents">{children}</span>
      {label}
    </button>
  );
}

/* ---------------- Turn, Longer, Shorter, Place here, Remove ---------------- */

function BuildActions({
  stretch,
  length,
  selected,
  count,
  noun,
  fine,
}: {
  stretch: Build["stretch"];
  length: number;
  selected: boolean;
  count: number;
  noun: string;
  fine: boolean;
}) {
  // Labels give way to icons on narrow bars, the least needed first. The bridge needs
  // room for its plank counter, so its row tucks labels away sooner. Place here keeps
  // its words on touch screens, where it is the main way to build; with a mouse,
  // clicking the ground is.
  const turnLabel = stretch ? "hidden @min-[720px]:inline" : "hidden @min-[360px]:inline";
  const placeLabel = stretch ? (fine ? "hidden @min-[720px]:inline" : "hidden @min-[340px]:inline") : "inline";
  const removeLabel = stretch ? "hidden @min-[480px]:inline" : "hidden @min-[330px]:inline";

  return (
    <div
      role="group"
      aria-label={`Shape your ${noun}`}
      className="flex min-w-0 items-center justify-between gap-1 [grid-area:act] @min-[720px]:justify-end @min-[720px]:gap-2"
    >
      <div className="flex items-center gap-1 @min-[720px]:gap-2">
        <HudButton className="relative gap-1.5! px-3!" aria-label="Turn" title="Turn (R)" aria-keyshortcuts="R" onClick={() => actions.rotate(45)}>
          <Icon.rotate className="h-5 w-5 shrink-0" />
          <span className={`whitespace-nowrap ${turnLabel}`}>Turn</span>
          <KeySticker k="R" />
        </HudButton>

        {stretch && (
          <div role="group" aria-label={`${noun} length`} className="flex items-center rounded-2xl bg-white/35 ring-1 ring-pine/10">
            <HudButton
              round
              className="relative"
              aria-label="Shorter"
              title="Shorter ([)"
              aria-keyshortcuts="["
              disabled={length <= stretch.min}
              onClick={() => actions.setLength(Math.max(stretch.min, length - 1))}
            >
              <Icon.minus className="h-5 w-5" />
              <KeySticker k="[" />
            </HudButton>
            <span role="status" className="w-10 text-center leading-none tabular-nums @min-[720px]:w-12">
              <span className="block text-[18px] font-extrabold">{length}</span>
              <span className="block text-[10.5px] font-bold text-pine/70 @min-[720px]:text-[11px]"> {stretch.unit}s</span>
            </span>
            <HudButton
              round
              className="relative"
              aria-label="Longer"
              title="Longer (])"
              aria-keyshortcuts="]"
              disabled={length >= stretch.max}
              onClick={() => actions.setLength(Math.min(stretch.max, length + 1))}
            >
              <Icon.plus className="h-5 w-5" />
              <KeySticker k="]" />
            </HudButton>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 @min-[720px]:gap-2">
        <HudButton
          className="relative gap-1.5! px-3! text-[14px]! @min-[720px]:text-[15px]!"
          aria-label="Place here"
          title="Place here (Enter)"
          aria-keyshortcuts="Enter"
          onClick={() => actions.placeAtCenter()}
        >
          <Icon.place className="h-5 w-5 shrink-0 text-wood" />
          <span className={`whitespace-nowrap ${placeLabel}`}>Place here</span>
          <KeySticker k="Enter" />
        </HudButton>
        <RemoveButton selected={selected} count={count} labelClass={removeLabel} />
      </div>
    </div>
  );
}

function RemoveButton({ selected, count, labelClass }: { selected: boolean; count: number; labelClass: string }) {
  const label = selected ? "Remove this" : "Undo last";
  return (
    <HudButton
      className="relative shrink-0 gap-1.5! px-3! text-[14px]! @min-[720px]:text-[15px]!"
      aria-label={label}
      title={`${label} (X)`}
      aria-keyshortcuts="X"
      disabled={count === 0}
      onClick={() => actions.removePiece()}
    >
      <Icon.remove className={`h-5 w-5 shrink-0 ${selected ? "text-geranium" : ""}`} />
      <span className={`whitespace-nowrap ${labelClass}`}>{label}</span>
      <KeySticker k="X" />
    </HudButton>
  );
}

/** A key hint stuck on the corner of a control, so it costs no room. Only shown with a keyboard. */
function KeySticker({ k }: { k: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -top-2 right-1 z-10 leading-none">
      <Kbd>{k}</Kbd>
    </span>
  );
}

/* ---------------- the hotbar ---------------- */

function Hotbar({ building, tool, invite }: { building: boolean; tool: Build["kind"]; invite: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const wheel = useRef(0);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Soft fades on the sides that have more slots to scroll to.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const update = () => {
      const start = box.scrollLeft > 2;
      const end = box.scrollLeft + box.clientWidth < box.scrollWidth - 2;
      setEdges((e) => (e.start === start && e.end === end ? e : { start, end }));
    };
    const ro = new ResizeObserver(update);
    ro.observe(box);
    box.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      box.removeEventListener("scroll", update);
    };
  }, []);

  // Whatever is picked (by a tap, a number key, or B) scrolls into view inside the bar only.
  useEffect(() => {
    if (!building) return;
    const box = scroller.current;
    const slot = box?.querySelector<HTMLElement>(`[data-kind="${tool}"]`);
    if (!box || !slot) return;
    const pad = 28;
    const b = box.getBoundingClientRect();
    const r = slot.getBoundingClientRect();
    const dx = r.left < b.left + pad ? r.left - b.left - pad : r.right > b.right - pad ? r.right - b.right + pad : 0;
    if (dx) box.scrollBy({ left: dx, behavior: reducedMotion() ? "auto" : "smooth" });
  }, [building, tool]);

  // A mouse wheel scrolls the hotbar sideways, one slot per notch.
  function onWheel(e: WheelEvent<HTMLDivElement>) {
    const box = scroller.current;
    if (!box || box.scrollWidth <= box.clientWidth) return;
    const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : 0;
    if (!d) return;
    wheel.current += d;
    if (Math.abs(wheel.current) < 30) return;
    box.scrollBy({ left: Math.sign(wheel.current) * 68, behavior: reducedMotion() ? "auto" : "smooth" });
    wheel.current = 0;
  }

  const fade = 22;
  const mask =
    edges.start || edges.end
      ? `linear-gradient(to right, ${edges.start ? `transparent 0, #000 ${fade}px` : "#000 0"}, ${edges.end ? `#000 calc(100% - ${fade}px), transparent 100%` : "#000 100%"})`
      : undefined;

  return (
    <div
      ref={scroller}
      role="group"
      aria-label="Things to build"
      onWheel={onWheel}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="-m-1.5 min-w-0 flex-1 snap-x snap-mandatory scroll-px-7 overflow-x-auto overscroll-x-contain [scrollbar-width:none] @min-[720px]:flex-none [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-1 p-1.5">
        {BUILDS.map((b) => (
          <Slot key={b.kind} build={b} picked={building && b.kind === tool} invite={invite && b.kind === "bridge"} />
        ))}
      </div>
    </div>
  );
}

function Slot({ build, picked, invite }: { build: Build; picked: boolean; invite: boolean }) {
  return (
    <button
      type="button"
      data-kind={build.kind}
      aria-pressed={picked}
      aria-label={build.label}
      aria-keyshortcuts={build.key}
      onClick={() => actions.pickTool(build.kind)}
      className={`group relative flex h-16 w-16 shrink-0 snap-start flex-col items-center justify-end gap-0.5 rounded-2xl pb-1.5 transition-[background-color,box-shadow,translate,scale] duration-150 select-none active:scale-95 motion-reduce:transition-none ${
        picked
          ? "bg-honey shadow-[inset_0_0_0_2px_rgb(44_58_50/0.85),0_8px_16px_-10px_rgb(94_60_38/0.9)] motion-safe:-translate-y-0.5"
          : "bg-white/55 shadow-[inset_0_-2px_0_rgb(44_58_50/0.07)] hover:bg-white/85"
      }`}
    >
      {invite && (
        // Grandpa's wish: until there is a bridge, its slot glows softly to say "start here".
        <span aria-hidden className="pointer-events-none absolute -inset-0.5 rounded-[18px] ring-[3px] ring-honey motion-safe:animate-pulse" />
      )}
      <BuildPicture kind={build.kind} className="h-9 w-9 transition-transform duration-150 group-hover:scale-105 motion-reduce:transition-none" />
      <span className="max-w-full truncate px-0.5 text-[11.5px] leading-none font-bold tracking-[-0.01em]">{build.label}</span>
      <span aria-hidden className="pointer-events-none absolute top-1 left-1 origin-top-left scale-90 leading-none">
        <Kbd>{build.key}</Kbd>
      </span>
    </button>
  );
}

/* ---------------- Show Grandpa ---------------- */

function ShowGrandpa({ count, sent }: { count: number; sent: boolean }) {
  const things = `${count} ${count === 1 ? "thing" : "things"} built`;
  const label = sent ? "Sent to Grandpa. Show Grandpa again" : count ? `Show Grandpa, ${things}` : "Show Grandpa";
  return (
    <HudButton
      primary={count > 0 && !sent}
      aria-label={label}
      onClick={() => actions.openPostcard()}
      className="relative h-16 w-[76px] shrink-0 flex-col justify-center gap-1! px-1! text-center leading-[1.1] @min-[720px]:w-auto @min-[720px]:min-w-0 @min-[720px]:flex-1 @min-[720px]:flex-row @min-[720px]:gap-2.5! @min-[720px]:px-4!"
    >
      {sent ? (
        <>
          <Icon.check className="h-6 w-6 shrink-0 text-leaf" />
          <span className="text-[13px] @min-[720px]:text-[15px]">Sent</span>
        </>
      ) : (
        <>
          <Icon.envelope className="h-6 w-6 shrink-0" />
          <span className="text-[12.5px] @min-[720px]:text-[16px] @min-[720px]:whitespace-nowrap">
            Show <span className="@min-[720px]:hidden">
              <br />
            </span>
            Grandpa
          </span>
          {count > 0 && (
            <span
              aria-hidden
              className="absolute -top-1.5 -right-1 grid h-6 min-w-6 place-items-center rounded-full bg-honey px-1.5 text-[13px] leading-none font-extrabold text-pine shadow-[0_0_0_2px_rgb(238_241_232)] tabular-nums @min-[720px]:static @min-[720px]:shadow-none"
            >
              {count}
            </span>
          )}
        </>
      )}
    </HudButton>
  );
}
