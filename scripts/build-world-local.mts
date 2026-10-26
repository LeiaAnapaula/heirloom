// The same loop as build-world.mts, with the checks run on this machine: Gemini 4 Argon writes the
// world, headless Chrome checks the lesson, Argon sees the failures and the screenshot and fixes it.
// Run: npx tsx scripts/build-world-local.mts [planets=4]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gemini } from "./gemini-env";
import { checkWorld, READY_MS } from "./world-check";
import { serveThreeLocally, THREE_URL } from "./world-three";

const N = Number(process.argv[2] ?? 4);
if (!Number.isInteger(N) || N < 1 || N > 8) throw new Error("planets must be 1 to 8");
// A folder of its own for every run, so a failed rebuild never touches the world the book is using.
const RUN = `count-${N}-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}`;
const OUT = path.join("public", "worlds", RUN);
const ROUNDS = 6;
mkdirSync(path.join(OUT, "shots"), { recursive: true });
mkdirSync(path.join(OUT, "rounds"), { recursive: true });
const client = gemini();

const SPEC = `Write world/scene.html for a picture book page for a 5-year-old: a counting lesson. The book asks "How many planets do you see?" and the child must count EXACTLY ${N} planets.
One self-contained HTML file. Load Three.js with an import map that maps "three" to ${THREE_URL}, and import nothing else (no addons, no other CDNs). Full-window canvas. Calm deep night sky (#0a0f2a to #1e2a5e), soft stars, a faint luminous band. Exactly ${N} planets in distinct soft colors (rose #d9788a, teal #4fb3b0, violet #8a6ee0, amber #e8a94b, sky #6aa2e8, cream #f7f0dc), clearly separated, gently floating and rotating; one may have a ring. No text, no faces, nothing scary.
Expose window.__world = { planets(): [{x,y,r}] (every planet on screen, projected every call: x = center as a fraction of the viewport width, y = center as a fraction of its height, r = on-screen radius as a fraction of the viewport HEIGHT), highlight(i, on) (planet i glows warm gold or goes calm), addPlanet() (one more planet fades in at a free spot that keeps every rule) }.
Rules a checker will test at 1180x787, in pixels: exactly ${N} planets; each fully inside the frame with a margin of 4% of the width at the sides and 4% of the height at the top and bottom; no overlaps (center distance > r1 + r2 + 2% of the height); no planet center with x between 0.45 and 0.55 (the book's fold); no planet top above y 0.20 (narration); no planet bottom below y 0.76 (number buttons); the top 18% stays dark (mean luminance under 0.25); it moves; zero console errors and no requests but the page and three.js; highlight(i, false) then highlight(i, true) work for every planet; after addPlanet() there are ${N + 1} planets, the new one keeps every rule and can be highlighted too; within ${READY_MS} ms of the start of the page's load, planets() answers with all ${N} and highlight(0, false) runs.
Reply with the complete HTML only, no explanation, no code fences.`;

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`.padStart(5);
const clean = (t: string) => t.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
type Reply = { id: string; output_text: string };

let it = (await client.interactions.create({ model: "gemini-4-argon", input: SPEC, generation_config: { thinking_level: "medium" } } as never)) as unknown as Reply;
let html = clean(it.output_text);
const rounds: { round: number; score: string; failed: string[] }[] = [];
for (let round = 1; round <= ROUNDS; round++) {
  // Kept before checking, so no paid round is lost if the run stops partway.
  writeFileSync(path.join(OUT, "rounds", `round-${round}.html`), html);
  const shotPath = path.join(OUT, "shots", `round-${round}.png`);
  const checks = await checkWorld(html, N, shotPath);
  const failed = checks.filter((c) => !c.pass);
  rounds.push({ round, score: `${checks.length - failed.length}/${checks.length}`, failed: failed.map((f) => f.name) });
  console.log(`${since()}  round ${round}: ${checks.length - failed.length}/${checks.length}  ${failed.map((f) => f.name).join(", ")}`);
  if (!failed.length || round === ROUNDS) break;
  let shot: string[] = [];
  try {
    shot = [readFileSync(shotPath).toString("base64")];
  } catch {
    // the page never got as far as a screenshot; the failures say why
  }
  it = (await client.interactions.create({
    model: "gemini-4-argon",
    previous_interaction_id: it.id,
    input: [
      {
        type: "text",
        text: `The checker rendered your page. These checks failed:\n${failed.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}\n${shot.length ? "The screenshot is attached. " : ""}Fix scene.html so every check passes without breaking the others. Reply with the complete HTML only.`,
      },
      ...shot.map((data) => ({ type: "image", data, mime_type: "image/png" })),
    ],
    generation_config: { thinking_level: "medium" },
  } as never)) as unknown as Reply;
  html = clean(it.output_text);
}

// Save it pointing at the app's own copy of three.js, and check that saved version once more,
// served the way the book serves it, before the counting page may use it.
const local = serveThreeLocally(html);
writeFileSync(path.join(OUT, "scene.html"), local.html);
let passed = rounds[rounds.length - 1].failed.length === 0;
if (local.remote.length) {
  // The book has no network to lean on while the page turns.
  console.log(`${since()}  still loads from a CDN, so it stays out of the book: ${local.remote.join(" ")}`);
  passed = false;
}
if (passed) {
  const recheck = await checkWorld(local.html, N, path.join(OUT, "shots", "saved.png"));
  const failed = recheck.filter((c) => !c.pass);
  console.log(`${since()}  saved copy: ${recheck.length - failed.length}/${recheck.length}  ${failed.map((f) => `${f.name} (${f.detail})`).join(", ")}`);
  passed = failed.length === 0;
}
writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ planets: N, rounds, passed, checkedBy: "local headless Chrome" }, null, 2));
if (passed) writeFileSync(path.join("public", "worlds", "current.json"), JSON.stringify({ planets: N, path: `/worlds/${RUN}/scene.html` }, null, 2));
console.log(`${since()}  ${passed ? "PASSED: the counting page now uses this world" : "not passing: the book keeps the world it had"}  saved to ${OUT}`);
