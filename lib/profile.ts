export type SkillId =
  | "read:GO"
  | "read:HOME"
  | "read:SUN"
  | "write:S"
  | "count:to5"
  | "count:add1"
  | "idea:gravity";

export const SKILL_IDS: SkillId[] = [
  "read:GO",
  "read:HOME",
  "read:SUN",
  "write:S",
  "count:to5",
  "count:add1",
  "idea:gravity",
];

export type ChildProfile = {
  id: string;
  name: string; // first name only
  age: number;
  interests: string[];
  skills: Record<SkillId, number>; // mastery 0..1
};

// Each attempt is logged, then skills are updated
export type Attempt = {
  skill: SkillId;
  correct: boolean;
  hintsUsed: number; // 0, 1, 2
  ms: number; // time to answer
  mode?: "voice" | "tap" | "trace"; // how the child answered
  note?: string; // e.g. the child's guess on the gravity page, as text
};

/**
 * Mia is made up. Starting scores reflect the demo script:
 * knows most letter sounds and reads short words, just starting letters, counts to 10.
 */
export const MIA: ChildProfile = {
  id: "demo-mia",
  name: "Mia",
  age: 5,
  interests: ["space", "planets", "how things move"],
  skills: {
    "read:GO": 0.5,
    "read:HOME": 0.3,
    "read:SUN": 0.3,
    "write:S": 0.2,
    "count:to5": 0.6,
    "count:add1": 0.3,
    "idea:gravity": 0,
  },
};

/** Other made-up children for trying the story brain (M8). Same starting skills as Mia. */
export const DEMO_PROFILES: ChildProfile[] = [
  MIA,
  { ...MIA, id: "demo-leo", name: "Leo", interests: ["dinosaurs", "volcanoes"] },
  { ...MIA, id: "demo-ava", name: "Ava", interests: ["the ocean", "whales"] },
];
