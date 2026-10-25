# The Primer

A storybook for children ages 4 to 6 that wakes up, reads aloud, and listens back.
The full build spec lives in `CLAUDE.md`.

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000 in Chrome (laptop) or Safari/Chrome (iPad).

## Keys (optional)

Copy `.env.example` to `.env.local` and fill in what you have. Everything still works with no keys:
the narrator falls back to the browser voice and the story uses the pre-written narration.

## Scripts

- `npm test` runs the unit tests (Vitest)
- `npm run typecheck` checks TypeScript
- `npm run audio` pre-generates narration audio with ElevenLabs (needs keys)
