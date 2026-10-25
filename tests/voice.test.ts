import { describe, expect, it } from "vitest";
import { wordIndexAt } from "@/lib/voice";

const LINE = "A little star fell out of the sky last night, and only you can bring it home.";
const lastIndex = (text: string) => text.split(/\s+/).length - 1;

/** How many of `steps` evenly spaced progress points land on each word. */
function share(text: string, steps = 10_000): number[] {
  const counts = new Array<number>(lastIndex(text) + 1).fill(0);
  for (let s = 0; s <= steps; s++) counts[wordIndexAt(s / steps, text)]++;
  return counts;
}

describe("wordIndexAt", () => {
  it("starts on the first word", () => {
    expect(wordIndexAt(0, LINE)).toBe(0);
    expect(wordIndexAt(0, "Go!")).toBe(0);
  });

  it("ends on the last word", () => {
    expect(wordIndexAt(1, LINE)).toBe(lastIndex(LINE));
    expect(wordIndexAt(1, "Hello, Mia.")).toBe(1);
  });

  it("never steps backward as the line plays", () => {
    let prev = 0;
    for (let s = 0; s <= 1000; s++) {
      const i = wordIndexAt(s / 1000, LINE);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
    expect(prev).toBe(lastIndex(LINE));
  });

  it("visits every word on the way", () => {
    expect(share(LINE).every((n) => n > 0)).toBe(true);
  });

  it("gives long words more time than short ones", () => {
    const [a, , long, , b] = share("I see extraordinarily big stars");
    expect(long).toBeGreaterThan(a * 2);
    expect(long).toBeGreaterThan(b);
  });

  it("holds a word longer when a pause follows it", () => {
    expect(share("Go. go go")[0]).toBeGreaterThan(share("go go go")[0]);
  });

  it("stays in range for odd input", () => {
    expect(wordIndexAt(-0.5, LINE)).toBe(0);
    expect(wordIndexAt(7, LINE)).toBe(lastIndex(LINE));
    expect(wordIndexAt(Number.NaN, LINE)).toBe(0);
    expect(wordIndexAt(0.5, "Home!")).toBe(0);
    expect(wordIndexAt(0.5, "")).toBe(0);
  });
});

describe("lib/voice on the server", () => {
  it("imports and runs in Node without touching window", async () => {
    const voice = await import("@/lib/voice");
    expect(typeof window).toBe("undefined");
    expect(voice.voiceSource()).toBe("unknown");
    expect(() => {
      voice.unlockAudio();
      voice.preload([{ id: "s1-hello", text: "Hello, Mia." }]);
      voice.stop();
    }).not.toThrow();
    await expect(voice.play({ id: "s1-hello", text: "Hello, Mia." })).resolves.toBeUndefined();
  });
});
