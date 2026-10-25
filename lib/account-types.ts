import type { Attempt, SkillId } from "./profile";

/** What the browser sees about an account. Never includes the password hash. */
export type AccountChild = {
  id: string;
  name: string; // first name only
  age: number;
  interests: string[];
  skills: Record<SkillId, number>;
  lastSession: { finishedAt: number; episodeId: string; attempts: Attempt[] } | null;
};

export type AccountView = {
  parent: { email: string; createdAt: number };
  children: AccountChild[];
};

export const CONSENT_VERSION = "2026-10-25.2";

/** Shown at sign-up, word for word, and stored with the date the parent agreed. */
export const CONSENT_TEXT =
  "I am this child's parent or guardian. I agree that The Primer may keep my child's first name, age, interests, and reading progress, only to teach my child. To write and read stories, only the first name, age, and interests are shared with our AI partners (Anthropic for the story, ElevenLabs for the narrator's voice). Spoken answers are turned into text by the browser's speech service; no voice recordings are kept. I can delete everything at any time.";

const NAME = /^[\p{L}][\p{L}' -]{0,19}$/u;
const INTEREST = /^[\p{L} ]{2,30}$/u;

export function cleanChildInput(input: unknown): { name: string; age: number; interests: string[] } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Please fill in your child's details." };
  const { name, age, interests } = input as Record<string, unknown>;
  const n = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
  if (!NAME.test(n)) return { error: "Use your child's first name only (letters, up to 20)." };
  const a = typeof age === "number" ? age : Number(age);
  if (!Number.isInteger(a) || a < 3 || a > 8) return { error: "The Primer is made for children ages 3 to 8." };
  const list = Array.isArray(interests) ? interests : [];
  const ints = [...new Set(list.map((i) => (typeof i === "string" ? i.trim().toLowerCase().replace(/\s+/g, " ") : "")))].filter(Boolean);
  if (ints.length < 1 || ints.length > 3) return { error: "Pick one to three things your child loves." };
  if (!ints.every((i) => INTEREST.test(i))) return { error: "Interests can only use letters and spaces." };
  return { name: n, age: a, interests: ints };
}

export function cleanEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) return "Use at least 8 characters for the password.";
  if (password.length > 200) return "That password is too long.";
  return null;
}
