// World Builder: one Antigravity managed-agent call. Gemini 4 Argon builds a lesson page as a
// living 3D world, writes a headless-Chrome check of the lesson, and loops until it passes.
// Run: npx tsx scripts/build-world.mts [planets=4]
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gemini } from "./gemini-env";
import { checkWorld, READY_MS } from "./world-check";
import { serveThreeLocally, THREE_URL } from "./world-three";

const N = Number(process.argv[2] ?? 4);
if (!Number.isInteger(N) || N < 1 || N > 8) throw new Error("planets must be 1 to 8");
// A folder of its own for every run, so a failed rebuild never touches the world the book is using.
const RUN = `count-${N}-${new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}`;
const OUT = path.join("public", "worlds", RUN);
const client = gemini();

const TASK = `You are building one page of a picture book for a 5-year-old as a living 3D world, and you must prove it is right before you hand it back.

THE PAGE: a counting lesson. The book asks "How many planets do you see?" The child must be able to count EXACTLY ${N} planets. If the picture shows a different number, the lesson is broken.

Work in a folder named world in your current directory. Deliver:

1. world/scene.html, one self-contained file. Load Three.js with an import map that maps "three" to ${THREE_URL}, and import nothing else (no addons, no other CDNs). Full-window canvas. Calm deep night sky (#0a0f2a to #1e2a5e), soft hand-placed stars, a faint luminous band. Exactly ${N} planets, each a distinct soft color (rose #d9788a, teal #4fb3b0, violet #8a6ee0, amber #e8a94b, sky #6aa2e8, moon cream #f7f0dc), clearly separated so a child can count them, gently floating and rotating. One may have a ring. No text, no faces, nothing scary. It must expose:
   window.__world = {
     planets(): Array<{ x: number, y: number, r: number }>  // every planet on screen, projected with the camera on every call: x = center as a fraction of the viewport width, y = center as a fraction of its height, r = on-screen radius as a fraction of the viewport HEIGHT
     highlight(i: number, on: boolean): void  // planet i glows warm gold, or goes calm
     addPlanet(): void  // one more planet fades and scales in at a free spot that keeps every rule below
   }

2. world/verify.mjs, a headless Chromium check. Install with: npm i playwright && npx playwright install --with-deps chromium. Serve or open scene.html at a 1180x787 viewport (the book's two-page spread), wait 2 seconds, then check and print JSON {"checks":[{"name","pass","detail"}],"score":"passed/total"}:
   a. count: planets().length === ${N}
   Measure b to f in pixels (x times the width, y and r times the height).
   b. inFrame: every planet fully inside the viewport, with a margin of 4% of the width at the sides and 4% of the height at the top and bottom
   c. separated: no two planets overlap on screen (center distance > r1 + r2 + 2% of the height)
   d. spine: no planet center with x between 0.45 and 0.55 (the book's fold runs there)
   e. captionBand: no planet top above y 0.20 (the narration is printed there)
   f. buttonBand: no planet bottom below y 0.76 (the child's number buttons sit there)
   g. calmTop: mean luminance of the top 18% of a screenshot is below 0.25 (cream text must stay readable)
   h. alive: two screenshots 600 ms apart differ, there are zero console errors, and the page requests nothing but itself and three.js
   i. api: highlight(i, false) for every planet, then highlight(0, true), then addPlanet(), then after 800 ms planets().length === ${N + 1}, the new planet also passes b to f, and highlight(i, true) then highlight(i, false) run without an error for every planet, the new one too
   j. ready: within ${READY_MS} ms of the start of the page's load (performance.now() in the page), planets() answers with all ${N} planets and highlight(0, false) runs without an error
   Save a screenshot every round as world/shots/round-<k>.png.

3. The loop: run verify.mjs. If any check fails, read the failures, look at the screenshot, fix scene.html, and run again. Stop when every check passes, or after 6 rounds. Keep every round honest: never change verify.mjs to make a check easier. Write world/report.json:
   { "planets": ${N}, "rounds": [{ "round": 1, "score": "7/10", "failed": ["count", "spine", "ready"] }], "passed": true }

Reply with the contents of world/report.json and nothing else.`;

type Step = { type?: string; [k: string]: unknown };
type Interaction = { id: string; status: string; environment_id?: string; output_text?: string; steps?: Step[] };

const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`.padStart(5);

let it = (await client.interactions.create(
  {
    agent: "antigravity-preview-09-2026",
    agent_config: { type: "antigravity", model: "gemini-4-argon" },
    input: TASK,
    environment: "remote",
    background: true,
  } as never,
  { timeout: 300000 },
)) as unknown as Interaction;
console.log(`${since()}  started ${it.id}  (Argon in a Google-hosted sandbox)`);

// Show what the agent is doing as it works: every new step, one line each.
let shown = 0;
while (["in_progress", "queued"].includes(it.status)) {
  await new Promise((r) => setTimeout(r, 4000));
  it = (await client.interactions.get(it.id as never)) as unknown as Interaction;
  const steps = it.steps ?? [];
  for (const s of steps.slice(shown)) {
    const detail = JSON.stringify(s.arguments ?? s.code ?? s.content ?? s.name ?? "").replace(/\s+/g, " ").slice(0, 110);
    console.log(`${since()}  ${s.type ?? "step"}  ${detail}`);
  }
  shown = steps.length;
}
console.log(`${since()}  ${it.status}  env=${it.environment_id}`);
console.log(it.output_text);
if (!it.environment_id) process.exit(1);

// Bring the verified world home: the scene, the report, and every round's screenshot.
const list = (await client.environments.files.list({ environment: it.environment_id, path: "", recursive: true } as never)) as unknown as {
  files: { path: string }[];
};
const report = list.files.find((f) => f.path.endsWith("world/report.json"));
const dir = report ? report.path.replace(/\/report\.json$/, "") : "world";
const bytes = await client.environments.files.download({ environment: it.environment_id, path: dir, recursive: true } as never);
mkdirSync(OUT, { recursive: true });
const tar = path.join(OUT, "world.tar");
writeFileSync(tar, Buffer.from(bytes as unknown as Uint8Array));
execSync(`tar -xf "${tar}" -C "${OUT}" && rm "${tar}"`);
// Flatten if the archive kept the folder name.
execSync(`cd "${OUT}" && if [ -d world ]; then cp -R world/. . && rm -rf world; fi; rm -rf node_modules package-lock.json`);
console.log(`${since()}  saved to ${OUT}`);
let passed = false;
try {
  const text = readFileSync(path.join(OUT, "report.json"), "utf8");
  console.log(text);
  const r = JSON.parse(text) as { planets?: number; passed?: boolean };
  passed = r.passed === true && r.planets === N;
} catch {
  console.log("(no readable report.json in the download)");
}
// Save it pointing at the app's own copy of three.js, then check it here as well, served the way the
// book serves it: the agent's own report is not enough on its own.
const scene = path.join(OUT, "scene.html");
if (!existsSync(scene)) {
  console.log("(no scene.html in the download)");
  passed = false;
} else {
  const local = serveThreeLocally(readFileSync(scene, "utf8"));
  writeFileSync(scene, local.html);
  if (local.remote.length) {
    // The book has no network to lean on while the page turns.
    console.log(`${since()}  still loads from a CDN, so it stays out of the book: ${local.remote.join(" ")}`);
    passed = false;
  }
  if (passed) {
    mkdirSync(path.join(OUT, "shots"), { recursive: true });
    const recheck = await checkWorld(local.html, N, path.join(OUT, "shots", "recheck.png"));
    const failed = recheck.filter((c) => !c.pass);
    writeFileSync(path.join(OUT, "recheck.json"), JSON.stringify({ checks: recheck, passed: !failed.length }, null, 2));
    console.log(`${since()}  checked here too: ${recheck.length - failed.length}/${recheck.length}  ${failed.map((f) => `${f.name} (${f.detail})`).join(", ")}`);
    passed = failed.length === 0;
  }
}
// Only a world that passed every check, there and here, goes into the book.
if (passed) writeFileSync(path.join("public", "worlds", "current.json"), JSON.stringify({ planets: N, path: `/worlds/${RUN}/scene.html` }, null, 2));
console.log(`${since()}  ${passed ? "PASSED: the counting page now uses this world" : "not passing: the book keeps the world it had"}`);
