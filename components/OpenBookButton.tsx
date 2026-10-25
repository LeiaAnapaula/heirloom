"use client";

import { useRouter } from "next/navigation";
import { unlockAudio } from "@/lib/voice";

/**
 * The first tap of the session. Browsers only let a page speak after a person taps,
 * so this tap wakes the narrator before the book opens.
 */
export default function OpenBookButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        unlockAudio();
        router.push(href);
      }}
      className="glow-button mt-14 rounded-full px-12 py-5 text-2xl font-bold sm:text-3xl"
    >
      Open the book
    </button>
  );
}
