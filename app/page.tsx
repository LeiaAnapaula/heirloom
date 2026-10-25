import Link from "next/link";
import OpenBookButton from "@/components/OpenBookButton";
import Starfield from "@/components/Starfield";

export default function TitleScreen() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <Starfield />

      <h1
        className="bg-gradient-to-b from-[#fff4d6] via-gold to-gold-deep bg-clip-text text-6xl font-semibold tracking-tight text-transparent drop-shadow-[0_0_28px_rgba(245,201,105,0.35)] sm:text-8xl"
      >
        The Primer
      </h1>
      <p className="mt-4 text-xl font-medium text-mist sm:text-2xl">Mia and the Lost Star</p>

      <OpenBookButton href="/episode/lost-star" />

      <Link
        href="/parent"
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-6 rounded-full px-3 py-2 text-sm font-medium text-mist/70 transition-colors hover:text-moon"
      >
        For grown-ups
      </Link>
    </main>
  );
}
