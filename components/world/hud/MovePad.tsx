"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { actions } from "../store";
import { Icon } from "./icons";
import { Kbd, Panel } from "./ui";

/**
 * The on-screen pad for walking around Grandpa's world. On a phone or tablet it is
 * the main way to move, so the buttons are big enough for small thumbs; with a
 * mouse and keyboard it shrinks a little and shows the keys that do the same.
 *
 *   turn left   forward   turn right
 *   step left   home      step right
 *   go up       back      go down
 */

type Move = readonly [x: number, y: number, z: number];

/** A tap from the keyboard (Enter or Space on a focused button) walks this long. */
const STEP_MS = 300;

type Held = {
  press(id: string, move: Move): void;
  release(id: string): void;
};

const clamp = (n: number) => Math.max(-1, Math.min(1, n));

/**
 * Everything held on the pad at once, added up. Each finger, the mouse and each key
 * is its own entry, so a thumb on forward and another on step right walks on a
 * slant, letting go of one never stops the other, and letting go of all of them
 * always stops.
 */
function useHeld(): Held {
  const held = useRef(new Map<string, Move>());

  useEffect(() => {
    const map = held.current;
    return () => {
      // Never leave the camera walking when the pad goes away.
      if (map.size > 0) actions.setMove(0, 0, 0);
      map.clear();
    };
  }, []);

  function send() {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const m of held.current.values()) {
      x += m[0];
      y += m[1];
      z += m[2];
    }
    actions.setMove(clamp(x), clamp(y), clamp(z));
  }

  return {
    press(id, move) {
      held.current.set(id, move);
      send();
    },
    release(id) {
      if (held.current.delete(id)) send();
    },
  };
}

const BUTTON =
  "pointer-events-auto relative grid h-[var(--s)] w-[var(--s)] touch-none select-none place-items-center text-pine [-webkit-touch-callout:none] transition-[background-color,box-shadow,transform] duration-150 motion-safe:active:scale-95 motion-reduce:transition-none";

type Look = { className: string; round?: boolean };

const LOOK = {
  /** The four ways to walk: the d-pad cross. */
  walk: { className: "rounded-2xl bg-white/70 shadow-[0_1px_0_rgb(255_255_255/0.8)_inset,0_1px_3px_rgb(20_30_24/0.18)] hover:bg-white" },
  /** Turning and going up or down, in the corners: quieter, round. */
  corner: { className: "bg-white/40 hover:bg-white/80", round: true },
  /** Home in the middle of the cross. */
  home: { className: "bg-paper text-wood shadow-[inset_0_0_0_2px_rgb(138_90_59/0.35)] hover:bg-white", round: true },
} satisfies Record<string, Look>;

/**
 * Round buttons keep their circle (and a circular focus ring) inline, because the
 * HUD's focus style squares every focused corner off to 14px.
 */
const shape = (look: Look) => (look.round ? { borderRadius: 9999 } : undefined);

const PRESSED =
  "data-[pressed]:bg-honey data-[pressed]:text-pine data-[pressed]:shadow-[inset_0_0_0_2px_rgb(44_58_50/0.85)] motion-safe:data-[pressed]:scale-95";

const ICON = "h-[22px] w-[22px] [@media(hover:hover)_and_(pointer:fine)]:h-5 [@media(hover:hover)_and_(pointer:fine)]:w-5";

type HoldProps = {
  id: string;
  move: Move;
  label: string;
  keys: string;
  look: Look;
  held: Held;
  children: ReactNode;
};

/** Press and hold to keep moving; let go (anywhere) to stop. */
function HoldButton({ id, move, label, keys, look, held, children }: HoldProps) {
  const [down, setDown] = useState(false);
  const keyTap = useRef({ at: 0, timer: 0 });

  function endPointer(e: PointerEvent<HTMLButtonElement>) {
    held.release(`pointer:${e.pointerId}`);
    setDown(false);
  }

  function stopKey() {
    window.clearTimeout(keyTap.current.timer);
    held.release(`key:${id}`);
    setDown(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    if (e.repeat) return; // holding the key keeps walking until it comes up
    window.clearTimeout(keyTap.current.timer);
    keyTap.current.at = performance.now();
    held.press(`key:${id}`, move);
    setDown(true);
  }

  function onKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    // A quick tap still takes a whole small step.
    const wait = Math.max(0, keyTap.current.at + STEP_MS - performance.now());
    window.clearTimeout(keyTap.current.timer);
    keyTap.current.timer = window.setTimeout(stopKey, wait);
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={label}
      data-pressed={down || undefined}
      className={`${BUTTON} ${look.className} ${PRESSED}`}
      style={shape(look)}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        try {
          // Keep hearing this finger even after it slides off the button.
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; pointerup will not come, so do not start.
          return;
        }
        held.press(`pointer:${e.pointerId}`, move);
        setDown(true);
      }}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={endPointer}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={stopKey}
    >
      {children}
    </button>
  );
}

type TapProps = {
  label: string;
  keys: string;
  look: Look;
  onPress: () => void;
  children: ReactNode;
};

/** One press, one turn (or one trip home). */
function TapButton({ label, keys, look, onPress, children }: TapProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={label}
      className={`${BUTTON} ${look.className}`}
      style={shape(look)}
      onClick={onPress}
      onKeyDown={(e) => {
        // The engine owns Enter for placing pieces; a focused pad button keeps it.
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      {children}
    </button>
  );
}

export default function MovePad() {
  const held = useHeld();

  return (
    <Panel
      role="group"
      aria-label="Move around"
      onContextMenu={(e) => e.preventDefault()}
      className="flex touch-none select-none items-center gap-3.5 p-2 [--g:6px] [--s:52px] max-[379px]:[--g:5px] max-[379px]:[--s:48px] [@media(hover:hover)_and_(pointer:fine)]:p-2.5 @min-[340px]:[@media(hover:hover)_and_(pointer:fine)]:pr-3.5 [@media(hover:hover)_and_(pointer:fine)]:[--s:44px] [@media(max-height:700px)]:[--g:5px]! [@media(max-height:700px)]:[--s:44px]!"
    >
      <div className="relative grid grid-cols-[repeat(3,var(--s))] grid-rows-[repeat(3,var(--s))] gap-[var(--g)]">
        {/* A soft cross behind the four walking buttons, like a d-pad. */}
        <span
          aria-hidden
          className="absolute rounded-[20px] bg-pine/[0.07]"
          style={{ left: -3, right: -3, top: "calc(var(--s) + var(--g) - 3px)", height: "calc(var(--s) + 6px)" }}
        />
        <span
          aria-hidden
          className="absolute rounded-[20px] bg-pine/[0.07]"
          style={{ top: -3, bottom: -3, left: "calc(var(--s) + var(--g) - 3px)", width: "calc(var(--s) + 6px)" }}
        />

        <TapButton label="Turn left" keys="ArrowLeft" look={LOOK.corner} onPress={() => actions.turn(30)}>
          <Icon.turnLeft className={ICON} />
        </TapButton>
        <HoldButton id="forward" move={[0, 0, 1]} label="Walk forward" keys="W ArrowUp" look={LOOK.walk} held={held}>
          <Icon.up className={ICON} />
        </HoldButton>
        <TapButton label="Turn right" keys="ArrowRight" look={LOOK.corner} onPress={() => actions.turn(-30)}>
          <Icon.turnRight className={ICON} />
        </TapButton>

        <HoldButton id="left" move={[-1, 0, 0]} label="Step left" keys="A" look={LOOK.walk} held={held}>
          <Icon.left className={ICON} />
        </HoldButton>
        <TapButton label="Back to the start" keys="H" look={LOOK.home} onPress={() => actions.home()}>
          <Icon.home className={ICON} />
        </TapButton>
        <HoldButton id="right" move={[1, 0, 0]} label="Step right" keys="D" look={LOOK.walk} held={held}>
          <Icon.right className={ICON} />
        </HoldButton>

        <HoldButton id="rise" move={[0, 1, 0]} label="Go up" keys="E" look={LOOK.corner} held={held}>
          <Icon.rise className={ICON} />
        </HoldButton>
        <HoldButton id="back" move={[0, 0, -1]} label="Walk back" keys="S ArrowDown" look={LOOK.walk} held={held}>
          <Icon.down className={ICON} />
        </HoldButton>
        <HoldButton id="sink" move={[0, -1, 0]} label="Go down" keys="Q" look={LOOK.corner} held={held}>
          <Icon.sink className={ICON} />
        </HoldButton>
      </div>

      {/* The same moves on a keyboard, only where there is one and room beside the pad. */}
      <div
        aria-hidden
        className="hidden grid-cols-[auto_auto] items-center gap-x-2 gap-y-2 @min-[340px]:[@media(hover:hover)_and_(pointer:fine)]:grid"
      >
        <Keys keys={["W", "A", "S", "D"]} />
        <Hint>Walk</Hint>
        <Keys keys={["←", "→"]} />
        <Hint>Turn</Hint>
        <Keys keys={["E", "Q"]} />
        <Hint>Up, down</Hint>
        <Keys keys={["H"]} />
        <Hint>Home</Hint>
      </div>
    </Panel>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex justify-end gap-0.5">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap font-ui text-[12px] font-bold text-pine/70">{children}</span>;
}
