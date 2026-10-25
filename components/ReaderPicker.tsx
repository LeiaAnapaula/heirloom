"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AccountView } from "@/lib/account-types";
import { fetchAccount } from "@/lib/account-client";
import { activeProfileId, setActiveProfile, subscribeActiveProfile } from "@/lib/active-profile";
import { DEMO_PROFILES, MIA } from "@/lib/profile";

type Choice = { id: string; name: string; loves: string };

// One account request per page view, shared by the title and the picker.
let accountRequest: Promise<AccountView | null> | null = null;

/** undefined while loading, null for a guest. */
function useAccount(): AccountView | null | undefined {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    accountRequest ??= fetchAccount();
    accountRequest.then((a) => live && setAccount(a));
    return () => {
      live = false;
      accountRequest = null; // the next visit to this page asks again
    };
  }, []);
  return account;
}

function useChoices() {
  const account = useAccount();
  const id = useSyncExternalStore(subscribeActiveProfile, activeProfileId, () => MIA.id);
  const real = account?.children.length ? account.children : null;
  const choices: Choice[] = real
    ? real.map((c) => ({ id: c.id, name: c.name, loves: c.interests[0] }))
    : DEMO_PROFILES.map((p) => ({ id: p.id, name: p.name, loves: p.interests[0] }));
  const active = choices.find((c) => c.id === id) ?? choices[0];
  return { account, choices, active, real: !!real };
}

/** "Mia and the Lost Star", or the signed-in child's name. */
export function ReaderTitle({ title }: { title: string }) {
  const { active } = useChoices();
  return <p className="mt-4 text-xl font-medium text-mist sm:text-2xl">{title.replaceAll("{name}", active.name)}</p>;
}

/**
 * Who the story is for. Signed in, these are the parent's own children; otherwise the
 * made-up demo children, so anyone can hear the story brain retell the episode.
 */
export function ReaderPicker() {
  const { account, choices, active, real } = useChoices();
  return (
    <div className="mt-10 flex flex-col items-center gap-3">
      {choices.length > 1 && (
        <>
          <p className="text-sm font-medium text-mist/80">Story for</p>
          <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Story for">
            {choices.map((c) => (
              <button
                key={c.id}
                role="radio"
                aria-checked={c.id === active.id}
                onClick={() => setActiveProfile(c.id)}
                className={`rounded-full px-4 py-2 text-base font-semibold transition-all ${
                  c.id === active.id ? "bg-gold/90 text-ink" : "text-moon/80 ring-1 ring-mist/30 hover:ring-gold/60"
                }`}
              >
                {c.name}
                <span className={c.id === active.id ? "text-ink/70" : "text-mist/70"}> loves {c.loves}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {account !== undefined && (
        <p className="mt-2 text-sm text-mist/80">
          {account ? (
            <Link href="/join" className="font-semibold text-moon/80 hover:text-gold">
              {real ? "Add a child" : "Add your child"}
            </Link>
          ) : (
            <>
              <Link href="/join" className="font-semibold text-moon/80 hover:text-gold">
                Make a grown-up account
              </Link>
              <span aria-hidden className="mx-3 text-mist/40">
                or
              </span>
              <Link href="/login" className="font-semibold text-moon/80 hover:text-gold">
                Sign in
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}
