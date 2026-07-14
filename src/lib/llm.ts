import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@trigger.dev/sdk";
import { ReportContent, type ReportPayload } from "../schema.js";

// Approved default is Sonnet 5 (quality/speed/cost balance); upgrade path is
// Opus 4.8. Override per-environment with REPORT_MODEL.
const MODEL = process.env.REPORT_MODEL ?? "claude-sonnet-5";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM_PROMPT = `You are a senior business strategy consultant. You write concise,
professional analysis reports for company leadership. You never ask clarifying
questions — if a detail is missing, make a reasonable, clearly-stated assumption
and continue. Ground recommendations in the stated industry, challenge, and goal.
You reply with a single JSON object and nothing else — no prose, no markdown fences.`;

function buildUserPrompt(p: ReportPayload): string {
  return [
    `Write a business strategy report for this company and return it as JSON.`,
    ``,
    `Company name: ${p.companyName}`,
    `Industry: ${p.industry}`,
    `Main challenge: ${p.challenge}`,
    `Goal: ${p.goal}`,
    ``,
    `Produce these sections, in order, each as an object in "sections":`,
    `Executive Summary, Industry Context, Challenge Analysis,`,
    `Strategic Recommendations, 90-Day Action Plan.`,
    ``,
    `Return EXACTLY this shape (no extra keys, no markdown):`,
    `{`,
    `  "title": "string",`,
    `  "sections": [`,
    `    { "heading": "string", "paragraphs": ["string", "string"] }`,
    `  ]`,
    `}`,
    ``,
    `Each section has 1-4 paragraphs written in clear prose (not bullet fragments).`,
  ].join("\n");
}

/**
 * Generate the report via Claude and return validated, structured content.
 * The model is asked for JSON directly; we parse and validate it against
 * ReportContent. Genuine API errors (auth/rate/5xx) propagate so Trigger.dev
 * retries. A malformed/off-schema response never fails the run — it falls back
 * to wrapping the raw prose as a single section, so docx.ts always has valid
 * input.
 */
export async function generateReport(
  payload: ReportPayload,
): Promise<ReportContent> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(payload) }],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n\n")
    .trim();

  const parsed = tryParseReport(text);
  if (parsed) return parsed;

  logger.warn("llm.parse_fallback", {
    reason: "response was not valid JSON matching the schema",
  });
  return {
    title: `${payload.companyName} — Strategy Report`,
    sections: [
      {
        heading: "Report",
        paragraphs: text ? text.split(/\n{2,}/) : ["No content generated."],
      },
    ],
  };
}

/** Parse the model's reply as a ReportContent JSON object, or null on failure. */
function tryParseReport(text: string): ReportContent | null {
  // Be lenient: strip markdown fences and pull the outermost {...} object in
  // case the model wraps the JSON in any surrounding text.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const jsonText = text.slice(start, end + 1);
  try {
    const result = ReportContent.safeParse(JSON.parse(jsonText));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
