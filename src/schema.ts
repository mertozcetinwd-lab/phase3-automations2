import { z } from "zod";

/**
 * The webhook payload from n8n. Every field has a default so a partial or empty
 * body still produces a valid report — this is what guarantees "no mid-run
 * questions": the task never has to stop and ask for a missing value.
 */
export const ReportPayload = z.object({
  companyName: z.string().min(1).default("Unknown Company"),
  industry: z.string().min(1).default("Unspecified"),
  challenge: z.string().min(1).default("Not specified"),
  goal: z.string().min(1).default("Not specified"),
});

export type ReportPayload = z.infer<typeof ReportPayload>;

/**
 * The structured report Claude returns. Kept flat and deterministic so docx.ts
 * can render it without guessing. `messages.parse()` validates against this.
 */
export const ReportContent = z.object({
  title: z.string(),
  sections: z
    .array(
      z.object({
        heading: z.string(),
        paragraphs: z.array(z.string()),
      }),
    )
    .min(1),
});

export type ReportContent = z.infer<typeof ReportContent>;
