"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

/** The quiet form pieces the grown-up screens share. */

export function Field({ label, hint, ...input }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-2 block text-base font-semibold text-moon">{label}</span>
      <input
        {...input}
        className="block w-full rounded-2xl bg-night/70 px-5 py-4 text-lg text-moon ring-1 ring-mist/25 outline-none transition-shadow placeholder:text-mist/50 focus:ring-2 focus:ring-gold"
      />
      {hint && <span className="mt-2 block text-sm text-mist">{hint}</span>}
    </label>
  );
}

export function Pill({ selected, onClick, children, size = "md" }: { selected: boolean; onClick: () => void; children: ReactNode; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full font-semibold transition-all ${size === "lg" ? "min-h-14 min-w-14 px-5 text-xl" : "px-4 py-2.5 text-base"} ${
        selected ? "bg-gold text-ink shadow-[0_0_24px_rgba(245,201,105,0.35)]" : "bg-night/70 text-moon ring-1 ring-mist/25 hover:ring-gold/60"
      }`}
    >
      {children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-2xl bg-[#d9788a]/15 px-4 py-3 text-base font-medium text-[#ffd0d8] ring-1 ring-[#d9788a]/40">
      {message}
    </p>
  );
}

export function PrimaryButton({ children, busy, ...rest }: { busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} disabled={busy || rest.disabled} className="glow-button w-full rounded-full px-8 py-4 text-xl font-bold disabled:opacity-60">
      {busy ? "One moment..." : children}
    </button>
  );
}
