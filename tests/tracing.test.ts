import { describe, expect, it } from "vitest";
import { S } from "@/content/letters/S";
import {
  PASS_THRESHOLD,
  averageDistance,
  normalizeToBox,
  pathLength,
  resample,
  sampleCubicPath,
  scoreTrace,
  type Pt,
} from "@/lib/tracing";

const template = S.points[0];
const BOX = Math.max(S.box.width, S.box.height);

/** A small seeded random generator (LCG), so every run draws the same shaky strokes. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Like pointer events: ~90 points along the shape, then moved, scaled and wobbled. */
function shakyS(seed: number, { sx = 1, sy = 1, dx = 0, dy = 0, jitter = 0.06, wobble = 0 } = {}): Pt[] {
  const rand = lcg(seed);
  const phase = rand() * Math.PI * 2;
  const size = BOX * Math.max(sx, sy);
  return resample(template, 90).map((p, i) => ({
    x: p.x * sx + dx + (rand() * 2 - 1) * jitter * size + Math.sin(i / 9 + phase) * wobble * size,
    y: p.y * sy + dy + (rand() * 2 - 1) * jitter * size + Math.cos(i / 11 + phase) * wobble * size,
  }));
}

function line(a: Pt, b: Pt, n = 60): Pt[] {
  return Array.from({ length: n }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / (n - 1), y: a.y + ((b.y - a.y) * i) / (n - 1) }));
}

/** An elliptical arc in the S box. Angles in degrees, screen style (y grows downward). */
function arc(from: number, to: number, { cx = 50, cy = 70, rx = 40, ry = 62, n = 90 } = {}): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = ((from + ((to - from) * i) / (n - 1)) * Math.PI) / 180;
    return { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
  });
}

/** Back and forth across the box while moving down: a scribble, not a letter. */
function zigzag(sweeps: number): Pt[] {
  const corners: Pt[] = Array.from({ length: sweeps + 1 }, (_, i) => ({ x: i % 2 === 0 ? 85 : 15, y: 10 + (120 * i) / sweeps }));
  return corners.slice(1).flatMap((c, i) => line(corners[i], c, 20));
}

function randomScribble(seed: number): Pt[] {
  const rand = lcg(seed);
  const corners = Array.from({ length: 10 }, () => ({ x: 10 + rand() * 80, y: 10 + rand() * 120 }));
  return corners.slice(1).flatMap((c, i) => line(corners[i], c, 12));
}

const mirror = (pts: Pt[]) => pts.map((p) => ({ x: S.box.width - p.x, y: p.y }));
const score = (pts: Pt[]) => scoreTrace(pts, template).distance;
const fmt = (d: number) => d.toFixed(3);
const seeds = Array.from({ length: 25 }, (_, i) => i + 1);
const worst = (f: (seed: number) => Pt[]) => Math.max(...seeds.map((s) => score(f(s))));
const best = (strokes: Pt[][]) => Math.min(...strokes.map(score));

describe("geometry helpers", () => {
  it("measures path length", () => {
    expect(pathLength([])).toBe(0);
    expect(pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 10 }])).toBe(11);
  });

  it("resamples to n evenly spaced points, keeping both ends", () => {
    const pts = resample([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }], 11);
    expect(pts).toHaveLength(11);
    pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(i, 9);
      expect(p.y).toBe(0);
    });
    const curve = resample(template, 50);
    const gaps = curve.slice(1).map((p, i) => Math.hypot(p.x - curve[i].x, p.y - curve[i].y));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.3);
    expect(curve[0]).toEqual(template[0]);
    expect(curve[49]).toEqual(template[template.length - 1]);
  });

  it("resamples degenerate input without dividing by zero", () => {
    expect(resample([], 5)).toEqual([]);
    expect(resample([{ x: 2, y: 3 }], 3)).toEqual([{ x: 2, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 3 }]);
  });

  it("normalizes into a unit box without changing proportions", () => {
    const vertical = normalizeToBox(line({ x: 300, y: 40 }, { x: 300, y: 240 }, 5));
    expect(vertical.map((p) => p.x)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(vertical[0].y).toBeCloseTo(0);
    expect(vertical[4].y).toBeCloseTo(1);

    const n = normalizeToBox([{ x: 0, y: 0 }, { x: 100, y: 140 }]);
    expect(n[0].x).toBeCloseTo(0.5 - 100 / 140 / 2);
    expect(n[1]).toEqual({ x: expect.closeTo(0.5 + 100 / 140 / 2), y: 1 });
    expect(normalizeToBox([{ x: 7, y: 7 }])).toEqual([{ x: 0.5, y: 0.5 }]);
  });

  it("averages pointwise distance", () => {
    expect(averageDistance([{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 3, y: 4 }, { x: 0, y: 1 }])).toBe(3);
    expect(averageDistance([], [])).toBe(Infinity);
  });
});

describe("sampleCubicPath", () => {
  it("samples absolute M and C, starting at M and ending at the last point", () => {
    const pts = sampleCubicPath("M0 0 C0 10, 10 10, 10 0", 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[10]).toEqual({ x: 10, y: 0 });
    expect(pts[5].x).toBeCloseTo(5);
    expect(pts[5].y).toBeCloseTo(7.5);
  });

  it("handles relative commands, smooth curves, lines and close", () => {
    const abs = sampleCubicPath("M10 10 C10 20 20 20 20 10 S30 0 30 10", 8);
    const rel = sampleCubicPath("m10 10 c0 10 10 10 10 0 s10 -10 10 0", 8);
    expect(rel).toHaveLength(abs.length);
    rel.forEach((p, i) => {
      expect(p.x).toBeCloseTo(abs[i].x);
      expect(p.y).toBeCloseTo(abs[i].y);
    });
    expect(sampleCubicPath("M0 0 L5 0 5 5 H0 Z")).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
      { x: 0, y: 0 },
    ]);
  });

  it("refuses commands it does not understand", () => {
    expect(() => sampleCubicPath("M0 0 A5 5 0 0 1 10 10")).toThrow(/unsupported/);
    expect(() => sampleCubicPath("10 10")).toThrow();
  });
});

describe("the S template", () => {
  it("is one stroke from top right to bottom left, inside its box", () => {
    expect(S.strokes).toHaveLength(1);
    expect(S.points).toHaveLength(1);
    const first = template[0];
    const last = template[template.length - 1];
    expect(first).toEqual(S.start);
    expect(first.x).toBeGreaterThan(S.box.width * 0.6);
    expect(first.y).toBeLessThan(S.box.height * 0.3);
    expect(last.x).toBeLessThan(S.box.width * 0.4);
    expect(last.y).toBeGreaterThan(S.box.height * 0.7);
    for (const p of template) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(S.box.width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(S.box.height);
    }
  });

  it("goes left over the top, right through the middle, then left along the bottom", () => {
    const pts = resample(template, 100);
    const leftTop = pts.slice(0, 40).reduce((a, b) => (b.x < a.x ? b : a));
    const right = pts.slice(40, 80).reduce((a, b) => (b.x > a.x ? b : a));
    expect(leftTop.x).toBeLessThan(25);
    expect(leftTop.y).toBeLessThan(S.box.height / 2);
    expect(right.x).toBeGreaterThan(75);
    expect(right.y).toBeGreaterThan(S.box.height / 2);
  });
});

describe("scoreTrace", () => {
  const shaky = {
    "jitter only": (s: number) => shakyS(s),
    "squashed 20% tall": (s: number) => shakyS(s, { sy: 0.8, dx: 40, dy: -20 }),
    "squashed 20% wide": (s: number) => shakyS(s, { sx: 0.8, dx: -15, dy: 30 }),
    "scaled up 20%, offset": (s: number) => shakyS(s, { sx: 1.2, sy: 1.2, dx: 120, dy: 60 }),
    "scaled down 20%, offset": (s: number) => shakyS(s, { sx: 0.8, sy: 0.8, dx: -60, dy: 10 }),
    "wobbly and jittery": (s: number) => shakyS(s, { wobble: 0.03, dx: 25 }),
  };

  const wrong = {
    "straight vertical line": best([line({ x: 50, y: 8 }, { x: 50, y: 132 })]),
    "straight horizontal line": best([line({ x: 10, y: 70 }, { x: 90, y: 70 })]),
    diagonal: best([line({ x: 85, y: 10 }, { x: 15, y: 130 }), line({ x: 15, y: 10 }, { x: 85, y: 130 })]),
    circle: best([0, 45, 90, 135, 180, 225, 270, 315].flatMap((a) => [arc(a, a + 360, { rx: 45, ry: 60 }), arc(a, a - 360, { rx: 45, ry: 60 })])),
    C: best([arc(-50, -310)]),
    "zigzag scribble": best([5, 6, 7, 8].map(zigzag).concat(seeds.map(randomScribble))),
  };

  it("prints every score so the threshold can be tuned", () => {
    const rows: [string, string][] = [
      ["clean S", fmt(score(template))],
      ["clean S drawn backwards", fmt(score([...template].reverse()))],
      ...Object.entries(shaky).map(([k, f]): [string, string] => [`shaky S, ${k} (worst of ${seeds.length})`, fmt(worst(f))]),
      ["mirrored S", fmt(best([mirror(template), mirror(template).reverse()]))],
      ...Object.entries(wrong).map(([k, d]): [string, string] => [`${k} (best case)`, fmt(d)]),
    ];
    console.log(`PASS_THRESHOLD ${PASS_THRESHOLD}\n` + rows.map(([k, v]) => `  ${v}  ${k}`).join("\n"));
  });

  it("passes a clean S, either way round", () => {
    expect(scoreTrace(template, template)).toEqual({ distance: 0, pass: true });
    expect(scoreTrace([...template].reverse(), template).pass).toBe(true);
  });

  for (const [name, make] of Object.entries(shaky)) {
    it(`passes a shaky S: ${name}`, () => {
      for (const seed of seeds) expect(scoreTrace(make(seed), template).pass).toBe(true);
      // with room to spare, so a messier real hand still gets through
      expect(worst(make)).toBeLessThan(PASS_THRESHOLD * 0.85);
    });
  }

  for (const [name, distance] of Object.entries(wrong)) {
    it(`fails a ${name}`, () => {
      expect(distance).toBeGreaterThan(PASS_THRESHOLD * 1.2);
    });
  }

  it("fails a mirrored S", () => {
    const m = mirror(template);
    expect(scoreTrace(m, template)).toMatchObject({ pass: false, reason: "too-far" });
    expect(scoreTrace(m.reverse(), template).pass).toBe(false);
  });

  it("calls taps and tiny flicks too short", () => {
    expect(scoreTrace([{ x: 10, y: 10 }, { x: 11, y: 11 }, { x: 12, y: 12 }], template)).toEqual({
      distance: Infinity,
      pass: false,
      reason: "too-short",
    });
    const tinyS = template.map((p) => ({ x: p.x * 0.1, y: p.y * 0.1 }));
    expect(scoreTrace(tinyS, template).reason).toBe("too-short");
  });

  it("lets the caller loosen or tighten the threshold", () => {
    const wobbly = shakyS(3);
    const d = scoreTrace(wobbly, template).distance;
    expect(scoreTrace(wobbly, template, { threshold: d / 2 }).pass).toBe(false);
    expect(scoreTrace(wobbly, template, { threshold: d * 2, samples: 32 }).pass).toBe(true);
  });
});
