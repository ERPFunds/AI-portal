import Anthropic from "@anthropic-ai/sdk";
import { withExcelFile, EXCEL_FILES } from "@/lib/agents/excel-utils";
import type { ResearchBundle } from "@/lib/agents/research";

const anthropic = new Anthropic();

/** Detect market from ask + projectContext */
function detectMarket(ask: string, projectContext: string): "permian" | "brevard" {
  const haystack = `${ask} ${projectContext}`.toLowerCase();
  if (
    haystack.includes("brevard") ||
    haystack.includes("space coast") ||
    haystack.includes("cocoa") ||
    haystack.includes("melbourne") ||
    haystack.includes("titusville")
  ) {
    return "brevard";
  }
  return "permian"; // default
}

export async function runUpdatePipelineComps(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle | null;
  attachmentContent?: string;
}): Promise<{ summary: string; outputType: string; omContent?: string; xlsUrl?: string }> {
  const { ask, projectContext, research, attachmentContent } = params;
  const market = detectMarket(ask, projectContext);
  const filename =
    market === "brevard" ? EXCEL_FILES.brevardPipeline : EXCEL_FILES.permianPipeline;
  const marketLabel = market === "brevard" ? "Brevard / Space Coast" : "Permian Basin";

  // ── Read existing rows to get the header schema + avoid duplicate entries ─
  const existingData = await withExcelFile(filename, "read");
  const headers = existingData.headers;
  const headerStr = headers.length > 0 ? `Existing columns: ${headers.join(" | ")}` : "";

  // ── Extract new entries via Claude ────────────────────────────────────────
  const contextBlocks = [
    `Request: ${ask}`,
    `Market: ${marketLabel}`,
    headerStr,
    research?.findings ? `\nResearch findings:\n${research.findings}` : "",
    attachmentContent ? `\nAttachment content:\n${attachmentContent.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const columnGuide =
    headers.length > 0
      ? `Use these exact columns (in order): ${headers.join(" | ")}`
      : `Use these default columns: Category | Owner | Address | Tenant | Acreage | Sq. Ft. | Year Built | City | State | Zip Code | Notes`;

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: `You are a CRE analyst for ERP Industrials. Extract all industrial pipeline deals and/or sale comparable transactions mentioned in the text for the ${marketLabel} market.

${columnGuide}

For any field you don't have data for, use an empty string.

${contextBlocks}

Return ONLY a valid JSON array — one object per deal/comp (no prose):
[
  {
    /* keys matching the column names exactly */
  }
]

If no new deals or comps are found, return [].`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  let entries: Record<string, string>[] = [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) entries = JSON.parse(jsonMatch[0]);
  } catch {
    /* leave empty */
  }

  if (entries.length === 0) {
    return {
      summary: `No new pipeline or comp entries found for "${projectContext}" (${marketLabel}).`,
      outputType: "info",
    };
  }

  // Build rows in column-order (use existing headers if available, else object values)
  let newRows: string[][];
  if (headers.length > 0) {
    newRows = entries.map((e) => headers.map((h) => String(e[h] ?? "")));
  } else {
    newRows = entries.map((e) => Object.values(e).map(String));
  }

  const appendResult = await withExcelFile(filename, "append", newRows);

  // Compact display for email reply
  const entryList = entries
    .map((e) => {
      const parts = [
        e["Category"] || e["Asset Class"] || e["Type"] || "",
        e["Address"] || e["Property"] || "",
        e["Owner"] || e["Seller"] || e["Buyer"] || "",
        e["Acreage"] ? `${e["Acreage"]} ac` : e["Sq. Ft."] ? `${e["Sq. Ft."]} SF` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `• ${parts || JSON.stringify(e).slice(0, 80)}`;
    })
    .join("\n");

  const xlsNote = appendResult.success
    ? `✅ ${appendResult.message} → ${filename}`
    : `⚠️ Excel update failed: ${appendResult.message}`;

  const summary = `Pipeline & Comps updated — ${entries.length} new record(s) added to ${marketLabel} tracker for "${projectContext}".\n\n${entryList}\n\n${xlsNote}`;

  return {
    summary,
    outputType: "pipeline-comps",
    omContent: entryList,
    xlsUrl: (appendResult as { webUrl?: string }).webUrl ?? existingData.webUrl,
  };
}

/**
 * Read existing comps from the relevant market file.
 * Used by sale-comps-pull to enrich its context.
 */
export async function readPipelineComps(
  market: "permian" | "brevard"
): Promise<{ headers: string[]; records: Record<string, string>[]; webUrl: string }> {
  const filename =
    market === "brevard" ? EXCEL_FILES.brevardPipeline : EXCEL_FILES.permianPipeline;
  const result = await withExcelFile(filename, "read");
  return {
    headers: result.headers,
    records: result.records,
    webUrl: result.webUrl,
  };
}
