"use client";

import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useState } from "react";
import Book from "./Book";
import EpisodeRunner from "./EpisodeRunner";
import RotateHint from "./RotateHint";
import Starfield from "./Starfield";
import { loadReader } from "@/lib/active-profile";
import type { Episode } from "@/lib/episode";
import { MIA, type ChildProfile } from "@/lib/profile";
import { applyTelling, getNarration, pickTelling } from "@/lib/story";

type Ready = { profile: ChildProfile; episode: Episode; childId: string | null };

/**
 * Finds out who is reading and picks their story. Mia hears the written story (and its
 * pre-made audio). Anyone else hears, in this order: the written story when it is already
 * about what they love (space), a written telling for their theme (dinosaurs, the ocean...),
 * both instantly, or else a story the story brain writes for them. Only that last one waits,
 * with the closed book breathing on the night sky, and any problem there means the written story.
 */
export default function StoryLoader({ episode }: { episode: Episode }) {
  const [ready, setReady] = useState<Ready | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);

  // Next keeps a visited page alive but hidden. When the book is closed, forget who was reading,
  // so reopening it (maybe for another child) starts fresh instead of replaying the old story.
  useLayoutEffect(
    () => () => {
      setReady(null);
      setWaitingFor(null);
    },
    [],
  );

  useEffect(() => {
    const abort = new AbortController();
    (async () => {
      const { profile, childId } = await loadReader();
      if (abort.signal.aborted) return;
      if (profile.id === MIA.id) return setReady({ profile, episode, childId });
      // A written story for what this child loves needs no wait.
      const telling = pickTelling(episode, profile.interests);
      if (telling === "written") return setReady({ profile, episode, childId });
      if (telling) return setReady({ profile, episode: applyTelling(episode, telling), childId });
      setWaitingFor(profile.name);
      const story = await getNarration(
        { name: profile.name, age: profile.age, interests: profile.interests },
        episode,
        { signal: abort.signal, timeoutMs: 45000 },
      );
      // Any problem (no key, a slow reply, a line that failed the safety check) quietly
      // means the written story, which still says this child's name.
      if (!abort.signal.aborted) setReady({ profile, episode: story.episode, childId });
    })();
    return () => abort.abort();
  }, [episode]);

  if (ready) return <EpisodeRunner episode={ready.episode} profile={ready.profile} childId={ready.childId} />;
  return <SleepingBook waitingFor={waitingFor} />;
}

/**
 * The closed, glowing book on the night sky, while the episode loads. The episode page's loading
 * fallback is this same view, so from the tap on "Open the book" until the book opens, the sky and
 * the book never blink or move as one tree hands over to the next.
 */
export function SleepingBook({ waitingFor }: { waitingFor: string | null }) {
  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center gap-5 overflow-hidden">
      <Starfield />
      <RotateHint />
      <Book opened={false} glowing turnKey="loading">
        {null}
      </Book>
      {/* As tall as the row of page stars under the open book, so the book stays put when the story arrives. */}
      <motion.p
        className="h-4 text-lg font-semibold leading-4 text-moon/90"
        animate={{ opacity: waitingFor ? [0.5, 1, 0.5] : 0 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {waitingFor ? `Writing a story for ${waitingFor}...` : ""}
      </motion.p>
    </main>
  );
}
