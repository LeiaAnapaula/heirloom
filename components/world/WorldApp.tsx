"use client";

import { useEffect, useRef, useState } from "react";
import { GRANDPA, WORLD } from "./config";
import { loadPieces, savePieces } from "./persist";
import { hud, useHud } from "./store";
import BuildBar from "./hud/BuildBar";
import GrandpaCard from "./hud/GrandpaCard";
import MovePad from "./hud/MovePad";
import Postcard from "./hud/Postcard";
import Readouts from "./hud/Readouts";
import Timeline from "./hud/Timeline";
import WorldControls from "./hud/WorldControls";

/**
 * Grandpa's world in 3D with the HUD on top. The canvas fills the screen; the HUD
 * sits in a grid of named areas around it, so each panel only has to look after
 * itself. On a phone the areas stack into two columns.
 *
 *   desktop                          phone                  phone held sideways
 *   story    timeline    stats       story     stats        story  timeline  stats
 *   .        .           .           timeline  timeline     move   .         world
 *   move     build       world       .         .            move   build     build
 *                                                           (while building, build spans the row)
 *                                    move      world
 *                                    build     build
 *
 * While building on a small screen, the move pad and time of day step aside so the
 * build bar and the aiming circle in the middle have the room.
 */
export default function WorldApp() {
  const stage = useRef<HTMLDivElement>(null);
  const mode = useHud((s) => s.mode);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("quality");
    hud.reset();
    // ?fresh starts with an empty world for rehearsals and saves nothing, so the child's own
    // world on this device is still there next time. Otherwise the child's pieces come back.
    const fresh = params.has("fresh");
    if (!fresh) hud.set({ pieces: loadPieces() });
    let saved = hud.get().pieces;
    const unsave = fresh
      ? () => {}
      : hud.subscribe(() => {
          const { pieces } = hud.get();
          if (pieces !== saved) savePieces((saved = pieces));
        });

    let stop = () => {};
    let cancelled = false;
    // three.js and Spark only ever load in the browser, after the page is up.
    import("./engine").then(({ startWorld }) => {
      if (cancelled || !stage.current) return;
      stop = startWorld({ container: stage.current, quality: q === "preview" || q === "full" ? q : "auto" });
    });
    return () => {
      cancelled = true;
      stop();
      unsave();
    };
  }, []);

  return (
    <main data-mode={mode} className="heirloom group/world fixed inset-0 overflow-hidden bg-[#cfdde6] font-ui text-pine select-none">
      <div ref={stage} className="absolute inset-0" />
      <LoadingVeil />
      <Reticle />

      {/* A mouse click never leaves focus on a HUD button, so Enter keeps placing pieces and the
          arrow keys keep walking. Keyboard focus is untouched. */}
      <div
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) e.preventDefault();
        }}
        className="pointer-events-none absolute inset-0 grid gap-3 [--pad:0.75rem] [grid-template-areas:'story_stats'_'timeline_timeline'_'._.'_'move_world'_'build_build'] [grid-template-columns:minmax(0,1fr)_auto] [grid-template-rows:auto_auto_1fr_auto_auto] short:gap-2.5 short:[grid-template-areas:'story_timeline_stats'_'move_._world'_'move_build_build'] short:[grid-template-columns:minmax(170px,230px)_minmax(0,1fr)_auto] short:[grid-template-rows:auto_1fr_auto] short:group-data-[mode=build]/world:[grid-template-areas:'story_timeline_stats'_'._._.'_'build_build_build'] roomy:[--pad:1rem] lg:[grid-template-areas:'story_timeline_stats'_'._._.'_'move_build_world'] lg:[grid-template-columns:clamp(240px,22vw,340px)_minmax(0,1fr)_clamp(200px,18vw,280px)] lg:[grid-template-rows:auto_1fr_auto]"
        style={{
          paddingTop: "max(var(--pad), env(safe-area-inset-top))",
          paddingBottom: "max(var(--pad), env(safe-area-inset-bottom))",
          paddingLeft: "max(var(--pad), env(safe-area-inset-left))",
          paddingRight: "max(var(--pad), env(safe-area-inset-right))",
        }}
      >
        <div className="flex min-w-0 items-start [grid-area:story]">
          <GrandpaCard />
        </div>
        <div className="flex min-w-0 items-start justify-center [grid-area:timeline]">
          <Timeline />
        </div>
        <div className="flex min-w-0 items-start justify-end [grid-area:stats]">
          <Readouts />
        </div>
        <div className="@container flex min-w-0 items-end [grid-area:move] compact:group-data-[mode=build]/world:hidden">
          <MovePad />
        </div>
        <div className="flex min-w-0 items-end justify-center [grid-area:build]">
          <BuildBar />
        </div>
        <div className="flex min-w-0 items-end justify-end [grid-area:world] compact:group-data-[mode=build]/world:hidden">
          <WorldControls />
        </div>
      </div>

      <Notice />
      <Postcard />
    </main>
  );
}

/** Covers the screen until the world has arrived, with Marble's own picture of it behind. */
function LoadingVeil() {
  const status = useHud((s) => s.status);
  const progress = useHud((s) => s.progress);
  const error = useHud((s) => s.error);
  if (status === "ready") return null;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-pine/40 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element -- a remote picture behind the veil; no layout to optimize */}
      <img src={WORLD.preview} alt="" className="absolute inset-0 -z-10 h-full w-full scale-105 object-cover blur-sm" />
      <div className="hud-panel w-full max-w-sm rounded-[24px] p-6 text-center">
        <p className="font-display text-2xl leading-tight">{status === "error" ? "The world is resting" : `${GRANDPA.name}'s village`}</p>
        {status === "error" ? (
          <>
            <p className="mt-2 text-[15px] leading-snug text-pine/80">{error}</p>
            {/* No link out to Marble here: a child stays inside the app (CLAUDE.md, section 11). */}
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-2xl bg-pine px-5 font-bold text-paper">
                Try again
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-[15px] text-pine/75">is on its way.</p>
            <div
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-pine/12"
              role="progressbar"
              aria-label="Loading the world"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
            >
              <div className="h-full rounded-full bg-river transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** On touch screens the build tool aims at the middle of the screen; this shows where. */
function Reticle() {
  const mode = useHud((s) => s.mode);
  const valid = useHud((s) => s.ghost.valid);
  if (mode !== "build") return null;
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 [@media(pointer:coarse)]:block">
      <svg viewBox="0 0 40 40" className={`h-10 w-10 drop-shadow ${valid ? "text-honey" : "text-geranium"}`}>
        <circle cx="20" cy="20" r="11" fill="none" stroke="white" strokeWidth="5" opacity=".7" />
        <circle cx="20" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="3" />
        <circle cx="20" cy="20" r="2.5" fill="currentColor" />
      </svg>
    </div>
  );
}

/** A short line after something happens ("Your bridge is in. 8 planks!"), then it fades. */
function Notice() {
  const notice = useHud((s) => s.notice);
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setShownAt(notice.at), 2600);
    return () => window.clearTimeout(t);
  }, [notice]);
  const visible = !!notice && notice.at !== shownAt;
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-[38%] z-20 flex justify-center px-6">
      {visible && (
        <p key={notice.at} className="hud-panel animate-[notice_2.6s_ease_forwards] rounded-full px-5 py-2.5 text-center text-[17px] font-bold">
          {notice.text}
        </p>
      )}
    </div>
  );
}
