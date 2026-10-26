// The lesson checker, in headless Chrome on this machine. It serves the world the way the book does
// (same origin, three.js from this machine's copy, nothing else from the network), probes it the way
// the counting page does, and runs the same checks the managed agent writes for itself, so no world
// reaches the book on the agent's word alone.
import { existsSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";
import { threeFile } from "./world-three";

export type Check = { name: string; pass: boolean; detail: string };
type P = { x: number; y: number; r: number };
type World = { planets(): P[]; highlight(i: number, on: boolean): void; addPlanet(): void };
type Probe = { __world?: World; __readyMs?: number; __probeError?: string };

const ORIGIN = "http://book.test";
const PAGE = `${ORIGIN}/worlds/check/scene.html`;
const W = 1180;
const H = 787;
/**
 * The counting page gives a world 1.2 s from the page turn, polling every 150 ms, so the world gets
 * 1 s from the start of its own load here.
 */
export const READY_MS = 1000;
/** A world still busy after this long is failed, so a page that never settles cannot stall a build. */
const DEADLINE_MS = 30_000;
const NAMES = ["count", "inFrame", "separated", "spine", "captionBand", "buttonBand", "calmTop", "alive", "api", "ready"];

/**
 * Renders `html` at the book's spread size (1180x787) and checks the counting lesson for `planets`.
 * planets() gives x as a fraction of the width, y as a fraction of the height, and r (the on-screen
 * radius) as a fraction of the height; the rules are measured in pixels.
 * Files the world asks for under /worlds/ come from `root`, as the app serves them.
 * Saves the first screenshot to `shot`. A page that hangs or cannot be run fails every check.
 */
export async function checkWorld(html: string, planets: number, shot: string, root = "public"): Promise<Check[]> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failAll = (detail: string) => NAMES.map((name) => ({ name, pass: false, detail }));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = run(browser, html, planets, shot, root);
  work.catch(() => {}); // when the deadline wins, closing the browser rejects whatever was still running
  const hung = new Promise<Check[]>((resolve) => {
    timer = setTimeout(() => resolve(failAll(`the page was still busy after ${DEADLINE_MS / 1000} s`)), DEADLINE_MS);
  });
  try {
    return await Promise.race([work, hung]);
  } catch (e) {
    return failAll(`the page could not be checked: ${String(e).slice(0, 160)}`);
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => {});
  }
}

async function run(browser: Browser, html: string, planets: number, shot: string, root: string): Promise<Check[]> {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors: string[] = [];
  const outside: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url === PAGE) return route.fulfill({ body: html, contentType: "text/html" });
    const three = threeFile(url);
    if (three) return route.fulfill({ path: three, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } });
    if (url.startsWith(`${ORIGIN}/`)) {
      const file = path.join(root, decodeURIComponent(new URL(url).pathname));
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: "" });
    }
    // The book is offline-safe only if the world is: anything else it reaches for is refused.
    outside.push(url);
    return route.abort();
  });
  // The counting page's own test of a live world: all its planets answer and highlight(0, false)
  // runs. Timed inside the page, from the start of its load, so setup before the load event counts.
  await page.addInitScript((n: number) => {
    const w = window as unknown as Probe;
    const t = setInterval(() => {
      try {
        if (!w.__world || w.__world.planets().length !== n) return;
        w.__world.highlight(0, false);
      } catch (e) {
        w.__probeError = String(e).slice(0, 120);
        return;
      }
      w.__readyMs = performance.now();
      clearInterval(t);
    }, 25);
  }, planets);

  await page.goto(PAGE, { waitUntil: "commit" });
  await page.waitForFunction((ms) => (window as unknown as Probe).__readyMs !== undefined || performance.now() > ms, READY_MS);
  await page.waitForLoadState("load");
  const probe = await page.evaluate(() => {
    const w = window as unknown as Probe;
    return { ms: w.__readyMs, error: w.__probeError };
  });
  const readyMs = probe.ms !== undefined && probe.ms <= READY_MS ? Math.round(probe.ms) : -1;

  const read = () => page.evaluate(() => (window as unknown as Probe).__world?.planets() ?? []).catch((): P[] => []);
  await page.waitForTimeout(2000);
  const now = await read();
  const first = await page.screenshot({ path: shot });
  // From the screenshot, not the canvas: a WebGL canvas usually reads back blank once drawn.
  const top = await page
    .evaluate(async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 118;
      c.height = 14;
      const g = c.getContext("2d")!;
      g.drawImage(img, 0, 0, img.width, img.height * 0.18, 0, 0, 118, 14);
      const d = g.getImageData(0, 0, 118, 14).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      return sum / (d.length / 4);
    }, first.toString("base64"))
    .catch(() => 1);
  await page.waitForTimeout(600);
  const second = await page.screenshot();

  // Drive it the way the counting page does: every planet goes calm, the first lights, one more
  // arrives, then every planet, the new one too, lights and goes calm again.
  let after: P[] = [];
  let apiError = "";
  try {
    await page.evaluate((n) => {
      const w = (window as unknown as Probe).__world!;
      for (let i = 0; i < n; i++) w.highlight(i, false);
      w.highlight(0, true);
      w.addPlanet();
    }, planets);
    await page.waitForTimeout(800);
    after = await page.evaluate(() => {
      const w = (window as unknown as Probe).__world!;
      const ps = w.planets();
      for (let i = 0; i < ps.length; i++) {
        w.highlight(i, true);
        w.highlight(i, false);
      }
      return ps;
    });
  } catch (e) {
    apiError = String(e).replace(/^Error: page\.evaluate: /, "").slice(0, 120);
  }

  const px = (ps: P[]) => ps.map((p) => ({ x: p.x * W, y: p.y * H, r: p.r * H }));
  const rules = (ps: P[]) => {
    const q = px(ps);
    return {
      inFrame: q.length > 0 && q.every((p) => p.x - p.r > 0.04 * W && p.x + p.r < 0.96 * W && p.y - p.r > 0.04 * H && p.y + p.r < 0.96 * H),
      separated: q.every((a, i) => q.every((b, j) => j <= i || Math.hypot(a.x - b.x, a.y - b.y) > a.r + b.r + 0.02 * H)),
      spine: q.every((p) => p.x < 0.45 * W || p.x > 0.55 * W),
      captionBand: q.every((p) => p.y - p.r >= 0.2 * H),
      buttonBand: q.every((p) => p.y + p.r <= 0.76 * H),
    };
  };
  const at = rules(now);
  const later = rules(after);
  const where = now.map((p) => `(${p.x.toFixed(2)},${p.y.toFixed(2)} r${p.r.toFixed(2)})`).join(" ");
  const broken = Object.entries(later).filter(([, ok]) => !ok).map(([k]) => k);
  const refused = [...new Set(outside)];
  const trouble = [...(refused.length ? [`loads from outside the app: ${refused.slice(0, 2).join(" ")}`] : []), ...errors.slice(0, 2)];
  return [
    { name: "count", pass: now.length === planets, detail: `${now.length} planets, needs ${planets}` },
    { name: "inFrame", pass: at.inFrame, detail: where || "no planets" },
    { name: "separated", pass: at.separated, detail: where },
    { name: "spine", pass: at.spine, detail: "keep centers out of x 0.45 to 0.55" },
    { name: "captionBand", pass: at.captionBand, detail: "planet tops must be below y 0.20" },
    { name: "buttonBand", pass: at.buttonBand, detail: "planet bottoms must be above y 0.76" },
    { name: "calmTop", pass: top < 0.25, detail: `top luminance ${top.toFixed(2)}` },
    { name: "alive", pass: !first.equals(second) && errors.length === 0 && refused.length === 0, detail: trouble.join(" | ") || "moves" },
    {
      name: "api",
      pass: !apiError && after.length === planets + 1 && broken.length === 0,
      detail: apiError || `${after.length} after addPlanet${broken.length ? `, then breaks ${broken.join(", ")}` : ""}`,
    },
    {
      name: "ready",
      pass: readyMs >= 0,
      detail:
        readyMs >= 0
          ? `live ${readyMs} ms after its load began`
          : `not live within ${READY_MS} ms of its load beginning (all ${planets} planets answer, then highlight(0, false) runs)${probe.error ? `: ${probe.error}` : ""}`,
    },
  ];
}
