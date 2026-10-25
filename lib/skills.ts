import type { Attempt, SkillId } from "./profile";

/** A skill counts as mastered at this score or above. */
export const MASTERY = 0.8;

/**
 * Scores live on a 0..1 scale with two decimals. Rounding every update keeps
 * float drift out (0.2 + 0.1 is 0.30000000000000004 in JavaScript), so 0.5 + 0.3
 * lands exactly on MASTERY instead of a hair below it.
 */
export function roundScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.round(Math.min(1, Math.max(0, score)) * 100) / 100;
}

/**
 * The demo's update rule (CLAUDE.md section 7), a simple cousin of knowledge tracing:
 * right with no hints +0.3, right after a hint +0.1, not right -0.1, kept within 0..1.
 */
export function updateScore(score: number, { correct, hintsUsed }: Pick<Attempt, "correct" | "hintsUsed">): number {
  const delta = !correct ? -0.1 : hintsUsed >= 1 ? 0.1 : 0.3;
  return roundScore(roundScore(score) + delta);
}

/** A new skills record with one attempt applied. The input is never changed. */
export function applyAttempt(skills: Record<SkillId, number>, attempt: Attempt): Record<SkillId, number> {
  return { ...skills, [attempt.skill]: updateScore(skills[attempt.skill] ?? 0, attempt) };
}

export function isMastered(score: number): boolean {
  return roundScore(score) >= MASTERY;
}

/** True when the child got it right with no hints at all. */
export function isClean(attempt: Pick<Attempt, "correct" | "hintsUsed">): boolean {
  return attempt.correct && attempt.hintsUsed <= 0;
}

/** Every attempt at one skill, oldest first. */
export function attemptsFor<A extends Attempt>(attempts: readonly A[], skill: SkillId): A[] {
  return attempts.filter((a) => a.skill === skill);
}

/** The most recent attempt at one skill, if there was one. */
export function lastAttempt<A extends Attempt>(attempts: readonly A[], skill: SkillId): A | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    if (attempts[i].skill === skill) return attempts[i];
  }
  return undefined;
}
