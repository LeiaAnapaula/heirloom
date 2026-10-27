/**
 * The safety check every generated line passes before a child sees it.
 * First a blocklist (pure, instant, runs anywhere), then a second Claude call that
 * answers "safe for a 5-year-old: yes or no" for whatever the blocklist let through.
 * Anything uncertain counts as unsafe: we fail closed and the written narration plays.
 */

export type SafetyVerdict = { safe: boolean; reasons: string[] };

// Words and phrases, matched whole (so "skill" never trips "kill" and "grape" never trips "rape").
// Matching ignores case, accents, and the gap in "spider-man" / "spiderman" / "spider man".
const CATEGORIES: { label: string; terms: string[] }[] = [
  {
    label: "violent or scary",
    terms: [
      "kill", "kills", "killed", "killing", "killer", "die", "dies", "died", "dying", "dead", "deadly",
      "death", "blood", "bloody", "gun", "guns", "knife", "knives", "sword", "swords", "weapon", "weapons",
      "fight", "fights", "fighting", "fought", "hurt", "hurts", "hurting", "scary", "scare", "scared",
      "scream", "screams", "screaming", "monster", "monsters", "ghost", "ghosts", "nightmare", "nightmares",
      "attack", "attacks", "attacked", "bomb", "bombs", "war", "wars", "poison", "poisonous", "murder",
      "stab", "choke", "drown", "drowned", "evil", "devil", "demon", "zombie", "zombies", "vampire",
      "witch", "terrified", "terrifying", "horror", "creepy", "eat you", "rape",
      // more word forms and plain harms; never "shooting" (shooting stars) or "skeleton" (dinosaur bones)
      "stabbed", "stabbing", "choked", "choking", "drowning", "murdered", "murderer", "bleed", "bleeding",
      "punch", "punched", "punching", "kidnap", "kidnapped", "kidnapper", "strangle", "torture", "corpse",
      "suicide", "self harm", "hang yourself", "hit you", "hurt you", "beat you up", "gunshot",
    ],
  },
  {
    label: "romance",
    terms: [
      "kiss", "kisses", "kissed", "kissing", "boyfriend", "girlfriend", "sexy", "sex", "naked", "marry",
      "married", "marriage", "romance", "romantic", "in love", "sweetheart", "lovers", "sexual", "nude", "porn",
    ],
  },
  {
    label: "grown-up things",
    terms: [
      "beer", "wine", "drunk", "alcohol", "vodka", "whiskey", "cocktail", "cigarette", "cigarettes",
      "vape", "drug", "drugs", "casino", "gambling",
    ],
  },
  {
    label: "unkind words",
    terms: [
      "stupid", "idiot", "dumb", "shut up", "hate", "hates", "hated", "hating", "hell", "damn", "crap", "ass",
      "shit", "fuck", "bitch", "bastard", "loser", "ugly",
    ],
  },
  {
    label: "personal information",
    terms: [
      "address", "where do you live", "where you live", "phone number", "telephone", "last name",
      "full name", "what school", "your school", "your street", "password", "email", "e-mail",
      "keep a secret", "our secret", "don't tell", "photo of you", "picture of you", "credit card",
    ],
  },
  {
    label: "real brand, character or person",
    terms: [
      "disney", "pixar", "pokemon", "pikachu", "elsa", "olaf", "mickey", "barbie", "lego", "minecraft",
      "roblox", "fortnite", "spider-man", "batman", "superman", "hulk", "iron man", "avengers",
      "captain america", "wonder woman", "paw patrol", "peppa", "bluey", "sesame street", "elmo",
      "star wars", "harry potter", "toy story", "lightyear", "lightning mcqueen", "moana", "simba",
      "nemo", "dora", "mario", "nintendo", "shrek", "snoopy", "scooby", "pooh", "hello kitty",
      "cocomelon", "blippi", "teletubbies", "paddington", "grinch", "seuss", "my little pony",
      "power rangers", "ninja turtles", "transformers", "hot wheels", "thomas the tank", "playstation",
      "xbox", "iphone", "ipad", "netflix", "youtube", "tiktok", "google", "facebook", "instagram",
      "snapchat", "whatsapp", "twitter", "mcdonald's", "burger king", "coca-cola", "pepsi", "starbucks",
      "nike", "nasa", "spacex", "einstein", "newton", "galileo", "armstrong", "aldrin", "elon musk",
      "taylor swift", "obama", "trump", "biden",
    ],
  },
];

// Brand names that are also everyday words ("a frozen lake", "marvel at the stars", "a sonic boom")
// count only when capitalized. The classifier catches the rest.
const CAPITALIZED_BRANDS = ["Frozen", "Marvel", "Sonic"];

const LINK = /\bhttps?\b|www\.|\.(?:com|net|org|io|app|tv|ly)\b|\bdot\s+com\b/i;
// Emoji and pictographs, the joiners that build them, and the trademark-style symbols.
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}\u{2122}\u{00A9}\u{00AE}]/u;
// Four or more digits in a row, maybe split by spaces, dots or dashes: phone numbers, codes.
const LONG_DIGITS = /\d(?:[\s.-]?\d){3,}/;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Regex source for one term: spaces stretch, hyphens and apostrophes are optional. */
function termSource(term: string): string {
  return term
    .trim()
    .split(/\s+/)
    .map((word) =>
      word
        .split(/['\u2019]/)
        .map((part) => part.split("-").map(escapeRegExp).join("[\\s-]?"))
        .join("['\\u2019]?"),
    )
    .join("\\s+");
}

// Whole-word edges without lookbehind, which older iPad Safari cannot parse.
const bounded = (alternatives: string, flags: string) =>
  new RegExp(`(?:^|[^\\p{L}\\p{N}])(${alternatives})(?=$|[^\\p{L}\\p{N}])`, flags);

const CATEGORY_PATTERNS = CATEGORIES.map((c) => ({
  label: c.label,
  re: bounded(c.terms.map(termSource).join("|"), "iu"),
}));
const CAPITALIZED_PATTERN = bounded(CAPITALIZED_BRANDS.map(termSource).join("|"), "u");

/** Strip accents so "Pokémon" reads as "Pokemon". */
const plain = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "");

/** True if `term` appears in `text` as a whole word or phrase, ignoring case and accents. */
export function hasTerm(text: string, term: string): boolean {
  if (!term.trim()) return false;
  return bounded(termSource(plain(term)), "iu").test(plain(text));
}

export function hasLink(text: string): boolean {
  return LINK.test(text);
}

export function hasEmoji(text: string): boolean {
  return EMOJI.test(text);
}

/**
 * Swap the child's name for a placeholder before checking. A child named Elsa should
 * not trip the brand list, and the classifier never needs to see the name at all.
 * Text and name are both put in the same Unicode form (NFC) first, so a name typed in
 * pieces (a Korean name as separate jamo, a Greek accent as its own mark) still matches
 * lines that were tidied into the composed form, and the other way round.
 */
export function maskName(text: string, name: string, mask = "[name]"): string {
  const composedName = name.normalize("NFC");
  if (!composedName.trim()) return text;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${termSource(composedName)})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return text.normalize("NFC").replace(re, `$1${mask}`);
}

// ---------------------------------------------------------------- the child's name, in any spelling

// Letters with no accent to strip, read the way a plain keyboard types them. Final sigma reads as
// sigma, so a Greek name in capitals still matches.
const PLAIN_LETTERS: Record<string, string> = {
  ø: "o", ł: "l", đ: "d", ð: "d", ħ: "h", ŧ: "t", ı: "i", æ: "ae", œ: "oe", ß: "ss", þ: "th", ς: "σ",
};
// Letters shaped like apostrophes (the Hawaiian ʻokina, ʼ) count for nothing.
const SILENT_LETTERS = /[ʹ-ʿ]/gu;

/** One character as the name check reads it: lowercase, no accents, wide or fancy forms as plain letters, ø as o. */
function foldChar(ch: string): string {
  const bare = ch.normalize("NFKD").toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(SILENT_LETTERS, "");
  return Array.from(bare, (c) => PLAIN_LETTERS[c] ?? c).join("");
}

/** Text as the name check reads it: "Søren", "SOREN" and "ｓｏｒｅｎ" all read "soren". */
export const fold = (text: string) => Array.from(text, foldChar).join("");

// What may join the parts of a name, or be left out: "Mary Ann", "Mary-Ann", "MaryAnn".
const GAP = "[\\s'\\u2018\\u2019\\p{Pd}]*";

/**
 * Regex source for a folded name whose parts may be joined by any gap or none. With `gapsAnywhere`
 * a gap may fall between any two letters too ("mary ann" for Maryann). Null when folding leaves nothing.
 */
function nameSource(name: string, gapsAnywhere: boolean): string | null {
  const parts = fold(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length === 0) return null;
  return (gapsAnywhere ? Array.from(parts.join("")) : parts).map(escapeRegExp).join(GAP);
}

/** Where the name is in `text`, in any spelling, as [start, end) positions in `text` itself. */
function nameRanges(text: string, name: string, gapsAnywhere: boolean): [number, number][] {
  const source = nameSource(name, gapsAnywhere);
  if (!source) return [];
  // Fold one character at a time, remembering which character each folded piece came from.
  const chars = Array.from(text);
  const starts: number[] = [];
  const owner: number[] = [];
  let folded = "";
  let at = 0;
  chars.forEach((ch, i) => {
    starts.push(at);
    at += ch.length;
    const f = foldChar(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) owner.push(i);
  });
  starts.push(at);

  const ranges: [number, number][] = [];
  for (const m of folded.matchAll(bounded(source, "gu"))) {
    const first = (m.index ?? 0) + m[0].length - m[1].length;
    let end = owner[first + m[1].length - 1] + 1;
    // Accent marks typed after the name (a name in pieces) go with it.
    while (end < chars.length && foldChar(chars[end]) === "") end++;
    ranges.push([starts[owner[first]], starts[end]]);
  }
  return ranges;
}

/**
 * Swap the child's name for `mask` in every spelling: case, accents, letters like ø and ł, wide
 * letters, and spaces, hyphens or apostrophes between its parts added or left out. Used on text a
 * model reads (interests, lines for the classifier). maskName stays exact for text a child hears,
 * so "angel" never turns into a child's name Ángel.
 */
export function maskAnySpelling(text: string, name: string, mask = "[name]", { gapsAnywhere = false } = {}): string {
  const composed = text.normalize("NFC");
  let out = "";
  let from = 0;
  for (const [start, end] of nameRanges(composed, name, gapsAnywhere)) {
    out += composed.slice(from, start) + mask;
    from = end;
  }
  return out + composed.slice(from);
}

/**
 * True when `text` holds the name in any spelling maskAnySpelling would swap. A name that folds to
 * nothing cannot be looked for, so it counts as there: whatever asks then sends nothing.
 */
export function holdsName(text: string, name: string): boolean {
  const source = nameSource(name, false);
  if (!source) return name.trim() !== "";
  return bounded(source, "u").test(fold(text));
}

/** The instant, offline half of the check. Pure: same line in, same verdict out. */
export function blocklistCheck(line: string): SafetyVerdict {
  const text = plain(line);
  const reasons: string[] = [];
  for (const { label, re } of CATEGORY_PATTERNS) {
    const m = re.exec(text);
    if (m) reasons.push(`${label}: ${m[1].toLowerCase()}`);
  }
  const cap = CAPITALIZED_PATTERN.exec(text);
  if (cap) reasons.push(`real brand, character or person: ${cap[1].toLowerCase()}`);
  if (LINK.test(text)) reasons.push("link");
  if (EMOJI.test(line)) reasons.push("emoji or symbol");
  if (LONG_DIGITS.test(text)) reasons.push("long number");
  return { safe: reasons.length === 0, reasons };
}

/**
 * Check many lines: the blocklist first, then `classify` on only the lines that passed it.
 * `classify` answers true (safe) or false for each line it is given, in order.
 * A classifier error, a missing answer, or anything but `true` makes that line unsafe.
 * Without `classify`, the blocklist alone decides.
 */
export async function checkLines(
  lines: string[],
  classify?: (lines: string[]) => Promise<boolean[]>,
): Promise<SafetyVerdict[]> {
  const verdicts = lines.map(blocklistCheck);
  const pending = verdicts.flatMap((v, i) => (v.safe ? [i] : []));
  if (!classify || pending.length === 0) return verdicts;

  let answers: unknown[] | null = null;
  try {
    const result: unknown = await classify(pending.map((i) => lines[i]));
    answers = Array.isArray(result) ? result : null;
  } catch {
    answers = null;
  }

  pending.forEach((lineIndex, k) => {
    if (answers === null) {
      verdicts[lineIndex] = { safe: false, reasons: ["classifier unavailable"] };
    } else if (answers[k] !== true) {
      verdicts[lineIndex] = { safe: false, reasons: [answers[k] === false ? "classifier: unsafe" : "classifier: no answer"] };
    }
  });
  return verdicts;
}
