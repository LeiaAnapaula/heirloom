import type { AccountChild, AccountView } from "./account-types";
import type { Attempt, SkillId } from "./profile";

/** Browser-side calls to the account API. Every change is JSON, same origin. */
async function send<T>(url: string, method: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? "Something went wrong. Try again.", status: res.status };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, error: "Can't reach the book right now. Check the connection and try again.", status: 0 };
  }
}

export async function fetchAccount(): Promise<AccountView | null> {
  const r = await send<AccountView | { guest: true }>("/api/account", "GET");
  return r.ok && "parent" in r.data ? r.data : null;
}

export const signUp = (email: string, password: string, consent: string) => send<{ ok: true }>("/api/auth/signup", "POST", { email, password, consent });
export const signIn = (email: string, password: string) => send<{ ok: true }>("/api/auth/login", "POST", { email, password });
export const signOut = () => send<{ ok: true }>("/api/auth/logout", "POST", {});
export const deleteAccount = () => send<{ ok: true }>("/api/account", "DELETE", {});
export const addChild = (child: { name: string; age: number; interests: string[] }) => send<AccountChild>("/api/children", "POST", child);
export const updateChild = (id: string, child: { name: string; age: number; interests: string[] }) => send<AccountChild>(`/api/children/${id}`, "PATCH", child);
export const removeChild = (id: string) => send<{ ok: true }>(`/api/children/${id}`, "DELETE", {});
export const saveProgress = (id: string, progress: { skills: Record<SkillId, number>; episodeId: string; attempts: Attempt[] }) =>
  send<AccountChild>(`/api/children/${id}/progress`, "POST", progress);
