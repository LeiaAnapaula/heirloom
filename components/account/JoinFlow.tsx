"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addChild, fetchAccount, signUp } from "@/lib/account-client";
import { CONSENT_TEXT, CONSENT_VERSION, cleanEmail, passwordProblem } from "@/lib/account-types";
import { setActiveProfile } from "@/lib/active-profile";
import ChildForm from "./ChildForm";
import { Field, FormError, PrimaryButton } from "./fields";

type Step = "loading" | "parent" | "child" | "done";

/**
 * A parent makes an account and agrees to the note for parents (COPPA: the grown-up
 * consents before any child data is kept), then adds a child.
 * Signed-in parents land straight on "add a child".
 */
export default function JoinFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [childName, setChildName] = useState("");

  useEffect(() => {
    fetchAccount().then((a) => setStep(a ? "child" : "parent"));
  }, []);

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanEmail(email);
    if (!clean) return setError("Please enter a real email address.");
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (!agreed) return setError("Please read and agree to the note for parents.");
    setBusy(true);
    const r = await signUp(clean, password, CONSENT_VERSION);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setError(null);
    setStep("child");
  };

  return (
    <div className="w-full max-w-md">
      {step === "loading" && <p className="text-center text-mist">Opening...</p>}

      {step === "parent" && (
        <>
          <h1 className="text-4xl font-semibold text-moon">Make a grown-up account</h1>
          <p className="mt-3 text-lg text-mist">So the book remembers what your child has learned, on any device you sign in on.</p>
          <form onSubmit={createAccount} className="mt-10 space-y-6" noValidate>
            <Field label="Your email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div>
              <Field
                label="Password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="At least 8 characters."
              />
              <button type="button" onClick={() => setShowPassword((s) => !s)} className="mt-2 text-sm font-semibold text-gold">
                {showPassword ? "Hide password" : "Show password"}
              </button>
            </div>

            <div className="rounded-2xl bg-night/50 p-5 ring-1 ring-gold/25">
              <p className="text-base font-semibold text-moon">A note for parents</p>
              <p className="mt-2 text-base leading-relaxed text-mist">{CONSENT_TEXT}</p>
              <label className="mt-4 flex cursor-pointer items-center gap-3 text-base font-semibold text-moon">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="h-6 w-6 accent-[#f5c969]" />I agree
              </label>
            </div>

            <FormError message={error} />
            <PrimaryButton type="submit" busy={busy}>
              Create account
            </PrimaryButton>
          </form>
          <p className="mt-8 text-center text-base text-mist">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-gold">
              Sign in
            </Link>
          </p>
        </>
      )}

      {step === "child" && (
        <>
          <h1 className="text-4xl font-semibold text-moon">Who is reading?</h1>
          <p className="mt-3 text-lg text-mist">The book calls your child by name and tells stories about what they love.</p>
          <div className="mt-10">
            <ChildForm
              submitLabel={(n) => (n ? `Add ${n}` : "Add child")}
              onSubmit={async (child) => {
                const r = await addChild(child);
                if (!r.ok) return r.error;
                setActiveProfile(r.data.id);
                setChildName(r.data.name);
                setStep("done");
                return null;
              }}
            />
          </div>
        </>
      )}

      {step === "done" && (
        <div className="text-center">
          <h1 className="text-4xl font-semibold text-moon">All set</h1>
          <p className="mt-3 text-lg text-mist">The book is ready for {childName}.</p>
          <div className="mt-10 space-y-4">
            <PrimaryButton type="button" onClick={() => router.push("/")}>
              Go to the book
            </PrimaryButton>
            <button type="button" onClick={() => setStep("child")} className="w-full rounded-full px-6 py-3 text-lg font-semibold text-moon ring-1 ring-gold/40">
              Add another child
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
