"use client";

import { useState } from "react";
import { cleanChildInput } from "@/lib/account-types";
import { Field, FormError, Pill, PrimaryButton } from "./fields";

const IDEAS = ["space", "dinosaurs", "the ocean", "animals", "trucks", "music", "drawing", "bugs", "castles", "trains"];
const AGES = [3, 4, 5, 6, 7, 8];

export type ChildDraft = { name: string; age: number; interests: string[] };

/**
 * First name, age, and up to three loves. That is everything the book ever knows about a child,
 * and the interests are what the story brain weaves into the narration.
 */
export default function ChildForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ChildDraft;
  submitLabel: (name: string) => string;
  onSubmit: (child: ChildDraft) => Promise<string | null>; // resolves to an error message, or null when saved
  onCancel?: () => void; // when given, a Cancel button sits beside the submit button
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [age, setAge] = useState<number | null>(initial?.age ?? null);
  const [interests, setInterests] = useState<string[]>(initial?.interests ?? []);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (i: string) =>
    setInterests((list) => (list.includes(i) ? list.filter((x) => x !== i) : list.length < 3 ? [...list, i] : list));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const all = other.trim() ? [...interests, other.trim().toLowerCase()].slice(0, 3) : interests;
    const clean = cleanChildInput({ name, age, interests: all });
    if ("error" in clean) return setError(clean.error);
    setBusy(true);
    setError(await onSubmit(clean));
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <Field label="Your child's first name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={20} placeholder="First name only" />

      <fieldset>
        <legend className="mb-3 text-base font-semibold text-moon">Age</legend>
        <div className="flex flex-wrap gap-3">
          {AGES.map((a) => (
            <Pill key={a} size="lg" selected={age === a} onClick={() => setAge(a)}>
              {a}
            </Pill>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-base font-semibold text-moon">What does {name.trim() || "your child"} love?</legend>
        <p className="mb-3 text-sm text-mist">Pick up to three. The story is woven around them.</p>
        <div className="flex flex-wrap gap-2.5">
          {IDEAS.map((i) => (
            <Pill key={i} selected={interests.includes(i)} onClick={() => toggle(i)}>
              {i}
            </Pill>
          ))}
        </div>
        <div className="mt-4">
          <Field label="Something else" value={other} onChange={(e) => setOther(e.target.value)} maxLength={30} placeholder="For example: volcanoes" />
        </div>
      </fieldset>

      <FormError message={error} />
      <div className="flex items-center gap-3">
        <PrimaryButton type="submit" busy={busy}>
          {submitLabel(name.trim())}
        </PrimaryButton>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="shrink-0 rounded-full px-5 py-3 text-lg font-semibold text-mist hover:text-moon disabled:opacity-60"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
