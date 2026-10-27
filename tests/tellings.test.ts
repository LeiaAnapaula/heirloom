import { describe, expect, it } from "vitest";
import { lostStar } from "@/content/episodes/lost-star";
import { TELLING_INTERESTS, lostStarTellings } from "@/content/episodes/lost-star-tellings";
import type { Episode, Telling } from "@/lib/episode";
import { IDEAS, MIA } from "@/lib/profile";
import { blocklistCheck } from "@/lib/safety";
import { applyGenerated, applyTelling, buildOutline, pickTelling, sameInterest, validateGenerated } from "@/lib/story";

const outline = buildOutline(lostStar);
const outlineIds = outline.map((o) => o.id);
const about = lostStar.about ?? [];

/** Tellings with the real match lists and no words yet, so matching is tested before the stories land. */
const placeholders: Telling[] = Object.entries(TELLING_INTERESTS).map(([id, interests]) => ({ id, interests, screens: {} }));
const withPlaceholders: Episode = { ...lostStar, tellings: placeholders };

/** What a child with these interests hears: "written", a telling's id, or null (the story brain). */
function picked(interests: string[], episode = withPlaceholders): string | null {
  const pick = pickTelling(episode, interests);
  return pick === null || pick === "written" ? pick : pick.id;
}

/** A telling as a generated story for one name, in outline order, ready for validateGenerated. */
function filledIn(t: Telling, name: string) {
  return { screens: outlineIds.map((id) => ({ id, narration: (t.screens[id] ?? []).map((line) => line.replaceAll("{name}", name)) })) };
}

const linesOf = (t: Telling) => Object.values(t.screens).flat();

describe("sameInterest", () => {
  it("ignores case, extra spaces, a leading 'the' and a simple plural", () => {
    expect(sameInterest("dinosaurs", "Dinosaur")).toBe(true);
    expect(sameInterest("dinosaurs", "  The   Dinosaurs ")).toBe(true);
    expect(sameInterest("the ocean", "ocean")).toBe(true);
    expect(sameInterest("buses", "bus")).toBe(true);
    expect(sameInterest("ponies", "pony")).toBe(true);
    expect(sameInterest("horses", "horse")).toBe(true);
    expect(sameInterest("princesses", "princess")).toBe(true);
    expect(sameInterest("choo choo trains", "choo-choo train")).toBe(true);
  });

  it("matches whole phrases only", () => {
    expect(sameInterest("animals", "sea animals")).toBe(false);
    expect(sameInterest("dinosaurs", "baby dinosaurs")).toBe(false);
    expect(sameInterest("space", "")).toBe(false);
    expect(sameInterest("", "")).toBe(false);
  });
});

describe("pickTelling", () => {
  it("gives Charles, who loves dinosaurs, the dinosaur telling", () => {
    expect(picked(["dinosaurs"])).toBe("dinosaurs");
    expect(picked(["Dinosaurs"])).toBe("dinosaurs");
    expect(picked(["the dinosaurs"])).toBe("dinosaurs");
    expect(picked(["dinosaur"])).toBe("dinosaurs");
    expect(picked(["dino"])).toBe("dinosaurs");
  });

  it("returns the telling itself, ready to apply", () => {
    expect(pickTelling(withPlaceholders, ["the ocean"])).toBe(placeholders.find((t) => t.id === "ocean"));
  });

  it("plays the written story when it is already about the first interest that matches", () => {
    expect(picked(["space", "dinosaurs"])).toBe("written");
    expect(picked(["Planets"])).toBe("written");
    expect(picked(["the moon"])).toBe("written");
    expect(picked(MIA.interests)).toBe("written");
  });

  it("walks the interests in order", () => {
    expect(picked(["dinosaurs", "space"])).toBe("dinosaurs");
    expect(picked(["robots", "trains"])).toBe("trains");
    expect(picked(["robots", "volcanoes", "the sea"])).toBe("ocean");
  });

  it("returns null when nothing matches, so the story brain may write one", () => {
    expect(picked(["robots"])).toBeNull();
    expect(picked(["baby dinosaurs"])).toBeNull();
    expect(picked([])).toBeNull();
    expect(picked(["space"], { ...lostStar, about: undefined, tellings: undefined })).toBeNull();
  });

  it("understands synonyms and plurals from the match lists", () => {
    expect(picked(["bus"])).toBe("trucks");
    expect(picked(["puppy"])).toBe("animals");
    expect(picked(["pony"])).toBe("animals");
    expect(picked(["butterfly"])).toBe("bugs");
    expect(picked(["princess"])).toBe("castles");
    expect(picked(["sea animals"])).toBe("ocean");
    expect(picked(["Colours"])).toBe("drawing");
    expect(picked(["choo choo train"])).toBe("trains");
  });
});

describe("applyTelling", () => {
  const dinos: Telling = {
    id: "dinosaurs",
    interests: TELLING_INTERESTS.dinosaurs,
    screens: {
      go: ["A tiny dinosaur is buckled into the rocket.", "To start the rocket, read the word on the button."],
      "home:success": ["Thank you, {name}.", "Tomorrow, the star wants to show you Saturn's rings."],
      bonus: ["Not an outline id, so it is never shown."],
    },
  };

  it("swaps only the ids the telling has, with tell- ids", () => {
    const ep = applyTelling(lostStar, dinos);
    expect(ep.screens[1].narration).toEqual([
      { id: "tell-dinosaurs-go-0", text: "A tiny dinosaur is buckled into the rocket." },
      { id: "tell-dinosaurs-go-1", text: "To start the rocket, read the word on the button." },
    ]);
    expect(ep.screens[5].onSuccess.narration.map((l) => l.id)).toEqual(["tell-dinosaurs-home:success-0", "tell-dinosaurs-home:success-1"]);
    // Everything else stays as written.
    expect(ep.screens[0].narration).toBe(lostStar.screens[0].narration);
    expect(ep.screens[1].onSuccess.narration).toBe(lostStar.screens[1].onSuccess.narration);
    expect(ep.screens[5].narration).toBe(lostStar.screens[5].narration);
    expect(JSON.stringify(ep)).not.toContain("never shown");
  });

  it("keeps hints, give-up lines, count steps and numbers as written, and never changes the original", () => {
    const before = JSON.stringify(lostStar);
    const ep = applyTelling(lostStar, dinos);
    ep.screens.forEach((s, i) => {
      expect(s.interaction).toBe(lostStar.screens[i].interaction);
      expect(s.onHelp).toBe(lostStar.screens[i].onHelp);
      expect(s.art).toBe(lostStar.screens[i].art);
    });
    expect(JSON.stringify(lostStar)).toBe(before);
  });

  it("leaves generated stories on gen- ids", () => {
    const ep = applyGenerated(lostStar, { screens: [{ id: "go", narration: ["Ready, set, read!"] }] });
    expect(ep.screens[1].narration[0].id).toBe("gen-go-0");
  });
});

describe("TELLING_INTERESTS", () => {
  const lists = Object.entries(TELLING_INTERESTS);

  it("starts each list with its interest chip, and every chip but space starts one", () => {
    for (const [id, words] of lists) {
      expect(IDEAS, id).toContain(words[0]);
      expect(sameInterest(words[0], id), id).toBe(true);
    }
    expect(lists.map(([, words]) => words[0]).sort()).toEqual(IDEAS.filter((i) => i !== "space").sort());
  });

  it("is lowercase and tidy", () => {
    for (const [id, words] of lists) {
      for (const w of words) expect(w, id).toBe(w.toLowerCase().replace(/\s+/g, " ").trim());
      expect(new Set(words).size, id).toBe(words.length);
    }
  });

  it("never lets one word pick two tellings, or something the written story is about", () => {
    for (const [id, words] of lists) {
      for (const w of words) {
        const others = lists.filter(([other, list]) => other !== id && list.some((x) => sameInterest(x, w))).map(([other]) => other);
        expect(others, `"${w}" (${id}) also picks`).toEqual([]);
        expect(about.filter((a) => sameInterest(a, w)), `"${w}" (${id}) is already the written story`).toEqual([]);
      }
    }
  });
});

describe("lostStarTellings: each written telling passes the same checks as generated narration", () => {
  it("has at most one telling per theme, each named in TELLING_INTERESTS", () => {
    const ids = lostStarTellings.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(Object.keys(TELLING_INTERESTS), id).toContain(id);
  });

  it("covers every outline id, and nothing else", () => {
    for (const t of lostStarTellings) expect(Object.keys(t.screens).sort(), t.id).toEqual([...outlineIds].sort());
  });

  it("passes validateGenerated for Charles, Mia, Zoë and Maximiliano, already tidy", () => {
    for (const t of lostStarTellings) {
      for (const name of ["Charles", "Mia", "Zoë", "Maximiliano"]) {
        const result = validateGenerated(filledIn(t, name), outline, { name, age: 5, interests: [t.interests[0]] });
        expect(result.ok ? [] : result.errors, `${t.id} for ${name}`).toEqual([]);
        // What is checked is exactly what plays: no stray spaces or dashes for tidying to fix.
        expect(result.ok && result.value, `${t.id} for ${name}`).toEqual(filledIn(t, name));
      }
    }
  });

  it("passes the blocklist on every line", () => {
    for (const t of lostStarTellings) {
      for (const line of linesOf(t)) {
        const verdict = blocklistCheck(line.replaceAll("{name}", "Charles"));
        expect(verdict.reasons, `${t.id}: ${line}`).toEqual([]);
      }
    }
  });

  it("has no em or en dashes", () => {
    for (const t of lostStarTellings) {
      for (const line of linesOf(t)) expect(line, t.id).not.toMatch(/[\u2014\u2013]/);
    }
  });

  it("says {name} two to eight times", () => {
    for (const t of lostStarTellings) {
      const count = linesOf(t).join(" ").split("{name}").length - 1;
      expect(count, `${t.id} says {name} ${count} times`).toBeGreaterThanOrEqual(2);
      expect(count, `${t.id} says {name} ${count} times`).toBeLessThanOrEqual(8);
    }
  });

  it("ends by naming Saturn, tomorrow's story", () => {
    for (const t of lostStarTellings) expect((t.screens["home:success"] ?? []).join(" "), t.id).toMatch(/\bSaturn\b/);
  });

  it("uses its match list from TELLING_INTERESTS", () => {
    for (const t of lostStarTellings) expect(t.interests, t.id).toEqual(TELLING_INTERESTS[t.id]);
  });

  it("never lets one interest pick two tellings, or the written story", () => {
    for (const t of lostStarTellings) {
      for (const w of t.interests) {
        const picks = lostStarTellings.filter((o) => o.interests.some((x) => sameInterest(x, w))).map((o) => o.id);
        expect(picks, `"${w}"`).toEqual([t.id]);
        expect(picked([w], lostStar), `"${w}"`).toBe(t.id);
      }
    }
  });
});

describe("interest chips", () => {
  it("space plays the written story", () => {
    expect(picked(["space"], lostStar)).toBe("written");
  });

  // Expected to fail until the written tellings are pasted into content/episodes/lost-star-tellings.ts.
  it("every other chip picks its own written telling", () => {
    const ownTelling = (chip: string) => {
      const pick = pickTelling(lostStar, [chip]);
      return pick !== null && pick !== "written" && pick.interests[0] === chip;
    };
    const missing = IDEAS.filter((i) => i !== "space" && !ownTelling(i));
    expect(missing, `No written telling yet for: ${missing.join(", ")}. Paste the stories into content/episodes/lost-star-tellings.ts.`).toEqual(
      [],
    );
  });
});
