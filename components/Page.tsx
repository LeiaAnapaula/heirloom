"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Line } from "@/lib/episode";
import { Spine } from "./Book";

/**
 * One page of the book: the illustration fills the spread, the interaction sits
 * on top of it, and the narration reads across the top like printed text.
 */
export default function Page({ art, caption, children }: { art: ReactNode; caption?: ReactNode; children?: ReactNode }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0">{art}</div>
      <Spine />
      <div className="absolute inset-0">{children}</div>
      {/* Above the art, so a star that rises in front of the words never sits on top of the narration. */}
      {caption && <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center px-[8%] pt-[4.5%]">{caption}</div>}
    </div>
  );
}

/**
 * The narration as it is spoken. While the narrator reads, the current word glows gold,
 * so a child can follow along with their eyes.
 */
export function Caption({ line, wordIndex = -1 }: { line: Line | null; wordIndex?: number }) {
  const words = line ? line.text.split(/\s+/) : [];
  return (
    <AnimatePresence mode="wait">
      {line && (
        <motion.p
          key={line.id + line.text}
          aria-live="polite"
          className="max-w-[34ch] text-center [text-wrap:balance] text-[clamp(1.25rem,2.7vw,2.4rem)] font-semibold leading-snug text-moon [text-shadow:0_2px_18px_rgba(10,15,42,0.85)]"
          initial={{ opacity: 0, y: 8 }}
          // Quick swaps: the narrator starts each line at once, so its caption must be readable within about 0.2 s.
          animate={{ opacity: 1, y: 0, transition: { duration: 0.15 } }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.1 } }}
        >
          {words.map((w, i) => (
            <span
              key={i}
              className="transition-colors duration-150"
              style={{ color: wordIndex === -1 || i < wordIndex ? undefined : i === wordIndex ? "#f5c969" : "rgba(247,240,220,0.62)" }}
            >
              {w}
              {i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </motion.p>
      )}
    </AnimatePresence>
  );
}
