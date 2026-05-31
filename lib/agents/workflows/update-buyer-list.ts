import Anthropic from "@anthropic-ai/sdk";
import { withExcelFile, EXCEL_FILES } from "@/lib/agents/excel-utils";
import type { ResearchBundle } from "@/lib/agents/research";

const anthropic = new Anthropic();

interface BuyerRow {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  website: string;
  notes: string;
}

// ── Web research: find acquisition contact info for a single company ──────────
async function researchBuyerContact(name: string): Promise<Partial<BuyerRow>> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      tools: [
        {
          type: "web_search_20250305" as "web_search_20250305",
          name: "web_search",
          max_uses: 2,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Search for "${name}" industrial CRE acquisitions contact. Find their acquisitions or investments team — name of contact person, direct email, phone number, corporate HQ address, and website.

Return ONLY a JSON object, no prose:
{
  "contact": "First Last, Title — or empty string",
  "email": "email@domain.com or empty string",
  "phone": "phone number or empty string",
  "address": "Street, City, State ZIP or empty string",
  "website": "https://... or empty string"
}`,
        },
      ],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Sanitise — only keep non-empty string values
      return Object.fromEntries(
        Object.entries(parsed).filter(([, v]) => typeof v === "string" && v.trim() !== "")
      ) as Partial<BuyerRow>;
    }
  } catch (err) {
    console.error(`[buyer-list] contact research failed for "${name}":`, err);
  }
  return {};
}

// ── Main workflow ─────────────────────────────────────────────────────────────

export async function runUpdateBuyerList(params: {
  ask: string;
  projectContext: string;
  research: ResearchBundle | null;
  attachmentContent?: string;
}): Promise<{ summary: string; outputType: string; omContent?: string; xlsUrl?: string }> {
  const { ask, projectContext, research, attachmentContent } = params;

  // ── Read existing buyers to get headers + avoid duplicates ────────────────
  const existingData = await withExcelFile(EXCEL_FILES.buyerList, "read");
  const fileWebUrl: string | null = existingData.webUrl || null;

  // Determine actual column order from the file (fall back to defaults)
  const headers = existingData.headers.length > 0
    ? existingData.headers
    : ["NAME", "Contact", "Email", "Phone", "Address", "WEBSITE", "Notes"];

  const existingNames = new Set(
    existingData.records.map((r) => (r["NAME"] ?? r["name"] ?? "").toLowerCase().trim())
  );

  // Build a sample of existing name formats so Claude can match the style
  const existingSample = existingData.records
    .slice(0, 5)
    .map((r) => r["NAME"] ?? r["name"] ?? "")
    .filter(Boolean)
    .join(", ");

  const existingNamesStr = existingNames.size > 0
    ? `\nExisting buyers (skip these — exact match check): ${[...existingNames].filter(Boolean).join(", ")}`
    : "";

  // ── Step 1: Extract buyer names + notes from the email/research ──────────
  const contextBlocks = [
    `Request: ${ask}`,
    research?.findings ? `\nResearch findings:\n${research.findings}` : "",
    attachmentContent ? `\nAttachment content:\n${attachmentContent.slice(0, 6000)}` : "",
    existingNamesStr,
    existingSample ? `\nExisting name format examples (match this style): ${existingSample}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const msg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are a CRE deal team analyst for ERP Industrials. Extract all potential buyers, acquirers, or investors mentioned in the text below who could be relevant to an industrial portfolio exit.

Include: industrial REITs, private equity firms, family offices, 1031 exchange buyers, owner-users, and active industrial buyers.
Skip any names that already appear in the existing buyers list.

Format company names exactly as the company brands itself (e.g. "Prologis" not "PROLOGIS"; "Link Logistics" not "LINK LOGISTICS"). Match the casing style of the existing name format examples if provided.

For "notes", include: acquisition criteria, asset type focus, geography, deal size range, and any specific context from the request (e.g. "Active in Permian Basin IOS; closed 3 Midland deals in Q1 2026"). Be specific — this is the key field.

${contextBlocks}

Return ONLY a valid JSON array (no prose):
[
  {
    "name": "Company name — proper title case as the company brands itself",
    "contact": "",
    "email": "",
    "phone": "",
    "address": "",
    "website": "",
    "notes": "Specific acquisition focus, geography, deal size, asset type, and source context"
  }
]

If no new buyers are found, return [].`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
  let buyers: BuyerRow[] = [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) buyers = JSON.parse(jsonMatch[0]);
  } catch {
    /* leave empty */
  }

  // Filter out duplicates
  buyers = buyers.filter((b) => !existingNames.has(b.name.toLowerCase().trim()));

  if (buyers.length === 0) {
    return {
      summary: `No new buyer contacts found for "${projectContext}". Either no buyers were mentioned or all were already in the list.`,
      outputType: "info",
      xlsUrl: fileWebUrl,
    };
  }

  // ── Step 2: Web-research contact info for each buyer in parallel ──────────
  console.log(`[buyer-list] Researching contact info for ${buyers.length} buyer(s)...`);
  const contactResults = await Promise.all(buyers.map((b) => researchBuyerContact(b.name)));

  // Merge contact research into buyer rows (research wins over empty Claude-extracted values)
  buyers = buyers.map((b, i) => {
    const r = contactResults[i];
    return {
      name: b.name,
      contact: r.contact || b.contact || "",
      email: r.email || b.email || "",
      phone: r.phone || b.phone || "",
      address: r.address || b.address || "",
      website: r.website || b.website || "",
      notes: b.notes || "",
    };
  });

  // ── Step 3: Ask Claude to map buyers into column-ordered arrays ─────────────
  const rowMsg = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `You are filling rows into a buyer list spreadsheet.

The spreadsheet has these exact columns in this order:
${headers.map((h, i) => `${i + 1}. ${h}`).join("\n")}

Here are the new buyer entries to insert:
${JSON.stringify(buyers, null, 2)}

For each buyer, return a JSON array of arrays — one inner array per buyer, with values in the EXACT column order above.
- For any column that has no matching data, use an empty string "".
- Every inner array must have exactly ${headers.length} values.

Return ONLY the JSON (no prose):
[[value1, value2, ...], [value1, value2, ...]]`,
      },
    ],
  });

  const rowText = rowMsg.content[0].type === "text" ? rowMsg.content[0].text : "[]";
  let newRows: string[][] = [];
  try {
    const jsonMatch = rowText.match(/\[[\s\S]*\]/);
    if (jsonMatch) newRows = JSON.parse(jsonMatch[0]);
  } catch { /* leave empty */ }

  // Pad/trim each row to match column count
  newRows = newRows.map((row) => {
    const padded = [...row.map(String)];
    while (padded.length < headers.length) padded.push("");
    return padded.slice(0, headers.length);
  });

  // Fallback: if Claude didn't return rows, build them from known fields
  if (newRows.length === 0) {
    newRows = buyers.map((b) => [b.name, b.contact, b.email, b.phone, b.address, b.website, b.notes].slice(0, headers.length));
  }

  const appendResult = await withExcelFile(EXCEL_FILES.buyerList, "append", newRows);

  // ── Build reply summary ───────────────────────────────────────────────────
  const buyerList = buyers
    .map((b) => {
      const contactLine = b.contact ? ` · ${b.contact}` : "";
      const emailLine = b.email ? ` · ${b.email}` : "";
      const notesLine = b.notes ? `\n  _${b.notes}_` : "";
      return `• **${b.name}**${contactLine}${emailLine}${notesLine}`;
    })
    .join("\n");

  const xlsNote = appendResult.success
    ? `✅ ${appendResult.message}`
    : `⚠️ Excel update failed: ${appendResult.message}`;

  const summary = `Buyer List updated — ${buyers.length} new contact(s) added for "${projectContext}".\n\n${buyerList}\n\n${xlsNote}`;

  return {
    summary,
    outputType: "buyer-list",
    omContent: buyerList,
    xlsUrl: (appendResult as { webUrl?: string }).webUrl ?? fileWebUrl,
  };
}
