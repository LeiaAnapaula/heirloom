import Link from "next/link";
import Starfield from "@/components/Starfield";
import SignInForm from "@/components/account/SignInForm";

export const metadata = { title: "Sign in | The Primer" };

export default function LoginPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center px-6 py-16 sm:justify-center">
      <Starfield density={0.6} />
      <Link href="/" className="mb-12 self-start text-lg font-semibold text-gold sm:absolute sm:left-8 sm:top-8 sm:mb-0">
        The Primer
      </Link>
      <SignInForm />
    </main>
  );
}
