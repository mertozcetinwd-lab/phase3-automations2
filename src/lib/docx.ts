import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  PageNumber,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ReportContent, ReportPayload } from "../schema.js";

// Brand palette (hex without the leading #).
const ACCENT = "1F3864"; // deep blue — title, headings, labels
const MUTED = "595959"; // gray — subtitle, footer
const RULE = "D9D9D9"; // light gray — heading underline

const BODY_FONT = "Calibri";

/**
 * Render the structured report to a styled .docx and return it as a Buffer.
 * Deterministic — same inputs always produce the same document.
 */
export async function buildDocx(
  report: ReportContent,
  payload: ReportPayload,
): Promise<Buffer> {
  const dateStr = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());

  const children: Paragraph[] = [
    // Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: report.title, bold: true, size: 44, color: ACCENT }),
      ],
    }),
    // Subtitle + rule
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 10 },
      },
      children: [
        new TextRun({
          text: `Strategy Report  ·  ${dateStr}`,
          allCaps: true,
          size: 18,
          color: MUTED,
        }),
      ],
    }),
  ];

  for (const section of report.sections) {
    children.push(sectionHeading(section.heading));
    for (const para of section.paragraphs) {
      if (!para.trim()) continue;
      children.push(bodyParagraph(para));
    }
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: BODY_FONT, size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        footers: { default: pageFooter(payload.companyName, dateStr) },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 320, after: 140 },
    keepNext: true,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 },
    },
    children: [new TextRun({ text, bold: true, size: 28, color: ACCENT })],
  });
}

function bodyParagraph(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: 276 }, // 1.15x line spacing
    children: [new TextRun({ text, size: 22 })],
  });
}

function pageFooter(companyName: string, dateStr: string): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: RULE, space: 6 },
        },
        children: [
          new TextRun({
            text: `${companyName}  ·  Generated ${dateStr}  ·  Page `,
            size: 16,
            color: MUTED,
          }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED }),
        ],
      }),
    ],
  });
}

/** Filesystem/Drive-safe name, e.g. `<Company Name>-report-2026-07-14.docx`. */
export function reportFilename(companyName: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeCompany = companyName.replace(/[^\w\- ]+/g, "").trim() || "report";
  return `${safeCompany}-report-${date}.docx`;
}
