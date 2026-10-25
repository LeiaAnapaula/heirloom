// The same loop as build-world.ts, with the checks run on this machine: Gemini 4 Argon writes the
// world, headless Chrome checks the lesson, Argon sees the failures and the screenshot and fixes it.
// Run: npx tsx scripts/build-world-local.ts [planets=4]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { gemini } from "./gemini-env";

const N = Number(process.argv[2] ?? 4);
const OUT = path.join("public", "worlds", `count-${N}`);
mkdirSync(path.join(OUT, "shots"), { recursive: true });
const client = gemini();

const SPEC = `Write world/scene.html for a picture book page for a 5-year-old: a counting lesson. The book asks "How many planets do you see?" and the child must count EXACTLY ${N} planets.
One self-contained HTML file. Load Three.js with an import map from https://unpkg.com/three@0.170.0/build/three.module.js. Full-window canvas. Calm deep night sky (#0a0f2a to #1e2a5e), soft stars, a faint luminous band. Exactly ${N} planets in distinct soft colors (rose #d9788a, teal #4fb3b0, violet #8a6ee0, amber #e8a94b, sky #6aa2e8, cream #f7f0dc), clearly separated, gently floating and rotating; one may have a ring. No text, no faces, nothing scary.
Expose window.__world = { planets(): [{x,y,r}] (on-screen center and radius as fractions of the viewport, projected every call), highlight(i, on) (planet i glows warm gold or goes calm), addPlanet() (one more planet fades in at a free spot that keeps every rule) }.
Rules a checker will test at 1180x787: exactly ${N} planets; each fully inside the frame with a 4% margin; no overlaps (center distance > r1 + r2 + 0.02); no planet center with x between 0.45 and 0.55 (the book's fold); no planet top above y 0.20 (narration); no planet bottom below y 0.76 (number buttons); the top 18% stays dark (mean luminance under 0.25); it moves; zero console errors; after addPlanet() there are ${N + 1} planets and the new one keeps every rule.
Reply with the complete HTML only, no explanation, no code fences.`;

type Check = { name: string; pass: boolean; detail: string };

async function verify(html: string, round: number): Promise<Check[]> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1180, height: 787 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(2500);
  type P = { x: number; y: number; r: number };
  const planets: P[] = await page.evaluate(() => (window as unknown as { __world?: { planets(): P[] } }).__world?.planets() ?? []).catch(() => []);
  const shot = await page.screenshot({ path: path.join(OUT, "shots", `round-${round}.png`) });
  const top = await page.evaluate(async () => {
    const c = document.querySelector("canvas");
    if (!c) return 1;
    const t = document.createElement("canvas");
    t.width = 118;
    t.height = 14;
    const g = t.getContext("2d")!;
    g.drawImage(c, 0, 0, c.width, c.height * 0.18, 0, 0, 118, 14);
    const d = g.getImageData(0, 0, 118, 14).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return sum / (d.length / 4);
  }).catch(() => 1);
  await page.waitForTimeout(600);
  const shot2 = await page.screenshot();
  let after: P[] = [];
  let apiError = "";
  try {
    after = await page.evaluate(() => {
      const w = (window as unknown as { __world: { highlight(i: number, on: boolean): void; addPlanet(): void; planets(): P[] } }).__world;
      w.highlight(0, true);
      w.addPlanet();
      return w.planets();
    });
  } catch (e) {
    apiError = String(e).slice(0, 120);
  }
  await page.waitForTimeout(800);
  if (!apiError) after = await page.evaluate(() => (window as unknown as { __world: { planets(): P[] } }).__world.planets()).catch(() => after);
  await browser.close();

  const rules = (ps: P[]) => ({
    inFrame: ps.every((p) => p.x - p.r > 0.04 && p.x + p.r < 0.96 && p.y - p.r > 0.04 && p.y + p.r < 0.96),
    separated: ps.every((a, i) => ps.every((b, j) => j <= i || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.02)),
    spine: ps.every((p) => p.x < 0.45 || p.x > 0.55),
    captionBand: ps.every((p) => p.y - p.r >= 0.2),
    buttonBand: ps.every((p) => p.y + p.r <= 0.76),
  });
  const now = rules(planets);
  const later = rules(after);
  const where = planets.map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)} r${p.r.toFixed(2)})`).join(" ");
  return [
    { name: "count", pass: planets.length === N, detail: `${planets.length} planets, needs ${N}` },
    { name: "inFrame", pass: planets.length > 0 && now.inFrame, detail: where },
    { name: "separated", pass: now.separated, detail: where },
    { name: "spine", pass: now.spine, detail: "keep centers out of x 0.45 to 0.55" },
    { name: "captionBand", pass: now.captionBand, detail: "planet tops must be below y 0.20" },
    { name: "buttonBand", pass: now.buttonBand, detail: "planet bottoms must be above y 0.76" },
    { name: "calmTop", pass: top < 0.25, detail: `top luminance ${top.toFixed(2)}` },
    { name: "alive", pass: !shot.equals(shot2) && errors.length === 0, detail: errors.slice(0, 2).join(" | ") || "moves" },
    { name: "api", pass: !apiError && after.length === N + 1 && Object.values(later).every(Boolean), detail: apiError || `${after.length} after addPlanet` },
  ];
}

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`.padStart(5);
const clean = (t: string) => t.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();

let it = (await client.interactions.create({ model: "gemini-4-argon", input: SPEC, generation_config: { thinking_level: "medium" } } as never)) as unknown as {
  id: string;
  output_text: string;
};
let html = clean(it.output_text);
const rounds: { round: number; score: string; failed: string[] }[] = [];
for (let round = 1; round <= 6; round++) {
  const checks = await verify(html, round);
  const failed = checks.filter((c) => !c.pass);
  rounds.push({ round, score: `${checks.length - failed.length}/${checks.length}`, failed: failed.map((f) => f.name) });
  console.log(`${since()}  round ${round}: ${checks.length - failed.length}/${checks.length}  ${failed.map((f) => f.name).join(", ")}`);
  if (!failed.length) break;
  const shot = (await import("node:fs")).readFileSync(path.join(OUT, "shots", `round-${round}.png`)).toString("base64");
  it = (await client.interactions.create({
    model: "gemini-4-argon",
    previous_interaction_id: it.id,
    input: [
      {
        type: "text",
        text: `The checker rendered your page. These checks failed:\n${failed.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}\nThe screenshot is attached. Fix scene.html so every check passes without breaking the others. Reply with the complete HTML only.`,
      },
      { type: "image", data: shot, mime_type: "image/png" },
    ],
    generation_config: { thinking_level: "medium" },
  } as never)) as unknown as { id: string; output_text: string };
  html = clean(it.output_text);
}
writeFileSync(path.join(OUT, "scene.html"), html);
const passed = rounds[rounds.length - 1].failed.length === 0;
writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ planets: N, rounds, passed, checkedBy: "local headless Chrome" }, null, 2));
if (passed) writeFileSync(path.join("public", "worlds", "current.json"), JSON.stringify({ planets: N, path: `/worlds/count-${N}/scene.html` }, null, 2));
console.log(`${since()}  ${passed ? "PASSED" : "not passing yet"}  saved to ${OUT}`);
