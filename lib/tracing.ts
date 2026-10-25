/**
 * Compares a child's traced stroke to a letter template. Pure math with no DOM, so the
 * same code runs in the browser, in Node scripts and in tests.
 *
 * The idea: walk both lines and take the same number of evenly spaced points, scale each
 * into the same unit box, then measure how far apart matching points are on average.
 * Where she drew, how big, and which end she started from do not matter. The shape does.
 */

export type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Total length of the polyline through `points`. */
export function pathLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/**
 * `n` points spaced evenly along the polyline, first and last included. Pointer events
 * bunch up where a finger slows down; this spreads them out by distance instead of time.
 */
export function resample(points: Pt[], n: number): Pt[] {
  if (points.length === 0 || n <= 0) return [];
  const total = pathLength(points);
  if (n === 1 || total === 0) return Array.from({ length: n }, () => ({ ...points[0] }));

  const step = total / (n - 1);
  const out: Pt[] = [{ ...points[0] }];
  let seg = 1; // walking along points[seg - 1] -> points[seg]
  let walked = 0; // distance from points[0] to points[seg - 1]
  for (let k = 1; k < n - 1; k++) {
    const target = k * step;
    while (seg < points.length - 1 && walked + dist(points[seg - 1], points[seg]) < target) {
      walked += dist(points[seg - 1], points[seg]);
      seg++;
    }
    const a = points[seg - 1];
    const b = points[seg];
    const len = dist(a, b);
    const t = len === 0 ? 0 : Math.min(1, (target - walked) / len);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/**
 * Scale uniformly so the larger side of the bounding box is 1, centered on (0.5, 0.5).
 * Uniform, so proportions survive: a straight line stays a line, a tall S stays tall.
 * A single dot lands in the middle.
 */
export function normalizeToBox(points: Pt[]): Pt[] {
  if (points.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const size = Math.max(maxX - minX, maxY - minY);
  const scale = size === 0 ? 0 : 1 / size;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({ x: 0.5 + (p.x - cx) * scale, y: 0.5 + (p.y - cy) * scale }));
}

/** Mean distance between matching points (a[i] to b[i]). Resample both to the same length first. */
export function averageDistance(a: Pt[], b: Pt[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let total = 0;
  for (let i = 0; i < n; i++) total += dist(a[i], b[i]);
  return total / n;
}

export type TraceScore = { distance: number; pass: boolean; reason?: "too-short" | "too-far" };

/**
 * Average distance in the unit box at or under which a trace counts. Generous on purpose:
 * a 4 year old's S is wobbly, lopsided and rarely the size of the guide.
 *
 * Measured in tests/tracing.test.ts (64 samples, better of both directions; shaky rows are
 * the worst of 25 seeds, wrong shapes the best case over starts and directions):
 *   clean S 0.000, clean S drawn backwards 0.000
 *   shaky S, seeded jitter +-6% of the box: 0.092
 *     plus squashed 20% tall 0.103, squashed 20% wide 0.101, scaled 20% up or down and offset 0.092,
 *     plus a slow wobble 0.104
 *   straight vertical line 0.200, C 0.217, zigzag scribble 0.230, diagonal 0.237,
 *   circle 0.319, mirrored S 0.325, horizontal line 0.434
 * 0.15 leaves about 30% headroom over the worst shaky S and 33% under the closest wrong
 * shape (the straight line), so neither side passes or fails by a hair.
 */
export const PASS_THRESHOLD = 0.15;

const MIN_POINTS = 8; // fewer pointer events than this is a tap or a flick, not a letter
const MIN_LENGTH_RATIO = 0.2; // a stroke under a fifth of the letter's length is not an attempt at it
const SAMPLES = 64;

/**
 * Score one stroke against one template stroke. Both must be in the same units
 * (the drawing area's viewBox), so their lengths can be compared for "too short".
 */
export function scoreTrace(stroke: Pt[], template: Pt[], opts: { threshold?: number; samples?: number } = {}): TraceScore {
  const threshold = opts.threshold ?? PASS_THRESHOLD;
  const samples = opts.samples ?? SAMPLES;
  if (stroke.length < MIN_POINTS || pathLength(stroke) < pathLength(template) * MIN_LENGTH_RATIO) {
    return { distance: Infinity, pass: false, reason: "too-short" };
  }
  const t = normalizeToBox(resample(template, samples));
  const s = normalizeToBox(resample(stroke, samples));
  // Starting from the wrong end is still a good S: try it both ways and keep the better.
  const distance = Math.min(averageDistance(s, t), averageDistance([...s].reverse(), t));
  return distance <= threshold ? { distance, pass: true } : { distance, pass: false, reason: "too-far" };
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

/**
 * Turn SVG path data into points, without a DOM. Handles M, L, H, V, C, S and Z, absolute
 * or relative. Each curve becomes `perSegment` points after its start; spacing is uneven
 * along a curve, which resample() evens out later.
 */
export function sampleCubicPath(d: string, perSegment = 24): Pt[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Pt[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = { x: 0, y: 0 };
  let start: Pt = { x: 0, y: 0 };
  let lastCtrl: Pt | null = null; // second control point of the last C or S, mirrored by a following S

  const isCommand = (tok: string) => /^[a-zA-Z]$/.test(tok);
  const num = () => {
    const tok = tokens[i++];
    const v = Number(tok);
    if (tok === undefined || isCommand(tok) || !Number.isFinite(v)) throw new Error(`sampleCubicPath: expected a number in "${d}"`);
    return v;
  };

  while (i < tokens.length) {
    if (isCommand(tokens[i])) cmd = tokens[i++];
    else if (!cmd) throw new Error(`sampleCubicPath: path must start with a command: "${d}"`);
    const rel = cmd !== cmd.toUpperCase();
    // Relative points are all measured from where this command began, so read before moving cur.
    const pt = (): Pt => {
      const x = num();
      const y = num();
      return rel ? { x: cur.x + x, y: cur.y + y } : { x, y };
    };

    switch (cmd.toUpperCase()) {
      case "M":
        cur = pt();
        start = cur;
        out.push(cur);
        lastCtrl = null;
        cmd = rel ? "l" : "L"; // extra pairs after a move are lines
        break;
      case "L":
        cur = pt();
        out.push(cur);
        lastCtrl = null;
        break;
      case "H":
        cur = { x: rel ? cur.x + num() : num(), y: cur.y };
        out.push(cur);
        lastCtrl = null;
        break;
      case "V":
        cur = { x: cur.x, y: rel ? cur.y + num() : num() };
        out.push(cur);
        lastCtrl = null;
        break;
      case "C":
      case "S": {
        const c1 = cmd.toUpperCase() === "C" ? pt() : lastCtrl ? lerp(lastCtrl, cur, 2) : cur;
        const c2 = pt();
        const end = pt();
        for (let k = 1; k <= perSegment; k++) out.push(cubicAt(cur, c1, c2, end, k / perSegment));
        lastCtrl = c2;
        cur = end;
        break;
      }
      case "Z":
        if (cur.x !== start.x || cur.y !== start.y) out.push(start);
        cur = start;
        lastCtrl = null;
        cmd = ""; // Z takes no numbers
        break;
      default:
        throw new Error(`sampleCubicPath: unsupported command "${cmd}"`);
    }
  }
  return out;
}
