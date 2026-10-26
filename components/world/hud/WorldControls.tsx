"use client";

import { useRef, useSyncExternalStore, type KeyboardEvent } from "react";
import { TIMES, type TimeOfDay } from "../config";
import { actions, useHud } from "../store";
import { Icon } from "./icons";
import { HudButton, Panel } from "./ui";

/**
 * Changing the world itself: the time of day, and full screen for recording.
 * On a phone it shares a row with the move pad, so it folds into a small square.
 */

const TIME_ICONS: Record<TimeOfDay, (typeof Icon)[keyof typeof Icon]> = {
  morning: Icon.sunrise,
  day: Icon.sun,
  golden: Icon.sunset,
  night: Icon.moon,
};

export default function WorldControls() {
  return (
    <Panel className="grid gap-1.5 p-1.5 [grid-template-areas:'times'_'screen'] sm:[grid-template-areas:'times_screen'] sm:items-center lg:w-full lg:max-w-[280px] lg:items-center lg:gap-y-1 lg:p-2 lg:[grid-template-areas:'label_screen'_'times_times'] lg:[grid-template-columns:1fr_auto]">
      <p aria-hidden className="hidden pl-1.5 font-ui text-[13px] font-bold text-pine/80 [grid-area:label] lg:block">
        Time of day
      </p>
      <TimePicker />
      <FullscreenButton />
    </Panel>
  );
}

/** Morning, day, sunset, night: one radio group, arrow keys move between them. */
function TimePicker() {
  const time = useHud((s) => s.timeOfDay);
  const radios = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const from = radios.current.indexOf(e.target as HTMLButtonElement);
    const at = from >= 0 ? from : TIMES.findIndex((t) => t.id === time);
    const last = TIMES.length - 1;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = at === last ? 0 : at + 1;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = at === 0 ? last : at - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    // The arrows also walk and turn the camera; inside this group they only pick a time.
    e.preventDefault();
    e.stopPropagation();
    actions.setTimeOfDay(TIMES[next].id);
    radios.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Time of day"
      onKeyDown={onKeyDown}
      className="grid grid-cols-2 gap-1 [grid-area:times] sm:flex lg:rounded-2xl lg:bg-pine/[0.07] lg:p-1"
    >
      {TIMES.map((t, i) => {
        const checked = t.id === time;
        const Picture = TIME_ICONS[t.id];
        return (
          <button
            key={t.id}
            ref={(el) => {
              radios.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={t.label}
            onClick={() => actions.setTimeOfDay(t.id)}
            className={`pointer-events-auto flex h-11 w-11 select-none flex-col items-center justify-center gap-1 rounded-2xl font-ui text-pine transition-[background-color,box-shadow,transform] duration-150 motion-safe:active:scale-95 motion-reduce:transition-none min-[380px]:h-12 min-[380px]:w-12 lg:h-[54px] lg:w-auto lg:min-w-0 lg:flex-1 lg:rounded-[14px] ${
              checked
                ? "bg-honey shadow-[inset_0_0_0_2px_rgb(44_58_50/0.85)]"
                : "bg-white/55 hover:bg-white/90 lg:bg-transparent lg:hover:bg-white/70"
            }`}
          >
            <Picture className="h-[22px] w-[22px] lg:h-5 lg:w-5" />
            <span className="sr-only text-[11.5px] font-bold leading-none lg:not-sr-only">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => void };

function canFullscreen(): boolean {
  const d = document as FullscreenDocument;
  const root = document.documentElement as FullscreenRoot;
  return Boolean((d.fullscreenEnabled && typeof root.requestFullscreen === "function") || (d.webkitFullscreenEnabled && root.webkitRequestFullscreen));
}

function isFullscreen(): boolean {
  const d = document as FullscreenDocument;
  return Boolean(d.fullscreenElement ?? d.webkitFullscreenElement);
}

function onFullscreenChange(callback: () => void): () => void {
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
  };
}

const never = () => () => {};

function toggleFullscreen() {
  const d = document as FullscreenDocument;
  const root = document.documentElement as FullscreenRoot;
  if (isFullscreen()) {
    if (typeof d.exitFullscreen === "function") d.exitFullscreen().catch(() => {});
    else d.webkitExitFullscreen?.();
  } else if (typeof root.requestFullscreen === "function") {
    root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
  } else {
    root.webkitRequestFullscreen?.();
  }
}

/** Hidden where the browser can't do it (an iPhone, for one). */
function FullscreenButton() {
  const supported = useSyncExternalStore(never, canFullscreen, () => false);
  const on = useSyncExternalStore(onFullscreenChange, isFullscreen, () => false);
  if (!supported) return null;
  return (
    <HudButton
      round
      active={on}
      aria-pressed={on}
      aria-label="Full screen"
      title={on ? "Leave full screen" : "Full screen"}
      onClick={toggleFullscreen}
      className="[grid-area:screen] max-sm:w-full sm:h-12 lg:h-11"
    >
      {on ? <ExitFullscreenIcon /> : <EnterFullscreenIcon />}
    </HudButton>
  );
}

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function EnterFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...line}>
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </svg>
  );
}

function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden {...line}>
      <path d="M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5" />
    </svg>
  );
}
