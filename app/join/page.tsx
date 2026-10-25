import Link from "next/link";
import Starfield from "@/components/Starfield";
import JoinFlow from "@/components/account/JoinFlow";

export const metadata = { title: "Make an account | The Primer" };

export default function JoinPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center px-6 py-16">
      <Starfield density={0.6} />
      <Link href="/" className="mb-12 self-start text-lg font-semibold text-gold sm:absolute sm:left-8 sm:top-8 sm:mb-0">
        The Primer
      </Link>
      <JoinFlow />
    </main>
  );
}
