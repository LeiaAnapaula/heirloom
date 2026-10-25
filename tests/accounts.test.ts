import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanChildInput, cleanEmail, passwordProblem } from "@/lib/account-types";
import { hashPassword, signToken, verifyPassword, verifyToken } from "@/lib/server/auth-crypto";
import { FileAccountStore } from "@/lib/server/accounts";
import { MIA } from "@/lib/profile";

const SECRET = "test-secret-that-is-long-enough-for-hmac";

describe("passwords", () => {
  it("hashes with a salt and verifies only the right password", async () => {
    const a = await hashPassword("starlight-123");
    const b = await hashPassword("starlight-123");
    expect(a).not.toBe(b);
    expect(a).not.toContain("starlight");
    expect(await verifyPassword("starlight-123", a)).toBe(true);
    expect(await verifyPassword("starlight-124", a)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips and rejects tampering and expiry", () => {
    const token = signToken({ pid: "p_1", v: 0, exp: Date.now() + 60_000 }, SECRET);
    expect(verifyToken(token, SECRET)?.pid).toBe("p_1");
    expect(verifyToken(token, "another-secret-that-is-also-long-enough")).toBeNull();
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ pid: "p_2", v: 0, exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(verifyToken(`${body}.`, SECRET)).toBeNull();
    const old = signToken({ pid: "p_1", v: 0, exp: Date.now() - 1 }, SECRET);
    expect(verifyToken(old, SECRET)).toBeNull();
  });
});

describe("input cleaning", () => {
  it("accepts a first name, age and interests, and nothing more", () => {
    expect(cleanChildInput({ name: " Leo ", age: 5, interests: ["Dinosaurs", "dinosaurs", "volcanoes"] })).toEqual({
      name: "Leo",
      age: 5,
      interests: ["dinosaurs", "volcanoes"],
    });
    expect(cleanChildInput({ name: "Ana-María", age: "6", interests: ["the ocean"] })).toMatchObject({ name: "Ana-María", age: 6 });
    expect(cleanChildInput({ name: "Leo Smith Johnson the Third", age: 5, interests: ["x y"] })).toHaveProperty("error");
    expect(cleanChildInput({ name: "Leo", age: 12, interests: ["space"] })).toHaveProperty("error");
    expect(cleanChildInput({ name: "Leo", age: 5, interests: [] })).toHaveProperty("error");
    expect(cleanChildInput({ name: "Leo", age: 5, interests: ["a", "b", "c", "d"] })).toHaveProperty("error");
    expect(cleanChildInput({ name: "Leo", age: 5, interests: ["http://x.com"] })).toHaveProperty("error");
    expect(cleanChildInput({ name: "<script>", age: 5, interests: ["space"] })).toHaveProperty("error");
  });
  it("checks emails and passwords", () => {
    expect(cleanEmail(" Parent@Example.COM ")).toBe("parent@example.com");
    expect(cleanEmail("not an email")).toBeNull();
    expect(passwordProblem("short")).toBeTruthy();
    expect(passwordProblem("long enough")).toBeNull();
  });
});

describe("FileAccountStore", () => {
  const fresh = () => new FileAccountStore(path.join(mkdtempSync(path.join(tmpdir(), "primer-")), "accounts.json"));

  it("creates one account per email and signs in only with the right password", async () => {
    const store = fresh();
    const made = await store.createParent("p@example.com", "correct horse", "v1");
    expect("id" in made).toBe(true);
    expect(await store.createParent("p@example.com", "other password", "v1")).toEqual({ error: "exists" });
    expect(await store.verifyLogin("p@example.com", "correct horse")).toEqual(made);
    expect(await store.verifyLogin("p@example.com", "wrong horse")).toBeNull();
    expect(await store.verifyLogin("nobody@example.com", "correct horse")).toBeNull();
  });

  it("keeps children, their progress, and deletes everything on request", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "primer-")), "accounts.json");
    const store = new FileAccountStore(file);
    const made = await store.createParent("q@example.com", "correct horse", "v1");
    if (!("id" in made)) throw new Error("expected an account");
    const leo = await store.addChild(made.id, { name: "Leo", age: 5, interests: ["dinosaurs"] });
    expect(leo?.skills).toEqual(MIA.skills);
    for (let i = 0; i < 3; i++) await store.addChild(made.id, { name: `Kid${"abc"[i]}`, age: 4, interests: ["space"] });
    expect(await store.addChild(made.id, { name: "Fifth", age: 4, interests: ["space"] })).toBeNull();

    const saved = await store.saveProgress(made.id, leo!.id, {
      skills: { ...MIA.skills, "read:GO": 0.8 },
      episodeId: "lost-star",
      attempts: [{ skill: "read:GO", correct: true, hintsUsed: 0, ms: 1200 }],
    });
    expect(saved?.skills["read:GO"]).toBe(0.8);
    expect((await store.view(made.id))?.children[0].lastSession?.attempts).toHaveLength(1);

    const onDisk = readFileSync(file, "utf8");
    expect(onDisk).not.toContain("correct horse");
    expect(onDisk).toContain("scrypt$");

    expect(await store.removeChild(made.id, leo!.id)).toBe(true);
    expect((await store.view(made.id))?.children).toHaveLength(3);
    expect(await store.deleteParent(made.id)).toBe(true);
    expect(await store.view(made.id)).toBeNull();
    expect(readFileSync(file, "utf8")).not.toContain("q@example.com");
  });

  it("moves the session version on sign-out, and forgets it when the account is deleted", async () => {
    const store = fresh();
    const made = await store.createParent("s@example.com", "correct horse", "v1");
    if (!("id" in made)) throw new Error("expected an account");
    expect(await store.sessionVersion(made.id)).toBe(0);
    await store.bumpSession(made.id);
    expect(await store.sessionVersion(made.id)).toBe(1);
    await store.deleteParent(made.id);
    expect(await store.sessionVersion(made.id)).toBeNull();
  });

  it("does not lose writes that arrive at the same time", async () => {
    const store = fresh();
    const made = await store.createParent("r@example.com", "correct horse", "v1");
    if (!("id" in made)) throw new Error("expected an account");
    await Promise.all(["Ava", "Ben", "Cy"].map((name) => store.addChild(made.id, { name, age: 5, interests: ["space"] })));
    expect((await store.view(made.id))?.children.map((c) => c.name).sort()).toEqual(["Ava", "Ben", "Cy"]);
  });
});
