import Link from "next/link";

// Placeholder until M7 builds the real summary.
export default function ParentPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-ink px-6 text-center">
      <p className="text-2xl font-semibold text-moon">The grown-up summary is coming soon.</p>
      <Link href="/" className="text-lg font-semibold text-gold">Back to the book</Link>
    </main>
  );
}
