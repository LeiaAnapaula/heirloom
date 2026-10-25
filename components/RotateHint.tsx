"use client";

import { motion } from "framer-motion";

/**
 * The book is a landscape spread. On a tablet or phone held upright, ask for a turn
 * instead of squeezing the pages. CSS decides when it shows, so it never flashes.
 */
export default function RotateHint() {
  return (
    // Covers and blocks the page on an upright tablet or phone (touch screens only, so a narrow
    // laptop window never sees it). EpisodeRunner pauses the story under the same media query.
    <div className="fixed inset-0 z-50 hidden items-center justify-center bg-ink [@media(orientation:portrait)_and_(pointer:coarse)]:flex">
      <div className="flex flex-col items-center gap-6 px-8 text-center">
        <motion.svg
          viewBox="0 0 64 64"
          className="h-24 w-24 text-gold"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ rotate: [0, 0, -90, -90, 0] }}
          transition={{ duration: 3.2, times: [0, 0.25, 0.5, 0.85, 1], repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          <rect x="18" y="8" width="28" height="48" rx="5" />
          <circle cx="32" cy="50" r="1.6" fill="currentColor" />
        </motion.svg>
        <p className="text-2xl font-semibold text-moon">Turn me sideways to open the book.</p>
      </div>
    </div>
  );
}
