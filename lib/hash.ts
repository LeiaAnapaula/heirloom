/**
 * A tiny, synchronous string hash (FNV-1a, 32-bit) shared by the browser and Node scripts.
 * Used to tell whether cached narration audio still matches its text. Not for security.
 * Sync on purpose: crypto.subtle is missing on plain-http LAN addresses (an iPad on wifi).
 */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
