"use client";

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

/**
 * The few building blocks every HUD panel shares, so the whole HUD reads as one
 * object: frosted paper panels, rounded buttons that light up honey when picked,
 * and small key hints for keyboards.
 */

export function Panel({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={`hud-panel pointer-events-auto rounded-[20px] ${className}`}>
      {children}
    </div>
  );
}

type HudButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Picked, on, or the current choice: filled honey. */
  active?: boolean;
  /** The one thing to do next on this panel: filled pine. */
  primary?: boolean;
  /** Square, icon only. Give it an aria-label. */
  round?: boolean;
  children: ReactNode;
};

export function HudButton({ active, primary, round, className = "", children, ...rest }: HudButtonProps) {
  const look = primary
    ? "bg-pine text-paper hover:bg-[#3a4b41]"
    : active
      ? "bg-honey text-pine shadow-[inset_0_0_0_2px_rgb(44_58_50/0.85)]"
      : "bg-white/55 text-pine hover:bg-white/85";
  const shape = round ? "h-11 w-11 justify-center rounded-2xl" : "min-h-11 gap-2 rounded-2xl px-3.5";
  return (
    <button
      type="button"
      {...rest}
      className={`pointer-events-auto inline-flex select-none items-center text-[15px] font-bold transition-[background-color,transform] duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-45 ${shape} ${look} ${className}`}
    >
      {children}
    </button>
  );
}

/** A key hint like "R", shown only where there is a real keyboard. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="hidden min-w-5 rounded-md border border-pine/25 bg-white/70 px-1.5 py-px text-center font-ui text-[11px] font-bold leading-4 text-pine/75 [@media(hover:hover)_and_(pointer:fine)]:inline-block">
      {children}
    </kbd>
  );
}
