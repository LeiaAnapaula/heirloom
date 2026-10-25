import { describe, expect, it } from "vitest";
import { MIA, type Attempt } from "@/lib/profile";
import { MASTERY, applyAttempt, attemptsFor, isClean, isMastered, lastAttempt, roundScore, updateScore } from "@/lib/skills";

const right = { correct: true, hintsUsed: 0 };
const hinted = { correct: true, hintsUsed: 1 };
const wrong = { correct: false, hintsUsed: 0 };

describe("updateScore", () => {
  it("adds 0.3 for right with no hints", () => {
    expect(updateScore(0.2, right)).toBe(0.5);
  });

  it("adds 0.1 for right after one or two hints", () => {
    expect(updateScore(0.2, hinted)).toBe(0.3);
    expect(updateScore(0.2, { correct: true, hintsUsed: 2 })).toBe(0.3);
  });

  it("takes 0.1 away when not right, hints or not", () => {
    expect(updateScore(0.5, wrong)).toBe(0.4);
    expect(updateScore(0.5, { correct: false, hintsUsed: 2 })).toBe(0.4);
  });

  it("clamps to 0..1", () => {
    expect(updateScore(0.9, right)).toBe(1);
    expect(updateScore(1, right)).toBe(1);
    expect(updateScore(0.05, wrong)).toBe(0);
    expect(updateScore(0, wrong)).toBe(0);
  });

  it("keeps two decimals with no float drift", () => {
    expect(0.2 + 0.1).not.toBe(0.3); // the drift we guard against
    expect(updateScore(0.2, hinted)).toBe(0.3);
    expect(updateScore(0.6, right)).toBe(0.9);
    expect(updateScore(0.7, hinted)).toBe(0.8);
    expect(updateScore(0.5, right)).toBe(MASTERY);
    expect(updateScore(0.123456, right)).toBe(0.42);
  });

  it("treats a missing or broken score as 0", () => {
    expect(updateScore(Number.NaN, right)).toBe(0.3);
    expect(updateScore(Number.POSITIVE_INFINITY, wrong)).toBe(0);
  });
});

describe("isMastered", () => {
  it("is mastered at 0.8 and above", () => {
    expect(MASTERY).toBe(0.8);
    expect(isMastered(0.8)).toBe(true);
    expect(isMastered(1)).toBe(true);
    expect(isMastered(0.79)).toBe(false);
    expect(isMastered(0)).toBe(false);
  });

  it("is not fooled by float drift just under 0.8", () => {
    expect(0.7 + 0.1).toBeLessThan(0.8);
    expect(isMastered(0.7 + 0.1)).toBe(true);
    expect(isMastered(0.5 + 0.3)).toBe(true);
  });
});

describe("roundScore", () => {
  it("clamps and rounds to two decimals", () => {
    expect(roundScore(1.4)).toBe(1);
    expect(roundScore(-0.2)).toBe(0);
    expect(roundScore(0.30000000000000004)).toBe(0.3);
    expect(roundScore(0.555)).toBeCloseTo(0.56, 10);
  });
});

describe("applyAttempt", () => {
  it("returns a new record and leaves the input alone", () => {
    const before = { ...MIA.skills };
    const after = applyAttempt(MIA.skills, { skill: "read:GO", correct: true, hintsUsed: 0, ms: 1200 });
    expect(after).not.toBe(MIA.skills);
    expect(MIA.skills).toEqual(before);
    expect(after["read:GO"]).toBe(0.8);
    expect({ ...after, "read:GO": before["read:GO"] }).toEqual(before);
  });

  it("walks Mia's perfect run to the expected scores", () => {
    const run: Attempt[] = [
      { skill: "read:GO", correct: true, hintsUsed: 0, ms: 1500 },
      { skill: "write:S", correct: true, hintsUsed: 0, ms: 6000 },
      { skill: "count:to5", correct: true, hintsUsed: 0, ms: 2000 },
      { skill: "count:add1", correct: true, hintsUsed: 0, ms: 1800 },
      { skill: "idea:gravity", correct: true, hintsUsed: 0, ms: 7000 },
      { skill: "read:HOME", correct: true, hintsUsed: 0, ms: 1700 },
    ];
    const skills = run.reduce(applyAttempt, MIA.skills);
    expect(skills).toEqual({
      "read:GO": 0.8,
      "read:HOME": 0.6,
      "read:SUN": 0.3,
      "write:S": 0.5,
      "count:to5": 0.9,
      "count:add1": 0.6,
      "idea:gravity": 0.3,
    });
  });
});

describe("attempt helpers", () => {
  const attempts: Attempt[] = [
    { skill: "read:GO", correct: false, hintsUsed: 1, ms: 5000 },
    { skill: "write:S", correct: true, hintsUsed: 0, ms: 4000 },
    { skill: "read:GO", correct: true, hintsUsed: 2, ms: 3000 },
  ];

  it("finds attempts per skill, oldest first", () => {
    expect(attemptsFor(attempts, "read:GO").map((a) => a.ms)).toEqual([5000, 3000]);
    expect(attemptsFor(attempts, "read:SUN")).toEqual([]);
  });

  it("finds the last attempt per skill", () => {
    expect(lastAttempt(attempts, "read:GO")?.ms).toBe(3000);
    expect(lastAttempt(attempts, "count:to5")).toBeUndefined();
  });

  it("calls an attempt clean only when right with no hints", () => {
    expect(isClean(right)).toBe(true);
    expect(isClean(hinted)).toBe(false);
    expect(isClean(wrong)).toBe(false);
  });
});
