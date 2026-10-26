import { Fraunces, Nunito } from "next/font/google";

// Heirloom's two voices: Fraunces for Grandpa's words, Nunito for everything you tap.
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], style: ["normal", "italic"], axes: ["SOFT", "opsz"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["500", "700", "800"] });

export default function WorldLayout({ children }: LayoutProps<"/world">) {
  return <div className={`${fraunces.variable} ${nunito.variable}`}>{children}</div>;
}
