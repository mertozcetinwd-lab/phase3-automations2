# CLAUDE.md

## What this is
Trigger.dev task that turns a small JSON payload (company profile) into a
Claude-written business report, renders it to `.docx`, and uploads it to Google
Drive. Triggered by an n8n form → HTTP Request hitting the Trigger.dev REST API.
Fully unattended.

## Flow
n8n Form → n8n HTTP Request (POST /tasks/generate-report/trigger)
  → Trigger.dev `generate-report` task:
     validate (zod) → Claude narrative → build .docx → upload to Drive
  → returns `{ fileId, webViewLink }`

## Layout
- `src/trigger/generate-report.ts` — the `schemaTask`; orchestrates the 4 steps + logging (`step()` helper logs+rethrows so runs retry).
- `src/schema.ts`   — zod `ReportPayload` (all fields defaulted — never blocks on missing input) + `ReportContent` (Claude's structured output).
- `src/lib/llm.ts`  — Anthropic client + `generateReport(payload)`. Asks Claude for JSON directly via `client.messages.create`, then parses + validates against zod `ReportContent`; falls back to prose-as-one-section on malformed/off-schema output. (Deliberately NOT using `betaZodOutputFormat` — its `z.toJSONSchema` call needs zod v4, but zod is pinned at v3 for Trigger.dev's `schemaTask`.)
- `src/lib/docx.ts` — `buildDocx(report, payload)` → `Buffer` (via `docx` `Packer`); `reportFilename()`.
- `src/lib/drive.ts`— `uploadToDrive(buffer, filename)`. **OAuth2 user auth** (client id/secret + refresh token) — NOT a service account: service accounts have no Drive quota and can't own files in a personal My Drive (Google returns "Service Accounts do not have storage quota"). Files are owned by the OAuth user. Uses the Drive-only `@googleapis/drive` package — NOT the `googleapis` meta-package, which is 183 MB / 317 APIs and OOMs the worker.
- `scripts/get-refresh-token.mjs` — one-time helper; loopback OAuth flow that writes `GOOGLE_REFRESH_TOKEN` into `.env`. Run `node scripts/get-refresh-token.mjs`.
- `trigger.config.ts` — project ref, task dir, retries, `maxDuration`.

## Conventions / invariants
- **No mid-run questions**: LLM prompt is self-contained; the schema supplies defaults for every field.
- **Never crash the worker**: `schemaTask` turns bad input into a handled validation error; external calls are wrapped (`step()`) to log context and rethrow so Trigger.dev retries. Runs are isolated — one failure ≠ worker crash.
- **Log every step**: `logger.info` with a stable event name at each phase — `received`, `llm.done`, `docx.built`, `drive.uploaded`, `complete` (plus `*.failed` on error).
- **Model / Anthropic params**: consult the `claude-api` skill before editing `llm.ts`. Default `claude-sonnet-5`; override via `REPORT_MODEL` (upgrade path `claude-opus-4-8`). Uses structured outputs (`output_config.format`), which require Sonnet 5 / Opus 4.8 / Haiku 4.5 / Fable 5.

## Env
Local dev: `.env.local` (see `.env.local.example`). Cloud: set in the Trigger.dev dashboard — the cloud worker does NOT read local `.env`.
`ANTHROPIC_API_KEY` · `GOOGLE_CLIENT_ID` · `GOOGLE_CLIENT_SECRET` · `GOOGLE_REFRESH_TOKEN` · `GOOGLE_DRIVE_FOLDER_ID` · optional `REPORT_MODEL`. (Drive auth is OAuth2, not a service account — see `drive.ts` note.)
n8n authenticates its trigger call with your Trigger.dev secret key (lives in n8n, not here).

## Dev / run
- `npx trigger.dev@latest init` — one-time; creates the project + fills the ref in `trigger.config.ts`.
- `npx trigger.dev@latest dev` — local dev worker; test payloads via the dashboard **Test** tab.
- `npx trigger.dev@latest deploy` — deploy.
- `npm run typecheck` — `tsc --noEmit`.
- The Drive target folder MUST be shared with the service-account email (or be a Shared Drive with the SA added), or uploads 403/404.
