# The Primer: Build Spec for Claude Code

Put this file at the root of a new, empty folder named `primer`. Claude Code reads `CLAUDE.md` automatically at the start of every session, so this is the single source of truth for the build.

---

## 1. What we are building

A magical AI storybook for children ages 4 to 6. It calls the child by name, reads stories aloud in a soft voice, listens while the child reads, and teaches reading, writing, and counting through stories about what the child loves.

The first deliverable is a **working demo of one episode**, "Mia and the Lost Star," that runs in a browser on a laptop or tablet and can be recorded for a YC application video.

**The feeling:** a book that wakes up, glows, turns its own pages, and speaks to you. Intelligent elegance: soft night-sky colors, warm gold light, gentle motion, rounded modern sans-serif type. No cartoon clutter.

**Rule for every screen:** the child does something on every page (reads, traces, counts, taps). Story moves forward only when the child acts. No passive watching.

---

## 2. Who builds what

- **Leia** is the founder and product owner. She decides look, feel, and story.
- **Claude Code** builds, runs, and tests the code.
- In every session, Claude Code also **teaches Leia one concept of how this is done at scale in production** (see section 12), in two or three plain sentences, tied to the code just written.

---

## 3. Leia's machine (read before any install command)

- Intel (x86_64) MacBook Pro. **Homebrew is not supported on it. Do not use `brew`.**
- Node and Bun are available. Bun is installed at `~/.bun/bin`.
- IDE is Cursor with the Claude Code extension.
- Use `npm` or `bun` for all installs. If a tool needs a native binary, pick an alternative that works on Intel macOS.
- Leia loses time when a repo is set up in the wrong order. **Follow the milestone order in section 9 exactly. Do not skip ahead.**

---

## 4. Tech stack

| Piece | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript | One project for UI and API routes |
| Styling | Tailwind CSS | Fast, consistent design tokens |
| Animation | Framer Motion | Page turns, glow, rocket flight |
| Story brain | Claude API (`@anthropic-ai/sdk`) | Writes narration from the child profile |
| Narrator voice | ElevenLabs text-to-speech | Soft, warm voice that says the child's name |
| Listening | Browser Web Speech API first, behind an interface | Free, instant, works in Chrome for the demo |
| Magic pencil | HTML canvas + SVG stroke paths | Animated letter strokes and finger tracing |
| Data | Local JSON / in-memory for the demo | Database comes later (Supabase) |
| Tests | Vitest | Unit tests for scoring and adaptation logic |

**Important design rule:** voice, listening, and story generation each sit behind a small interface (`lib/voice.ts`, `lib/listen.ts`, `lib/story.ts`). That way the demo can use cached audio and the browser's speech recognition, and later we swap in ElevenLabs streaming or Whisper/Deepgram without touching the screens.

---

## 5. Environment variables

Create `.env.local` (never commit it; add it to `.gitignore` in milestone 1):

```
ANTHROPIC_API_KEY=
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
```

API keys are only used in server routes under `app/api/`. **Never expose a key to the browser.**

If a key is missing, the app must still run: fall back to the browser's built-in `speechSynthesis` voice and to the pre-written narration in `content/episodes/lost-star.ts`.

---

## 6. Repo structure (create in this exact shape)

```
primer/
  CLAUDE.md
  .env.local                 (not committed)
  .gitignore
  package.json
  app/
    layout.tsx
    page.tsx                 -> title screen: "Open the book"
    episode/[id]/page.tsx    -> runs an episode screen by screen
    parent/page.tsx          -> parent summary (behind a simple parent check)
    api/
      narrate/route.ts       -> text in, audio out (ElevenLabs), cached to disk
      story/route.ts         -> profile + outline in, narration lines out (Claude)
  components/
    Book.tsx                 -> the glowing book frame and page-turn animation
    Page.tsx                 -> one page: illustration + narration + interaction slot
    ReadAloud.tsx            -> shows a word, listens, judges, gives hints
    MagicPencil.tsx          -> animates a letter, then lets the child trace it
    CountPlanets.tsx         -> lights objects one by one, takes a number answer
    FeatherDrop.tsx          -> the gravity moment on the Moon
    Starfield.tsx            -> animated night-sky background
  lib/
    profile.ts               -> child profile type + Mia's demo profile
    skills.ts                -> skill scores and the update rule
    adapt.ts                 -> picks next episode's words/letters from scores
    voice.ts                 -> play(lineId) using cached audio or speechSynthesis
    listen.ts                -> listenFor(expected) using Web Speech API
    story.ts                 -> getNarration(profile, outline)
    tracing.ts               -> compares a traced stroke to a letter template
    safety.ts                -> checks generated text before a child sees it
  content/
    episodes/lost-star.ts    -> the full episode definition (section 8)
    letters/S.ts             -> stroke template for the letter S
  public/
    audio/                   -> cached narration mp3s
    art/                     -> illustrations (placeholder SVGs first)
    sfx/                     -> rumble, sparkle, page turn
  tests/
    tracing.test.ts
    skills.test.ts
    adapt.test.ts
    safety.test.ts
```

---

## 7. Data model

```ts
// lib/profile.ts
export type ChildProfile = {
  id: string;
  name: string;            // "Mia"
  age: number;             // 5
  interests: string[];     // ["space", "planets", "how things move"]
  skills: Record<SkillId, number>; // mastery 0..1
};

export type SkillId =
  | "read:GO" | "read:HOME" | "read:SUN"
  | "write:S"
  | "count:to5" | "count:add1"
  | "idea:gravity";

// Each attempt is logged, then skills are updated
export type Attempt = {
  skill: SkillId;
  correct: boolean;
  hintsUsed: number;       // 0, 1, 2
  ms: number;              // time to answer
};
```

**Skill update rule (simple version for the demo):**

```
if correct and hintsUsed == 0:  score += 0.3
if correct and hintsUsed >= 1:  score += 0.1
if not correct:                 score -= 0.1
clamp score to 0..1
```

A skill counts as mastered at 0.8 or above.

---

## 8. The episode: "Mia and the Lost Star"

Store this as data in `content/episodes/lost-star.ts`. Screens read from the data, so new episodes are just new data files.

Every screen has: `id`, `art`, `narration` (array of lines), `interaction` (type + config), `onSuccess`, `onHelp`.

### Screen 1: The book wakes up
- **Art:** closed book on a starry sky. It glows, then opens on its own.
- **Narration:** "Hello, Mia. A little star fell out of the sky last night, and only you can bring it home. Will you help me?"
- **Interaction:** big glowing "Yes!" button, or Mia says "yes".
- **Success:** page turns.

### Screen 2: Reading, the rocket button (skill `read:GO`)
- **Art:** Mia's rocket on a launch pad; a big button shows **GO**.
- **Narration:** "To start the rocket, read the word on the button."
- **Interaction:** `ReadAloud` expecting "go".
- **Success:** rocket rumbles and lifts off. "You did it, Mia!"
- **Help (after 5 seconds of silence or a wrong word):** "Let's sound it out together. G... O... Go!" Then she tries again. Highlight each letter as it is spoken.
- After two hints, accept the attempt with encouragement and move on. **Never trap a child on a screen.**

### Screen 3: Writing, the letter S (skill `write:S`)
- **Art:** space with a curvy dotted path; the magic pencil appears.
- **Narration:** "To steer, we draw the letter S, for Star. Watch the magic pencil."
- **Interaction:** `MagicPencil` animates S stroke by stroke, then Mia traces with a finger or mouse.
- **Success:** the rocket swoops along the exact curve she drew.
- **Help:** pencil shows it again, slower. A shaky S still counts (generous threshold).

### Screen 4: Math, counting planets (skill `count:to5`, then `count:add1`)
- **Art:** rocket flies past 4 planets that light up one at a time.
- **Narration:** "How many planets do you see, Mia?"
- **Interaction:** `CountPlanets`. She says the number or taps a big number button (1 to 6).
- **Success:** "Four planets! Let's add one more." A fifth lights up. "How many now?"
- **Help:** planets light up again one by one while the book counts with her.

### Screen 5: Physics, gravity on the Moon (skill `idea:gravity`)
- **Art:** rocket lands on the Moon; the star sits in a crater; a feather appears.
- **Narration:** "If you drop a feather on the Moon, what do you think happens?"
- **Interaction:** Mia guesses out loud (any answer accepted, logged for the parent), then taps to drop the feather. It falls slowly.
- **Narration after:** "The Moon pulls gently, Mia. That's called gravity."

### Screen 6: Bringing the star home (skill `read:HOME`)
- **Art:** Mia holds the star. The word **HOME** appears.
- **Narration:** "Read the magic word to send the star home."
- **Interaction:** `ReadAloud` expecting "home".
- **Success:** star floats into the sky and sparkles. "Thank you, Mia. Tomorrow, the star wants to show you Saturn's rings."

### Parent summary (`/parent`)
Behind a simple parent check (e.g. "What is 7 + 6?"). Shows:
- Words read: GO, HOME
- Letter practiced: S
- Counting: up to 5
- New idea: gravity (and Mia's guess)
- Tomorrow: Saturn's rings, with the next word chosen by `adapt.ts`

### Adaptation rules (`lib/adapt.ts`)
- `read:GO` mastered with no hints -> next word is **SUN**
- needed a hint on GO -> practice **GO** again in a new scene
- `write:S` below 0.5 -> bring **S** back on Saturn
- counting easy -> next episode tries simple adding

---

## 9. Milestones (build in this order, one at a time)

After each milestone: run the app, run the tests, show Leia what changed, teach one production concept, then commit to git with a clear message.

**M1. Skeleton (target: 30 min)**
Create the Next.js + TypeScript + Tailwind project, the folder structure above, `.gitignore` (including `.env.local`), and `git init`. Title screen with a glowing "Open the book" button and the starfield.
*Done when:* `npm run dev` shows the title screen with no errors.

**M2. The book and the story flow**
`Book`, `Page`, page-turn animation. Episode runner reads `lost-star.ts` and steps through all 6 screens with simple "Next" buttons as stand-ins for interactions. Mia's profile is hardcoded.
*Done when:* you can click from screen 1 to screen 6 and every narration line shows.

**M3. Voice**
`lib/voice.ts` + `/api/narrate`. Pre-generate every narration line with ElevenLabs, save to `public/audio/`, play instantly. Fallback to `speechSynthesis` if there is no key.
*Done when:* every page reads itself aloud in one soft voice, with no delay.

**M4. Read-aloud check (the hardest piece, so it comes early)**
`lib/listen.ts` + `ReadAloud`. Listen with the Web Speech API, match the expected word (lowercase, trim, accept close matches like "goh"), 5-second hint timer, two-hint maximum.
*Done when:* saying "go" launches the rocket, staying silent triggers the gentle hint.

**M5. Magic pencil**
`MagicPencil` + `lib/tracing.ts`. Animate the S template, capture the child's stroke, score it by average distance to the template after scaling both to the same box. Generous threshold.
*Done when:* a shaky S passes, a straight line does not, and the rocket follows her curve.

**M6. Counting and gravity**
`CountPlanets` and `FeatherDrop`.
*Done when:* screens 4 and 5 work by voice and by tap.

**M7. Skills, adaptation, parent summary**
`lib/skills.ts`, `lib/adapt.ts`, `/parent`. Every interaction logs an `Attempt` and updates scores.
*Done when:* the parent page shows real results from the session and a sensible next word.

**M8. Story brain (live generation)**
`/api/story` uses Claude to rewrite narration for a different profile (e.g. a child who loves dinosaurs) while keeping the same skills and structure. Every generated line passes `lib/safety.ts` before display. Cached narration stays the default for the demo.
*Done when:* switching the profile interest produces a new, safe, age-appropriate version of the episode.

**M9. Polish for the demo video**
Real illustrations in place of placeholders, sound effects, smooth transitions, full-screen landscape mode, works on an iPad in Safari or Chrome.
*Done when:* the whole episode runs start to finish in 10 to 15 minutes without a hiccup.

---

## 10. Claude prompt for story generation (`/api/story`)

System prompt (keep it in `lib/story.ts`):

```
You are the narrator of a magical storybook for a young child.
Write in short, warm, simple sentences a 5-year-old understands.
Always use the child's name. Weave in their interests.
Each line must set up the learning task given for that screen and nothing else.
Never include anything scary, violent, romantic, or about real brands, characters, or people.
Never ask the child for personal information.
Return JSON only: { "screens": [ { "id": string, "narration": string[] } ] }
```

User message: the child profile (name, age, interests only) plus the episode outline with the skill for each screen.

---

## 11. Safety and privacy (non-negotiable)

- This product is for children under 13, so it falls under **COPPA**. A parent creates the account and gives consent before a child uses it. For the demo, use only made-up profiles like Mia, or a real child only with the parent's written permission.
- Collect only what the episode needs: first name, age, interests, skill scores.
- **Never store raw voice recordings.** Speech is turned into text in the browser and discarded.
- Child data is never used for anything other than teaching that child.
- Send only first name, age, and interests to the Claude API. No last names, locations, photos, or voice.
- Every generated line passes `lib/safety.ts` (a blocklist plus a second Claude call that answers "safe for a 5-year-old: yes or no") before a child sees it.
- No ads, no links out of the app, no chat with strangers.
- No real movie or TV characters, logos, or plots. All worlds and characters are original.

---

## 12. Production concepts to teach Leia along the way

Teach one per milestone, in plain language, tied to the code just written:

1. **M1: Environment variables and secrets.** Why keys live on the server and never in the browser.
2. **M2: Content as data.** Why episodes are data files: writers can add stories without engineers.
3. **M3: Caching and CDNs.** Pre-generating audio and serving it from a CDN is how apps make voice feel instant and keep costs low.
4. **M4: Abstraction layers.** `listen.ts` hides which speech engine we use, so we can swap the browser for Whisper or Deepgram later.
5. **M5: Scoring with tolerance.** Real handwriting apps use similar distance metrics plus thresholds tuned on real kids' samples.
6. **M6: Accessibility.** Every voice interaction also works by tap, for kids who are shy, nonverbal, or in a noisy room.
7. **M7: Knowledge tracing.** Big edtech uses models like Bayesian Knowledge Tracing to estimate what a child knows after each answer; our update rule is the simple version.
8. **M8: Eval sets and guardrails.** A library of test profiles is run through the story generator on every change, and every output is checked for safety before shipping.
9. **M9: CI/CD.** Tests run automatically on every push (GitHub Actions), and the app deploys to Vercel only when they pass.

---

## 13. Definition of done for the demo

- Runs from `npm run dev` on Leia's Intel Mac with one command.
- All 6 screens work end to end by voice and by tap.
- One consistent, soft narrator voice that says the child's name.
- Parent summary shows real results from the session.
- All tests pass.
- No API keys in the code or in git history.
- Looks and feels like a living, glowing book.
