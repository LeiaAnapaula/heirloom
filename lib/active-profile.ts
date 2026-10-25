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

/** Remember which child is reading on this device. */
export function setActiveProfile(id: string): void {
  memory = id;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
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

export function activeProfileId(): string {
  return getActiveProfile().id;
}

/** Which made-up child the book reads to. Mia unless a grown-up picked someone else. */
export function getActiveProfile(): ChildProfile {
  const id = storedId();
  return DEMO_PROFILES.find((p) => p.id === id) ?? MIA;
}
