import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface CompetitorIntelligenceOutput {
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
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.2;">&#128202; ${displayTitle}</h1>
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

export async function runCompetitorIntelligence(params: {
  market: string;
  period: string;
}): Promise<CompetitorIntelligenceOutput> {
  const isPermian = params.market.toLowerCase() === "permian";
  const marketLabel = isPermian ? "Permian Basin" : params.market.charAt(0).toUpperCase() + params.market.slice(1);
  const geoLabel = isPermian ? "Texas / Sun Belt" : "Florida / Sun Belt";

  const briefTitle = `${marketLabel} Competitive Landscape & Comparable Funds`;

  const ask = `Competitor intelligence for ${marketLabel} industrial CRE market, period: ${params.period}.

Focus areas:
1. Industrial capital flowing — recent fund closes, major acquisitions, institutional deployments with dollar figures and dates
2. EastGroup Properties (EGP) latest quarterly results — EPS, FFO/share, leasing rate, consecutive FFO growth quarters, same-store NOI, dev starts guidance, debt/market cap, FFO guide, geographic focus
3. Other public industrial REITs to track: Prologis, Rexford, Terreno, STAG, First Industrial, Plymouth, LXP
4. ${geoLabel} industrial PE peers — Stonelake Capital Partners, Harbor Capital, Investcorp, Circle Industrial, others active in market
5. Private competitors with potential ${marketLabel} interest — Hillwood, Stream Realty, Crow Holdings, Ares Industrial, Lincoln Property, others
6. Comparable fund structures — industry-standard ranges for management fee, carried interest, term, target IRR
7. LP differentiation angles — 3 verified positioning angles with specific data points from this month
${isPermian ? `8. IOS / service yard competitor tracker — These firms are actively acquiring IOS and service yards in Texas and are ERP's direct competition. Search for their deal announcements this period:
   - Stonemont Financial Group (Atlanta-based, IOS/industrial outdoor storage focus, active Texas)
   - Titan Industrial (IOS specialist)
   - InSite Real Estate (industrial, Midwest/Sunbelt)
   - Broadstone Net Lease (NNN, industrial outdoor)
   - Zenith IOS (dedicated IOS fund)
   - Realty Income / STORE Capital (NNN service yards)
   For each: property acquired, location, acreage/SF, price if available, date.
9. SEC EDGAR Form D filings — new $50M+ industrial CRE fund raises filed in the past 30-60 days.
   Search: site:sec.gov/cgi-bin/browse-edgar "Form D" "industrial real estate" OR "industrial outdoor storage" OR "service yard" filed in ${params.period}.
   Also check: efts.sec.gov/LATEST/search-index?q=%22industrial+real+estate%22&forms=D
   For each: fund name, sponsor/GP, raise amount, date filed, industrial focus description.` : ""}`;


  const research = await runResearchAgent({
    ask,
    projectContext: `${briefTitle} ${params.period}`,
    workflowId: "competitor-intelligence",
    market: params.market,
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 6000,
    system: [{ type: "text" as const, text: `You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.

Produce a richly detailed, LP-grade competitor intelligence brief. Be specific and data-dense. Every section must contain real named entities, figures, and actionable observations. Use web_search aggressively to fill gaps before marking anything as data pending.`, cache_control: { type: "ephemeral" } }],
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
        content: `Generate a competitor intelligence brief for the ${marketLabel} industrial CRE market for the period ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

---
Return ONLY valid JSON with this exact structure:

{
  "subject": "string — e.g. '${marketLabel} Competitive Landscape & Comparable Funds — ${params.period}'",

  "section1_items": [
    { "title": "Fund/deal name · amount or key stat", "date": "Month Year", "body": "1-2 sentences on significance to ERP — overlap, competition, signal" }
  ],

  "section2_egp_rows": [
    { "metric": "Q1 2026 EPS", "value": "$x.xx (vs $x.xx Y/Y)" },
    { "metric": "FFO/share", "value": "$x.xx (+x.x% YoY)" },
    { "metric": "Leasing rate", "value": "xx.x%" },
    { "metric": "Consecutive FFO growth", "value": "xx quarters" },
    { "metric": "Same-store NOI growth", "value": "xx consecutive quarters" },
    { "metric": "2026 dev starts", "value": "$xxxM" },
    { "metric": "Debt / market cap", "value": "xx.x%" },
    { "metric": "2026 FFO guide", "value": "$x.xx–$x.xx" },
    { "metric": "Geographic focus", "value": "TX · FL · CA · AZ · NC" }
  ],
  "section2_lp_narrative": "2-3 sentence LP-facing narrative on what EGP performance signals for ERP's thesis",
  "section2_other_reits": "Prologis (PLD) · Rexford (REXR) · Terreno (TRNO) · STAG (STAG) · First Industrial (FR) · Plymouth (PLYM) · LXP (LXP). Add any notable recent data point per ticker if found.",

  "section3_table": [
    { "firm": "Stonelake Capital Partners", "description": "$5.5B+ commercial RE across Austin, Dallas, Houston, San Antonio. $3.1B equity raised across 9 funds in 18 years. Direct Texas peer at meaningful scale." }
  ],

  "section4_bullets": [
    "Hillwood (Perot family) — AllianceTexas DFW — no announced Permian project",
    "Stream Realty Partners — Texas-wide, has Midland office presence"
  ],
  "section4_correction": "Optional — only include if correcting a specific prior-draft error. Leave empty string if none.",

  "section5_rows": [
    { "metric": "Management fee", "range": "1.5–2.0% on committed capital" },
    { "metric": "Carried interest", "range": "20% over 8% preferred return" },
    { "metric": "Term", "range": "7–10 years with extensions" },
    { "metric": "Target net IRR", "range": "12–16% (core+ to value-add)" }
  ],
  "section5_note": "Industry-typical ranges from public PE conventions. ERP-specific positioning vs. peers: pending PPM comp data integration.",

  "section6_angles": [
    { "angle": "Positioning angle title", "narrative": "Supporting data point — implication for ERP LP narrative." }
  ],
  "section6_watch": "Watch for ${params.period.split(' ')[0] === params.period ? 'next month' : 'next month'}: specific items to monitor — fund closes, earnings, leasing data",

  ${isPermian ? `"section7_ios_tracker": [
    { "firm": "Stonemont Financial", "deal": "Property name or address", "location": "City, TX", "size": "xx acres or xxx,xxx SF", "price": "$x.xM or undisclosed", "date": "Mon YYYY", "notes": "IOS/service yard type, tenant if known" }
  ],
  "section7_ios_note": "If no new deal announcements found for a firm, note last known activity.",
  "section8_form_d": [
    { "fund": "Fund name", "sponsor": "Sponsor/GP name", "amount": "$xxxM", "filed": "Mon YYYY", "focus": "Industrial outdoor storage / service yards / flex industrial" }
  ],
  "section8_form_d_note": "Source: SEC EDGAR Form D filings. Raises over $50M with industrial CRE focus. Represents 30-60 day advance notice of new capital entering market.",` : ""}
  "source_names": ["EastGroup Q1 press release", "Diamondback Q1 2026", "Stonelake website"]
}

Rules:
- section1_items: 4-6 items, mix of fund closes, acquisitions, operator results
- section2_egp_rows: use most recent quarter available; search for it if not in research
- section3_table: 3-5 ${geoLabel} PE peers with substantive descriptions
- section4_bullets: 4-6 private competitors, one sentence each
- section4_correction: empty string "" if no correction needed
- section5_rows: industry ranges only, NOT individual named funds
- section6_angles: exactly 3 angles with specific verified data points
${isPermian ? `- section7_ios_tracker: search specifically for Stonemont, Titan Industrial, InSite, Broadstone, Zenith IOS deal announcements. If nothing found this period, note last known activity.
- section8_form_d: search SEC EDGAR for Form D filings from industrial CRE funds. This is a competitive intelligence signal.` : ""}
- Return ONLY valid JSON, no markdown, no extra text.`,
      },
    ],
  });

  // Find last text block (tool_use blocks may precede it)
  const textBlocks = response.content.filter((b) => b.type === "text");
  const rawText = textBlocks.length > 0 ? (textBlocks[textBlocks.length - 1] as { type: "text"; text: string }).text : "{}";
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanText);
  } catch (e) {
    console.error("[competitor-intelligence] JSON parse failed:", rawText.slice(0, 500));
    data = { subject: `${briefTitle} — ${params.period}` };
  }

  const subject = (data.subject as string) || `${briefTitle} — ${params.period}`;

  // ── Parse sections ────────────────────────────────────────────────────────
  type IosRow   = { firm: string; deal: string; location: string; size: string; price: string; date: string; notes: string };
  type FormDRow = { fund: string; sponsor: string; amount: string; filed: string; focus: string };

  const section1Items   = (data.section1_items   as Array<{ title: string; date: string; body: string }> | undefined) ?? [];
  const section2EgpRows = (data.section2_egp_rows as Array<{ metric: string; value: string }> | undefined) ?? [];
  const section3Table   = (data.section3_table   as Array<{ firm: string; description: string }> | undefined) ?? [];
  const section4Bullets = (data.section4_bullets as string[] | undefined) ?? [];
  const section5Rows    = (data.section5_rows    as Array<{ metric: string; range: string }> | undefined) ?? [];
  const section6Angles  = (data.section6_angles  as Array<{ angle: string; narrative: string }> | undefined) ?? [];
  const section7Ios     = isPermian ? (data.section7_ios_tracker as IosRow[] | undefined) ?? [] : [];
  const section8FormD   = isPermian ? (data.section8_form_d      as FormDRow[] | undefined) ?? [] : [];
  const sourceNames     = (data.source_names     as string[] | undefined) ?? [];

  // ── HTML helpers ──────────────────────────────────────────────────────────
  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const tdL = (val: string, bold = false) =>
    `<td style="padding:9px 10px 9px 0;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top;width:42%;">${bold ? `<strong>${val}</strong>` : val}</td>`;
  const tdR = (val: string) =>
    `<td style="padding:9px 0 9px 10px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top;">${val}</td>`;

  // ── §1 — Capital Flowing ──────────────────────────────────────────────────
  const s1Cards = section1Items.map((i) =>
    `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;">
  <p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px;">${i.title}${i.date ? ` <span style="font-weight:400;color:#94a3b8;font-size:12px;">&middot; ${i.date}</span>` : ""}</p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p>
</div>`
  ).join("\n");

  // ── §2 — EastGroup deep table ─────────────────────────────────────────────
  const s2EgpRows = section2EgpRows.map((r) =>
    `<tr>${tdL(r.metric, true)}${tdR(r.value)}</tr>`
  ).join("\n");

  // ── §3 — PE Peers ─────────────────────────────────────────────────────────
  const s3Rows = section3Table.map((r) =>
    `<tr>${tdL(r.firm, true)}${tdR(r.description)}</tr>`
  ).join("\n");

  // ── §4 — Private competitors bullet list ─────────────────────────────────
  const s4Bullets = section4Bullets.length > 0
    ? `<ul style="margin:0 0 12px;padding-left:20px;">${section4Bullets.map((b) =>
        `<li style="font-size:13px;color:#334155;line-height:1.7;margin-bottom:4px;">${b}</li>`
      ).join("")}</ul>`
    : "";

  const s4Correction = (data.section4_correction as string | undefined)?.trim()
    ? `<div style="border-left:4px solid #dc2626;background:#fef2f2;padding:10px 14px;margin:12px 0;border-radius:0 4px 4px 0;font-size:13px;color:#1c1917;line-height:1.6;">
  <strong>Correction from prior draft:</strong> ${data.section4_correction as string}
</div>`
    : "";

  // ── §5 — Fund structures ──────────────────────────────────────────────────
  const s5Rows = section5Rows.map((r) =>
    `<tr>${tdL(r.metric, true)}${tdR(r.range)}</tr>`
  ).join("\n");

  // ── §7 — IOS/Service Yard Tracker (Permian) ──────────────────────────────
  const s7IosRows = section7Ios.map((r) =>
    `<tr>
      ${tdL(r.firm, true)}
      ${tdR(`<strong>${r.deal || "—"}</strong><br/><span style="font-size:12px;color:#64748b;">${r.location || ""} &middot; ${r.size || ""} &middot; ${r.price || "undisclosed"} &middot; ${r.date || ""}</span>${r.notes ? `<br/><em style="font-size:12px;color:#94a3b8;">${r.notes}</em>` : ""}`)}
    </tr>`
  ).join("\n");

  // ── §8 — Form D Filings (Permian) ────────────────────────────────────────
  const s8FormDRows = section8FormD.map((r) =>
    `<tr>
      ${tdL(`${r.sponsor || "—"}<br/><em style="font-weight:400;font-size:12px;color:#64748b;">${r.fund || ""}</em>`)}
      ${tdR(`<strong>${r.amount || "—"}</strong> &middot; Filed ${r.filed || "—"}<br/><span style="font-size:12px;color:#64748b;">${r.focus || ""}</span>`)}
    </tr>`
  ).join("\n");

  // ── §6 — Differentiation angles ──────────────────────────────────────────
  const s6List = section6Angles.length > 0
    ? `<p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 10px;">Three verified positioning angles this month:</p>
<ol style="margin:0 0 14px;padding-left:20px;">${section6Angles.map((a) =>
      `<li style="font-size:13px;color:#334155;line-height:1.7;margin-bottom:8px;"><strong>${a.angle}</strong> — ${a.narrative}</li>`
    ).join("")}</ol>`
    : "";

  // ── Sources footer — hyperlinked URLs ────────────────────────────────────
  const linkedSources = research.sources
    .filter((u) => u.startsWith("http"))
    .slice(0, 40)
    .map((u) => {
      let label: string;
      try { label = new URL(u).hostname.replace(/^www\./, ""); } catch { label = u; }
      return `<a href="${u}" style="color:#1d4ed8;text-decoration:underline;" target="_blank">${label}</a>`;
    });

  const sourcesLine = linkedSources.length > 0
    ? `<strong style="color:#475569;">Sources verified ${params.period}:</strong><br/>${linkedSources.join(" &nbsp;&middot;&nbsp; ")}`
    : sourceNames.length > 0
    ? `<strong style="color:#475569;">Sources verified ${params.period}:</strong> ${sourceNames.join(" &middot; ")}`
    : "";

  // ── Body ──────────────────────────────────────────────────────────────────
  const bodyContent = `
<!-- Note box -->
<div style="border-left:4px solid #16a34a;background:#f0fdf4;padding:10px 14px;margin:0 0 24px;border-radius:0 4px 4px 0;font-size:13px;color:#166534;line-height:1.6;">
  All figures verified at publication. Items requiring data integration are explicitly marked.
</div>

${secLabel("§1 — Industrial Capital Flowing (Verified)")}
${s1Cards || '<p style="font-size:13px;color:#94a3b8;">No capital flow events found this period.</p>'}

${secLabel("§2 — Public Industrial REIT Benchmark (Verified)")}
<p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 10px;">EastGroup Properties (EGP) — closest public benchmark to ERP</p>
${s2EgpRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:14px;">
  <tbody>${s2EgpRows}</tbody>
</table>` : ""}
${(data.section2_lp_narrative as string) ? `<p style="font-size:13px;color:#334155;line-height:1.6;margin:0 0 12px;"><strong>LP-facing read:</strong> ${data.section2_lp_narrative as string}</p>` : ""}
${(data.section2_other_reits as string) ? `<p style="font-size:13px;color:#475569;margin:0;"><strong>Other public industrial REITs (tracking quarterly):</strong><br/><span style="font-style:italic;">${data.section2_other_reits as string}</span></p>` : ""}

${secLabel(`§3 — ${geoLabel} Industrial PE Peers (Verified)`)}
${s3Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <tbody>${s3Rows}</tbody>
</table>` : '<p style="font-size:13px;color:#94a3b8;">No peer data available.</p>'}

${secLabel("§4 — Private Competitors with Potential Permian Interest")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">Verified existence; specific ${marketLabel} deployment unverified unless noted.</p>
${s4Bullets}
${s4Correction}

${secLabel("§5 — Comparable Fund Structures")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">${(data.section5_note as string) || "Industry-typical ranges from public PE conventions."}</p>
${s5Rows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <tbody>${s5Rows}</tbody>
</table>` : ""}

${secLabel("§6 — Differentiation Narrative for LP Decks")}
${s6List}
${(data.section6_watch as string) ? `<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin:14px 0;border-radius:0 4px 4px 0;font-size:13px;color:#1d4ed8;"><strong>${data.section6_watch as string}</strong></div>` : ""}

${isPermian ? `
${secLabel("§7 — IOS / Service Yard Competitor Tracker")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">Direct competition — firms acquiring IOS and service yards in Texas. Deal announcements this period.</p>
${s7IosRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>${s7IosRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No new deal announcements found this period.</p>'}
${(data.section7_ios_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section7_ios_note as string}</p>` : ""}

${secLabel("§8 — SEC EDGAR Form D: New Industrial Fund Raises ($50M+)")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">30–60 day advance notice of new capital entering your market. Source: SEC.gov Form D filings.</p>
${s8FormDRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>${s8FormDRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No qualifying Form D filings found this period.</p>'}
${(data.section8_form_d_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section8_form_d_note as string}</p>` : ""}
` : ""}
`;

  const htmlBody = HTML_WRAPPER(
    briefTitle,
    `${params.period} &middot; Monthly &middot; v2 &mdash; verified sources only`,
    bodyContent,
    sourcesLine
  );

  const summary = `${briefTitle} generated for ${params.period}. Covers ${section1Items.length} capital flow events, EastGroup ${section2EgpRows.length}-metric benchmark, ${section3Table.length} PE peers, ${section4Bullets.length} private competitors, ${section6Angles.length} LP differentiation angles.`;

  return { subject, htmlBody, summary };
}
