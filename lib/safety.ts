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
    ],
  },
  {
    label: "romance",
    terms: [
      "kiss", "kisses", "kissed", "kissing", "boyfriend", "girlfriend", "sexy", "sex", "naked", "marry",
      "married", "marriage", "romance", "romantic", "in love", "sweetheart",
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
    terms: ["stupid", "idiot", "dumb", "shut up", "hate", "hell", "damn", "crap", "ass"],
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
 */
export function maskName(text: string, name: string, mask = "[name]"): string {
  if (!name.trim()) return text;
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${termSource(name)})(?=$|[^\\p{L}\\p{N}])`, "giu");
  return text.replace(re, `$1${mask}`);
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
