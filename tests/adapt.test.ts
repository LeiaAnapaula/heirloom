import { describe, expect, it } from "vitest";
import { planNext, type NextPlan } from "@/lib/adapt";
import { MIA, type Attempt, type SkillId } from "@/lib/profile";
import type { Session } from "@/lib/session";
import { applyAttempt } from "@/lib/skills";

type Try = [skill: SkillId, correct: boolean, hintsUsed: number];

/** A session as the store would hold it after these attempts, starting from Mia's scores. */
function sessionAfter(tries: Try[], start: Partial<Record<SkillId, number>> = {}, name = "Mia"): Pick<Session, "profile" | "skills" | "attempts"> {
  const attempts = tries.map(([skill, correct, hintsUsed], i): Attempt & { at: number } => ({ skill, correct, hintsUsed, ms: 2000, at: i }));
  const skills = attempts.reduce(applyAttempt, { ...MIA.skills, ...start });
  return { profile: { id: MIA.id, name, age: MIA.age, interests: MIA.interests }, skills, attempts };
}

const reasons = (p: NextPlan) => [p.wordReason, p.letterReason, p.mathReason];

const perfect: Try[] = [
  ["read:GO", true, 0],
  ["write:S", true, 0],
  ["count:to5", true, 0],
  ["count:add1", true, 0],
  ["idea:gravity", true, 0],
  ["read:HOME", true, 0],
];

const oneHintEverywhere: Try[] = [
  ["read:GO", true, 1],
  ["write:S", true, 1],
  ["count:to5", true, 1],
  ["count:add1", true, 1],
  ["idea:gravity", true, 0],
  ["read:HOME", true, 1],
];

describe("planNext, the two demo runs", () => {
  it("a perfect run from Mia's scores moves on: SUN, T, adding", () => {
    const plan = planNext(sessionAfter(perfect));
    expect(plan).toMatchObject({ title: "Saturn's Rings", word: "SUN", letter: "T", math: "adding" });
    expect(plan.wordReason).toBe("Mia read GO with no help, so the next new word is SUN.");
  });

  it("one hint everywhere practices again: GO, S, counting", () => {
    const plan = planNext(sessionAfter(oneHintEverywhere));
    expect(plan).toMatchObject({ title: "Saturn's Rings", word: "GO", letter: "S", math: "counting" });
  });
});

describe("planNext, the word", () => {
  it("no GO attempt means GO", () => {
    const plan = planNext(sessionAfter([]));
    expect(plan.word).toBe("GO");
    expect(plan.wordReason).toContain("has not read GO");
  });

  it("read together (not correct) means GO again", () => {
    expect(planNext(sessionAfter([["read:GO", false, 2]])).word).toBe("GO");
  });

  it("mastered by score but needed a hint means GO again", () => {
    const plan = planNext(sessionAfter([["read:GO", true, 1]], { "read:GO": 0.9 }));
    expect(plan.word).toBe("GO");
    expect(plan.wordReason).toContain("after a hint");
  });

  it("clean but not yet mastered means GO once more", () => {
    const plan = planNext(sessionAfter([["read:GO", true, 0]], { "read:GO": 0.2 }));
    expect(plan.word).toBe("GO");
  });

  it("a clean last try that reaches mastery wins over an earlier miss", () => {
    const plan = planNext(
      sessionAfter(
        [
          ["read:GO", false, 1],
          ["read:GO", true, 0],
        ],
        { "read:GO": 0.8 },
      ),
    );
    expect(plan.word).toBe("SUN");
  });

  it("a miss then a clean try from 0.5 is not mastery yet", () => {
    const s = sessionAfter([
      ["read:GO", false, 0],
      ["read:GO", true, 0],
    ]);
    expect(s.skills["read:GO"]).toBe(0.7);
    expect(planNext(s).word).toBe("GO");
  });

  it("0.5 + 0.3 lands exactly on mastery", () => {
    const s = sessionAfter([["read:GO", true, 0]]);
    expect(s.skills["read:GO"]).toBe(0.8);
    expect(planNext(s).word).toBe("SUN");
  });
});

describe("planNext, the letter", () => {
  it("S below 0.5 comes back", () => {
    expect(planNext(sessionAfter([], { "write:S": 0.49 })).letter).toBe("S");
    expect(planNext(sessionAfter([["write:S", false, 2]])).letter).toBe("S");
  });

  it("S at exactly 0.5 moves on to T (0.2 + 0.3, no drift)", () => {
    const s = sessionAfter([["write:S", true, 0]]);
    expect(s.skills["write:S"]).toBe(0.5);
    expect(planNext(s).letter).toBe("T");
  });

  it("S already strong with no attempt today still moves on", () => {
    const plan = planNext(sessionAfter([], { "write:S": 0.7 }));
    expect(plan.letter).toBe("T");
    expect(plan.letterReason).toContain("already knows S");
  });

  it("no attempt and a low score brings S", () => {
    const plan = planNext(sessionAfter([]));
    expect(plan.letter).toBe("S");
    expect(plan.letterReason).toContain("has not traced S");
  });

  it("clamped scores still plan sensibly", () => {
    const s = sessionAfter(
      [
        ["write:S", false, 0],
        ["write:S", false, 0],
      ],
      { "write:S": 0.05 },
    );
    expect(s.skills["write:S"]).toBe(0);
    expect(planNext(s).letter).toBe("S");
  });
});

describe("planNext, the math", () => {
  it("adding needs a clean count and a right add", () => {
    const plan = planNext(
      sessionAfter([
        ["count:to5", true, 0],
        ["count:add1", true, 1],
      ]),
    );
    expect(plan.math).toBe("adding");
  });

  it("any miss or hint on counting keeps counting", () => {
    expect(planNext(sessionAfter([["count:to5", true, 1], ["count:add1", true, 0]])).math).toBe("counting");
    expect(planNext(sessionAfter([["count:to5", false, 0], ["count:to5", true, 0], ["count:add1", true, 0]])).math).toBe("counting");
  });

  it("a wrong add keeps counting", () => {
    expect(planNext(sessionAfter([["count:to5", true, 0], ["count:add1", false, 1]])).math).toBe("counting");
  });

  it("no add attempt keeps counting", () => {
    expect(planNext(sessionAfter([["count:to5", true, 0]])).math).toBe("counting");
  });

  it("no counting at all keeps counting", () => {
    const plan = planNext(sessionAfter([]));
    expect(plan.math).toBe("counting");
    expect(plan.mathReason).toContain("has not counted");
  });
});

describe("planNext, the reasons", () => {
  const runs: Try[][] = [
    [],
    perfect,
    oneHintEverywhere,
    [["read:GO", false, 2], ["write:S", false, 2], ["count:to5", false, 2], ["count:add1", false, 2]],
    [["read:GO", true, 0], ["count:to5", true, 0], ["count:add1", false, 0]],
  ];

  it("are one plain sentence each, with the name, no pronouns and no em dashes", () => {
    for (const run of runs) {
      for (const r of reasons(planNext(sessionAfter(run)))) {
        expect(r).toContain("Mia");
        expect(r).toMatch(/^[A-Z].*\.$/);
        expect(r.match(/\./g)).toHaveLength(1);
        expect(r).not.toMatch(/\b(he|she|him|her|his|hers|they|them|their)\b/i);
        expect(r).not.toContain(String.fromCharCode(0x2014));
        expect(r).not.toContain(String.fromCharCode(0x2013));
      }
    }
  });

  it("use a gentle fallback when there is no name", () => {
    const plan = planNext(sessionAfter(perfect, {}, "  "));
    for (const r of reasons(plan)) expect(r).toMatch(/^Your child /);
  });

  it("does not change the session it reads", () => {
    const s = sessionAfter(oneHintEverywhere);
    const copy = structuredClone(s);
    planNext(s);
    expect(s).toEqual(copy);
  });
});

describe("tap answers", () => {
  it("never count as reading with no help", () => {
    const skills = { ...MIA.skills, "read:GO": 0.9 };
    const plan = planNext({
      profile: { id: MIA.id, name: "Mia", age: 5, interests: MIA.interests },
      skills,
      attempts: [{ skill: "read:GO", correct: true, hintsUsed: 1, ms: 900, mode: "tap", at: 1 }],
    });
    expect(plan.word).toBe("GO");
    expect(plan.wordReason).toContain("tap");
  });
});
