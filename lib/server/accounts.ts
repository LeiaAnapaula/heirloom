import { promises as fs } from "node:fs";
import path from "node:path";
import type { AccountChild, AccountView } from "../account-types";
import { MIA, type Attempt, type SkillId } from "../profile";
import { hashPassword, newId, verifyPassword } from "./auth-crypto";

/**
 * Where parent accounts live. The demo keeps them in a JSON file on this machine;
 * a hosted database (Supabase is the plan) implements the same interface later,
 * and nothing above this file changes.
 */
export interface AccountStore {
  createParent(email: string, password: string, consentVersion: string): Promise<{ id: string } | { error: "exists" }>;
  verifyLogin(email: string, password: string): Promise<{ id: string } | null>;
  view(parentId: string): Promise<AccountView | null>;
  addChild(parentId: string, child: { name: string; age: number; interests: string[] }): Promise<AccountChild | null>;
  updateChild(parentId: string, childId: string, patch: Partial<{ name: string; age: number; interests: string[] }>): Promise<AccountChild | null>;
  saveProgress(parentId: string, childId: string, progress: { skills: Record<SkillId, number>; episodeId: string; attempts: Attempt[] }): Promise<AccountChild | null>;
  removeChild(parentId: string, childId: string): Promise<boolean>;
  deleteParent(parentId: string): Promise<boolean>;
}

type StoredChild = AccountChild & { createdAt: number };
type StoredParent = {
  id: string;
  email: string;
  passwordHash: string;
  consent: { version: string; at: number };
  createdAt: number;
  children: StoredChild[];
};
type FileShape = { version: 1; parents: StoredParent[] };

const MAX_CHILDREN = 4;

// A new child starts where the demo calibration starts; the update rule takes it from there.
const BASELINE_SKILLS: Record<SkillId, number> = { ...MIA.skills };

/** Only what the browser may see: never the password hash or bookkeeping fields. */
function publicChild(c: StoredChild): AccountChild {
  return { id: c.id, name: c.name, age: c.age, interests: c.interests, skills: c.skills, lastSession: c.lastSession };
}

function toView(p: StoredParent): AccountView {
  return { parent: { email: p.email, createdAt: p.createdAt }, children: p.children.map(publicChild) };
}

export class FileAccountStore implements AccountStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private file: string) {}

  private async read(): Promise<FileShape> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as FileShape;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, parents: [] };
      throw e;
    }
  }

  private async write(data: FileShape) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await fs.rename(tmp, this.file); // atomic swap: a crash never leaves half a file
  }

  /** One change at a time, so two requests can't overwrite each other. */
  private change<T>(fn: (data: FileShape) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const data = await this.read();
      const out = await fn(data);
      await this.write(data);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async createParent(email: string, password: string, consentVersion: string): Promise<{ id: string } | { error: "exists" }> {
    const passwordHash = await hashPassword(password);
    return this.change<{ id: string } | { error: "exists" }>((data) => {
      if (data.parents.some((p) => p.email === email)) return { error: "exists" };
      const now = Date.now();
      const parent: StoredParent = { id: newId("p"), email, passwordHash, consent: { version: consentVersion, at: now }, createdAt: now, children: [] };
      data.parents.push(parent);
      return { id: parent.id };
    });
  }

  async verifyLogin(email: string, password: string) {
    const parent = (await this.read()).parents.find((p) => p.email === email);
    // Hash even when the email is unknown, so timing doesn't reveal which emails have accounts.
    const ok = await verifyPassword(password, parent?.passwordHash ?? "scrypt$00$00");
    return parent && ok ? { id: parent.id } : null;
  }

  async view(parentId: string) {
    const parent = (await this.read()).parents.find((p) => p.id === parentId);
    return parent ? toView(parent) : null;
  }

  addChild(parentId: string, child: { name: string; age: number; interests: string[] }) {
    return this.change((data) => {
      const parent = data.parents.find((p) => p.id === parentId);
      if (!parent || parent.children.length >= MAX_CHILDREN) return null;
      const stored: StoredChild = { id: newId("c"), ...child, skills: { ...BASELINE_SKILLS }, lastSession: null, createdAt: Date.now() };
      parent.children.push(stored);
      return publicChild(stored);
    });
  }

  updateChild(parentId: string, childId: string, patch: Partial<{ name: string; age: number; interests: string[] }>) {
    return this.change((data) => {
      const child = data.parents.find((p) => p.id === parentId)?.children.find((c) => c.id === childId);
      if (!child) return null;
      Object.assign(child, patch);
      return publicChild(child);
    });
  }

  saveProgress(parentId: string, childId: string, progress: { skills: Record<SkillId, number>; episodeId: string; attempts: Attempt[] }) {
    return this.change((data) => {
      const child = data.parents.find((p) => p.id === parentId)?.children.find((c) => c.id === childId);
      if (!child) return null;
      child.skills = progress.skills;
      child.lastSession = { finishedAt: Date.now(), episodeId: progress.episodeId, attempts: progress.attempts };
      return publicChild(child);
    });
  }

  removeChild(parentId: string, childId: string) {
    return this.change((data) => {
      const parent = data.parents.find((p) => p.id === parentId);
      if (!parent) return false;
      const before = parent.children.length;
      parent.children = parent.children.filter((c) => c.id !== childId);
      return parent.children.length < before;
    });
  }

  deleteParent(parentId: string) {
    return this.change((data) => {
      const before = data.parents.length;
      data.parents = data.parents.filter((p) => p.id !== parentId);
      return data.parents.length < before;
    });
  }
}

let store: AccountStore | null = null;

/** The one store the app uses. .data/ is gitignored. */
export function accounts(): AccountStore {
  store ??= new FileAccountStore(process.env.PRIMER_ACCOUNTS_FILE ?? path.join(process.cwd(), ".data", "accounts.json"));
  return store;
}
