# phase3-report-automation

n8n → **Trigger.dev** → Claude-written report → `.docx` → **Google Drive**, fully unattended.

A small JSON payload about a company (`companyName`, `industry`, `challenge`, `goal`)
triggers a Trigger.dev task that asks Claude to write a strategy report, renders it
to a Word document, and uploads it to a Google Drive folder. It handles errors
without crashing, logs every step, and never pauses to ask questions.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Create the Trigger.dev project**
   ```bash
   npx trigger.dev@latest init
   ```
   This creates a project in the dashboard and writes its ref into
   `trigger.config.ts` (replacing `proj_REPLACE_ME`).

3. **Google service account**
   - Create a service account in Google Cloud, enable the **Drive API**, and download a JSON key.
   - Share the target Drive folder with the service-account email (`...@...iam.gserviceaccount.com`),
     or add the SA to a Shared Drive. **Without this, uploads fail with 403/404.**
   - Copy the folder ID from its URL (`https://drive.google.com/drive/folders/<THIS>`).

4. **Environment variables**
   - Local dev: `cp .env.local.example .env.local` and fill in values.
   - Cloud: set the same variables in the **Trigger.dev dashboard → Environment Variables**
     (the cloud worker does not read `.env.local`):
     `ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY` (the JSON key on one line),
     `GOOGLE_DRIVE_FOLDER_ID`, and optionally `REPORT_MODEL`.

## Run & test

```bash
npx trigger.dev@latest dev      # local worker
npm run typecheck               # tsc --noEmit
npx trigger.dev@latest deploy   # deploy to the cloud
```

Test in the dashboard **Test** tab with:

```json
{
  "companyName": "Acme Corp",
  "industry": "retail",
  "challenge": "customer retention",
  "goal": "increase repeat purchases by 20%"
}
```

The run logs show all four steps in order and the run output is `{ fileId, webViewLink }`.
A `.docx` appears in the Drive folder.

## Triggering from n8n

1. **Form Trigger** node with four fields: Company Name, Industry, Challenge, Goal.
2. **HTTP Request** node:
   - **Method**: POST
   - **URL**: `https://api.trigger.dev/api/v1/tasks/generate-report/trigger`
     *(confirm the exact path against the Trigger.dev docs for your installed SDK version — the version pins it)*
   - **Authentication**: Header Auth → `Authorization: Bearer <TRIGGER_SECRET_KEY>`
     (your Trigger.dev environment's secret key)
   - **Body** (JSON):
     ```json
     {
       "payload": {
         "companyName": "={{ $json['Company Name'] }}",
         "industry": "={{ $json['Industry'] }}",
         "challenge": "={{ $json['Challenge'] }}",
         "goal": "={{ $json['Goal'] }}"
       }
     }
     ```

n8n gets a run handle back immediately; the report is produced asynchronously by
Trigger.dev (with retries and durability). Add a 4xx/5xx branch on the HTTP
Request node so n8n surfaces a failed trigger.

## Error handling

- **Bad/empty input** → the zod schema fills defaults; the run still completes.
- **LLM or Drive failure** → the step logs `*.failed` with context and rethrows;
  Trigger.dev retries with backoff (3 attempts). After the last attempt the run
  is marked failed and logged — the worker keeps running (runs are isolated).
- **Structured-output parse hiccup** → `llm.ts` falls back to plain prose wrapped
  as a single section, so a valid `.docx` is still produced.
