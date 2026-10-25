import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";
import "./globals.css";

// One rounded, modern family for everything: calm at body sizes,
// clear and friendly at the giant sizes we use for reading words.
const quicksand = Quicksand({
  variable: "--font-quicksand",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The Primer",
  description: "A storybook that wakes up, reads with your child, and listens back.",
  appleWebApp: {
    capable: true,
    title: "The Primer",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f2a",
  width: "device-width",
  initialScale: 1,
  // Small fingers pinch by accident; the book is already sized for the screen.
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${quicksand.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
