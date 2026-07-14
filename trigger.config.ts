import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  // Replace with your project ref from `npx trigger.dev@latest init`
  // (created in the Trigger.dev dashboard). Looks like "proj_abcdef....".
  project: "proj_fpcskqpjzhmqkrossipd",
  dirs: ["./src/trigger"],
  // Per-run retries: transient failures (LLM 5xx/429, Drive network blips) are
  // retried with backoff. A run that exhausts retries is marked failed and
  // logged — it never crashes the worker (runs are isolated).
  retries: {
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
  // Hard ceiling per run (seconds) so a hung LLM/Drive call can't run forever.
  maxDuration: 300,
});
