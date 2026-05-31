import Anthropic from "@anthropic-ai/sdk";
import { withExcelFile, EXCEL_FILES, listWorksheetNames, getExcelItemId } from "@/lib/agents/excel-utils";
import { getGraphToken } from "@/lib/agents/graph-token";
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

/**
 * For the Permian Pipeline file, detect which tab to use:
 *  - Tab 0 (first):  ERP acquisition pipeline — new ERP locations, sites under evaluation
 *  - Tab 1 (second): Pipeline & Market Analysis — market comps, third-party sales, market data
 *
 * Default to tab 1 (comps) since that's the most common update.
 */
function detectPermianTab(ask: string, projectContext: string): { tabIndex: number; tabLabel: string } {
  const haystack = `${ask} ${projectContext}`.toLowerCase();
  const isErpAcquisition =
    /\b(erp\s+(location|site|acquisition|target|deal)|new\s+erp|we('re|are)\s+(looking|evaluating|under\s+contract)|loi|letter\s+of\s+intent|erp\s+is\s+buying|erp\s+pipeline)\b/.test(haystack) ||
    /\b(our\s+(acquisition|pipeline|target|deal)|erp\s+fund|fund\s+iv\s+(target|deal|acqui))\b/.test(haystack);
  if (isErpAcquisition) {
    return { tabIndex: 0, tabLabel: "New ERP Location (Tab 1)" };
  }
  return { tabIndex: 1, tabLabel: "Pipeline & Market Analysis (Tab 2)" };
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

  // ── For Permian, detect which tab to use ─────────────────────────────────
  let worksheetIndex = 0;
  let tabLabel = "Tab 1";
  let sheetNames: string[] = [];

  if (market === "permian") {
    const { tabIndex, tabLabel: tl } = detectPermianTab(ask, projectContext);
    worksheetIndex = tabIndex;
    tabLabel = tl;

    // Fetch actual sheet names so the reply shows the real tab name
    try {
      const token = await getGraphToken();
      const siteId = process.env.SHAREPOINT_SITE_ID;
      if (token && siteId) {
        const fileInfo = await getExcelItemId(token, siteId, filename);
        if (fileInfo) {
          sheetNames = await listWorksheetNames(token, siteId, fileInfo.itemId);
          if (sheetNames[worksheetIndex]) {
            tabLabel = `"${sheetNames[worksheetIndex]}" (Tab ${worksheetIndex + 1})`;
          }
        }
      }
    } catch { /* non-fatal — tabLabel already set */ }
  }

  // ── Read existing rows to get the header schema + avoid duplicate entries ─
  const existingData = await withExcelFile(filename, "read", undefined, worksheetIndex);
  // Capture the SharePoint URL now — we include it in every return path so the
  // email reply always has the "View in Shared Drive" button (even on no-entries).
  const fileWebUrl: string | null = existingData.webUrl || null;
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
    // Match the outermost JSON array (array of objects: [{...}, {...}])
    const jsonMatch = text.match(/(\[\s*\{[\s\S]*\}\s*\])/);
    if (jsonMatch) {
      entries = JSON.parse(jsonMatch[1]);
    } else {
      const flatMatch = text.match(/\[[\s\S]*\]/);
      if (flatMatch) entries = JSON.parse(flatMatch[0]);
    }
  } catch {
    /* leave empty */
  }

  if (entries.length === 0) {
    return {
      summary: `No new pipeline or comp entries found for "${projectContext}" (${marketLabel}).`,
      outputType: "info",
      xlsUrl: fileWebUrl ?? undefined,
    };
  }

  // Build rows in column-order (use existing headers if available, else object values)
  let newRows: string[][];
  if (headers.length > 0) {
    newRows = entries.map((e) => headers.map((h) => String(e[h] ?? "")));
  } else {
    newRows = entries.map((e) => Object.values(e).map(String));
  }

  const appendResult = await withExcelFile(filename, "append", newRows, worksheetIndex);

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

  const tabNote = market === "permian" ? ` [${tabLabel}]` : "";
  const xlsNote = appendResult.success
    ? `✅ ${appendResult.message} → ${filename}${tabNote}`
    : `⚠️ Excel update failed: ${appendResult.message}`;

  const summary = `Pipeline & Comps updated — ${entries.length} new record(s) added to ${marketLabel} tracker${tabNote} for "${projectContext}".\n\n${entryList}\n\n${xlsNote}`;

  return {
    summary,
    outputType: "pipeline-comps",
    omContent: entryList,
    xlsUrl: (appendResult as { webUrl?: string }).webUrl ?? fileWebUrl ?? undefined,
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
