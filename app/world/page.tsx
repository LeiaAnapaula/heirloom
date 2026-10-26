import type { Metadata } from "next";
import WorldApp from "@/components/world/WorldApp";

export const metadata: Metadata = {
  title: "Heirloom | The world Grandpa and I built",
  description: "Grandpa's story as a 3D world the child can walk through and build in.",
};

// Nothing here depends on the request: the world loads and runs in the browser.
export const ensureStatic = "navigation";

export default function WorldPage() {
  return <WorldApp />;
}
