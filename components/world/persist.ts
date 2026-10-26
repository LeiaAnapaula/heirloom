import { BUILDS, WORLD } from "./config";
import type { Piece } from "./store";

/**
 * What the child built stays on this device, so the world is still theirs when
 * they come back. Anything that doesn't look like a piece is dropped on the way in.
 */

const KEY = `heirloom.world.${WORLD.id}.pieces.v1`;
const KINDS = new Set(BUILDS.map((b) => b.kind));
const MAX_PIECES = 200;

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function cleanPieces(raw: unknown): Piece[] {
  if (!Array.isArray(raw)) return [];
  const out: Piece[] = [];
  for (const p of raw.slice(0, MAX_PIECES)) {
    if (!p || typeof p !== "object") continue;
    const { id, kind, position, rotation, length, placedAt } = p as Record<string, unknown>;
    if (typeof id !== "string" || !KINDS.has(kind as Piece["kind"])) continue;
    if (!Array.isArray(position) || position.length !== 3 || !position.every(isNum)) continue;
    const stretch = BUILDS.find((b) => b.kind === kind)?.stretch;
    const len = isNum(length) ? Math.round(length) : 1;
    out.push({
      id,
      kind: kind as Piece["kind"],
      position: [position[0], position[1], position[2]],
      rotation: isNum(rotation) ? ((rotation % 360) + 360) % 360 : 0,
      length: stretch ? Math.max(stretch.min, Math.min(stretch.max, len)) : 1,
      placedAt: isNum(placedAt) ? placedAt : 0,
    });
  }
  return out;
}

export function loadPieces(): Piece[] {
  try {
    return cleanPieces(JSON.parse(window.localStorage.getItem(KEY) ?? "[]"));
  } catch {
    return [];
  }
}

export function savePieces(pieces: Piece[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(pieces));
  } catch {
    // Storage blocked (private browsing): the world lasts until the page closes.
  }
}
