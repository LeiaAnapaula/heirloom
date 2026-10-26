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
import { getNarration } from "@/lib/story";

type Ready = { profile: ChildProfile; episode: Episode; childId: string | null };

/**
 * Finds out who is reading, and for anyone but Mia asks the story brain to retell the
 * episode around what they love. Mia's written story (and its pre-made audio) is the default.
 * While a new story is being written, the closed book breathes on the night sky.
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
