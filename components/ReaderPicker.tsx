"use client";

import { useSyncExternalStore } from "react";
import { activeProfileId, setActiveProfile, subscribeActiveProfile } from "@/lib/active-profile";
import { DEMO_PROFILES, MIA } from "@/lib/profile";

/**
 * The episode title says who the story is for, and a grown-up can switch between the
 * made-up demo children to hear the story brain retell it around different interests.
 */
export function ReaderTitle({ title }: { title: string }) {
  const id = useSyncExternalStore(subscribeActiveProfile, activeProfileId, () => MIA.id);
  const name = DEMO_PROFILES.find((p) => p.id === id)?.name ?? MIA.name;
  return <p className="mt-4 text-xl font-medium text-mist sm:text-2xl">{title.replaceAll("{name}", name)}</p>;
}

export function ReaderPicker() {
  const id = useSyncExternalStore(subscribeActiveProfile, activeProfileId, () => MIA.id);
  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      <p className="text-sm font-medium text-mist/80">Story for</p>
      <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Story for">
        {DEMO_PROFILES.map((p) => (
          <button
            key={p.id}
            role="radio"
            aria-checked={p.id === id}
            onClick={() => setActiveProfile(p.id)}
            className={`rounded-full px-4 py-2 text-base font-semibold transition-all ${
              p.id === id ? "bg-gold/90 text-ink" : "text-moon/80 ring-1 ring-mist/30 hover:ring-gold/60"
            }`}
          >
            {p.name}
            <span className={p.id === id ? "text-ink/70" : "text-mist/70"}> loves {p.interests[0]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
