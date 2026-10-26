import { beforeEach, describe, expect, it } from "vitest";
import { BUILDS, MOMENTS, buildOf } from "@/components/world/config";
import { cleanPieces } from "@/components/world/persist";
import { actions, hud } from "@/components/world/store";

describe("cleanPieces", () => {
  const good = { id: "p1", kind: "bridge", position: [0, -1, -4], rotation: 45, length: 8, placedAt: 1 };

  it("keeps a saved piece as it was", () => {
    expect(cleanPieces([good])).toEqual([good]);
  });

  it.each([null, "pieces", 3, { pieces: [] }])("treats %s as an empty world", (raw) => {
    expect(cleanPieces(raw)).toEqual([]);
  });

  it("drops pieces it doesn't know or can't place", () => {
    const bad = [
      { ...good, kind: "castle" },
      { ...good, id: 7 },
      { ...good, position: [0, 1] },
      { ...good, position: [0, Number.NaN, 1] },
      null,
      "bridge",
    ];
    expect(cleanPieces([...bad, good])).toEqual([good]);
  });

  it("keeps a bridge's planks within what the build bar allows", () => {
    const { min, max } = buildOf("bridge").stretch!;
    expect(cleanPieces([{ ...good, length: 999 }])[0].length).toBe(max);
    expect(cleanPieces([{ ...good, length: 1 }])[0].length).toBe(min);
    expect(cleanPieces([{ ...good, kind: "house", length: 12 }])[0].length).toBe(1);
  });

  it("wraps turns into 0..360 and fills in what is missing", () => {
    const [p] = cleanPieces([{ id: "p2", kind: "lantern", position: [1, 2, 3], rotation: -90 }]);
    expect(p).toEqual({ id: "p2", kind: "lantern", position: [1, 2, 3], rotation: 270, length: 1, placedAt: 0 });
  });

  it("caps how many pieces come back", () => {
    expect(cleanPieces(Array.from({ length: 500 }, (_, i) => ({ ...good, id: `p${i}` })))).toHaveLength(200);
  });
});

describe("HUD actions", () => {
  beforeEach(() => hud.reset());

  it("turns the ghost in 45 degree steps, both ways round", () => {
    actions.rotate();
    expect(hud.get().rotation).toBe(45);
    actions.rotate(-90);
    expect(hud.get().rotation).toBe(315);
  });

  it("picking a piece switches to build mode", () => {
    actions.pickTool("garden");
    expect(hud.get()).toMatchObject({ tool: "garden", mode: "build" });
  });

  it("removes the selected piece, or the last one when nothing is selected", () => {
    const a = actions.addPiece({ kind: "bridge", position: [0, 0, 0], rotation: 0, length: 8 });
    const b = actions.addPiece({ kind: "house", position: [1, 0, 0], rotation: 0, length: 1 });
    const c = actions.addPiece({ kind: "tree", position: [2, 0, 0], rotation: 0, length: 1 });
    actions.select(a.id);
    actions.removePiece();
    expect(hud.get().pieces.map((p) => p.id)).toEqual([b.id, c.id]);
    expect(hud.get().selected).toBeNull();
    actions.removePiece();
    expect(hud.get().pieces.map((p) => p.id)).toEqual([b.id]);
  });

  it("gives every piece its own id", () => {
    const ids = new Set(Array.from({ length: 20 }, () => actions.addPiece({ kind: "lantern", position: [0, 0, 0], rotation: 0, length: 1 }).id));
    expect(ids.size).toBe(20);
  });

  it("building something new means Grandpa hasn't seen it yet", () => {
    actions.markSent();
    actions.addPiece({ kind: "bench", position: [0, 0, 0], rotation: 0, length: 1 });
    expect(hud.get().sent).toBe(false);
  });
});

describe("the world's data", () => {
  it("gives every piece a different number key, 1 to 8", () => {
    expect(BUILDS.map((b) => b.key).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("writes every line for Grandpa without em dashes", () => {
    for (const m of MOMENTS) expect(m.line, m.id).not.toMatch(/—/);
    for (const b of BUILDS) expect(b.message("Mia"), b.kind).not.toMatch(/—/);
  });
});
