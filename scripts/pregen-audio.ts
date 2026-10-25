/**
 * npm run audio
 *
 * Pre-makes the narrator's voice for every line of "Mia and the Lost Star" with ElevenLabs,
 * so the book reads instantly and never waits on the network. Writes public/audio/<line id>.mp3
 * and public/audio/manifest.json, which lib/voice.ts reads to find them.
 *
 * Lines whose mp3 already matches their words are skipped, so running it again is cheap.
 * With no keys in .env.local it explains the browser-voice fallback and exits without error.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { lostStar } from "@/content/episodes/lost-star";
import { allLines, resolveLine, type Line } from "@/lib/episode";
import { textHash } from "@/lib/hash";
import { MIA } from "@/lib/profile";

type Manifest = Record<string, { file: string; hash: string }>;

const ROOT = process.cwd(); // npm run always starts in the project root
const AUDIO_DIR = path.join(ROOT, "public", "audio");
const MANIFEST = path.join(AUDIO_DIR, "manifest.json");
const PAUSE_MS = 350; // a short breath between requests keeps us under ElevenLabs' rate limits

class VoiceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Reads KEY=VALUE lines from .env.local into process.env. Values already set win. */
async function loadEnvLocal() {
  const raw = await readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => "");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

async function readManifest(): Promise<Manifest> {
  try {
    const data: unknown = JSON.parse(await readFile(MANIFEST, "utf8"));
    return data && typeof data === "object" ? (data as Manifest) : {};
  } catch {
    return {};
  }
}

// Kept in step with app/api/narrate/route.ts, so cached and live lines sound the same.
async function synthesize(text: string, key: string, voiceId: string): Promise<Uint8Array> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.92 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    const why = res.status === 401 ? " (the key was not accepted)" : res.status === 429 ? " (too many requests)" : "";
    throw new VoiceError(res.status, `ElevenLabs answered ${res.status}${why}`);
  }
  const mp3 = new Uint8Array(await res.arrayBuffer());
  if (mp3.byteLength === 0) throw new VoiceError(0, "ElevenLabs sent no audio");
  return mp3;
}

/** Busy or briefly down: wait and try again, twice. Anything else fails right away. */
async function synthesizeWithRetry(text: string, key: string, voiceId: string): Promise<Uint8Array> {
  for (const wait of [2000, 5000]) {
    try {
      return await synthesize(text, key, voiceId);
    } catch (err) {
      const status = err instanceof VoiceError ? err.status : 0;
      if (status !== 429 && status < 500) throw err;
      await sleep(wait);
    }
  }
  return synthesize(text, key, voiceId);
}

/** One entry per line id. The same id should never mean two different sentences. */
function unique(lines: Line[]): Line[] {
  const seen = new Map<string, Line>();
  for (const line of lines) {
    const prev = seen.get(line.id);
    if (!prev) seen.set(line.id, line);
    else if ((prev.say ?? prev.text) !== (line.say ?? line.text)) {
      console.warn(`  Note: line id "${line.id}" is used for two different sentences. Keeping the first.`);
    }
  }
  return [...seen.values()];
}

async function main() {
  await loadEnvLocal();
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();

  if (!key || !voiceId) {
    console.log(
      [
        "",
        "  No ElevenLabs key yet, so no audio was made.",
        "  That's fine: the book reads aloud with the browser's own voice until you add one.",
        "  To use the narrator voice, put ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env.local",
        "  and run npm run audio again.",
        "",
      ].join("\n"),
    );
    return;
  }
  if (!/^[\w-]{1,64}$/.test(voiceId)) {
    console.error("  ELEVENLABS_VOICE_ID looks wrong. It should be the id from ElevenLabs: letters and numbers only.");
    process.exitCode = 1;
    return;
  }

  const old = await readManifest();
  const lines = unique(allLines(lostStar).map((line) => resolveLine(line, MIA.name)));
  await mkdir(AUDIO_DIR, { recursive: true });

  const next: Manifest = {};
  const counts = { made: 0, kept: 0, failed: 0 };
  const numWidth = String(lines.length).length;
  const idWidth = Math.max(...lines.map((l) => l.id.length));

  console.log(`\n  Making narration for ${lines.length} lines, read for ${MIA.name}.\n`);

  for (const [i, line] of lines.entries()) {
    const spoken = line.say ?? line.text;
    const hash = textHash(spoken);
    const file = `${line.id}.mp3`;
    const label = `  [${String(i + 1).padStart(numWidth)}/${lines.length}] ${line.id.padEnd(idWidth)}`;

    if (existsSync(path.join(AUDIO_DIR, file)) && old[line.id]?.hash === hash) {
      next[line.id] = { file, hash };
      counts.kept++;
      console.log(`${label}  already made`);
      continue;
    }

    try {
      const mp3 = await synthesizeWithRetry(spoken, key, voiceId);
      await writeFile(path.join(AUDIO_DIR, file), mp3);
      next[line.id] = { file, hash };
      counts.made++;
      console.log(`${label}  made (${Math.max(1, Math.round(mp3.byteLength / 1024))} KB)  "${spoken}"`);
    } catch (err) {
      counts.failed++;
      console.log(`${label}  failed: ${err instanceof Error ? err.message : "unknown error"}`);
      // A refused key will refuse every line, so stop here instead of failing them all.
      if (err instanceof VoiceError && (err.status === 401 || err.status === 403)) break;
    }
    await sleep(PAUSE_MS);
  }

  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  await writeFile(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);

  console.log(`\n  Done: ${counts.made} made, ${counts.kept} already there, ${counts.failed} failed.`);
  console.log(`  Wrote public/audio/manifest.json with ${Object.keys(sorted).length} lines.`);
  if (counts.failed) {
    console.log("  Lines that failed are read by the browser voice. Run npm run audio again to retry them.");
    process.exitCode = 1;
  }
  console.log("");
}

main().catch((err: unknown) => {
  console.error(`  Could not make the audio: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
