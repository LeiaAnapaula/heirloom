"use client";

import { useRouter } from "next/navigation";
import { unlockSfx } from "@/lib/sfx";
import { unlockAudio } from "@/lib/voice";

/** Full screen where the browser allows it (iPad Safari and Chrome do after a tap). */
function goFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    // Not allowed here (iPhone, some embeds): the book still fits the window.
  }
}

/**
 * The first tap of the session. Browsers only let a page speak, play sounds, or go full
 * screen after a person taps, so this tap wakes all three before the book opens.
 */
export default function OpenBookButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        unlockAudio();
        unlockSfx();
        goFullscreen();
        router.push(href);
      }}
      className="glow-button mt-14 rounded-full px-12 py-5 text-2xl font-bold sm:text-3xl"
    >
      Open the book
    </button>
  );
}
