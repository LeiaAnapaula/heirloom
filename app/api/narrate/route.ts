import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { textHash } from "@/lib/hash";

/**
 * POST /api/narrate with { text } answers audio/mpeg in the narrator's voice (ElevenLabs).
 *
 * Used for lines that have no pre-made mp3 in public/audio. Every answer is saved under
 * .cache/narration, so each line costs one ElevenLabs request, ever. The key stays here on
 * the server. With no key the route answers 501 and the browser reads with its own voice.
 * The only personal detail in `text` is the child's first name.
 *
 * No `runtime` export: route handlers run on Node by default, and with Cache Components on,
 * Next 16 asks us not to declare it at all.
 */

const MAX_CHARS = 400;
const CACHE_DIR = path.join(process.cwd(), ".cache", "narration");

// Two requests for the same line at once share one ElevenLabs call.
const inFlight = new Map<string, Promise<Uint8Array>>();

function voiceConfig(): { key: string; voiceId: string } | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  // The voice id ends up in a file name and a URL, so it must look like one.
  return key && voiceId && /^[\w-]{1,64}$/.test(voiceId) ? { key, voiceId } : null;
}

/** GET tells the browser, once per session, whether a server voice exists, without a noisy 501. */
export async function GET() {
  await connection(); // answer per request, so adding a key takes effect without a rebuild
  return Response.json({ available: voiceConfig() !== null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const text = await readText(request);
  if (text === null) {
    return Response.json({ error: `text must be 1 to ${MAX_CHARS} characters` }, { status: 400 });
  }

  const config = voiceConfig();
  if (!config) return Response.json({ error: "no-voice-key" }, { status: 501 });
  const { key, voiceId } = config;

  const file = path.join(CACHE_DIR, `${voiceId}-${textHash(text)}.mp3`);
  const cached = await readFile(file).catch(() => null);
  if (cached && cached.byteLength > 0) return audio(cached);

  let pending = inFlight.get(file);
  if (!pending) {
    pending = synthesize(text, key, voiceId)
      .then(async (mp3) => {
        await save(file, mp3);
        return mp3;
      })
      .finally(() => inFlight.delete(file));
    inFlight.set(file, pending);
  }

  try {
    return audio(await pending);
  } catch (err) {
    // Our own message only: never the key, never ElevenLabs' response body.
    console.error(`[narrate] ${err instanceof Error ? err.message : "voice request failed"}`);
    return Response.json({ error: "voice-unavailable" }, { status: 502 });
  }
}

async function readText(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.json();
    const text = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS) return null;
    return text;
  } catch {
    return null;
  }
}

function audio(bytes: Uint8Array): Response {
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// Kept in step with scripts/pregen-audio.ts, so cached and live lines sound the same.
async function synthesize(text: string, key: string, voiceId: string): Promise<Uint8Array> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.92 },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new Error(`ElevenLabs answered ${res.status}`);
  }
  const mp3 = new Uint8Array(await res.arrayBuffer());
  if (mp3.byteLength === 0) throw new Error("ElevenLabs sent no audio");
  return mp3;
}

/** Write through a temp file, so a request that reads at the same moment never gets half an mp3. */
async function save(file: string, bytes: Uint8Array) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(tmp, bytes);
    await rename(tmp, file);
  } catch {
    // A read-only disk (some hosts) only means no cache. The child still hears the line.
    await unlink(tmp).catch(() => {});
    console.warn("[narrate] could not write the narration cache");
  }
}
