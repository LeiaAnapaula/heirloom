// Two first calls: Gemini 4 Argon directly, then the Antigravity managed agent with Argon in its sandbox.
// Run: npx tsx scripts/argon-hello.mts
import { gemini } from "./gemini-env";

const client = gemini();

const t0 = Date.now();
const hi = await client.interactions.create({
  model: "gemini-4-argon",
  input: "In one short warm sentence, say hello to a five-year-old named Mia who loves planets.",
  generation_config: { thinking_level: "low" },
} as never);
console.log(`[argon ${((Date.now() - t0) / 1000).toFixed(1)}s]`, (hi as { output_text?: string }).output_text);

const t1 = Date.now();
const agent = await client.interactions.create(
  {
    agent: "antigravity-preview-09-2026",
    agent_config: { type: "antigravity", model: "gemini-4-argon" },
    input: "Run `pwd && node -v && python3 --version && df -h . | tail -1` and reply with the raw output only.",
    environment: "remote",
  } as never,
  { timeout: 300000 },
);
const a = agent as { output_text?: string; environment_id?: string; status?: string };
console.log(`[antigravity ${((Date.now() - t1) / 1000).toFixed(1)}s] status=${a.status} env=${a.environment_id}`);
console.log(a.output_text);
