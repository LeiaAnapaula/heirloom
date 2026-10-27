# Heirloom

*"The world Grandpa and I built."*

Every story a grandparent tells (a memory, a dream, something made up) becomes a world their grandchild can
explore and build in. Each thing the child builds goes back to the grandparent, who answers with the next story.

## The loop

1. **Grandpa tells.** Any story, by voice. An AI interviewer asks a few gentle questions ("What did the house smell
   like? Who was there?") and the story becomes a 3D world the child can zoom into and explore.
2. **I build.** The child adds something of their own: a bridge, a house, a garden. The learning lives in the
   building: counting the planks, reading the sign, naming what they made, in Grandpa's language too.
3. **Grandpa answers.** "Mia built a bridge to your village!" goes back to Grandpa, and his reply is the next story.
   Tap anything in the world and you hear Grandpa's own voice telling that part.

**Not** a game with levels or streaks, **not** an AI friend, **not** a chat. The world is a conversation between
generations, and it is measured by time together, not time on screen.

## Why

Children are lonely and hooked on fast rewards, and so many grandparents are lonely too. Heirloom turns a phone call
into a shared place, and the only reward is the person on the other side answering.

## What exists today

Heirloom grows out of **The Primer**, a working AI storybook for children 4 to 6 (the full build spec is `CLAUDE.md`).
It is built, tested (446 unit tests, end-to-end runs in headless Chrome) and committed milestone by milestone:

- **A living book**: it glows, opens, turns its pages and reads aloud in one narrator voice, with captions that light
  up word by word (`components/`).
- **Learning by doing**: reading a word aloud with gentle sound-it-out hints, tracing a letter with the magic pencil,
  counting, and a real physics moment. Every page works by voice or by tap and never traps a child.
- **Skills and adaptation**: every answer updates a skill score, and tomorrow's plan adapts (`lib/skills.ts`,
  `lib/adapt.ts`). Grown-ups see a summary behind a parent check (`/parent`).
- **Story brain**: every child hears the episode woven around their name and what they love, picked in this order
  (`lib/story.ts`):
  1. a **written telling** for their theme (dinosaurs, the ocean, trucks...), the moment the book opens
     (`content/episodes/lost-star-tellings.ts`). A child who loves space hears the written story, which is about space;
  2. else a **live story from Claude** (with `ANTHROPIC_API_KEY`);
  3. else, **only if the server opts in** with `GEMINI_STORIES=on` (and `GEMINI_API_KEY`), a **live story from
     Gemini**, for made-up demo profiles only (see below);
  4. else the **written story**, with the child's name.

  Written tellings pass the same checks as generated lines, and every generated line passes a safety check before a
  child hears it (`lib/safety.ts`).

  **Gemini stories are off by default, and are not for real children.** Google's Gemini API terms do not allow it in
  apps meant for children, the free tier may use what it is sent to improve Google's models, and the note parents
  agree to names only Anthropic as the story partner. `GEMINI_API_KEY` alone never turns them on (the World Builder
  scripts use that key too); the server must also say `GEMINI_STORIES=on`, exactly. When it does, **Gemini never
  receives the child's name**: the story is written for a stand-in name, picked without looking at the real one, and
  Google gets only that, the child's age and interests, with `store: false` on every request. The name is looked for
  in any spelling a parent might type: case, accents, letters like ø and ł, wide letters, and spaces or hyphens added
  or dropped ("soren boats" for Søren becomes "Tavi boats"). The real name goes back in on our own server, and a
  request that still holds it is never sent (`lib/server/story-gemini.ts`). A nickname or the name in another
  alphabet cannot be matched, which is one more reason these stories are for made-up profiles only.

  New live stories are capped per caller and, for everyone together, at 20 an hour; a story Gemini turns down before
  asking (to keep a name private) is not counted. Each one is cached on this server with the child's name masked,
  under a file name keyed with the server's secret (`.cache/story`). A story that still holds the name in another
  spelling ("Zoe" for Zoë) stays in memory only and is never written to disk.
- **Grown-up accounts**: parental consent first, children added by first name, age and interests only, progress
  saved per child, and **Delete account** removes the account, its children and their progress. Live stories
  already written stay in the story cache, with the name masked (see Grown-up accounts below; `app/api/`, `lib/server/`).
- **World Builder**: living Three.js worlds built and verified by Gemini 4 Argon (below). This is the first step toward
  Heirloom's worlds.

## Grandpa's world in 3D (`/world`)

Open http://localhost:3000/world. Grandpa's village is a World Labs Marble world, streamed straight from Marble's
CDN and drawn with Spark (World Labs' gaussian-splat renderer for three.js). A light 2.4 MB version opens in a second
or two everywhere; on laptops and desktops the full 68.5 MB version loads in the background and swaps in.

The HUD on top:

- **Grandpa's card**: his portrait, the line he is telling, and "Play the story", which glides the camera to each
  moment while the line is read aloud.
- **Story path**: the four moments of the story, numbered like the markers floating in the world, plus everything the
  child has built.
- **Readouts**: a compass, how high you are, how far the next story moment is, and a measuring card for the piece you
  are about to place ("8 planks, 3.2 m long").
- **Moving**: drag to look, W A S D or the on-screen pad to walk, pinch or scroll to step forward.
- **Changing the world**: morning, day, sunset, or night with fireflies.
- **Build mode**: a hotbar of eight pieces (bridge, garden, house, treehouse, lantern, bench, boat, tree), turn, longer
  or shorter for the bridge, place, undo, and **Show Grandpa**, which turns the build into a postcard.

What the child builds stays on the device (`?fresh` starts an empty world for rehearsals; `?quality=preview` skips the
big download). A new story is a new copy of `components/world/config.ts`: the splat files, Grandpa's lines, and where
the camera stands for each moment.

## Next: from story to world

- [ ] Grandparent recorder with the AI interviewer (memories, dreams, anything)
- [ ] Story to world plan: Opus 5.5 turns the story into places, people, objects, colors and tap points; a 3D world
      model (World Labs) and the World Builder turn the plan into an explorable world
- [ ] Zoom, orbit and tap-to-dive into details, with Grandpa's own voice at every tap point
- [ ] Build mode for the child, with learning moments inside the building
- [ ] The reply loop: the child's build goes to Grandpa, Grandpa's answer becomes the next story
- [ ] Each story adds a new place to the family's map, so the worlds grow into a family atlas

## Gemini 4 Argon hackathon (Oct 25, 2026): what was built here

Everything in this repo was written on Oct 25, 2026 during the hackathon (first commit 11:40 AM, see `git log`).

**Track: More Dimensions.** One-shot AI art breaks lessons: a counting page that shows 5 planets when the
lesson says 4 teaches the wrong number. The **World Builder** (`scripts/build-world.mts`) makes one
**Antigravity managed-agent** call with **Gemini 4 Argon** in a Google-hosted sandbox. Argon:

1. builds the lesson page as a living Three.js world (`scene.html`),
2. writes a headless-Chrome check of the lesson (`verify.mjs`): exact planet count, everything in frame,
   nothing on the book's fold, the narration and number-button bands clear, readable top, it moves, zero errors,
   the page's API (`highlight`, `addPlanet`) works, and it is ready within 1 second of loading,
3. renders, reads the failures and screenshots, fixes the scene, and loops until every check passes.

The world, its `report.json` (score per round) and a screenshot per round come home to a new folder for
each run, `public/worlds/count-<N>-<time>/`, so a failed rebuild never touches the world the book is using. It is saved pointing at the app's own copy of three.js (`public/worlds/vendor/`),
so the book never waits on a CDN, and `scripts/world-check.ts` checks that saved copy again here, served the
way the book serves it. Only a world that passes both the agent's checks and these goes into the book: the
child still says or taps the number, and the book lights each planet as it counts.
`scripts/build-world-local.mts` runs the same loop with every round checked on this machine instead.

```bash
npx tsx scripts/argon-hello.mts          # first calls: Argon, then the managed agent
npx tsx scripts/build-world.mts 4        # build and verify the 4-planet counting page
```

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome (if that port is busy, the dev server prints the one it picked). Tap **Open the book**: that first tap lets the browser speak,
play sounds, and go full screen.

## Keys (optional)

Copy `.env.example` to `.env.local` and fill in what you have. Everything works with no keys:

| Key | What it adds | Without it |
|---|---|---|
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | The soft ElevenLabs narrator | The browser's own voice |
| `ANTHROPIC_API_KEY` | Live stories for interests with no written telling (robots, volcanoes...) | Gemini, if `GEMINI_STORIES=on`; else the written story, with the child's name |
| `SESSION_SECRET` | Signs grown-up sign-in cookies and keys the story cache's file names (required in production) | Made for you on first run in development; in production, no sign-in and no story cache on disk |
| `GEMINI_API_KEY` | The World Builder scripts (Gemini 4 Argon), and Gemini stories when `GEMINI_STORIES=on` | The book's own counting scene |
| `GEMINI_STORIES` | `on` (exactly) turns on live stories from Gemini when there is no Anthropic key, written for a stand-in name and never sent the child's name in any spelling we can match. **Only for made-up demo profiles**: Google's terms do not allow Gemini in apps meant for children, the free tier may train on what it gets, and the parent consent names only Anthropic | Off: the written story, with the child's name |

With the ElevenLabs keys set, run `npm run audio` once to pre-make Mia's whole episode into `public/audio/`.
Those files play instantly and cost nothing after the first run.

## Grown-up accounts

A parent can make an account at `/join`, agree to the note for parents, and add up to four children (first name, age,
and one to three things they love). The book then reads to that child by name, retells the story around their interests
(a written telling for every interest you can tap, a live story for anything typed in with a Claude key),
and saves their progress to the account so it follows them to any device.

For the demo, accounts live in `.data/accounts.json` on this machine (never committed): passwords are hashed with scrypt,
sign-in is a signed httpOnly cookie, and **Delete account and all data** on the grown-up page removes the account, its
children and their progress. Live stories already written stay in the story cache (`.cache/story`): they are stored
with the child's name masked, under file names keyed with the server's secret, and deleting that folder clears them.
To let people sign up from other devices, swap `lib/server/accounts.ts` for a hosted database (Supabase is the plan) and deploy.

## On an iPad

The microphone only works on a secure page. Two ways:

1. **Deploy** (cleanest for the demo video): push to GitHub, import into Vercel, add the keys there, open the https link on the iPad.
2. **Same wifi**: run `npm run dev:ipad`, then open `https://<your-mac-name>.local:3000` on the iPad and accept the certificate warning once.

For a true full-screen book, use Safari's Share menu, **Add to Home Screen**, then open the book from the Home Screen and
**sign in there** (a Home Screen app keeps its own sign-in, separate from Safari). Hold the iPad sideways.

### Deploying to Vercel

- Add `SESSION_SECRET` (any random 32+ characters) in the project's environment variables, or sign-in is turned off.
- Vercel's disk is read-only except a temporary folder that is wiped when the server restarts. The app writes caches and
  demo accounts there, so **accounts on a Vercel demo can disappear**. That is fine for recording the video; before real
  families sign up, move `lib/server/accounts.ts` to a hosted database (Supabase).
- Children whose interests have a written telling never wait. A new live story takes two model calls (often 20 to 60
  seconds with Claude, about 10 with Gemini). Open each demo child once before recording so the story is already cached.

## Scripts

- `npm test` runs the unit tests (Vitest)
- `npm run typecheck` checks TypeScript
- `npm run lint` runs ESLint
- `npm run audio` pre-generates narration with ElevenLabs (needs keys)
- `npm run sfx` rebuilds the sound effects in `public/sfx/`

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a production build on every push.
