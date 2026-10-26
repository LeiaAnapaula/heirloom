// Three.js for the built worlds. A world is written against the pinned unpkg URL, because the
// agent's sandbox has no copy of its own, then saved pointing at a copy served from /worlds/vendor,
// so the book never waits on a CDN while the page turns.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const BUILD = path.join("node_modules", "three", "build");
const FILES = ["three.module.js", "three.core.js"]; // three.module.js imports ./three.core.js

/** The version this app installs, so the world is built and served on the same three.js. */
export const THREE_VERSION: string = JSON.parse(readFileSync(path.join("node_modules", "three", "package.json"), "utf8")).version;
export const THREE_CDN = `https://unpkg.com/three@${THREE_VERSION}/build/`;
export const THREE_URL = `${THREE_CDN}three.module.js`;
const SERVED = `/worlds/vendor/three@${THREE_VERSION}/`;

/** This machine's copy of a three.js file the CDN would serve, or null for anything else. */
export function threeFile(url: string): string | null {
  if (!url.startsWith(THREE_CDN)) return null;
  const name = url.slice(THREE_CDN.length).split(/[?#]/)[0];
  return FILES.includes(name) ? path.join(BUILD, name) : null;
}

/**
 * Copies three.js under `root` (the app's public folder) and points the world at that copy.
 * Also returns any other CDN address the world still loads from, so the builder can say so.
 */
export function serveThreeLocally(html: string, root = "public"): { html: string; remote: string[] } {
  const dir = path.join(root, SERVED);
  mkdirSync(dir, { recursive: true });
  for (const f of FILES) copyFileSync(path.join(BUILD, f), path.join(dir, f));
  const out = html.split(THREE_CDN).join(SERVED);
  const cdn = /https?:\/\/(?:unpkg\.com|cdn\.jsdelivr\.net|esm\.sh|cdnjs\.cloudflare\.com|cdn\.skypack\.dev|ga\.jspm\.io)[^\s"'`)]*/g;
  return { html: out, remote: [...new Set(out.match(cdn) ?? [])] };
}
