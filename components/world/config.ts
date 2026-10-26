/**
 * The one world in the demo, as data. A new story is a new copy of this file:
 * the splat files Marble made, Grandpa's story split into moments, and where
 * the camera stands for each moment.
 */

const CDN = "https://cdn.marble.worldlabs.ai/7534e896-0dbd-45bb-909b-1e569741f8d6";

export const WORLD = {
  id: "grandpas-village",
  title: "The village on the river bend",
  marbleUrl: "https://marble.worldlabs.ai/world/7534e896-0dbd-45bb-909b-1e569741f8d6",
  /** Marble's own picture of the world, shown while the 3D version loads. */
  preview: `${CDN}/59961c53-dc94-42a8-a1a7-cb8617e0f92c_sand_mpi/thumbnail_1440.webp`,
  /** A light version that opens fast everywhere, and the full one for big screens. */
  splats: {
    preview: `${CDN}/210475d2-5081-4ac2-a210-1ee8586d2368_ceramic_150k.spz`, // 2.4 MB
    full: `${CDN}/1cf50915-fb47-4785-ba98-2d33763cc043_ceramic.spz`, // 68.5 MB
  },
  /** Marble worlds come out about life size. Change this if pieces look too big or small. */
  metersPerUnit: 1,
  /** Where the camera starts, looking the way Marble's own viewer does. */
  start: { position: [0, 0, 0] as [number, number, number], yawDeg: 0, pitchDeg: -6 },
  /**
   * A Marble world looks right near where its camera stood and comes apart farther
   * out, so the child walks inside a bubble: this far from the center, between these heights.
   */
  walk: { center: [0, 0, -1] as [number, number, number], radius: 3.2, minY: -0.45, maxY: 1.9 },
  /** The ground near the start, for when there's nothing under the camera to measure. */
  groundY: -0.75,
};

export const GRANDPA = {
  name: "Grandpa Ilya",
  initial: "G",
  /** Optional recorded files, one per moment, played instead of the device voice when present. */
  title: "The bridge we never had",
};

export type MomentId = "bend" | "path" | "hilltop" | "crossing";

export type Moment = {
  id: MomentId;
  label: string; // short, for the timeline
  line: string; // what Grandpa says here
  audio?: string; // a recording of Grandpa saying the line, if the family made one
  camera: { position: [number, number, number]; yawDeg: number; pitchDeg: number };
  /** The spot the moment is about. A glowing marker floats here. */
  focus: [number, number, number];
};

export const MOMENTS: Moment[] = [
  {
    id: "bend",
    label: "The river bend",
    line: "When I was a boy, our village sat on the bend of a slow green river. Every house was wooden, and in summer the windows were full of red flowers.",
    camera: { position: [0.4, 0.15, 0.4], yawDeg: -8, pitchDeg: -8 },
    focus: [3.75, -0.2, -8.46],
  },
  {
    id: "path",
    label: "The flower path",
    line: "A little path climbed the hill past the yellow flowers.",
    camera: { position: [0.6, 0.05, -0.6], yawDeg: 34, pitchDeg: -5 },
    focus: [-3.3, 0.55, -5.0],
  },
  {
    id: "hilltop",
    label: "The lake view",
    line: "From the top you could see the lake shining, far away.",
    camera: { position: [0, 1.7, -0.8], yawDeg: 3, pitchDeg: 1 },
    focus: [-0.8, 2.6, -15.2],
  },
  {
    id: "crossing",
    label: "Across the river",
    line: "The only bridge was far around the bend. To visit my grandmother across the river, we waited for old Pavel and his boat. I always wished for a bridge right here, straight across.",
    camera: { position: [0.2, 0.1, -0.4], yawDeg: 0, pitchDeg: -16 },
    focus: [-0.1, -0.55, -3.7],
  },
];

export type TimeOfDay = "morning" | "day" | "golden" | "night";

export const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: "morning", label: "Morning" },
  { id: "day", label: "Day" },
  { id: "golden", label: "Sunset" },
  { id: "night", label: "Night" },
];

export type BuildKind = "bridge" | "garden" | "house" | "treehouse" | "lantern" | "bench" | "boat" | "tree";

export type Build = {
  kind: BuildKind;
  label: string;
  noun: string; // "bridge", for "Mia's bridge"
  key: string; // the number key that picks it
  /** Footprint in meters before stretching: width (x), height (y), depth (z). */
  size: [number, number, number];
  /** Pieces that stretch are measured in planks the child can count. */
  stretch?: { unit: string; unitM: number; min: number; max: number; initial: number };
  /** What Grandpa reads on the postcard. */
  message: (name: string) => string;
};

export const BUILDS: Build[] = [
  {
    kind: "bridge",
    label: "Bridge",
    noun: "bridge",
    key: "1",
    size: [1.6, 1.1, 0.4],
    stretch: { unit: "plank", unitM: 0.4, min: 4, max: 24, initial: 8 },
    message: (n) => `${n} built a bridge across your river!`,
  },
  { kind: "garden", label: "Garden", noun: "garden", key: "2", size: [2.4, 0.5, 1.6], message: (n) => `${n} planted yellow flowers by your path!` },
  { kind: "house", label: "House", noun: "house", key: "3", size: [2.6, 2.8, 2.4], message: (n) => `${n} built a little house next to yours!` },
  { kind: "treehouse", label: "Treehouse", noun: "treehouse", key: "4", size: [3, 5, 3], message: (n) => `${n} built a treehouse on your hill!` },
  { kind: "lantern", label: "Lantern", noun: "lantern", key: "5", size: [0.4, 1.8, 0.4], message: (n) => `${n} hung a lantern so you can find your way at night.` },
  { kind: "bench", label: "Bench", noun: "bench", key: "6", size: [1.6, 0.9, 0.6], message: (n) => `${n} made a bench where you can both sit.` },
  { kind: "boat", label: "Boat", noun: "boat", key: "7", size: [3, 0.6, 1.2], message: (n) => `${n} made a boat, like old Pavel's.` },
  { kind: "tree", label: "Tree", noun: "tree", key: "8", size: [2.2, 4, 2.2], message: (n) => `${n} planted a tree by the river.` },
];

export function buildOf(kind: BuildKind): Build {
  return BUILDS.find((b) => b.kind === kind) ?? BUILDS[0];
}

export function momentOf(id: MomentId): Moment {
  return MOMENTS.find((m) => m.id === id) ?? MOMENTS[0];
}
