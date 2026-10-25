"use client";

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, type ReactNode } from "react";

export const TURN_MS = 1100;
export const OPEN_MS = 1500;

const turnEase = [0.645, 0.045, 0.355, 1] as const;

/**
 * The glowing book. Closed, it shows its cover and breathes gold light.
 * Open, it is a two-page spread; changing `turnKey` turns a page.
 */
export default function Book({
  opened,
  glowing,
  turnKey,
  children,
}: {
  opened: boolean;
  glowing?: boolean;
  turnKey: string | number;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const coverAngle = useMotionValue(opened ? -180 : 0);
  const coverFront = useTransform(coverAngle, [-91, -89], [0, 1]);
  const coverBack = useTransform(coverAngle, [-91, -89], [1, 0]);
  const coverOpacity = useTransform(coverAngle, [-180, -150], [0, 1]);

  useEffect(() => {
    const controls = animate(coverAngle, opened ? -180 : 0, {
      duration: reduceMotion ? 0 : OPEN_MS / 1000,
      ease: turnEase,
    });
    return () => controls.stop();
  }, [opened, reduceMotion, coverAngle]);

  return (
    <div className="relative [perspective:2600px]" style={{ width: "min(94vw, calc((100dvh - 88px) * 1.5))", aspectRatio: "3 / 2" }}>
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        initial={false}
        animate={{ x: opened ? "0%" : "-25%" }}
        transition={{ duration: reduceMotion ? 0 : OPEN_MS / 1000, ease: turnEase }}
      >
        {/* The boards behind the pages, and the gold light they throw. Closed, only the right half exists. */}
        <motion.div
          className="absolute -inset-y-[1.2%] right-[-0.8%] rounded-[2.2rem] bg-[#18205a]"
          initial={false}
          animate={{
            left: opened ? "-0.8%" : "50%",
            boxShadow: glowing
              ? "0 0 0 1px rgba(245,201,105,0.75), 0 0 90px 28px rgba(245,201,105,0.5), 0 0 240px 70px rgba(245,201,105,0.22)"
              : "0 0 0 1px rgba(245,201,105,0.35), 0 0 70px 10px rgba(245,201,105,0.2), 0 30px 80px rgba(0,0,0,0.45)",
          }}
          transition={{
            left: { duration: reduceMotion ? 0 : OPEN_MS / 1000, ease: turnEase },
            boxShadow: { duration: glowing ? 1.4 : 0.8, ease: "easeInOut" },
          }}
        />

        {/* The pages. Stacked cream edges along the bottom say "book". */}
        <motion.div
          className="absolute inset-0 overflow-hidden rounded-[1.6rem]"
          style={{
            background:
              "radial-gradient(120% 90% at 30% 10%, #24306b 0%, #18215099 45%, transparent 75%), radial-gradient(90% 80% at 80% 90%, #2c2766 0%, transparent 70%), #121a40",
            boxShadow:
              "0 2px 0 #efe5c8, 0 4px 0 #ddd0ab, 0 6px 0 #eae0c2, 0 8px 0 #d3c59c, 0 10px 0 #e4d9b8, 0 12px 18px rgba(0,0,0,0.35)",
          }}
          initial={false}
          animate={{ clipPath: opened ? "inset(0% 0% 0% 0% round 1.6rem)" : "inset(0% 0% 0% 50% round 1.6rem)" }}
          transition={{ duration: reduceMotion ? 0 : OPEN_MS / 1000, ease: turnEase }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={turnKey}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: reduceMotion ? 0 : 0.45, duration: 0.5 } }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
            >
              {children}
            </motion.div>
          </AnimatePresence>

          {/* The spine: a soft valley of shadow down the middle. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 w-[9%] -translate-x-1/2"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(5,8,26,0.28) 38%, rgba(5,8,26,0.5) 50%, rgba(5,8,26,0.28) 62%, transparent 100%)",
            }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[1.6rem] ring-1 ring-inset ring-gold/15" />
        </motion.div>

        {/* A turning leaf hides the swap from one spread to the next. */}
        {!reduceMotion && <TurningLeaf turnKey={turnKey} />}

        {/* The front cover, hinged at the spine. Faces swap at 90 degrees, which is
            sturdier across browsers than relying on backface-visibility alone. */}
        <motion.div
          aria-hidden={opened}
          className="pointer-events-none absolute inset-y-0 left-1/2 w-1/2"
          style={{ transformOrigin: "left center", rotateY: coverAngle, opacity: coverOpacity }}
        >
          <motion.div className="absolute inset-0" style={{ opacity: coverFront }}>
            <Cover glowing={!!glowing} />
          </motion.div>
          <motion.div
            aria-hidden
            className="absolute inset-0 rounded-[1.6rem]"
            style={{ opacity: coverBack, background: "linear-gradient(270deg, #1a2350 0%, #121a40 100%)" }}
          />
        </motion.div>
      </motion.div>
    </div>
  );
}

function TurningLeaf({ turnKey }: { turnKey: string | number }) {
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={turnKey}
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-1/2 [transform-style:preserve-3d]"
        style={{ transformOrigin: "left center" }}
        initial={{ rotateY: 0, opacity: 1 }}
        animate={{ rotateY: -180, opacity: [1, 1, 1, 0], transition: { duration: TURN_MS / 1000, ease: turnEase, opacity: { duration: TURN_MS / 1000, times: [0, 0.6, 0.85, 1] } } }}
        exit={{ opacity: 0, transition: { duration: 0 } }}
      >
        <div
          className="absolute inset-0 rounded-r-[1.6rem] [backface-visibility:hidden]"
          style={{ background: "linear-gradient(90deg, #0f1638 0%, #1c2660 40%, #222d6b 100%)", boxShadow: "inset 12px 0 30px rgba(5,8,26,0.5)" }}
        />
        <div
          className="absolute inset-0 rounded-l-[1.6rem] [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={{ background: "linear-gradient(270deg, #0f1638 0%, #1a2358 50%, #202a66 100%)", boxShadow: "inset -12px 0 30px rgba(5,8,26,0.5)" }}
        />
      </motion.div>
    </AnimatePresence>
  );
}

function Cover({ glowing }: { glowing: boolean }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.6rem] [backface-visibility:hidden]"
      style={{
        background: "radial-gradient(90% 70% at 50% 35%, #2a3478 0%, #1a2258 55%, #121a40 100%)",
        boxShadow: "inset 0 0 0 1px rgba(245,201,105,0.35), inset 10px 0 24px rgba(5,8,26,0.55)",
      }}
    >
      <div className="absolute inset-[5%] rounded-[1.1rem] border border-gold/45" />
      <div className="absolute inset-[6.5%] rounded-[0.9rem] border border-gold/20" />
      <motion.svg
        viewBox="0 0 100 100"
        className="w-[34%]"
        animate={glowing ? { scale: [1, 1.06, 1], opacity: [0.85, 1, 0.85] } : { scale: 1, opacity: 0.85 }}
        transition={{ duration: 2.4, repeat: glowing ? Infinity : 0, ease: "easeInOut" }}
      >
        <defs>
          <radialGradient id="cover-star-glow">
            <stop offset="0%" stopColor="#ffe9b0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#f5c969" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#cover-star-glow)" />
        <path
          d="M50 14 L59.5 39.5 L86 40.5 L65 57 L72.5 83 L50 68 L27.5 83 L35 57 L14 40.5 L40.5 39.5 Z"
          fill="#f5c969"
          stroke="#fff1c9"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </motion.svg>
      <p className="mt-[6%] text-[clamp(1.1rem,2.6vw,2.4rem)] font-semibold tracking-wide text-gold">The Primer</p>
    </div>
  );
}
