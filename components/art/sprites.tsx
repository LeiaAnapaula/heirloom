/**
 * The cast, drawn as SVG so it stays crisp on a tablet. Each sprite keeps a fixed
 * viewBox and props so the scenes can move them around without caring how they look.
 */

type SpriteProps = { className?: string; style?: React.CSSProperties };

/** Points up. viewBox 0 0 60 120; the nozzle is at (30, 100). */
export function Rocket({ className, style, flame = false }: SpriteProps & { flame?: boolean }) {
  return (
    <svg viewBox="0 0 60 120" className={className} style={style} aria-hidden>
      <defs>
        <linearGradient id="rocket-body" x1="0" x2="1">
          <stop offset="0%" stopColor="#d9d3c2" />
          <stop offset="45%" stopColor="#fbf6e9" />
          <stop offset="100%" stopColor="#bfb7a3" />
        </linearGradient>
        <radialGradient id="rocket-flame" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#fff6d6" />
          <stop offset="45%" stopColor="#f5c969" />
          <stop offset="100%" stopColor="#d99a2b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {flame && <ellipse cx="30" cy="108" rx="9" ry="16" fill="url(#rocket-flame)" />}
      <path d="M14 70 L4 92 L16 88 Z" fill="#d99a2b" />
      <path d="M46 70 L56 92 L44 88 Z" fill="#d99a2b" />
      <path d="M30 4 C44 18 48 44 46 88 L14 88 C12 44 16 18 30 4 Z" fill="url(#rocket-body)" />
      <path d="M30 4 C36 10 40 18 42 26 L18 26 C20 18 24 10 30 4 Z" fill="#f5c969" />
      <circle cx="30" cy="46" r="8" fill="#1e2a5e" stroke="#f5c969" strokeWidth="2.5" />
      <circle cx="27.5" cy="43.5" r="2.4" fill="#a9b8e8" opacity="0.8" />
      <rect x="20" y="88" width="20" height="8" rx="2" fill="#8d8572" />
    </svg>
  );
}

/** The lost star. viewBox 0 0 100 100, centered. */
export function StarSprite({ className, style, glow = true }: SpriteProps & { glow?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <radialGradient id="star-halo">
          <stop offset="0%" stopColor="#fff1c4" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#f5c969" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f5c969" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="star-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff4cf" />
          <stop offset="100%" stopColor="#f2bd4e" />
        </linearGradient>
      </defs>
      {glow && <circle cx="50" cy="50" r="62" fill="url(#star-halo)" />}
      <path
        d="M50 12 C53 30 57 36 62 38 C70 40 80 40 88 41 C80 47 72 52 68 57 C66 62 70 76 73 86 C64 80 56 75 50 75 C44 75 36 80 27 86 C30 76 34 62 32 57 C28 52 20 47 12 41 C20 40 30 40 38 38 C43 36 47 30 50 12 Z"
        fill="url(#star-fill)"
        stroke="#fff6dc"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const PLANET_HUES: Record<string, [string, string, string]> = {
  rose: ["#f7b8a8", "#d9788a", "#7a3a62"],
  teal: ["#a8eadf", "#4fb3b0", "#1f5a6e"],
  violet: ["#cdb8ff", "#8a6ee0", "#3b2f7a"],
  amber: ["#ffe2a3", "#e8a94b", "#8a5420"],
  sky: ["#bfe0ff", "#6aa2e8", "#2b4a8a"],
};
export type PlanetHue = keyof typeof PLANET_HUES;

/** viewBox 0 0 100 100. `lit` makes it glow; unlit planets sit quietly in shadow. */
export function Planet({ className, style, hue = "teal", lit = false, ring = false }: SpriteProps & { hue?: PlanetHue; lit?: boolean; ring?: boolean }) {
  const [hi, mid, lo] = PLANET_HUES[hue];
  const id = `planet-${hue}`;
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden overflow="visible">
      <defs>
        <radialGradient id={`${id}-fill`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor={hi} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={lo} />
        </radialGradient>
        <radialGradient id={`${id}-glow`}>
          <stop offset="55%" stopColor={hi} stopOpacity="0.55" />
          <stop offset="100%" stopColor={hi} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="58" fill={`url(#${id}-glow)`} style={{ opacity: lit ? 1 : 0, transition: "opacity 500ms" }} />
      <g style={{ filter: lit ? "none" : "saturate(0.35) brightness(0.45)", transition: "filter 500ms" }}>
        {ring && <ellipse cx="50" cy="50" rx="62" ry="14" fill="none" stroke={hi} strokeWidth="4" opacity="0.7" transform="rotate(-18 50 50)" />}
        <circle cx="50" cy="50" r="36" fill={`url(#${id}-fill)`} />
        <path d="M22 44 C38 40 62 48 78 42" stroke={hi} strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
        <path d="M24 60 C40 56 60 64 76 58" stroke={lo} strokeWidth="3" fill="none" opacity="0.35" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** viewBox 0 0 40 120, quill pointing down. */
export function Feather({ className, style }: SpriteProps) {
  return (
    <svg viewBox="0 0 40 120" className={className} style={style} aria-hidden>
      <path d="M20 4 C34 22 36 56 26 92 L20 116 L14 92 C4 56 6 22 20 4 Z" fill="#f7f0dc" opacity="0.95" />
      <path d="M20 8 L20 116" stroke="#d9c9a0" strokeWidth="1.6" />
      {[24, 36, 48, 60, 72, 84].map((y) => (
        <g key={y} stroke="#d9c9a0" strokeWidth="0.9" opacity="0.7">
          <path d={`M20 ${y} L${9 + y / 12} ${y - 7}`} />
          <path d={`M20 ${y} L${31 - y / 12} ${y - 7}`} />
        </g>
      ))}
    </svg>
  );
}

/** The magic pencil. viewBox 0 0 40 120; the tip is at (20, 118). */
export function Pencil({ className, style }: SpriteProps) {
  return (
    <svg viewBox="0 0 40 120" className={className} style={style} aria-hidden overflow="visible">
      <circle cx="20" cy="118" r="7" fill="#f5c969" opacity="0.45" />
      <path d="M12 20 L28 20 L28 92 L20 118 L12 92 Z" fill="#f5c969" />
      <path d="M12 20 L20 20 L20 118 L12 92 Z" fill="#d99a2b" />
      <path d="M12 92 L28 92 L20 118 Z" fill="#f7f0dc" />
      <path d="M17.5 110 L22.5 110 L20 118 Z" fill="#3b3478" />
      <rect x="12" y="8" width="16" height="12" rx="3" fill="#a9b8e8" />
      <path d="M20 0 L22 5 L27 5 L23 8 L24.5 13 L20 10 L15.5 13 L17 8 L13 5 L18 5 Z" fill="#fff1c9" />
    </svg>
  );
}
