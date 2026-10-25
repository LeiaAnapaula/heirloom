"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
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

  return (
    <main className="relative isolate flex h-dvh flex-col items-center justify-center gap-5 overflow-hidden">
      <Starfield />
      <RotateHint />
      <Book opened={false} glowing turnKey="loading">
        {null}
      </Book>
      <motion.p
        className="h-6 text-lg font-semibold text-moon/90"
        animate={{ opacity: waitingFor ? [0.5, 1, 0.5] : 0 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {waitingFor ? `Writing a story for ${waitingFor}...` : ""}
      </motion.p>
    </main>
  );
}
