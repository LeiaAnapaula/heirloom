import type { AccountChild, AccountView } from "./account-types";
import { fetchAccount } from "./account-client";
import { DEMO_PROFILES, MIA, type ChildProfile } from "./profile";

const KEY = "primer.profile.v1";
const EVENT = "primer-profile";
let memory: string | null = null; // used when storage is blocked (private mode)

function storedId(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

/** Remember which child is reading on this device (a demo child's id or a real child's id). */
export function setActiveProfile(id: string): void {
  memory = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A child was renamed or removed: anything showing a reader or their story asks again. */
export function notifyReaderChanged(): void {
  window.dispatchEvent(new Event(EVENT));
}

/** For useSyncExternalStore: hear about changes from this tab and others. */
export function subscribeActiveProfile(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The remembered id, whatever kind of child it names. */
export function activeProfileId(): string {
  return storedId() ?? MIA.id;
}

/** Which made-up demo child the book reads to when nobody is signed in. Mia unless a grown-up picked someone else. */
export function getActiveProfile(): ChildProfile {
  const id = storedId();
  return DEMO_PROFILES.find((p) => p.id === id) ?? MIA;
}

export function childToProfile(c: AccountChild): ChildProfile {
  return { id: c.id, name: c.name, age: c.age, interests: c.interests, skills: c.skills };
}

export type Reader = {
  profile: ChildProfile;
  childId: string | null; // set when the reader is a real child in a signed-in account
  account: AccountView | null;
};

/**
 * Who the book is reading to right now: a signed-in parent's chosen child (or their first),
 * otherwise the demo child.
 */
export async function loadReader(): Promise<Reader> {
  const account = await fetchAccount();
  if (account && account.children.length) {
    const id = storedId();
    const child = account.children.find((c) => c.id === id) ?? account.children[0];
    return { profile: childToProfile(child), childId: child.id, account };
  }
  return { profile: getActiveProfile(), childId: null, account };
}
