"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AccountChild, AccountView } from "@/lib/account-types";
import { deleteAccount, fetchAccount, removeChild, signOut, updateChild } from "@/lib/account-client";
import { setActiveProfile } from "@/lib/active-profile";
import { MIA } from "@/lib/profile";
import ChildForm from "./ChildForm";

/**
 * The family part of the grown-up page. Guests see how to keep progress across devices;
 * signed-in parents see their children, can change or remove them, sign out, or delete everything.
 */
export default function FamilyPanel() {
  const [account, setAccount] = useState<AccountView | null | undefined>(undefined);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => fetchAccount().then(setAccount);
  useEffect(() => {
    let live = true;
    fetchAccount().then((a) => live && setAccount(a));
    return () => {
      live = false;
    };
  }, []);

  if (account === undefined) return null;

  return (
    <section className="mx-auto w-full max-w-[44rem] select-text border-t border-gold/15 pb-20 pt-12">
      {account === null ? (
        <>
          <h2 className="text-xl font-semibold text-gold">Keep progress on every device</h2>
          <p className="mt-3 max-w-[36rem] text-lg leading-relaxed text-mist">
            Make a grown-up account and add your child. The book will call them by name, tell stories about what they love, and
            remember what they have learned.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href="/join" className="glow-button rounded-full px-7 py-3.5 text-lg font-bold">
              Make a grown-up account
            </Link>
            <Link href="/login" className="rounded-full px-5 py-3 text-lg font-semibold text-moon ring-1 ring-gold/40 hover:bg-gold/10">
              Sign in
            </Link>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-semibold text-gold">Your family</h2>
          <p className="mt-2 text-base text-mist">Signed in as {account.parent.email}</p>

          <ul className="mt-6 space-y-4">
            {account.children.map((c) => (
              <li key={c.id} className="rounded-3xl bg-night/50 p-5 ring-1 ring-mist/15">
                {editing === c.id ? (
                  <ChildForm
                    initial={{ name: c.name, age: c.age, interests: c.interests }}
                    submitLabel={() => "Save"}
                    onSubmit={async (draft) => {
                      const r = await updateChild(c.id, draft);
                      if (!r.ok) return r.error;
                      setEditing(null);
                      await refresh();
                      return null;
                    }}
                  />
                ) : (
                  <ChildRow
                    child={c}
                    onRead={() => setActiveProfile(c.id)}
                    onEdit={() => setEditing(c.id)}
                    onRemove={async () => {
                      const r = await removeChild(c.id);
                      if (!r.ok) return setError(r.error);
                      await refresh();
                    }}
                  />
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            {account.children.length < 4 && (
              <Link href="/join" className="rounded-full px-5 py-3 text-lg font-semibold text-moon ring-1 ring-gold/40 hover:bg-gold/10">
                Add a child
              </Link>
            )}
            <button
              onClick={async () => {
                await signOut();
                setActiveProfile(MIA.id);
                await refresh();
              }}
              className="rounded-full px-5 py-3 text-lg font-semibold text-mist hover:text-moon"
            >
              Sign out
            </button>
          </div>

          {error && <p className="mt-4 text-base text-[#ffd0d8]">{error}</p>}

          <div className="mt-10 text-sm text-mist/80">
            {confirmDelete ? (
              <p className="flex flex-wrap items-center gap-3">
                <span className="text-base text-moon">Delete this account and everything about your children? This can&apos;t be undone.</span>
                <button
                  onClick={async () => {
                    const r = await deleteAccount();
                    if (!r.ok) return setError(r.error);
                    setActiveProfile(MIA.id);
                    setConfirmDelete(false);
                    await refresh();
                  }}
                  className="rounded-full bg-[#d9788a]/20 px-4 py-2 font-semibold text-[#ffd0d8] ring-1 ring-[#d9788a]/50"
                >
                  Delete everything
                </button>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 font-semibold text-mist hover:text-moon">
                  Keep my account
                </button>
              </p>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="font-semibold underline-offset-4 hover:text-moon hover:underline">
                Delete account and all data
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function ChildRow({ child, onRead, onEdit, onRemove }: { child: AccountChild; onRead: () => void; onEdit: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const last = child.lastSession ? new Date(child.lastSession.finishedAt).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xl font-semibold text-moon">
          {child.name}, {child.age}
        </p>
        <p className="mt-1 text-base text-mist">
          Loves {child.interests.join(", ")}.{last ? ` Last story on ${last}.` : " No stories yet."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
        <Link href="/" onClick={onRead} className="rounded-full bg-gold/90 px-4 py-2 text-ink">
          Read with {child.name}
        </Link>
        <button onClick={onEdit} className="rounded-full px-3 py-2 text-moon/85 hover:text-gold">
          Edit
        </button>
        {confirm ? (
          <button onClick={onRemove} className="rounded-full px-3 py-2 text-[#ffd0d8]">
            Remove {child.name}?
          </button>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-full px-3 py-2 text-mist hover:text-moon">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
