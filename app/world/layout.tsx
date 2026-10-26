import type { Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";

// Heirloom's two voices: Fraunces for Grandpa's words, Nunito for everything you tap.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "opsz"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["500", "700", "800"] });

// Pinch zoom stays off here, as in the book: in the world a two-finger pinch walks forward and
// back, and small hands pinch by accident. Browser zoom on a laptop still works, iPad Safari
// zooms anyway, and Android's own "Force enable zoom" setting still overrides this.
export const viewport: Viewport = { maximumScale: 1, userScalable: false };

export default function WorldLayout({ children }: LayoutProps<"/world">) {
  return <div className={`${fraunces.variable} ${nunito.variable}`}>{children}</div>;
}
