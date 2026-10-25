import type { SkillId } from "./profile";

/**
 * One spoken sentence. `text` is what the child sees; `say` (optional) is what the
 * narrator speaks when it differs, e.g. letter sounds: text "G..." / say "Guh...".
 * `{name}` is replaced with the child's first name before display or speech.
 * `highlight` lights up letters of the current word while this line plays (hints).
 */
export type Line = {
  id: string;
  text: string;
  say?: string;
  highlight?: number[];
};

export type ArtId = "book-wakes" | "launch-pad" | "space-path" | "planets" | "moon" | "star-home";

export type YesInteraction = {
  type: "yes";
  accept: string[]; // spoken words that count as yes
};

export type ReadAloudInteraction = {
  type: "readAloud";
  word: string; // "go"
  skill: SkillId;
  accept: string[]; // close matches a young reader or the recognizer may produce, e.g. "goh"
  giveUp: Line[]; // after two hints: encourage, say the word together, move on
  place: { x: number; y: number }; // where the word sits on the spread, in % (center of the word)
};

export type TraceInteraction = {
  type: "trace";
  letter: "S";
  skill: SkillId;
  yourTurn: Line[]; // after the pencil demo
};

export type CountStep = {
  answer: number;
  skill: SkillId;
  ask: Line[]; // empty for the first step: the screen narration already asks
  correct: Line[];
};

export type CountInteraction = {
  type: "count";
  max: number; // number buttons 1..max
  steps: CountStep[];
  numbers: Line[]; // "One." "Two." ... spoken while counting together
};

export type FeatherInteraction = {
  type: "feather";
  skill: SkillId;
  guessMs: number; // how long to listen for a guess before nudging toward the feather
  tapNow: Line[]; // nudge to drop the feather
};

export type Interaction =
  | YesInteraction
  | ReadAloudInteraction
  | TraceInteraction
  | CountInteraction
  | FeatherInteraction;

export type Screen = {
  id: string;
  art: ArtId;
  narration: Line[];
  interaction: Interaction;
  onSuccess: { narration: Line[]; effect?: "turn" | "liftoff" | "swoop" | "sparkle" | "fall" | "home" };
  onHelp: { narration: Line[] };
};

export type Episode = {
  id: string;
  title: string;
  screens: Screen[];
  next: { title: string }; // tomorrow's episode
};

export function withName(text: string, name: string): string {
  return text.replaceAll("{name}", name);
}

export function resolveLine(line: Line, name: string): Line {
  return {
    ...line,
    text: withName(line.text, name),
    say: line.say ? withName(line.say, name) : undefined,
  };
}

/** Every line in an episode, for pre-generating audio and for the story brain. */
export function allLines(episode: Episode): Line[] {
  const out: Line[] = [];
  for (const s of episode.screens) {
    out.push(...s.narration, ...s.onSuccess.narration, ...s.onHelp.narration);
    const i = s.interaction;
    if (i.type === "readAloud") out.push(...i.giveUp);
    if (i.type === "trace") out.push(...i.yourTurn);
    if (i.type === "count") {
      for (const step of i.steps) out.push(...step.ask, ...step.correct);
      out.push(...i.numbers);
    }
    if (i.type === "feather") out.push(...i.tapNow);
  }
  return out;
}
