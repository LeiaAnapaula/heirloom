# The Primer

A storybook for children ages 4 to 6 that wakes up, reads aloud, and listens back.
The full build spec lives in `CLAUDE.md`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000 in Chrome. Tap **Open the book**: that first tap lets the browser speak,
play sounds, and go full screen.

## Keys (optional)

Copy `.env.example` to `.env.local` and fill in what you have. Everything works with no keys:

| Key | What it adds | Without it |
|---|---|---|
| `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` | The soft ElevenLabs narrator | The browser's own voice |
| `ANTHROPIC_API_KEY` | Stories retold for each child's interests (Leo, Ava, or a real child) | The written story, with the child's name |
| `SESSION_SECRET` | Signs grown-up sign-in cookies (required in production) | Made for you on first run in development |

With the ElevenLabs keys set, run `npm run audio` once to pre-make Mia's whole episode into `public/audio/`.
Those files play instantly and cost nothing after the first run.

## Grown-up accounts

A parent can make an account at `/join`, agree to the note for parents, and add up to four children (first name, age,
and one to three things they love). The book then reads to that child by name, retells the story around their interests
(with an Anthropic key), and saves their progress to the account so it follows them to any device.

For the demo, accounts live in `.data/accounts.json` on this machine (never committed): passwords are hashed with scrypt,
sign-in is a signed httpOnly cookie, and **Delete account and all data** on the grown-up page removes everything.
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
- Creating a new personal story takes two Claude calls (often 20 to 60 seconds). Open each demo child once before
  recording so the story is already cached.

## Scripts

- `npm test` runs the unit tests (Vitest)
- `npm run typecheck` checks TypeScript
- `npm run lint` runs ESLint
- `npm run audio` pre-generates narration with ElevenLabs (needs keys)
- `npm run sfx` rebuilds the sound effects in `public/sfx/`

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a production build on every push.
