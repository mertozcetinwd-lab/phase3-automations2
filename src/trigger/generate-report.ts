import { logger, schemaTask } from "@trigger.dev/sdk";
import { ReportPayload } from "../schema.js";
import { generateReport } from "../lib/llm.js";
import { buildDocx, reportFilename } from "../lib/docx.js";
import { uploadToDrive } from "../lib/drive.js";

/**
 * Webhook-triggered task: JSON payload -> Claude-written report -> .docx ->
 * Google Drive. Trigger it from n8n via the Trigger.dev REST API.
 *
 * Design invariants:
 *  - No mid-run questions: the zod schema supplies defaults and the LLM prompt
 *    is fully self-contained.
 *  - Never crashes the worker: `schemaTask` turns invalid input into a handled
 *    validation error; external calls are wrapped so failures log context and
 *    rethrow, letting Trigger.dev retry (per-run isolation means a failed run
 *    can't take down the worker).
 *  - Every step is logged with a stable event name.
 */
export const generateReportTask = schemaTask({
  id: "generate-report",
  schema: ReportPayload,
  maxDuration: 300,
  run: async (payload) => {
    logger.info("received", { companyName: payload.companyName });

    const report = await step("llm.generate", () => generateReport(payload));
    logger.info("llm.done", {
      title: report.title,
      sectionCount: report.sections.length,
    });

    const buffer = await step("docx.build", () => buildDocx(report, payload));
    logger.info("docx.built", { bytes: buffer.length });

    const filename = reportFilename(payload.companyName);
    const file = await step("drive.upload", () =>
      uploadToDrive(buffer, filename),
    );
    logger.info("drive.uploaded", { filename, ...file });

    logger.info("complete", { fileId: file.fileId });
    return file;
  },
});

/**
 * Run a step, logging any error with the step name before rethrowing so
 * Trigger.dev's retry/backoff applies. The rethrow (not swallow) is deliberate:
 * a failed run should be retried and ultimately surfaced as failed, not
 * silently "succeed" with no file in Drive.
 */
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error(`${name}.failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
