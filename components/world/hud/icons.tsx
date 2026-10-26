import type { BuildKind } from "../config";

/**
 * Every picture the HUD uses, in one place. Line icons are 24 x 24, drawn in
 * currentColor so they follow the text. Build pictures are small colored
 * drawings, the same hand as the Heirloom demo page.
 */

type IconProps = { className?: string };

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Svg({ className = "h-5 w-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...line}>
      {children}
    </svg>
  );
}

export const Icon = {
  up: (p: IconProps) => <Svg {...p}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>,
  down: (p: IconProps) => <Svg {...p}><path d="M12 5v14M6 13l6 6 6-6" /></Svg>,
  left: (p: IconProps) => <Svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></Svg>,
  right: (p: IconProps) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>,
  turnLeft: (p: IconProps) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></Svg>,
  turnRight: (p: IconProps) => <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" /></Svg>,
  rise: (p: IconProps) => <Svg {...p}><path d="M12 15V4M8 8l4-4 4 4M5 20h14" /></Svg>,
  sink: (p: IconProps) => <Svg {...p}><path d="M12 4v11M8 11l4 4 4-4M5 20h14" /></Svg>,
  home: (p: IconProps) => <Svg {...p}><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /><path d="M10 20v-5h4v5" /></Svg>,
  sunrise: (p: IconProps) => <Svg {...p}><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M5 8l1.5 1.5M19 8l-1.5 1.5" /></Svg>,
  sun: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>,
  sunset: (p: IconProps) => <Svg {...p}><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 10V3M9 6l3 3 3-3" /></Svg>,
  moon: (p: IconProps) => <Svg {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Svg>,
  rotate: (p: IconProps) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></Svg>,
  remove: (p: IconProps) => <Svg {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>,
  plus: (p: IconProps) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>,
  minus: (p: IconProps) => <Svg {...p}><path d="M5 12h14" /></Svg>,
  play: (p: IconProps) => <Svg {...p}><path d="M8 5v14l11-7z" fill="currentColor" stroke="none" /></Svg>,
  pause: (p: IconProps) => <Svg {...p}><path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none" /></Svg>,
  speaker: (p: IconProps) => <Svg {...p}><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></Svg>,
  envelope: (p: IconProps) => <Svg {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="m4 8 8 6 8-6" /></Svg>,
  build: (p: IconProps) => <Svg {...p}><path d="M14 4 20 10M12 6l6 6-8 8H4v-6z" /></Svg>,
  explore: (p: IconProps) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></Svg>,
  check: (p: IconProps) => <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>,
  close: (p: IconProps) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>,
  ruler: (p: IconProps) => <Svg {...p}><path d="M3 16 16 3l5 5L8 21z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" /></Svg>,
  height: (p: IconProps) => <Svg {...p}><path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" /></Svg>,
  pin: (p: IconProps) => <Svg {...p}><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></Svg>,
  place: (p: IconProps) => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5" /><ellipse cx="12" cy="19" rx="7" ry="2" /></Svg>,
  sparkle: (p: IconProps) => <Svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" /></Svg>,
};

const pictures: Record<BuildKind, React.ReactNode> = {
  bridge: (
    <>
      <path d="M4 46c10-4 18-4 28 0s18 4 28 0v8H4z" fill="#5f8296" opacity=".85" />
      <path d="M6 38c8-14 44-14 52 0" fill="none" stroke="#8a5a3b" strokeWidth="5" strokeLinecap="round" />
      <path d="M4 38h56" stroke="#8a5a3b" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 30v8M32 27v11M46 30v8" stroke="#8a5a3b" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  garden: (
    <>
      <path d="M6 52c14-6 38-6 52 0v4H6z" fill="#7f9c6f" />
      <g stroke="#4f7a4a" strokeWidth="3" strokeLinecap="round">
        <path d="M18 50V34M32 50V28M46 50V34" />
      </g>
      <g fill="#e3a83d">
        <circle cx="18" cy="30" r="6" />
        <circle cx="32" cy="24" r="7" />
        <circle cx="46" cy="30" r="6" />
      </g>
      <g fill="#fff3d6">
        <circle cx="18" cy="30" r="2" />
        <circle cx="32" cy="24" r="2.5" />
        <circle cx="46" cy="30" r="2" />
      </g>
    </>
  ),
  house: (
    <>
      <path d="M10 30 32 12l22 18" fill="none" stroke="#6b4329" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 29h34v25H15z" fill="#a8734e" />
      <path d="M27 54V41h10v13" fill="#6b4329" />
      <rect x="19" y="34" width="7" height="6" rx="1" fill="#f6e2b5" />
      <rect x="39" y="34" width="7" height="6" rx="1" fill="#f6e2b5" />
      <g fill="#c8574a">
        <circle cx="20" cy="42" r="2" />
        <circle cx="24" cy="42" r="2" />
        <circle cx="40" cy="42" r="2" />
        <circle cx="44" cy="42" r="2" />
      </g>
    </>
  ),
  treehouse: (
    <>
      <circle cx="32" cy="22" r="18" fill="#7f9c6f" />
      <circle cx="20" cy="28" r="10" fill="#6f8e5f" />
      <circle cx="45" cy="27" r="11" fill="#6f8e5f" />
      <path d="M29 56V34h6v22" fill="#6b4329" />
      <path d="M22 34l10-9 10 9" fill="none" stroke="#6b4329" strokeWidth="3" strokeLinejoin="round" />
      <rect x="24" y="33" width="16" height="10" rx="1.5" fill="#a8734e" />
      <rect x="29" y="36" width="6" height="4" rx="1" fill="#f6e2b5" />
      <path d="M40 43v13M44 43v13M40 47h4M40 51h4" stroke="#8a5a3b" strokeWidth="1.6" />
    </>
  ),
  lantern: (
    <>
      <path d="M32 10v8" stroke="#5e3c26" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="34" r="16" fill="#e3a83d" opacity=".25" />
      <rect x="24" y="20" width="16" height="22" rx="4" fill="#e3a83d" />
      <rect x="22" y="17" width="20" height="5" rx="2" fill="#5e3c26" />
      <rect x="22" y="41" width="20" height="5" rx="2" fill="#5e3c26" />
      <path d="M32 46v10M26 56h12" stroke="#5e3c26" strokeWidth="3" strokeLinecap="round" />
      <rect x="29" y="25" width="6" height="12" rx="3" fill="#fff3d6" />
    </>
  ),
  bench: (
    <>
      <rect x="8" y="22" width="48" height="7" rx="2" fill="#b07a52" />
      <rect x="8" y="34" width="48" height="7" rx="2" fill="#b07a52" />
      <path d="M14 29v5M50 29v5M14 41v13M50 41v13" stroke="#5e3c26" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  boat: (
    <>
      <path d="M4 50c10-4 18-4 28 0s18 4 28 0v6H4z" fill="#5f8296" opacity=".85" />
      <path d="M8 36h48l-7 12H15z" fill="#8a5a3b" />
      <path d="M8 36h48" stroke="#5e3c26" strokeWidth="3" strokeLinecap="round" />
      <path d="M22 40v5M42 40v5" stroke="#b07a52" strokeWidth="3" strokeLinecap="round" />
      <path d="M38 18 52 46" stroke="#5e3c26" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  tree: (
    <>
      <path d="M29 56V36h6v20" fill="#6b4329" />
      <circle cx="32" cy="24" r="15" fill="#6f8e5f" />
      <circle cx="21" cy="31" r="9" fill="#7f9c6f" />
      <circle cx="43" cy="30" r="10" fill="#7f9c6f" />
      <path d="M14 56h36" stroke="#7f9c6f" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
};

/** The colored drawing for something a child can build. */
export function BuildPicture({ kind, className = "h-10 w-10" }: { kind: BuildKind; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      {pictures[kind]}
    </svg>
  );
}
