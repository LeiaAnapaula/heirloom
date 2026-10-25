import { describe, expect, it } from "vitest";
import {
  STORY_SYSTEM_PROMPT,
  applyGenerated,
  buildOutline,
  buildStoryMessage,
  salvageGenerated,
  validateGenerated,
  type GeneratedScreens,
  type StoryProfile,
} from "@/lib/story";
import { lostStar } from "@/content/episodes/lost-star";

const LEO: StoryProfile = { name: "Leo", age: 5, interests: ["dinosaurs"] };
const outline = buildOutline(lostStar);

/** A good rewrite for Leo, age 5, who loves dinosaurs. Fresh copy each call so tests can bend it. */
function leo(): GeneratedScreens {
  return {
    screens: [
      {
        id: "wake",
        narration: [
          "Hello, Leo.",
          "A little star fell from the sky, right next to a sleepy baby dinosaur, and only you can bring it home.",
          "Will you help me?",
        ],
      },
      { id: "go", narration: ["Your rocket is ready, and a tiny dinosaur is buckled in.", "To start the rocket, read the word on the button."] },
      { id: "go:success", narration: ["You did it, Leo! The rocket rumbles up like a happy dinosaur stomp."] },
      { id: "steer", narration: ["To steer, we draw the letter S, like a long dinosaur tail.", "Watch the magic pencil."] },
      { id: "steer:success", narration: ["Wheee! You steered the rocket, Leo!"] },
      { id: "count", narration: ["How many planets do you see, Leo?"] },
      { id: "count:success", narration: ["Five planets! Great counting, Leo."] },
      { id: "moon", narration: ["We landed on the Moon, and there is our star!", "If you drop a feather on the Moon, what do you think happens?"] },
      { id: "moon:success", narration: ["The Moon pulls gently, Leo. That's called gravity."] },
      { id: "home", narration: ["The little star is ready to fly back to the sky.", "Read the magic word to send it there."] },
      {
        id: "home:success",
        narration: ["Thank you, Leo. The baby dinosaur waves goodbye.", "Tomorrow, the star wants to show you Saturn's rings."],
      },
    ],
  };
}

function withScreen(id: string, narration: string[]): GeneratedScreens {
  const gen = leo();
  gen.screens = gen.screens.map((s) => (s.id === id ? { id, narration } : s));
  return gen;
}

function errorsOf(gen: unknown): string[] {
  const result = validateGenerated(gen, outline, LEO);
  return result.ok ? [] : result.errors;
}

describe("STORY_SYSTEM_PROMPT", () => {
  it("is the CLAUDE.md prompt", () => {
    expect(STORY_SYSTEM_PROMPT.split("\n")).toHaveLength(7);
    expect(STORY_SYSTEM_PROMPT).toContain("Never ask the child for personal information.");
    expect(STORY_SYSTEM_PROMPT.endsWith('Return JSON only: { "screens": [ { "id": string, "narration": string[] } ] }')).toBe(true);
  });
});

describe("buildOutline", () => {
  it("covers each opening and each non-empty success, in order", () => {
    expect(outline.map((o) => o.id)).toEqual([
      "wake",
      "go",
      "go:success",
      "steer",
      "steer:success",
      "count",
      "count:success",
      "moon",
      "moon:success",
      "home",
      "home:success",
    ]);
    expect(outline.find((o) => o.id === "wake")).toMatchObject({ skill: "say:yes", lines: 3 });
    expect(outline.find((o) => o.id === "count")?.skill).toBe("count:to5 then count:add1");
  });

  it("never includes hints, give-up lines, count numbers or count steps", () => {
    const current = outline.flatMap((o) => o.current);
    for (const s of lostStar.screens) {
      for (const line of s.onHelp.narration) expect(current).not.toContain(line.text);
      const i = s.interaction;
      if (i.type === "readAloud") for (const line of i.giveUp) expect(current).not.toContain(line.text);
      if (i.type === "count") {
        for (const line of i.numbers) expect(current).not.toContain(line.text);
        for (const step of i.steps) for (const line of [...step.ask, ...step.correct]) expect(current).not.toContain(line.text);
      }
    }
  });

  it("tells reading screens never to say their word, and sets each task's rules", () => {
    const rules = (id: string) => outline.find((o) => o.id === id)?.rules.join(" ") ?? "";
    expect(rules("go")).toMatch(/Never say or spell the word "GO"/);
    expect(rules("home")).toMatch(/Never say or spell the word "HOME"/);
    expect(rules("go:success")).not.toMatch(/Never say/);
    expect(rules("count")).toMatch(/how many/);
    expect(rules("moon")).toMatch(/feather and the Moon/);
    expect(rules("moon:success")).toMatch(/gravity/);
    expect(rules("steer")).toMatch(/letter S/);
    expect(outline.at(-1)?.task).toContain("Saturn's Rings");
  });

  it("sends only name, age and interests, with the name filled into current", () => {
    const sent = JSON.parse(buildStoryMessage({ ...LEO, id: "x", skills: {} } as StoryProfile, outline));
    expect(Object.keys(sent.child).sort()).toEqual(["age", "interests", "name"]);
    expect(sent.screens[0].current[0]).toBe("Hello, Leo.");
    expect(JSON.stringify(sent)).not.toContain("{name}");
  });
});

describe("validateGenerated", () => {
  it("accepts a good rewrite for Leo who loves dinosaurs", () => {
    const result = validateGenerated(leo(), outline, LEO);
    expect(result).toEqual({ ok: true, value: leo() });
  });

  it("tidies spacing and turns dashes between clauses into commas", () => {
    const result = validateGenerated(withScreen("go:success", ["  You did it,  Leo \u2014 liftoff!  "]), outline, LEO);
    expect(result.ok && result.value.screens[2].narration).toEqual(["You did it, Leo, liftoff!"]);
  });

  it("rejects a missing screen", () => {
    const gen = leo();
    gen.screens = gen.screens.filter((s) => s.id !== "count");
    expect(errorsOf(gen)).toContain("count: missing");
  });

  it("rejects unknown, repeated and badly shaped screens", () => {
    const gen = leo();
    expect(errorsOf({ ...gen, screens: [...gen.screens, { id: "bonus", narration: ["Hi, Leo."] }] })).toContain("screen 12: unknown id");
    expect(errorsOf({ screens: [...gen.screens, gen.screens[0]] })).toContain("wake: appears more than once");
    expect(errorsOf(withScreen("go", "Read it." as unknown as string[]))).toContain("go: narration must be a list of strings");
    expect(errorsOf(null)).toContain("expected { screens: [...] }");
  });

  it("rejects long lines and too many lines", () => {
    const long =
      "Leo and the tiny dinosaur zoom past bright planets and sparkly stars and big round moons and soft fluffy clouds all day long.";
    expect(errorsOf(withScreen("go:success", [long]))).toContain("go:success line 1: over 22 words");
    const wide = `${"Wonderful ".repeat(16)}Leo!`;
    expect(errorsOf(withScreen("go:success", [wide]))).toContain("go:success line 1: over 160 characters");
    expect(errorsOf(withScreen("count", ["Look, Leo.", "Planets!", "So many.", "How many do you see?"]))).toContain("count: needs 1 to 3 lines");
  });

  it("rejects a story that never says the child's name", () => {
    const gen = leo();
    gen.screens = gen.screens.map((s) => ({ ...s, narration: s.narration.map((l) => l.replaceAll("Leo", "friend")) }));
    expect(errorsOf(gen)).toContain("the child's name never appears");
  });

  it("rejects a reading screen that spells its word out", () => {
    expect(errorsOf(withScreen("go", ["Read the button, Leo. It says G-O."]))).toContain("go: says the word the child must read");
    expect(errorsOf(withScreen("home", ["Read the magic word, Leo: H O M E."]))).toContain("home: says the word the child must read");
  });

  it("rejects a feather question that gives the answer away", () => {
    expect(errorsOf(withScreen("moon", ["We made it, Leo!", "If you drop a feather on the Moon, will it float down slowly?"]))).toContain(
      "moon: gives away what the feather does",
    );
  });

  it("rejects a reading screen that says its word", () => {
    expect(errorsOf(withScreen("go", ["To start the rocket, read go on the button."]))).toContain("go: says the word the child must read");
    expect(errorsOf(withScreen("go", ["Ready, set, GO!"]))).toContain("go: says the word the child must read");
    // The written line says it too, which is why generated lines must not copy it.
    expect(errorsOf(withScreen("home", ["Read the magic word to send the star home."]))).toContain(
      "home: says the word the child must read",
    );
    // After the child has read it, saying it is fine.
    expect(errorsOf(withScreen("home:success", ["Thank you, Leo. The star is home.", "Tomorrow, Saturn's rings!"]))).toEqual([]);
  });

  it("rejects links, emoji and digits", () => {
    expect(errorsOf(withScreen("go:success", ["You did it, Leo! Visit www.dinos.com."]))).toContain("go:success line 1: has a link");
    expect(errorsOf(withScreen("go:success", ["You did it, Leo! \u{1F996}"]))).toContain("go:success line 1: has an emoji");
    expect(errorsOf(withScreen("count:success", ["5 planets! Great counting, Leo."]))).toContain("count:success line 1: has digits");
  });

  it("checks that each screen sets up its task", () => {
    expect(errorsOf(withScreen("count", ["Look at all the planets, Leo."]))).toContain("count: does not ask how many");
    expect(errorsOf(withScreen("count", ["Four planets! How many do you see, Leo?"]))).toContain("count: gives away a number");
    expect(errorsOf(withScreen("moon", ["We landed, and there is our star!", "What happens if you drop a feather?"]))).toContain(
      "moon: does not mention the Moon",
    );
    expect(errorsOf(withScreen("moon:success", ["The feather floats down slowly, Leo."]))).toContain("moon:success: does not name gravity");
    expect(errorsOf(withScreen("steer", ["To steer, we draw a curvy line.", "Watch the magic pencil."]))).toContain(
      "steer: does not name the letter S",
    );
    expect(errorsOf(withScreen("wake", ["Hello, Leo.", "A star fell. Let's help it."]))).toContain("wake: does not end with a question");
  });
});

describe("salvageGenerated", () => {
  it("keeps screens that pass and drops the rest", () => {
    const result = salvageGenerated(withScreen("go", ["Ready, set, GO!"]), outline, LEO);
    expect(result?.dropped).toEqual(["go"]);
    expect(result?.value.screens.map((s) => s.id)).not.toContain("go");
  });

  it("gives up on a broken shape or a story without the name", () => {
    expect(salvageGenerated({ screens: "nope" }, outline, LEO)).toBeNull();
    expect(salvageGenerated({ screens: [{ id: "count", narration: ["How many planets do you see?"] }] }, outline, LEO)).toBeNull();
  });
});

describe("applyGenerated", () => {
  it("swaps narration, keeps interactions and hints, and uses gen- ids", () => {
    const ep = applyGenerated(lostStar, leo());
    const go = ep.screens[1];
    expect(go.narration).toEqual([
      { id: "gen-go-0", text: "Your rocket is ready, and a tiny dinosaur is buckled in." },
      { id: "gen-go-1", text: "To start the rocket, read the word on the button." },
    ]);
    expect(go.onSuccess.narration[0].id).toBe("gen-go:success-0");
    expect(go.onSuccess.effect).toBe("liftoff");
    ep.screens.forEach((s, i) => {
      expect(s.interaction).toBe(lostStar.screens[i].interaction);
      expect(s.onHelp).toBe(lostStar.screens[i].onHelp);
      expect(s.art).toBe(lostStar.screens[i].art);
    });
    // The wake screen has no success narration to rewrite.
    expect(ep.screens[0].onSuccess.narration).toEqual([]);
  });

  it("honors keepDefault and never changes the original", () => {
    const before = JSON.stringify(lostStar);
    const ep = applyGenerated(lostStar, leo(), ["count", "home:success"]);
    expect(ep.screens[3].narration).toBe(lostStar.screens[3].narration);
    expect(ep.screens[3].onSuccess.narration[0].id).toBe("gen-count:success-0");
    expect(ep.screens[5].onSuccess.narration).toBe(lostStar.screens[5].onSuccess.narration);
    expect(ep.screens[5].narration[0].id).toBe("gen-home-0");
    expect(JSON.stringify(lostStar)).toBe(before);
  });

  it("leaves screens missing from the result as written", () => {
    const ep = applyGenerated(lostStar, { screens: [{ id: "wake", narration: ["Hello, Leo.", "Will you help me?"] }] });
    expect(ep.screens[0].narration.map((l) => l.id)).toEqual(["gen-wake-0", "gen-wake-1"]);
    expect(ep.screens[1]).toEqual(lostStar.screens[1]);
  });
});
