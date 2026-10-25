"use client";

import { motion } from "framer-motion";
import type { ArtId } from "@/lib/episode";
import { Rocket, StarSprite } from "./art/sprites";

export type Mood = "idle" | "celebrate";

/**
 * The illustration for a screen: a painted background from public/art, plus any
 * characters that react when the child succeeds (the rocket lifts off, the star flies home).
 * Interactive pieces (planets, pencil, feather) belong to their interaction components.
 */
export default function Scene({ art, mood }: { art: ArtId; mood: Mood }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(/art/${art}.svg)` }} />
      {art === "launch-pad" && <LaunchStage mood={mood} />}
      {art === "star-home" && <StarHomeStage mood={mood} />}
    </div>
  );
}

function LaunchStage({ mood }: { mood: Mood }) {
  const go = mood === "celebrate";
  return (
    <motion.div
      className="absolute bottom-[21%] left-[22%] h-[40%] -translate-x-1/2"
      style={{ aspectRatio: "60 / 120" }}
      animate={
        go
          ? { x: ["0%", "-4%", "4%", "-4%", "4%", "-3%", "3%", "0%", "0%"], y: ["0%", "0%", "0%", "0%", "0%", "0%", "0%", "0%", "-260%"] }
          : { x: "0%", y: "0%" }
      }
      transition={go ? { duration: 2.6, times: [0, 0.06, 0.12, 0.18, 0.24, 0.3, 0.36, 0.42, 1], ease: "easeIn" } : { duration: 0 }}
    >
      <Rocket className="h-full w-full" flame={go} />
    </motion.div>
  );
}

function StarHomeStage({ mood }: { mood: Mood }) {
  const go = mood === "celebrate";
  return (
    <motion.div
      className="absolute bottom-[16%] left-1/2 h-[20%] -translate-x-1/2"
      style={{ aspectRatio: "1" }}
      animate={go ? { y: "-250%", scale: 0.7 } : { y: ["0%", "-4%", "0%"], scale: 1 }}
      transition={go ? { duration: 3.2, ease: [0.22, 1, 0.36, 1] } : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <StarSprite className="h-full w-full" />
    </motion.div>
  );
}
