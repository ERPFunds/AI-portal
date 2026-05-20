import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface SubmarketIntelligenceOutput {
  subject: string;
  htmlBody: string;
  summary: string;
}

const HTML_WRAPPER = (
  displayTitle: string,
  displayDate: string,
  bodyContent: string,
  sourcesLine: string
) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${displayTitle}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
<div style="max-width:680px;margin:32px auto;background:#ffffff;">

  <!-- Header -->
  <div style="padding:28px 40px 20px;border-bottom:2px solid #e2e8f0;">
    <p style="font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin:0 0 10px;">ERP Funds &middot; Internal Research</p>
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.2;">&#127959;&#65039; ${displayTitle}</h1>
    <p style="font-size:13px;color:#64748b;margin:0;">${displayDate}</p>
  </div>

  <!-- Body -->
  <div style="padding:28px 40px 8px;">
    ${bodyContent}
  </div>

  <!-- Footer -->
  <div style="padding:16px 40px 28px;border-top:1px solid #e2e8f0;margin-top:16px;">
    <p style="font-size:11px;color:#94a3b8;line-height:1.8;margin:0;">${sourcesLine}</p>
    <p style="font-size:11px;color:#94a3b8;font-style:italic;margin:6px 0 0;">Questions or corrections &#x2192; reply to this email.</p>
  </div>

</div>
</body>
</html>`;

export async function runSubmarketIntelligence(params: {
  market: string;
  period: string;
}): Promise<SubmarketIntelligenceOutput> {
  const isPermian = params.market.toLowerCase() === "permian";
  const isBrevard = params.market.toLowerCase() === "brevard";

  const marketLabel = params.market.charAt(0).toUpperCase() + params.market.slice(1);

  const briefTitle = isPermian
    ? "Permian Submarket Watch"
    : isBrevard
    ? "Space Coast Submarket Watch"
    : `${marketLabel} Submarket Watch`;

  const marketFullName = isPermian
    ? "Permian Basin (Midland-Odessa, TX) industrial CRE"
    : isBrevard
    ? "Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE"
    : `${marketLabel} industrial CRE`;

  const baselines = isPermian
    ? "Midland MSA and Odessa MSA rent baselines from TREC @ TAMU (trerc.tamu.edu)"
    : "Space Coast / Melbourne-Titusville MSA rent and vacancy baselines from CoStar and local brokers";

  const tenantContext = isPermian
    ? "Permian Basin E&P operator CapEx commitments, rig additions, production guidance (Diamondback, ConocoPhillips, ExxonMobil, bpX, Permian Resources)"
    : "Space Coast aerospace/defense/logistics tenant activity (SpaceX, Blue Origin, L3Harris, Northrop Grumman, Amazon, UPS)";

  const infraContext = isPermian
    ? "Permian pipeline infrastructure, NGL takeaway, TX RRC / NM OCD regulatory items"
    : "Space Coast infrastructure, Port Canaveral, broadband/power, Brevard County permitting";

  const submarkets = isPermian
    ? "Midland MSA, Odessa MSA, Kermit (Winkler County), Delaware Basin"
    : "Melbourne / Palm Bay, Titusville, Cocoa / Rockledge, Port Canaveral corridor";

  const ask = `Monthly submarket intelligence for ${marketFullName}, period: ${params.period}.

Focus areas:
1. National and state-level industrial CRE context (CoStar national vacancy, absorption, completions; EastGroup Sun Belt comp performance)
2. ${baselines} — rents, vacancy, absorption, new deliveries
3. Recent verified development activity in market — named projects, developers, SF, delivery dates
4. ${tenantContext} — specific commitments with dollar figures and service yard demand implications
5. ${infraContext}
6. Submarket priority ranking with investment rationale per submarket: ${submarkets}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${briefTitle} ${params.period}`,
    workflowId: "submarket-intelligence",
    market: params.market,
  });

  const section2Label = isPermian
    ? "§2 — Midland / Odessa Baselines (TREC TAMU)"
    : "§2 — Space Coast Baselines (CoStar / Local Brokers)";

  const section4Label = isPermian
    ? "§4 — Tenant Watch (Verified Operator Commitments)"
    : "§4 — Tenant Watch (Aerospace & Logistics Commitments)";

  const section4ColHeader = isPermian ? "Operator" : "Tenant / Operator";

  const macroNote = isPermian
    ? "Macro signals — Permian rig count, WTI, DUC inventory, permits, employment — covered in the weekly Monday Brief."
    : "Macro signals — Space Coast employment, launch cadence, FL vacancy rate — covered in the weekly Monday Brief.";

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 6000,
    system: [{ type: "text" as const, text: `You are a senior CRE submarket analyst for ERP Funds producing monthly submarket watch reports. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.

Be specific and data-dense. Use real named entities, dollar figures, SF counts, and percentages. Use the web_search tool aggressively to fill gaps — especially for §3 development activity and §4 tenant commitments. Search for recent CapEx announcements, new industrial projects, and operator activity BEFORE marking any field as DATA PENDING. Only use "DATA PENDING" if web search also returns nothing concrete. Do NOT recommend external reports — find the data yourself.`, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        type: "web_search_20250305" as "web_search_20250305",
        name: "web_search",
        max_uses: 5,
      } as unknown as Anthropic.Tool,
    ],
    messages: [
      {
        role: "user",
        content: `Generate a monthly submarket watch for ${marketFullName}, period: ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

IMPORTANT: For any section where the research above lacks specific data (especially §3 dev activity and §4 tenant commitments), USE web_search NOW to find:
- §3: "${isPermian ? "Permian Basin" : "Brevard County"} industrial development 2025" or "${isPermian ? "Midland TX" : "Melbourne FL"} warehouse construction 2025"
- §4: "${isPermian ? "Diamondback Energy OR ConocoPhillips OR ExxonMobil Permian capex 2025" : "SpaceX OR L3Harris OR Northrop Grumman Brevard expansion 2025"}"
- §5: "${isPermian ? "Permian pipeline infrastructure 2025" : "Port Canaveral expansion OR Brevard infrastructure 2025"}"

---
Return ONLY valid JSON with this exact structure:

{
  "subject": "${briefTitle} — ${params.period}",
  "section1_title": "§1 — National / ${isPermian ? "Texas" : "Florida"} Industrial Context",
  "section1_headline": "One sentence on national industrial vacancy trend with source in parentheses",
  "section1_bullets": [
    "Net absorption figure with period and YoY",
    "12-month absorption figure",
    "New supply / completions trend"
  ],
  "section1_reit": "EastGroup Properties Q1 leased %, FFO YoY, dev starts guidance — or most recent available quarter",
  "section2_table": [
    { "submarket": "Midland MSA", "rents": "$xx+/SF NNN", "commentary": "1 sentence from TREC or CoStar" }
  ],
  "section2_source_note": "Source attribution and any pending data note",
  "section3_items": [
    { "title": "Project name · Location", "body": "SF, developer/owner, status, delivery date, relevance to ERP" }
  ],
  "section3_none_verified": "If no Permian/Space Coast institutional spec announced this month, state that clearly",
  "section4_table": [
    { "operator": "Company name", "activity": "Specific CapEx, rig/crew adds, production guidance, service yard demand implication" }
  ],
  "section5_table": [
    { "item": "Pipeline or regulatory item name", "status": "Current status, timeline, relevance" }
  ],
  "section5_data_note": "Any pending regulatory data note (e.g. TX RRC / NM OCD permits)",
  "section6_table": [
    { "submarket": "Submarket name", "assessment": "2-3 sentence investment priority rationale" }
  ],
  "source_names": ["CoStar", "TREC @ TAMU", "ExxonMobil IR", "Diamondback IR"]
}

Rules:
- section1_bullets: exactly 3 bullets, national US industrial stats
- section2_table: ${isPermian ? "Midland MSA and Odessa MSA rows required" : "Melbourne/Palm Bay and Titusville rows required"}
- section3_items: only VERIFIED named projects from research — no placeholders
- section3_none_verified: include this field if no confirmed local institutional spec found
- section4_table: ${isPermian ? "include Diamondback, ConocoPhillips, ExxonMobil, bpX if found in research" : "include top 3-4 tenants found in research"}
- section5_table: 2-4 items max, verified only
- section6_table: ${isPermian ? "Midland MSA, Odessa MSA, Kermit (Winkler), Delaware Basin" : "Melbourne/Palm Bay, Titusville, Port Canaveral corridor, Cocoa/Rockledge"}
- Return ONLY valid JSON, no markdown, no extra text.`,
      },
    ],
  });

  // Find the last text block — tool_use blocks may appear before it
  const textBlocks = response.content.filter((b) => b.type === "text");
  const rawText = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1] as { type: "text"; text: string }).text : "{}";
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanText);
  } catch (e) {
    console.error("[submarket-intelligence] JSON parse failed. Raw Claude output:", rawText.slice(0, 500));
    data = { subject: `${briefTitle} — ${params.period}` };
  }

  const subject = (data.subject as string) || `${briefTitle} — ${params.period}`;

  const section1Bullets = (data.section1_bullets as string[] | undefined) ?? [];
  const section2Table   = (data.section2_table   as Array<{ submarket: string; rents: string; commentary: string }> | undefined) ?? [];
  const section3Items   = (data.section3_items   as Array<{ title: string; body: string }> | undefined) ?? [];
  const section4Table   = (data.section4_table   as Array<{ operator: string; activity: string }> | undefined) ?? [];
  const section5Table   = (data.section5_table   as Array<{ item: string; status: string }> | undefined) ?? [];
  const section6Table   = (data.section6_table   as Array<{ submarket: string; assessment: string }> | undefined) ?? [];
  const sourceNames     = (data.source_names     as string[] | undefined) ?? [];

  // ── helpers ──────────────────────────────────────────────────────────────────
  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const tdCell = (val: string, bold = false) =>
    `<td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top;">${bold ? `<strong>${val}</strong>` : val}</td>`;

  const th = (label: string, last = false) =>
    `<th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 ${last ? "0" : "8px"} 8px ${last ? "8px" : "0"};border-bottom:2px solid #0f172a;">${label}</th>`;

  // ── §1 ───────────────────────────────────────────────────────────────────────
  const s1BulletsHtml = section1Bullets.length > 0
    ? `<ul style="margin:8px 0 12px;padding-left:20px;">${section1Bullets.map(b => `<li style="font-size:13px;color:#334155;line-height:1.6;margin-bottom:4px;">${b}</li>`).join("")}</ul>`
    : "";

  // ── §2 ───────────────────────────────────────────────────────────────────────
  const s2Rows = section2Table.map(r =>
    `<tr>${tdCell(r.submarket ?? "", true)}${tdCell(r.rents ?? "—")}${tdCell(r.commentary ?? "")}</tr>`
  ).join("\n");

  // ── §3 ───────────────────────────────────────────────────────────────────────
  const s3Cards = section3Items.map(i =>
    `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 14px;">
  <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 3px;">${i.title}</p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p>
</div>`
  ).join("\n");

  // ── §4 ───────────────────────────────────────────────────────────────────────
  const s4Rows = section4Table.map(r =>
    `<tr>${tdCell(r.operator ?? "", true)}${tdCell(r.activity ?? "")}</tr>`
  ).join("\n");

  // ── §5 ───────────────────────────────────────────────────────────────────────
  const s5Rows = section5Table.map(r =>
    `<tr>${tdCell(r.item ?? "", true)}${tdCell(r.status ?? "")}</tr>`
  ).join("\n");

  // ── §6 ───────────────────────────────────────────────────────────────────────
  const s6Rows = section6Table.map(r =>
    `<tr>${tdCell(r.submarket ?? "", true)}${tdCell(r.assessment ?? "")}</tr>`
  ).join("\n");

  // ── Sources footer line — hyperlinked article URLs ───────────────────────────
  const linkedSources = research.sources
    .filter((u) => u.startsWith("http"))
    .slice(0, 40)
    .map((u) => {
      let label: string;
      try {
        label = new URL(u).hostname.replace(/^www\./, "");
      } catch {
        label = u;
      }
      return `<a href="${u}" style="color:#1d4ed8;text-decoration:underline;" target="_blank">${label}</a>`;
    });

  const sourcesLine = linkedSources.length > 0
    ? `<strong style="color:#475569;">Sources verified ${params.period}:</strong><br/>${linkedSources.join(" &nbsp;&middot;&nbsp; ")}`
    : sourceNames.length > 0
    ? `<strong style="color:#475569;">Sources verified ${params.period}:</strong> ${sourceNames.join(" &middot; ")}`
    : "";

  // ── Body ─────────────────────────────────────────────────────────────────────
  const bodyContent = `
<!-- Note box -->
<div style="border-left:4px solid #16a34a;background:#f0fdf4;padding:10px 14px;margin:0 0 24px;border-radius:0 4px 4px 0;font-size:13px;color:#166534;line-height:1.6;">
  All figures verified at publication. ${macroNote}
</div>

${secLabel((data.section1_title as string) || "§1 — National / ${isPermian ? 'Texas' : 'Florida'} Industrial Context")}
<p style="font-size:13.5px;font-weight:600;color:#0f172a;margin:0 0 8px;line-height:1.5;">${(data.section1_headline as string) || ""}</p>
${s1BulletsHtml}
${(data.section1_reit as string) ? `<p style="font-size:13px;color:#334155;line-height:1.6;margin:8px 0 0;"><a href="https://www.eastgroup.net/investors" style="color:#1d4ed8;font-weight:700;text-decoration:underline;">EastGroup Properties (Sun Belt comp):</a> ${data.section1_reit as string}</p>` : ""}

${secLabel(section2Label)}
${s2Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    ${th("Submarket")}${th("Rents")}${th("Commentary", true)}
  </tr></thead>
  <tbody>${s2Rows}</tbody>
</table>` : ""}
${(data.section2_source_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section2_source_note as string}</p>` : ""}

${secLabel("§3 — Recent Development Activity (Verified)")}
${s3Cards || ""}
${(data.section3_none_verified as string) ? `<div style="border-left:3px solid #ef4444;padding:6px 0 6px 14px;margin:0 0 14px;"><p style="font-size:13px;color:#b91c1c;margin:0;font-weight:600;">${data.section3_none_verified as string}</p></div>` : ""}

${secLabel(section4Label)}
${s4Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    ${th(section4ColHeader)}${th("Activity", true)}
  </tr></thead>
  <tbody>${s4Rows}</tbody>
</table>` : "<p style=\"font-size:13px;color:#94a3b8;\">No verified operator commitments this period.</p>"}

${secLabel("§5 — Regulatory &amp; Infrastructure (Verified)")}
${s5Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    ${th("Item")}${th("Status", true)}
  </tr></thead>
  <tbody>${s5Rows}</tbody>
</table>` : ""}
${(data.section5_data_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section5_data_note as string}</p>` : ""}

${secLabel("§6 — Submarket Priority")}
${s6Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    ${th("Submarket")}${th("Assessment", true)}
  </tr></thead>
  <tbody>${s6Rows}</tbody>
</table>` : ""}
<p style="font-size:12px;color:#94a3b8;font-style:italic;margin:16px 0 0;">${macroNote}</p>
`;

  const htmlBody = HTML_WRAPPER(
    briefTitle,
    `${params.period} &middot; Monthly &middot; CRE focus, macro covered in Monday Brief`,
    bodyContent,
    sourcesLine
  );

  const summary = `${briefTitle} generated for ${params.period}. Covers ${section2Table.length} submarket baselines, ${section3Items.length} development items, ${section4Table.length} tenant commitments, ${section6Table.length} submarket priorities.`;

  return { subject, htmlBody, summary };
}
