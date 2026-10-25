import type { Metadata } from "next";
import ParentSummary from "@/components/ParentSummary";
import Starfield from "@/components/Starfield";

export const metadata: Metadata = {
  title: "For grown-ups | The Primer",
};

// No request data here, ever. The parent check and the results render in the browser,
// from this device, so the whole route stays a static page.
export const ensureStatic = "navigation";

export default function ParentPage() {
  return (
    <main className="relative isolate min-h-dvh px-4 sm:px-6">
      <Starfield density={0.8} />
      <ParentSummary />
    </main>
  );
}
