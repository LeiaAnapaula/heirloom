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

With the ElevenLabs keys set, run `npm run audio` once to pre-make Mia's whole episode into `public/audio/`.
Those files play instantly and cost nothing after the first run.

## On an iPad

The microphone only works on a secure page. Two ways:

1. **Deploy** (cleanest for the demo video): push to GitHub, import into Vercel, add the keys there, open the https link on the iPad.
2. **Same wifi**: run `npm run dev:ipad`, then open `https://<your-mac-name>.local:3000` on the iPad and accept the certificate warning once.

Then use Safari's Share menu, **Add to Home Screen**, and open it from there for a true full-screen book. Hold the iPad sideways.

## Scripts

- `npm test` runs the unit tests (Vitest)
- `npm run typecheck` checks TypeScript
- `npm run lint` runs ESLint
- `npm run audio` pre-generates narration with ElevenLabs (needs keys)
- `npm run sfx` rebuilds the sound effects in `public/sfx/`

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests and a production build on every push.
