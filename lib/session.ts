import { SKILL_IDS, type Attempt, type ChildProfile, type SkillId } from "./profile";
import { applyAttempt, roundScore } from "./skills";

export type LoggedAttempt = Attempt & { at: number };

/**
 * Today's reading, kept on this device only. It holds the child's first name, age,
 * interests, skill scores and attempts. An attempt's `note` is the gravity guess as
 * text; no audio is ever stored.
 */
export type Session = {
  profile: { id: string; name: string; age: number; interests: string[] };
  startedAt: number;
  startSkills: Record<SkillId, number>;
  skills: Record<SkillId, number>;
  attempts: LoggedAttempt[];
  finished: boolean;
};

const KEY = "primer.session.v1";
const NOTE_MAX = 200; // a child's guess is a sentence, not an essay

// The live copy. It also carries the session when storage is blocked (private mode).
// It is only ever filled in the browser, so a server never holds anyone's session.
let memory: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

const inBrowser = () => typeof window !== "undefined";

/** Begin a new session for this child. Replaces any earlier one. */
export function startSession(profile: ChildProfile): Session | null {
  if (!inBrowser()) return null;
  const skills = cleanSkills(profile.skills);
  const session: Session = {
    profile: {
      id: profile.id,
      name: profile.name.trim(),
      age: profile.age,
      interests: [...profile.interests],
    },
    startedAt: Date.now(),
    startSkills: skills,
    skills: { ...skills },
    attempts: [],
    finished: false,
  };
  save(session);
  return session;
}

/** Record one attempt and update that skill's score. Does nothing without a session. */
export function logAttempt(attempt: Attempt): Session | null {
  const session = loadSession();
  if (!session) return null;
  const entry = cleanAttempt({ ...attempt, at: Date.now() });
  if (!entry) return session;
  const next: Session = {
    ...session,
    skills: applyAttempt(session.skills, entry),
    attempts: [...session.attempts, entry],
  };
  save(next);
  return next;
}

/** The child reached the end of the story. */
export function finishSession(): Session | null {
  const session = loadSession();
  if (!session || session.finished) return session;
  const next = { ...session, finished: true };
  save(next);
  return next;
}

/**
 * The current session, or null. Returns the same object until something changes,
 * so it works directly as a useSyncExternalStore snapshot.
 */
export function loadSession(): Session | null {
  if (!inBrowser()) return null;
  if (!loaded) {
    memory = readStorage() ?? memory;
    loaded = true;
  }
  return memory;
}

/** Forget today's results on this device. */
export function clearSession(): void {
  if (!inBrowser()) return;
  memory = null;
  loaded = true;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the in-memory copy is already gone.
  }
  notify();
}

/** Hear about every change, including ones made in another tab. Returns an unsubscribe. */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1 && inBrowser()) window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && inBrowser()) window.removeEventListener("storage", onStorage);
  };
}

function save(session: Session) {
  memory = session;
  loaded = true;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // Storage blocked or full: the session lives in memory for this visit.
  }
  notify();
}

function notify() {
  for (const fn of listeners) fn();
}

function onStorage(e: StorageEvent) {
  if (e.key !== null && e.key !== KEY) return; // a null key means storage was cleared
  memory = readStorage();
  loaded = true;
  notify();
}

function readStorage(): Session | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parseSession(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// Stored data may be old, hand-edited or half-written. Keep only the fields we know,
// in the shapes we expect, so a bad record can never break the parent page.

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parseSession(v: unknown): Session | null {
  if (!isRecord(v) || !isRecord(v.profile) || !isNumber(v.startedAt)) return null;
  const p = v.profile;
  if (typeof p.name !== "string" || !isNumber(p.age)) return null;
  const attempts = Array.isArray(v.attempts) ? v.attempts.map(cleanAttempt).filter((a): a is LoggedAttempt => a !== null) : [];
  return {
    profile: {
      id: typeof p.id === "string" ? p.id : "",
      name: p.name,
      age: p.age,
      interests: Array.isArray(p.interests) ? p.interests.filter((i): i is string => typeof i === "string") : [],
    },
    startedAt: v.startedAt,
    startSkills: cleanSkills(v.startSkills),
    skills: cleanSkills(v.skills),
    attempts,
    finished: v.finished === true,
  };
}

function cleanSkills(v: unknown): Record<SkillId, number> {
  const src = isRecord(v) ? v : {};
  const out = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) out[id] = isNumber(src[id]) ? roundScore(src[id]) : 0;
  return out;
}

function cleanAttempt(v: unknown): LoggedAttempt | null {
  if (!isRecord(v) || !SKILL_IDS.includes(v.skill as SkillId)) return null;
  const entry: LoggedAttempt = {
    skill: v.skill as SkillId,
    correct: v.correct === true,
    hintsUsed: isNumber(v.hintsUsed) ? Math.max(0, Math.round(v.hintsUsed)) : 0,
    ms: isNumber(v.ms) ? Math.max(0, Math.round(v.ms)) : 0,
    at: isNumber(v.at) ? v.at : 0,
  };
  if (v.mode === "voice" || v.mode === "tap" || v.mode === "trace") entry.mode = v.mode;
  if (typeof v.note === "string" && v.note.trim()) entry.note = v.note.trim().slice(0, NOTE_MAX);
  return entry;
}
