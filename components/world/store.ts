"use client";

import { useSyncExternalStore } from "react";
import type { BuildKind, MomentId, TimeOfDay } from "./config";

/**
 * Everything the HUD shows lives in one small store. The 3D engine writes to it
 * (loading, where the camera is, what is under the pointer), the HUD reads it, and
 * the HUD talks back to the engine through `actions` below. Neither side imports
 * the other, so each HUD piece can be built and tested on its own.
 */

export type Vec3 = [number, number, number];

/** One thing the child has added to the world. The engine draws whatever is in this list. */
export type Piece = {
  id: string;
  kind: BuildKind;
  position: Vec3;
  rotation: number; // degrees around the up axis
  length: number; // in planks or steps, for pieces that stretch (the bridge); 1 for the rest
  placedAt: number;
};

export type Readouts = {
  heightM: number; // how far the camera is above the ground
  headingDeg: number; // 0 = north (the way the world first faces), clockwise
  nearest: { moment: MomentId; distanceM: number } | null;
};

/** What the build tool would place if the child tapped now. */
export type Ghost = {
  valid: boolean; // there is ground under it and it is inside the world
  distanceM: number | null; // from the camera to where it would go
};

export type HudState = {
  status: "loading" | "ready" | "error";
  progress: number; // 0..1 while the world downloads
  quality: "preview" | "full";
  sharpening: number | null; // 0..1 while the full-detail world downloads in the background
  error: string | null;
  /** Why the world isn't showing: no 3D on this device (trying again won't help), or the download failed or stalled. */
  errorKind: "webgl" | "network" | "stalled" | null;

  moment: MomentId | null; // the story moment the camera is at, if any
  /** Goes up by one whenever the child moves or looks around themselves, so a story tour knows to step aside. */
  steer: number;
  visited: MomentId[]; // moments the child has been to, in the order they went
  flying: boolean; // the camera is gliding to a moment

  mode: "explore" | "build";
  tool: BuildKind; // what the build bar has picked
  rotation: number; // the ghost's turn, degrees
  length: number; // the ghost's length, for stretchy pieces
  ghost: Ghost;
  selected: string | null; // a placed piece the child tapped

  pieces: Piece[];
  readouts: Readouts;
  timeOfDay: TimeOfDay;

  childName: string;
  speaking: boolean; // the story is being read aloud
  storyOpen: boolean; // Grandpa's words are open on a phone, so the layout makes room
  postcardOpen: boolean;
  sent: boolean; // the postcard went to Grandpa
  notice: { text: string; at: number } | null; // a short friendly line, shown for a moment
};

export const INITIAL: HudState = {
  status: "loading",
  progress: 0,
  quality: "preview",
  sharpening: null,
  error: null,
  errorKind: null,
  moment: null,
  steer: 0,
  visited: [],
  flying: false,
  mode: "explore",
  tool: "bridge",
  rotation: 0,
  length: 8,
  ghost: { valid: false, distanceM: null },
  selected: null,
  pieces: [],
  readouts: { heightM: 0, headingDeg: 0, nearest: null },
  timeOfDay: "day",
  childName: "",
  speaking: false,
  storyOpen: false,
  postcardOpen: false,
  sent: false,
  notice: null,
};

let state: HudState = INITIAL;
const listeners = new Set<() => void>();

export const hud = {
  get: (): HudState => state,
  set(patch: Partial<HudState> | ((s: HudState) => Partial<HudState>)): void {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  reset(): void {
    state = INITIAL;
    listeners.forEach((l) => l());
  },
};

/**
 * Read one slice of the HUD state. The selector must return something stable:
 * a primitive, or an object that is already in the state (like `s.pieces`).
 * Building a new object or array inside the selector re-renders forever.
 */
export function useHud<T>(select: (s: HudState) => T): T {
  return useSyncExternalStore(
    hud.subscribe,
    () => select(state),
    () => select(INITIAL),
  );
}

/** What the HUD can ask the 3D world to do. The engine fills this in when it starts. */
export type WorldCommands = {
  flyTo(moment: MomentId): void;
  /** Held movement from the on-screen pad, each -1..1: right, up, forward. Zero to stop. */
  setMove(x: number, y: number, z: number): void;
  /** Turn the view left or right by this many degrees, smoothly. */
  turn(deg: number): void;
  /** Place the current tool where the reticle (screen center) points. */
  placeAtCenter(): void;
  /** Put the camera back where the world starts. */
  home(): void;
  /** A picture of the world right now, for the postcard. */
  snapshot(maxWidth?: number): string | null;
};

let commands: WorldCommands | null = null;

export function registerWorld(c: WorldCommands | null): void {
  commands = c;
}

let nextId = 1;

/** Every button in the HUD calls one of these. */
export const actions = {
  flyTo: (m: MomentId) => commands?.flyTo(m),
  setMove: (x: number, y: number, z: number) => commands?.setMove(x, y, z),
  turn: (deg: number) => commands?.turn(deg),
  home: () => commands?.home(),
  placeAtCenter: () => commands?.placeAtCenter(),
  snapshot: (maxWidth?: number) => commands?.snapshot(maxWidth) ?? null,

  setMode: (mode: HudState["mode"]) => hud.set({ mode, selected: null }),
  pickTool: (tool: BuildKind) => hud.set({ tool, mode: "build", selected: null }),
  rotate: (stepDeg = 45) => hud.set((s) => ({ rotation: (((s.rotation + stepDeg) % 360) + 360) % 360 })),
  setLength: (length: number) => hud.set({ length }),
  setTimeOfDay: (timeOfDay: TimeOfDay) => hud.set({ timeOfDay }),
  select: (id: string | null) => hud.set({ selected: id }),

  addPiece(p: Omit<Piece, "id" | "placedAt">): Piece {
    const piece: Piece = { ...p, id: `p${Date.now().toString(36)}${nextId++}`, placedAt: Date.now() };
    hud.set((s) => ({ pieces: [...s.pieces, piece], sent: false }));
    return piece;
  },
  /** Remove the selected piece, or the last one placed when nothing is selected. */
  removePiece(id?: string) {
    hud.set((s) => {
      const target = id ?? s.selected ?? s.pieces.at(-1)?.id;
      if (!target) return {};
      return { pieces: s.pieces.filter((p) => p.id !== target), selected: null, sent: false };
    });
  },
  clearPieces: () => hud.set({ pieces: [], selected: null, sent: false }),

  setChildName: (childName: string) => hud.set({ childName }),
  setSpeaking: (speaking: boolean) => hud.set({ speaking }),
  setStoryOpen: (storyOpen: boolean) => hud.set({ storyOpen }),
  /** The child moved or looked around on their own. */
  steered: () => hud.set((s) => ({ steer: s.steer + 1 })),
  openPostcard: () => hud.set({ postcardOpen: true }),
  closePostcard: () => hud.set({ postcardOpen: false }),
  markSent: () => hud.set({ sent: true }),
  notify: (text: string) => hud.set({ notice: { text, at: Date.now() } }),
};
