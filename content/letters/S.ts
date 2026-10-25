import { sampleCubicPath, type Pt } from "@/lib/tracing";

/**
 * How to write a letter, as data: the strokes in writing order, drawn in a box of
 * fixed units. The pencil animates `strokes`; tracing is scored against `points`.
 */
export type LetterTemplate = {
  letter: string;
  box: { width: number; height: number };
  strokes: string[]; // SVG path data, absolute, in box units, one per stroke
  points: Pt[][]; // the same strokes as points, sampled without a DOM
  start: Pt; // where the first stroke begins: the glowing start dot
};

/**
 * S, in one stroke: start top right, curl over the top to the left, sweep down through
 * the middle to the right, then around the bottom to finish bottom left. The lower bowl
 * is a little bigger than the upper one, the way S is usually drawn.
 */
const stroke =
  "M 82 28 " +
  "C 76 14, 64 8, 50 8 " + // up and over the top
  "C 32 8, 18 18, 18 34 " + // down the left side of the top bowl
  "C 18 50, 34 58, 50 66 " + // through the middle
  "C 66 74, 84 84, 84 102 " + // down the right side of the bottom bowl
  "C 84 122, 68 132, 50 132 " + // around the bottom
  "C 32 132, 20 124, 15 112"; // and up a little at the end

export const S: LetterTemplate = {
  letter: "S",
  box: { width: 100, height: 140 },
  strokes: [stroke],
  points: [sampleCubicPath(stroke)],
  start: { x: 82, y: 28 },
};
