"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { signIn } from "@/lib/account-client";
import { Field, FormError, PrimaryButton } from "./fields";

export default function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Never leave an email and password sitting in a hidden page after it is left.
  useLayoutEffect(
    () => () => {
      setEmail("");
      setPassword("");
      setError(null);
      setBusy(false);
    },
    [],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await signIn(email, password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.push("/");
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-4xl font-semibold text-moon">Welcome back</h1>
      <p className="mt-3 text-lg text-mist">Sign in to pick up where your child left off.</p>
      <form onSubmit={submit} className="mt-10 space-y-6" noValidate>
        <Field label="Your email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={error} />
        <PrimaryButton type="submit" busy={busy}>
          Sign in
        </PrimaryButton>
      </form>
      <p className="mt-8 text-center text-base text-mist">
        New here?{" "}
        <Link href="/join" className="font-semibold text-gold">
          Make a grown-up account
        </Link>
      </p>
    </div>
  );
}
