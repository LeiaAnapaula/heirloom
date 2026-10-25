/**
 * npm run sfx
 *
 * Makes the book's little sounds from nothing: a rocket rumble, magic sparkle, a page turn,
 * a success chime, a tiny "I'm listening" ding, and a whoosh. Pure Node, no packages.
 * Every sound is built from noise, filters and bell tones with a seeded random generator,
 * so running it again writes the exact same bytes.
 *
 * Writes public/sfx/<name>.wav: 16-bit PCM, mono, 44.1 kHz, peaks near -6 dBFS, with soft
 * fades at both ends so nothing clicks. Then it reads every file back and checks it.
 * lib/sfx.ts plays them.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 44100;
const PEAK_DB = -6;
const MAX_BYTES = 250 * 1024;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "public", "sfx");

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Mulberry32: a small, fast, seeded generator. Same seed, same sound, every run. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const samples = (seconds) => new Float64Array(Math.round(seconds * SR));
const clamp01 = (x) => Math.min(1, Math.max(0, x));
/** Eases 0..1 with no corners, so envelopes never click. */
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** Rises to 1 at t = peak, then falls away; k sets how sharp. Shaped like a soft strike. */
const swell = (t, peak, k) => (t <= 0 ? 0 : Math.pow(t / peak, k) * Math.exp(k * (1 - t / peak)));

/** RBJ cookbook biquad. Call set() as often as you like to sweep it. */
class Biquad {
  constructor(type, freq, q) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, freq, q);
  }

  set(type, freq, q) {
    const w = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0;
    let b1;
    let b2;
    if (type === "lowpass") {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === "highpass") {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      // bandpass with 0 dB at the center
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    const a0 = 1 + alpha;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    return this;
  }

  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/** Scales a layer to an RMS of 1, so layers mix by the weights we give, not by accident. */
function unit(buf) {
  let sum = 0;
  for (const v of buf) sum += v * v;
  const rms = Math.sqrt(sum / buf.length) || 1;
  for (let i = 0; i < buf.length; i++) buf[i] /= rms;
  return buf;
}

/**
 * A bell or chime strike added into `out`: sine partials at `ratio` times the pitch, each
 * fading on its own clock (higher partials die first, like real metal). Two slightly
 * detuned copies of each partial beat gently, which is what makes a bell shimmer.
 */
function strike(out, { at, freq, amp, tau, partials, attack = 0.004, detune = 0.0015, glide = 0, rand }) {
  const start = Math.round(at * SR);
  for (const [ratio, weight, tauScale] of partials) {
    const f = freq * ratio;
    if (f * (1 + detune) > 16000) continue; // past what small speakers or young ears need
    const decay = tau * tauScale;
    let ph1 = rand() * Math.PI * 2;
    let ph2 = rand() * Math.PI * 2;
    for (let i = start; i < out.length; i++) {
      const t = (i - start) / SR;
      const env = Math.exp(-t / decay) * (t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : 1);
      if (t > attack && env < 1e-5) break;
      // A tiny upward glide at the very start reads as "ready", not as a wobble.
      const bend = glide ? 1 - glide * Math.exp(-t / 0.02) : 1;
      ph1 += (2 * Math.PI * f * bend * (1 + detune)) / SR;
      ph2 += (2 * Math.PI * f * bend * (1 - detune)) / SR;
      // The second copy is quieter, so the beating shimmers instead of pulsing on and off.
      out[i] += amp * weight * env * ((Math.sin(ph1) + 0.3 * Math.sin(ph2)) / 1.3);
    }
  }
}

// ---------------------------------------------------------------------------
// Finishing: fades, DC, level, and the wav file itself
// ---------------------------------------------------------------------------

/** Raised-cosine fades. The very first and last samples end up exactly at zero. */
function fade(buf, inSec, outSec) {
  const nIn = Math.max(2, Math.round(inSec * SR));
  const nOut = Math.max(2, Math.round(outSec * SR));
  for (let i = 0; i < nIn && i < buf.length; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / (nIn - 1));
  for (let i = 0; i < nOut && i < buf.length; i++) {
    buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / (nOut - 1));
  }
  return buf;
}

/** Removes any slow drift below hearing, so the waveform sits centered on zero. */
function dcBlock(buf) {
  const r = 1 - (2 * Math.PI * 18) / SR;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < buf.length; i++) {
    const y = buf[i] - x1 + r * y1;
    x1 = buf[i];
    y1 = y;
    buf[i] = y;
  }
  return buf;
}

function normalize(buf, db) {
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const gain = peak > 0 ? Math.pow(10, db / 20) / peak : 0;
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
  return buf;
}

/** 16-bit PCM mono wav. Triangular dither keeps quiet tails smooth; true silence stays silent. */
function encode(buf, seed) {
  const rand = rng(seed);
  const n = buf.length;
  const out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + n * 2, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); // fmt chunk size
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28); // bytes per second
  out.writeUInt16LE(2, 32); // bytes per frame
  out.writeUInt16LE(16, 34); // bits per sample
  out.write("data", 36, "ascii");
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = buf[i];
    const dither = Math.abs(s) < 1e-9 ? 0 : rand() - rand();
    const v = Math.max(-32768, Math.min(32767, Math.round(s * 32767 + dither)));
    out.writeInt16LE(v, 44 + i * 2);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/**
 * Rocket rumble, 2.4 s. Soft brown noise and a low, warm engine hum swell up slowly,
 * then a rising whoosh carries the rocket off the pad. Big but friendly: no crackle, no roar.
 */
function rumble() {
  const dur = 2.4;
  const rand = rng(0x5f1a01);
  const n = samples(dur).length;

  // Brown noise: white noise through a leaky integrator, then rounded off above 700 Hz.
  // Deep enough to feel like an engine, bright enough that tablet speakers still carry it.
  const noise = new Float64Array(n);
  const lp = new Biquad("lowpass", 700, 0.6);
  const hp = new Biquad("highpass", 38, 0.7);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    brown = (brown + 0.02 * (rand() * 2 - 1)) / 1.02;
    noise[i] = hp.run(lp.run(brown));
  }
  unit(noise);

  // Engine hum: soft low harmonics that drift up a little as the engine wakes, with a gentle
  // flutter. Two copies a hair apart in pitch make it round instead of buzzy.
  const hum = new Float64Array(n);
  const humLp = new Biquad("lowpass", 300, 0.7);
  let phA = 0;
  let phB = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 52 + 9 * smooth(t / 2);
    phA += (2 * Math.PI * f) / SR;
    phB += (2 * Math.PI * f * 1.007) / SR;
    let v = 0;
    for (let k = 1; k <= 6; k++) v += (Math.sin(k * phA) + Math.sin(k * phB)) / Math.pow(k, 1.3);
    hum[i] = humLp.run(v * (1 + 0.1 * Math.sin(2 * Math.PI * 6.5 * t)));
  }
  unit(hum);

  // Lift-off whoosh: white noise through a band that sweeps up from 350 Hz to 2.6 kHz.
  const whoosh = new Float64Array(n);
  const bp = new Biquad("bandpass", 350, 1.1);
  const bpLow = new Biquad("bandpass", 210, 0.9);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const u = smooth((t - 1.2) / 1.1);
    const fc = 350 * Math.pow(2600 / 350, u);
    bp.set("bandpass", fc, 1.1);
    bpLow.set("bandpass", fc * 0.6, 0.9);
    const w = rand() * 2 - 1;
    // Wider bands carry more energy, so ease off as it climbs to keep it airy, not hissy.
    whoosh[i] = (bp.run(w) + 0.6 * bpLow.run(w)) * Math.pow(fc / 350, -0.35);
  }
  unit(whoosh);

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    // Starts soft but present (the rocket answers right away), swells, then hands over to the air.
    const ground = (0.3 + 0.7 * smooth(t / 1.5)) * (1 - 0.75 * smooth((t - 1.6) / 0.8));
    const air = smooth((t - 1.2) / 0.85) * (1 - smooth((t - 2.05) / 0.35));
    out[i] = ground * (noise[i] + 0.3 * hum[i]) + 0.75 * air * whoosh[i];
  }
  return normalize(fade(dcBlock(out), 0.2, 0.3), PEAK_DB);
}

/**
 * Magic dust, 1.4 s. A cascade of small, soft bells falling down a pentatonic scale
 * (no note can clash), with a breath of airy shimmer underneath.
 */
function sparkle() {
  const dur = 1.4;
  const rand = rng(0x5f1a02);
  const out = samples(dur);
  const scale = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96, 3520];
  // Glockenspiel-like partials: [ratio, weight, decay scale]
  const partials = [
    [1, 1, 1],
    [2.756, 0.26, 0.45],
    [5.404, 0.07, 0.22],
  ];
  const count = 16;
  for (let k = 0; k < count; k++) {
    const x = k / (count - 1);
    const at = 0.01 + 0.82 * Math.pow(x, 1.25) + (rand() - 0.5) * 0.03;
    const step = Math.round((1 - x) * (scale.length - 1) + (rand() - 0.5) * 2.4);
    const freq = scale[Math.max(0, Math.min(scale.length - 1, step))];
    const amp = (0.55 + 0.45 * rand()) * (1 - 0.45 * x) * (0.6 + 0.4 * smooth(at / 0.12));
    strike(out, { at: Math.max(0, at), freq, amp, tau: 0.26 * Math.pow(1046.5 / freq, 0.25), partials, rand });
  }

  // Airy shimmer: the faintest high hiss, following the cascade.
  const air = new Float64Array(out.length);
  const hp = new Biquad("highpass", 6500, 0.7);
  const lp = new Biquad("lowpass", 12000, 0.7);
  for (let i = 0; i < air.length; i++) air[i] = lp.run(hp.run(rand() * 2 - 1));
  unit(air);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) {
    const t = i / SR;
    out[i] += 0.035 * peak * air[i] * swell(t, 0.18, 1.6);
  }
  return normalize(fade(dcBlock(out), 0.004, 0.3), PEAK_DB);
}

/**
 * Page turn, 0.7 s. A soft paper swish (noise through a band that lifts as the page moves,
 * with a little grain), then the quiet pat of the page settling.
 */
function pageTurn() {
  const dur = 0.7;
  const rand = rng(0x5f1a03);
  const n = samples(dur).length;

  const swish = new Float64Array(n);
  const bp = new Biquad("bandpass", 1100, 0.9);
  const grainLp = new Biquad("lowpass", 45, 0.7);
  const grain = new Float64Array(n);
  for (let i = 0; i < n; i++) grain[i] = grainLp.run(rand() * 2 - 1);
  unit(grain);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = 1100 * Math.pow(2.8, smooth(t / 0.3)) * (1 - 0.25 * smooth((t - 0.3) / 0.3));
    bp.set("bandpass", fc, 0.9);
    swish[i] = bp.run(rand() * 2 - 1) * (1 + 0.3 * grain[i]);
  }
  unit(swish);

  const pat = new Float64Array(n);
  const patLp = new Biquad("lowpass", 520, 0.8);
  for (let i = 0; i < n; i++) pat[i] = patLp.run(rand() * 2 - 1);
  unit(pat);

  const out = new Float64Array(n);
  const tone = new Biquad("lowpass", 7000, 0.7);
  const floor = new Biquad("highpass", 220, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const v = swell(t, 0.16, 2) * swish[i] + 0.4 * swell(t - 0.38, 0.03, 3) * pat[i];
    out[i] = floor.run(tone.run(v));
  }
  return normalize(fade(dcBlock(out), 0.01, 0.12), PEAK_DB);
}

/** Success chime, 0.9 s. Two warm bell notes rising a fourth: G5, then C6. */
function chime() {
  const dur = 0.9;
  const rand = rng(0x5f1a04);
  const out = samples(dur);
  // [ratio, weight, decay scale]: a round fundamental, soft harmonics, one bell-like
  // inharmonic partial that fades fast, and a low hum an octave below for warmth.
  const partials = [
    [1, 1, 1],
    [2, 0.3, 0.55],
    [3, 0.09, 0.35],
    [2.756, 0.1, 0.18],
    [0.5, 0.12, 1.3],
  ];
  strike(out, { at: 0, freq: 783.99, amp: 0.8, tau: 0.3, partials, attack: 0.006, detune: 0.0012, rand });
  strike(out, { at: 0.13, freq: 1046.5, amp: 1, tau: 0.38, partials, attack: 0.006, detune: 0.0012, rand });
  return normalize(fade(dcBlock(out), 0.002, 0.22), PEAK_DB);
}

/** Listening ding, 0.25 s. One tiny, soft E6 that lifts a hair into pitch. */
function listen() {
  const dur = 0.25;
  const rand = rng(0x5f1a05);
  const out = samples(dur);
  const partials = [
    [1, 1, 1],
    [0.5, 0.18, 1],
    [2, 0.1, 0.5],
    [2.756, 0.04, 0.3],
  ];
  strike(out, { at: 0, freq: 1318.51, amp: 1, tau: 0.075, partials, attack: 0.004, detune: 0.001, glide: 0.015, rand });
  return normalize(fade(dcBlock(out), 0.002, 0.05), PEAK_DB);
}

/**
 * Whoosh, 1.0 s. An airy swoop for the rocket riding the S: the band rises as it rushes
 * close and falls away as it passes, like a gentle Doppler.
 */
function whoosh() {
  const dur = 1.0;
  const rand = rng(0x5f1a06);
  const n = samples(dur).length;

  const body = new Float64Array(n);
  const bpA = new Biquad("bandpass", 450, 1.4);
  const bpB = new Biquad("bandpass", 850, 2);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const rise = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.9)), 1.2);
    const fc = 450 * Math.pow(2, 2.2 * rise);
    bpA.set("bandpass", fc, 1.4);
    bpB.set("bandpass", fc * 1.9, 2);
    const w = rand() * 2 - 1;
    body[i] = (bpA.run(w) + 0.45 * bpB.run(w)) * Math.pow(fc / 450, -0.3);
  }
  unit(body);

  const air = new Float64Array(n);
  const hp = new Biquad("highpass", 4000, 0.7);
  for (let i = 0; i < n; i++) air[i] = hp.run(rand() * 2 - 1);
  unit(air);

  const out = new Float64Array(n);
  const tone = new Biquad("lowpass", 8000, 0.7);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 2);
    out[i] = tone.run(env * body[i] + 0.12 * env * env * air[i]);
  }
  return normalize(fade(dcBlock(out), 0.03, 0.08), PEAK_DB);
}

// ---------------------------------------------------------------------------
// Write, then read back and check
// ---------------------------------------------------------------------------

const SOUNDS = [
  ["rumble", 2.4, rumble],
  ["sparkle", 1.4, sparkle],
  ["page-turn", 0.7, pageTurn],
  ["chime", 0.9, chime],
  ["listen", 0.25, listen],
  ["whoosh", 1.0, whoosh],
];

/** Parses a wav we wrote and returns what a player would see. Throws if anything is off. */
function inspect(name, bytes, expectSeconds) {
  const fail = (why) => {
    throw new Error(`${name}.wav: ${why}`);
  };
  if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") fail("not a RIFF/WAVE file");
  if (bytes.readUInt32LE(4) !== bytes.length - 8) fail("RIFF size does not match the file");
  if (bytes.toString("ascii", 12, 16) !== "fmt " || bytes.readUInt32LE(16) !== 16) fail("unexpected fmt chunk");
  const format = bytes.readUInt16LE(20);
  const channels = bytes.readUInt16LE(22);
  const rate = bytes.readUInt32LE(24);
  const bits = bytes.readUInt16LE(34);
  if (format !== 1 || channels !== 1 || rate !== SR || bits !== 16) fail(`expected PCM mono ${SR} Hz 16-bit`);
  if (bytes.toString("ascii", 36, 40) !== "data") fail("missing data chunk");
  const dataBytes = bytes.readUInt32LE(40);
  if (dataBytes !== bytes.length - 44) fail("data size does not match the file");
  const frames = dataBytes / 2;
  const seconds = frames / SR;
  if (Math.abs(seconds - expectSeconds) > 1 / SR) fail(`duration ${seconds}s, expected ${expectSeconds}s`);
  let peak = 0;
  for (let i = 0; i < frames; i++) peak = Math.max(peak, Math.abs(bytes.readInt16LE(44 + i * 2)));
  const peakDb = 20 * Math.log10(peak / 32768);
  if (peakDb > -5 || peakDb < -7) fail(`peak ${peakDb.toFixed(2)} dBFS, expected about ${PEAK_DB}`);
  const first = bytes.readInt16LE(44);
  const last = bytes.readInt16LE(44 + dataBytes - 2);
  if (first !== 0 || last !== 0) fail("does not start and end on silence");
  if (bytes.length > MAX_BYTES) fail(`${bytes.length} bytes is over the ${MAX_BYTES} byte budget`);
  return { seconds, peakDb, kb: bytes.length / 1024 };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  let seed = 0x0d17;
  for (const [name, , make] of SOUNDS) {
    await writeFile(path.join(OUT_DIR, `${name}.wav`), encode(make(), seed++));
  }
  console.log(`Wrote ${SOUNDS.length} sounds to ${path.relative(ROOT, OUT_DIR)}/`);
  for (const [name, seconds] of SOUNDS) {
    const info = inspect(name, await readFile(path.join(OUT_DIR, `${name}.wav`)), seconds);
    console.log(
      `  ${`${name}.wav`.padEnd(14)} ${info.seconds.toFixed(2).padStart(5)} s  ` +
        `peak ${info.peakDb.toFixed(1)} dBFS  ${info.kb.toFixed(0).padStart(4)} KB`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
