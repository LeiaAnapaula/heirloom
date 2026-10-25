"use client";

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { YesInteraction } from "@/lib/episode";
import type { InteractionProps } from "@/lib/interaction";
import { playSfx } from "@/lib/sfx";
import { isYes, listenFor, stopListening } from "@/lib/listen";

const NUDGES = 2;

/**
 * Screen 1: "Will you help me?" The child says yes or taps the big glowing button.
 * Asking out loud here also brings up the microphone prompt early, while a grown-up is near.
 */
export default function YesButton({ config, active, ctx }: InteractionProps<YesInteraction>) {
  const [listening, setListening] = useState(false);
  const [chosen, setChosen] = useState(false);
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    stopListening();
    setListening(false);
    setChosen(true);
    ctx.succeed();
  };

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      for (let nudges = 0; !cancelled && !done.current; ) {
        setListening(true);
        playSfx("listen");
        await new Promise((r) => setTimeout(r, 220)); // let the ding finish before the microphone opens
        if (cancelled || done.current) return;
        const heard = await listenFor((h) => isYes(h, config.accept), { timeoutMs: 6000 });
        if (cancelled || done.current || !ctx.alive()) return;
        setListening(false);
        if (heard.status === "match") return finish();
        // No microphone: the button alone carries the page, no spoken nudges about talking.
        if (heard.status === "unavailable") return;
        if (nudges >= NUDGES) return;
        nudges++;
        await ctx.narrate(ctx.help);
      }
    })();
    return () => {
      cancelled = true;
      stopListening();
    };
    // finish and ctx are stable for the life of this screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="absolute left-1/2 top-[84%] -translate-x-1/2 -translate-y-1/2">
      <motion.button
        onClick={finish}
        disabled={!active || chosen}
        aria-label="Yes"
        className="glow-button relative min-h-24 min-w-56 rounded-full px-14 text-[clamp(2.2rem,4.5vw,3.6rem)] font-bold disabled:cursor-default"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: active || chosen ? 1 : 0, scale: chosen ? 1.12 : 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Yes!
        {listening && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-3 rounded-full ring-2 ring-gold/70"
            animate={{ opacity: [0.2, 0.9, 0.2], scale: [0.98, 1.06, 0.98] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.button>
    </div>
  );
}
