import Link from "next/link";
import OpenBookButton from "@/components/OpenBookButton";
import { ReaderPicker, ReaderTitle } from "@/components/ReaderPicker";
import Starfield from "@/components/Starfield";
import { lostStar } from "@/content/episodes/lost-star";

export default function TitleScreen() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <Starfield />

      <h1
        className="bg-gradient-to-b from-[#fff4d6] via-gold to-gold-deep bg-clip-text text-6xl font-semibold tracking-tight text-transparent drop-shadow-[0_0_28px_rgba(245,201,105,0.35)] sm:text-8xl"
      >
        The Primer
      </h1>
      <ReaderTitle title={lostStar.title} />

      <OpenBookButton href={`/episode/${lostStar.id}`} />
      <ReaderPicker />

      <Link
        href="/parent"
        className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-6 rounded-full px-4 py-3 text-sm font-medium text-mist/90 transition-colors hover:text-moon"
      >
        For grown-ups
      </Link>
    </main>
  );
}
