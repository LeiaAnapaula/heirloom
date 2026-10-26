import { BUILDS, WORLD } from "./config";
import { actions, hud, type Piece } from "./store";

/**
 * What the child built stays on this device, so the world is still theirs when
 * they come back. Anything that doesn't look like a piece is dropped on the way in.
 */

const KEY = `heirloom.world.${WORLD.id}.pieces.v1`;
const KINDS = new Set(BUILDS.map((b) => b.kind));
/** How many pieces one world holds. Past this the child takes something away to build more. */
export const MAX_PIECES = 200;
export const FULL_NOTICE = "There's no more room. Take something away to build more.";

function isNum(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

export function cleanPieces(raw: unknown): Piece[] {
  if (!Array.isArray(raw)) return [];
  const out: Piece[] = [];
  // The newest ones, if there are ever too many: those are what the child built last.
  for (const p of raw.slice(-MAX_PIECES)) {
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

/**
 * Looks after the child's pieces while the world is open: saves each change (unless `save` is
 * false, for a rehearsal), takes a piece straight back out if the world is already full, and
 * picks up changes another open tab saved, so the two never write over each other.
 * Returns a function that stops all of it.
 */
export function keepPieces({ save }: { save: boolean }): () => void {
  let seen = hud.get().pieces;
  let sent = hud.get().sent;
  const unsubscribe = hud.subscribe(() => {
    const s = hud.get();
    if (s.pieces === seen) {
      sent = s.sent;
      return;
    }
    if (s.pieces.length > MAX_PIECES) {
      // Nothing changed for Grandpa either, so the postcard stays as sent as it was.
      hud.set({ pieces: s.pieces.slice(0, MAX_PIECES), sent });
      // Queued, so it lands after the engine's "Your bridge is in!", which comes right after placing.
      queueMicrotask(() => actions.notify(FULL_NOTICE));
      return;
    }
    seen = s.pieces;
    sent = s.sent;
    if (save) savePieces(seen);
  });
  if (!save) return unsubscribe;

  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== KEY) return;
    seen = loadPieces();
    hud.set({ pieces: seen, selected: null });
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}
