"use client";

import { useId } from "react";

/**
 * The postcard's own drawings: the stamp, the postmark, the envelope it flies
 * away in, Grandpa's teacup, and two quiet pictures for when there is no
 * snapshot to show. Same hand and colors as the build pictures in icons.tsx.
 */

type ArtProps = { className?: string };

/** SVG ids must be unique on the page and safe inside url(#...). */
function useSvgId(): string {
  return `pc${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Perforation holes around the stamp's edge, every few units. */
const HOLES: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let x = 4; x <= 56.1; x += 5.2) out.push([x, 4], [x, 68]);
  for (let y = 9.4; y <= 63; y += 5.4) out.push([4, y], [56, y]);
  return out;
})();

/** A little stamp of Grandpa's village: the river, the hill, and the bridge he wished for. */
export function Stamp({ className }: ArtProps) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 60 72" className={className} aria-hidden>
      <defs>
        <mask id={`${id}-perf`}>
          <rect width="60" height="72" fill="#fff" />
          {HOLES.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="#000" />
          ))}
        </mask>
        <clipPath id={`${id}-art`}>
          <rect x="9" y="9" width="42" height="54" rx="2" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="56" height="68" fill="#fffdf7" mask={`url(#${id}-perf)`} />
      <g clipPath={`url(#${id}-art)`}>
        <rect x="9" y="9" width="42" height="54" fill="#f6e3b9" />
        <circle cx="39" cy="21" r="5.5" fill="#e3a83d" />
        <path d="M9 41c7-6 13-8 20-5s13 2 22-4v31H9z" fill="#9fb88f" />
        <path d="M9 48c8-4 14-3 21 0s14 2 21-2v17H9z" fill="#6f8e5f" />
        <path d="M14 46v-5l4.5-3.6L23 41v5z" fill="#a8734e" />
        <path d="M13 41.6l5.5-4.6 5.5 4.6" fill="none" stroke="#6b4329" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="18.5" cy="43" r="1.1" fill="#c8574a" />
        <path d="M9 55c7-2 14-2 21 0s14 2 21 0v8H9z" fill="#5f8296" />
        <path d="M13 58c4-8 30-8 34 0" fill="none" stroke="#8a5a3b" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 52h36" stroke="#8a5a3b" strokeWidth="2" strokeLinecap="round" />
        <path d="M21 52v3.6M30 52v2.4M39 52v3.6" stroke="#8a5a3b" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M13.6 14.3c0-1.5 1.9-2.1 2.7-.7.8-1.4 2.7-.8 2.7.7 0 1.7-2.7 3.3-2.7 3.3s-2.7-1.6-2.7-3.3z" fill="#c8574a" />
      </g>
      <rect x="9" y="9" width="42" height="54" rx="2" fill="none" stroke="#2c3a32" strokeOpacity=".14" />
    </svg>
  );
}

/** The round postmark that thumps onto the stamp when the card is sent. */
export function Postmark({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 74 44" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <circle cx="52" cy="22" r="17" strokeWidth="1.8" />
        <circle cx="52" cy="22" r="12" strokeWidth="1.1" strokeDasharray="2.4 2.2" />
        <path d="M2 13c4-3 8-3 12 0s8 3 12 0 8-3 10-1.5M2 22c4-3 8-3 12 0s8 3 12 0 8-3 9.5-1.2M2 31c4-3 8-3 12 0s8 3 12 0 8-3 10-1.5" strokeWidth="1.8" />
      </g>
      <path d="M47.6 20.6c0-2.2 2.9-3.1 4.4-1 1.5-2.1 4.4-1.2 4.4 1 0 2.6-4.4 5.1-4.4 5.1s-4.4-2.5-4.4-5.1z" fill="currentColor" />
    </svg>
  );
}

/*
 * The envelope comes in four layers so the card can slide in and the flap can
 * close over it. 220 x 150. The closed flap reaches lower than the pocket's V
 * everywhere, so no corner of the card can peek out between them.
 */

export function EnvelopeBack({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden>
      <rect x="1" y="1" width="218" height="148" rx="9" fill="#e2c790" stroke="#c9a76c" strokeWidth="2" />
    </svg>
  );
}

export function EnvelopePocket({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden>
      <path d="M1 3l109 89L219 3v137a9 9 0 0 1-9 9H10a9 9 0 0 1-9-9z" fill="#f6e2b5" />
      <path d="M4 146l92-62M216 146l-92-62" stroke="#dcc08a" strokeWidth="2" strokeLinecap="round" />
      <path d="M1 3l109 89L219 3v137a9 9 0 0 1-9 9H10a9 9 0 0 1-9-9z" fill="none" stroke="#c9a76c" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export function EnvelopeFlap({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden>
      <path d="M2 2h216l-97.5 89.5a15 15 0 0 1-21 0z" fill="#efd7a6" stroke="#c9a76c" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

/** A tiny heart for the puff of joy where the envelope takes off. */
export function Heart({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path d="M2.5 6.2c0-3 3.9-4.1 5.5-1.4 1.6-2.7 5.5-1.6 5.5 1.4 0 3.4-5.5 6.8-5.5 6.8S2.5 9.6 2.5 6.2z" fill="currentColor" />
    </svg>
  );
}

/** A red wax seal with a heart, pressed where the flap closes. */
export function Seal({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#c8574a" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2" />
      <path d="M11 14.6c0-2.6 3.4-3.6 5-1.2 1.6-2.4 5-1.4 5 1.2 0 3-5 5.9-5 5.9s-5-2.9-5-5.9z" fill="#fff" />
    </svg>
  );
}

/** Grandpa's morning tea, a small cup with a curl of steam. */
export function Teacup({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 44 44" className={className} aria-hidden>
      <ellipse cx="21" cy="37" rx="15" ry="3.6" fill="#fffdf7" stroke="#8a5a3b" strokeWidth="2" />
      <path d="M9 21h24v4a12 12 0 0 1-24 0z" fill="#fffdf7" stroke="#8a5a3b" strokeWidth="2" strokeLinejoin="round" />
      <path d="M33 24h2.5a4 4 0 0 1 0 8H31" fill="none" stroke="#8a5a3b" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 22.6h20" stroke="#e3a83d" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17 16c-2-2.4 2-3.6 0-6.4M24 16c-2-2.4 2-3.6 0-6.4" fill="none" stroke="#5f8296" strokeOpacity=".7" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/**
 * When the world could not be photographed: a gentle drawing of the river
 * valley instead, with the bridge across it if the child built one.
 */
export function FallbackScene({ className, bridge }: ArtProps & { bridge?: boolean }) {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 300 200" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d7e5ec" />
          <stop offset="1" stopColor="#f5efdf" />
        </linearGradient>
      </defs>
      <rect width="300" height="200" fill={`url(#${id}-sky)`} />
      <circle cx="226" cy="52" r="20" fill="#e3a83d" opacity=".85" />
      <path d="M0 108c40-26 82-34 126-22s92 10 174-24v138H0z" fill="#a9bf9a" />
      <path d="M0 130c52-18 104-20 150-8s96 10 150-6v84H0z" fill="#7f9c6f" />
      <g>
        <path d="M58 118v-16l13-11 13 11v16z" fill="#a8734e" />
        <path d="M55 103l16-13 16 13" fill="none" stroke="#6b4329" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="66" y="105" width="9" height="7" rx="1" fill="#f6e2b5" />
        <circle cx="67" cy="114" r="1.8" fill="#c8574a" />
        <circle cx="74" cy="114" r="1.8" fill="#c8574a" />
        <path d="M202 112v-13l10-9 10 9v13z" fill="#a8734e" />
        <path d="M200 100l12-10 12 10" fill="none" stroke="#6b4329" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <path d="M0 160c50-10 100-10 150 0s100 10 150 0v40H0z" fill="#5f8296" />
      <path d="M30 172c14-3 26-3 40 0M150 178c14-3 26-3 40 0M220 168c12-3 22-3 34 0" stroke="#fff" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" fill="none" />
      {bridge && (
        <g stroke="#8a5a3b" strokeLinecap="round" fill="none">
          <path d="M84 168c16-30 116-30 132 0" strokeWidth="7" />
          <path d="M78 150h144" strokeWidth="5" />
          <path d="M110 150v9M150 150v6M190 150v9" strokeWidth="3.5" />
        </g>
      )}
    </svg>
  );
}

/** A blank postcard waiting for something to be built. */
export function EmptyCardArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 184 124" className={className} aria-hidden>
      <g transform="rotate(-4 92 62)">
        <rect x="10" y="14" width="164" height="100" rx="10" fill="#fffdf7" stroke="#d9cbb0" strokeWidth="2" />
        <rect x="20" y="24" width="78" height="80" rx="6" fill="#eef1e8" stroke="#8a5a3b" strokeOpacity=".45" strokeWidth="2" strokeDasharray="5 5" />
        <path d="M36 82c7-13 39-13 46 0" fill="none" stroke="#8a5a3b" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 7" />
        <path d="M30 88c9-3 17-3 26 0s17 3 26 0" fill="none" stroke="#5f8296" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
        <path d="M59 50v18M50 59h18" stroke="#e3a83d" strokeWidth="4" strokeLinecap="round" />
        <path d="M107 24v80" stroke="#e6dcc6" strokeWidth="2" strokeDasharray="4 4" />
        <rect x="140" y="24" width="24" height="29" rx="2" fill="#f6e3b9" stroke="#d9cbb0" strokeWidth="1.6" strokeDasharray="2.6 2.2" />
        <circle cx="152" cy="34" r="4" fill="#e3a83d" />
        <path d="M142 49c4-5 7-6 10-6s6 1 10 6" fill="#7f9c6f" />
        <path d="M118 70h46M118 84h46M118 98h30" stroke="#e1d5bc" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
