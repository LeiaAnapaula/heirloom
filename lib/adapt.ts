import type { Attempt, SkillId } from "./profile";
import type { Session } from "./session";
import { attemptsFor, isClean, isMastered, roundScore } from "./skills";

/** What tomorrow's episode practices, with one plain sentence per choice for the grown-up. */
export type NextPlan = {
  title: string;
  word: "SUN" | "GO";
  wordReason: string;
  letter: "S" | "T";
  letterReason: string;
  math: "adding" | "counting";
  mathReason: string;
};

// Tomorrow's episode, as promised at the end of the Lost Star.
const NEXT_TITLE = "Saturn's Rings";

// Below this, a letter comes back for more practice instead of moving on.
const LETTER_AGAIN_BELOW = 0.5;

type Plan<K extends string, V> = Record<K, V> & Record<`${K}Reason`, string>;

/**
 * Picks tomorrow's word, letter and math from today's scores and attempts
 * (CLAUDE.md section 8). Pure: same session in, same plan out.
 * Reasons use the child's name and no pronouns.
 */
export function planNext(session: Pick<Session, "profile" | "skills" | "attempts">): NextPlan {
  const name = session.profile.name.trim() || "Your child";
  const { skills, attempts } = session;
  return {
    title: NEXT_TITLE,
    ...planWord(name, skills, attempts),
    ...planLetter(name, skills, attempts),
    ...planMath(name, attempts),
  };
}

/** GO mastered and read cleanly last time: on to SUN. Any struggle with GO: GO again. */
function planWord(name: string, skills: Record<SkillId, number>, attempts: readonly Attempt[]): Plan<"word", NextPlan["word"]> {
  const tries = attemptsFor(attempts, "read:GO");
  const last = tries[tries.length - 1];
  if (!last) {
    return { word: "GO", wordReason: `${name} has not read GO yet, so GO comes first.` };
  }
  if (isMastered(skills["read:GO"]) && isClean(last)) {
    return { word: "SUN", wordReason: `${name} read GO with no help, so the next new word is SUN.` };
  }
  if (!last.correct) {
    return { word: "GO", wordReason: `${name} read GO together with the book, so GO comes back in a new scene.` };
  }
  if (last.hintsUsed > 0) {
    return { word: "GO", wordReason: `${name} read GO after a hint, so GO comes back in a new scene for more practice.` };
  }
  return { word: "GO", wordReason: `${name} is close with GO, so GO comes back once more in a new scene.` };
}

/** S below 0.5 comes back on Saturn; otherwise the next new letter is T. */
function planLetter(name: string, skills: Record<SkillId, number>, attempts: readonly Attempt[]): Plan<"letter", NextPlan["letter"]> {
  const tries = attemptsFor(attempts, "write:S");
  const last = tries[tries.length - 1];
  if (roundScore(skills["write:S"]) < LETTER_AGAIN_BELOW) {
    if (!last) return { letter: "S", letterReason: `${name} has not traced S yet, so Saturn starts with S.` };
    if (!last.correct) return { letter: "S", letterReason: `${name} traced S together with the book, so S comes back on Saturn.` };
    if (last.hintsUsed > 0) return { letter: "S", letterReason: `${name} traced S after a hint, so S comes back on Saturn for more practice.` };
    return { letter: "S", letterReason: `${name} traced S with no help, and one more try on Saturn will make it stick.` };
  }
  if (last && isClean(last)) return { letter: "T", letterReason: `${name} traced S with no help, so the next new letter is T.` };
  if (last) return { letter: "T", letterReason: `${name} is getting steady with S, so the next new letter is T.` };
  return { letter: "T", letterReason: `${name} already knows S well, so the next new letter is T.` };
}

/**
 * Counting was easy when every count to 4 was right with no hints and every
 * "one more" was right. Then the next story tries simple adding.
 */
function planMath(name: string, attempts: readonly Attempt[]): Plan<"math", NextPlan["math"]> {
  const counted = attemptsFor(attempts, "count:to5");
  const added = attemptsFor(attempts, "count:add1");
  const countedEasily = counted.length > 0 && counted.every(isClean);
  const addedRight = added.length > 0 && added.every((a) => a.correct);

  if (countedEasily && addedRight) {
    return { math: "adding", mathReason: `${name} counted the planets with no help and added one more, so the next story tries simple adding.` };
  }
  if (counted.length === 0) {
    return { math: "counting", mathReason: `${name} has not counted with the book yet, so the next story starts with counting.` };
  }
  if (counted.some((a) => !a.correct)) {
    return { math: "counting", mathReason: `${name} counted the planets together with the book, so the next story practices more counting.` };
  }
  if (!countedEasily) {
    return { math: "counting", mathReason: `${name} counted the planets with a little help, so the next story practices more counting.` };
  }
  if (added.length === 0) {
    return { math: "counting", mathReason: `${name} counted the planets with no help but has not added one more yet, so the next story practices counting a little longer.` };
  }
  return { math: "counting", mathReason: `${name} found adding one more a little tricky, so the next story practices more counting first.` };
}
