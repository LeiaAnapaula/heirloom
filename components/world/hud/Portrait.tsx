/**
 * Grandpa's portrait, drawn once and used wherever he appears: his card, the phone
 * chip, and the "Sent to Grandpa" card. While words are being read aloud the ring
 * turns honey and a soft halo breathes.
 */
export default function Portrait({ className = "", speaking }: { className?: string; speaking: boolean }) {
  return (
    <span aria-hidden className={`relative block shrink-0 ${className}`}>
      {speaking && <span className="absolute -inset-1.5 rounded-full bg-honey/45 motion-safe:animate-pulse" />}
      <span
        className={`relative block h-full w-full overflow-hidden rounded-full border-[3px] bg-[#f6e2b5] transition-colors duration-300 motion-reduce:transition-none ${
          speaking ? "border-honey" : "border-wood"
        }`}
      >
        <svg viewBox="0 0 64 64" className="h-full w-full">
          {/* a soft sun behind him */}
          <circle cx="53" cy="13" r="8" fill="#fff3d6" opacity=".85" />
          <g transform="translate(32 33) scale(1.2) translate(-32 -33)">
            {/* cardigan, shirt, buttons */}
            <path d="M5 66c1-13 11-20 27-20s26 7 27 20z" fill="#6f8e5f" />
            <path d="M25 46.5 32 58l7-11.5c-2.2-.6-4.5-.9-7-.9s-4.8.3-7 .9z" fill="#eef1e8" />
            <path d="M25 46.5 32 58M39 46.5 32 58" stroke="#56724a" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="32" cy="61.5" r="1.4" fill="#8a5a3b" />
            {/* neck and ears */}
            <path d="M27.5 40h9v7.5c-1.4 1.3-2.9 2-4.5 2s-3.1-.7-4.5-2z" fill="#d9a07a" />
            <ellipse cx="19.6" cy="32" rx="2.6" ry="3.6" fill="#e5ad88" />
            <ellipse cx="44.4" cy="32" rx="2.6" ry="3.6" fill="#e5ad88" />
            {/* face */}
            <ellipse cx="32" cy="31" rx="12.4" ry="13.6" fill="#ecbd97" />
            {/* white hair at the temples */}
            <path d="M19.4 24.5c-1.6 3-1.6 6.4-.4 9.4l2.6-.6c-.7-2.7-.5-5.6.6-8.3z" fill="#f7f4ee" />
            <path d="M44.6 24.5c1.6 3 1.6 6.4.4 9.4l-2.6-.6c.7-2.7.5-5.6-.6-8.3z" fill="#f7f4ee" />
            {/* flat cap */}
            <path d="M18.6 25.2C17.8 15.6 24.4 10.5 32.6 10.5c8.4 0 14.6 4.6 13.4 13.6-4.6-2.4-21.6-2.8-27.4 1.1z" fill="#8a5a3b" />
            <path d="M17 25.4c5.6-4.4 24.4-4.6 30.4-.9-.6 1.6-2.2 2-4 1.6-6.4-1.5-16.4-1.4-22.6.4-1.7.5-3.2.1-3.8-1.1z" fill="#6b4329" />
            <path d="M24 14.5c3-1.8 8-2.4 12-1.4" stroke="#a8734e" strokeWidth="1.4" strokeLinecap="round" fill="none" />
            {/* kind, smiling eyes under soft white brows */}
            <path d="M23.4 28.6c1.6-1.2 4-1.3 5.6-.2M35 28.4c1.6-1.1 4-1 5.6.2" stroke="#f7f4ee" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            <path d="M24.4 32.6c1.4-1.5 3.4-1.5 4.8 0M34.8 32.6c1.4-1.5 3.4-1.5 4.8 0" stroke="#2c3a32" strokeWidth="1.7" strokeLinecap="round" fill="none" />
            <path d="M22.6 32.4l-1.3.6M41.4 32.4l1.3.6" stroke="#c98d68" strokeWidth="1" strokeLinecap="round" />
            {/* rosy cheeks and a round nose */}
            <circle cx="24" cy="37.4" r="2.6" fill="#c8574a" opacity=".22" />
            <circle cx="40" cy="37.4" r="2.6" fill="#c8574a" opacity=".22" />
            <ellipse cx="32" cy="36" rx="2.7" ry="2.3" fill="#dc9f7b" />
            {/* a big white mustache and a small smile */}
            <path
              d="M23.6 41.4c1.4-3.4 5.6-4 8.4-2 2.8-2 7-1.4 8.4 2-2.4 1.6-5.4 1.2-8.4-.4-3 1.6-6 2-8.4.4z"
              fill="#f7f4ee"
              stroke="#ddd6c8"
              strokeWidth=".6"
            />
            <path d="M29.2 43.8c1.8 1.3 3.8 1.3 5.6 0" stroke="#9a5644" strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </g>
        </svg>
      </span>
    </span>
  );
}
