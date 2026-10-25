import { describe, expect, it, vi } from "vitest";
import { allLines } from "@/lib/episode";
import { blocklistCheck, checkLines, hasTerm, maskName } from "@/lib/safety";
import { lostStar } from "@/content/episodes/lost-star";

describe("blocklistCheck", () => {
  it.each(["Hello, Leo.", "A tiny dinosaur lost its star.", "How many planets do you see, Ava?", "The Moon pulls gently."])(
    "lets a safe line through: %s",
    (line) => {
      expect(blocklistCheck(line)).toEqual({ safe: true, reasons: [] });
    },
  );

  it("lets every written line of the episode through", () => {
    for (const line of allLines(lostStar)) {
      expect(blocklistCheck(line.text), line.id).toEqual({ safe: true, reasons: [] });
      if (line.say) expect(blocklistCheck(line.say).safe, line.id).toBe(true);
    }
  });

  it.each(["class", "glass", "assume", "hello", "shell", "skill", "dinosaur", "Saturn", "grape", "apple"])(
    "has no false positive inside %s",
    (word) => {
      expect(blocklistCheck(word).safe).toBe(true);
      expect(blocklistCheck(`Look, a ${word} near the shooting star!`).safe).toBe(true);
    },
  );

  it("does not treat everyday words as brands when they are not capitalized", () => {
    expect(blocklistCheck("The lake on the Moon was frozen.").safe).toBe(true);
    expect(blocklistCheck("We marvel at the rings.").safe).toBe(true);
  });

  it.each([
    ["violent or scary", "The monster wants to fight."],
    ["violent or scary", "The little star died."],
    ["violent or scary", "A scary ghost floats by."],
    ["violent or scary", "Watch out for the bomb!"],
    ["romance", "They kissed under the Moon."],
    ["romance", "Will you marry the dinosaur?"],
    ["grown-up things", "Dad had a beer on the rocket."],
    ["grown-up things", "The pirate was drunk."],
    ["unkind words", "That planet is stupid."],
    ["personal information", "What is your address?"],
    ["personal information", "Where do you live, Leo?"],
    ["personal information", "Tell me your last name."],
    ["personal information", "Dont tell your mom about our trip."],
    ["personal information", "Can you show me a picture of you?"],
    ["personal information", "What school do you go to?"],
    ["real brand, character or person", "Pikachu flies by the rocket."],
    ["real brand, character or person", "Let's watch YouTube together."],
    ["real brand, character or person", "Spiderman swings past the Moon."],
    ["real brand, character or person", "Spider-Man swings past the Moon."],
    ["real brand, character or person", "The Pokémon wave hello."],
    ["real brand, character or person", "Grab a McDonalds snack."],
    ["real brand, character or person", "We saw Frozen at the cinema."],
    ["real brand, character or person", "NASA built this rocket."],
    ["link", "Visit www.stars.com today."],
    ["link", "Go to https://example.org for more."],
    ["emoji or symbol", "The star glows \u2B50"],
    ["emoji or symbol", "Rocket time \u{1F680}!"],
    ["long number", "Call 555 1234 now."],
  ])("blocks %s: %s", (label, line) => {
    const verdict = blocklistCheck(line);
    expect(verdict.safe).toBe(false);
    expect(verdict.reasons.some((r) => r.startsWith(label))).toBe(true);
  });
});

describe("hasTerm and maskName", () => {
  it("matches whole words only, ignoring case and accents", () => {
    expect(hasTerm("Ready, set, GO!", "go")).toBe(true);
    expect(hasTerm("The rocket is going up.", "go")).toBe(false);
    expect(hasTerm("Zoe waves.", "Zoë")).toBe(true);
  });

  it("swaps the child's name for a placeholder, so a child named Elsa is not a brand", () => {
    expect(blocklistCheck("Hello, Elsa.").safe).toBe(false);
    const masked = maskName("Hello, Elsa. Elsa, look!", "Elsa");
    expect(masked).toBe("Hello, [name]. [name], look!");
    expect(blocklistCheck(masked).safe).toBe(true);
    expect(maskName("Anne-Marie sees Mars.", "Anne-Marie")).toBe("[name] sees Mars.");
  });
});

describe("checkLines", () => {
  const lines = ["Hello, Leo.", "The monster roars.", "The Moon pulls gently."];

  it("runs the blocklist first and asks the classifier only about lines that passed", async () => {
    const classify = vi.fn(async (ls: string[]) => ls.map(() => true));
    const verdicts = await checkLines(lines, classify);
    expect(classify).toHaveBeenCalledOnce();
    expect(classify).toHaveBeenCalledWith(["Hello, Leo.", "The Moon pulls gently."]);
    expect(verdicts.map((v) => v.safe)).toEqual([true, false, true]);
  });

  it("marks lines the classifier calls unsafe", async () => {
    const verdicts = await checkLines(lines, async (ls) => ls.map((l) => !l.includes("Moon")));
    expect(verdicts.map((v) => v.safe)).toEqual([true, false, false]);
    expect(verdicts[2].reasons).toEqual(["classifier: unsafe"]);
  });

  it("fails closed when the classifier throws", async () => {
    const verdicts = await checkLines(lines, async () => {
      throw new Error("offline");
    });
    expect(verdicts.every((v) => !v.safe)).toBe(true);
    expect(verdicts[0].reasons).toEqual(["classifier unavailable"]);
  });

  it("fails closed on a missing or odd answer", async () => {
    const verdicts = await checkLines(lines, async () => [true]);
    expect(verdicts.map((v) => v.safe)).toEqual([true, false, false]);
    expect(verdicts[2].reasons).toEqual(["classifier: no answer"]);
    const odd = await checkLines(["Hello, Leo."], async () => ["yes"] as unknown as boolean[]);
    expect(odd[0].safe).toBe(false);
  });

  it("uses the blocklist alone without a classifier, and skips the classifier when nothing passed", async () => {
    expect((await checkLines(lines)).map((v) => v.safe)).toEqual([true, false, true]);
    const classify = vi.fn(async (ls: string[]) => ls.map(() => true));
    await checkLines(["A ghost!", "Blood everywhere."], classify);
    expect(classify).not.toHaveBeenCalled();
  });
});

describe("more word forms (review)", () => {
  it.each(["The dragon stabbed the moon.", "He was choking.", "A kidnapper came.", "Leo hates the dark.", "What a loser."])("blocks %j", (line) => {
    expect(blocklistCheck(line).safe).toBe(false);
  });
  it.each(["A shooting star zoomed by.", "Look at the dinosaur skeleton!", "The volcano is smoky."])("still allows %j", (line) => {
    expect(blocklistCheck(line).safe).toBe(true);
  });
});
