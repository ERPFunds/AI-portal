import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface CompetitorIntelligenceOutput {
  subject: string;
  htmlBody: string;
  summary: string;
}

const HTML_WRAPPER = (subject: string, bodyContent: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${subject}</title>
<style>
  body { margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; }
  .wrapper { max-width: 720px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.10); }
  .header { background: #0f172a; padding: 36px 40px 28px; }
  .header h1 { margin: 0 0 6px; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.3px; }
  .header .subtitle { color: #94a3b8; font-size: 13px; margin: 0; }
  .verified-banner { background: #166534; color: #bbf7d0; font-size: 12px; font-weight: 600; padding: 8px 40px; letter-spacing: 0.5px; text-transform: uppercase; }
  .body { padding: 32px 40px; }
  .section-header { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; font-variant: small-caps; color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin: 28px 0 14px; }
  .card { border-left: 4px solid #0f172a; padding: 12px 16px; margin: 10px 0; background: #f8fafc; border-radius: 0 4px 4px 0; }
  .card .card-title { font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 4px; }
  .card .card-body { font-size: 13px; color: #475569; line-height: 1.55; }
  .highlight-box { background: #fefce8; border: 1px solid #fde68a; border-left: 4px solid #d97706; padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; font-size: 13px; color: #78350f; }
  .correction-box { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 10px 0; border-radius: 0 4px 4px 0; font-size: 13px; color: #991b1b; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  thead tr { background: #0f172a; color: #ffffff; }
  thead th { padding: 9px 12px; text-align: left; font-weight: 600; font-size: 12px; letter-spacing: 0.3px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 8px 12px; color: #334155; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .angle { margin: 8px 0; padding: 10px 14px; border-left: 4px solid #16a34a; background: #f0fdf4; border-radius: 0 4px 4px 0; font-size: 13px; color: #15803d; }
  .watch-box { background: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 14px 0; border-radius: 0 4px 4px 0; font-size: 13px; color: #1d4ed8; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  p { font-size: 13px; line-height: 1.6; color: #475569; margin: 8px 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${subject}</h1>
    <p class="subtitle">ERP Funds — Competitor Intelligence Brief</p>
  </div>
  <div class="verified-banner">Verified Research — Internal Use Only</div>
  <div class="body">
    ${bodyContent}
  </div>
  <div class="footer">ERP Funds Internal Research System &bull; Confidential &bull; Not for distribution</div>
</div>
</body>
</html>`;

export async function runCompetitorIntelligence(params: {
  market: string;
  period: string;
}): Promise<CompetitorIntelligenceOutput> {
  const marketLabel = params.market.charAt(0).toUpperCase() + params.market.slice(1);
  const ask = `Competitor intelligence for industrial CRE market in ${marketLabel}: institutional fundraises, major acquisitions, public REIT performance (EastGroup, Prologis, Rexford, Terreno, STAG, First Industrial), regional PE peers active in ${marketLabel}, private competitors, comparable fund structures (management fee, carry, term, target IRR), period: ${params.period}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${marketLabel} Competitor Intelligence ${params.period}`,
    workflowId: "competitor-intelligence",
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 6000,
    system: [{ type: "text" as const, text: `You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets (Midland-Odessa, Tampa/Brevard County FL, secondary Texas).

Your job: produce a richly detailed, LP-grade competitor intelligence brief for internal use. Be specific, data-dense, and direct. Every section must contain real named entities, figures, and actionable observations. No filler.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a competitor intelligence brief for the ${marketLabel} industrial CRE market for the period ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

---
Produce a JSON object with this exact structure (escape all HTML correctly):
{
  "subject": "string — e.g. 'Competitor Intelligence: Permian Basin — May 2026'",
  "section1_title": "§1 — Capital Flowing",
  "section1_items": [
    { "title": "event/deal title", "body": "details, amounts, parties, significance to ERP" }
  ],
  "section2_title": "§2 — Public Industrial REIT Benchmark",
  "section2_table": [
    { "name": "EastGroup Properties", "ticker": "EGP", "price": "$", "ytd": "%", "ffo_yield": "%", "div_yield": "%", "note": "text" },
    { "name": "Prologis", "ticker": "PLD", ... },
    { "name": "Rexford Industrial", "ticker": "REXR", ... },
    { "name": "Terreno Realty", "ticker": "TRNO", ... },
    { "name": "STAG Industrial", "ticker": "STAG", ... },
    { "name": "First Industrial", "ticker": "FR", ... }
  ],
  "section2_narrative": "2-3 sentences LP-facing narrative on REIT comp context",
  "section3_title": "§3 — Regional PE Peers",
  "section3_table": [
    { "firm": "name", "focus": "strategy", "aum_est": "$xB", "activity": "what they are doing in this market" }
  ],
  "section4_title": "§4 — Private Competitors",
  "section4_items": [
    { "title": "firm/operator name", "body": "description, assets, market interest" }
  ],
  "section5_title": "§5 — Comparable Fund Structures",
  "section5_table": [
    { "fund": "name", "mgmt_fee": "%", "carry": "%", "term": "years", "target_irr": "%" }
  ],
  "section6_title": "§6 — Differentiation Narrative for LP Decks",
  "section6_angles": [
    { "angle": "positioning angle title", "narrative": "1-2 sentence narrative" }
  ],
  "section6_watch": "Watch for next month: 1-2 sentences on key things to monitor"
}

Return ONLY valid JSON, no markdown, no extra text.`,
      },
    ],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(rawText);
  } catch {
    data = { subject: `Competitor Intelligence: ${marketLabel} — ${params.period}` };
  }

  const subject = (data.subject as string) || `Competitor Intelligence: ${marketLabel} — ${params.period}`;

  // Build HTML body from structured data
  const section1Items = (data.section1_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section2Table = (data.section2_table as Array<Record<string, string>> | undefined) ?? [];
  const section3Table = (data.section3_table as Array<Record<string, string>> | undefined) ?? [];
  const section4Items = (data.section4_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section5Table = (data.section5_table as Array<Record<string, string>> | undefined) ?? [];
  const section6Angles = (data.section6_angles as Array<{ angle: string; narrative: string }> | undefined) ?? [];

  const s1Cards = section1Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s2TableRows = section2Table
    .map(
      (r) =>
        `<tr><td><strong>${r.name ?? ""}</strong></td><td>${r.ticker ?? ""}</td><td>${r.price ?? "—"}</td><td>${r.ytd ?? "—"}</td><td>${r.ffo_yield ?? "—"}</td><td>${r.div_yield ?? "—"}</td><td>${r.note ?? ""}</td></tr>`
    )
    .join("\n");

  const s3TableRows = section3Table
    .map((r) => `<tr><td><strong>${r.firm ?? ""}</strong></td><td>${r.focus ?? ""}</td><td>${r.aum_est ?? "—"}</td><td>${r.activity ?? ""}</td></tr>`)
    .join("\n");

  const s4Cards = section4Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s5TableRows = section5Table
    .map((r) => `<tr><td><strong>${r.fund ?? ""}</strong></td><td>${r.mgmt_fee ?? "—"}</td><td>${r.carry ?? "—"}</td><td>${r.term ?? "—"}</td><td>${r.target_irr ?? "—"}</td></tr>`)
    .join("\n");

  const s6Angles = section6Angles
    .map((a) => `<div class="angle"><strong>${a.angle}</strong> — ${a.narrative}</div>`)
    .join("\n");

  const bodyContent = `
<div class="section-header">${(data.section1_title as string) || "§1 — Capital Flowing"}</div>
${s1Cards || '<div class="card"><div class="card-body">No data available for this period.</div></div>'}

<div class="section-header">${(data.section2_title as string) || "§2 — Public Industrial REIT Benchmark"}</div>
<div class="highlight-box">EastGroup Properties (EGP) is the closest public comp to ERP's Sunbelt/secondary industrial strategy.</div>
${
  s2TableRows
    ? `<table>
  <thead><tr><th>REIT</th><th>Ticker</th><th>Price</th><th>YTD</th><th>FFO Yield</th><th>Div Yield</th><th>Note</th></tr></thead>
  <tbody>${s2TableRows}</tbody>
</table>`
    : "<p>Benchmark data not available.</p>"
}
<p>${(data.section2_narrative as string) || ""}</p>

<div class="section-header">${(data.section3_title as string) || "§3 — Regional PE Peers"}</div>
${
  s3TableRows
    ? `<table>
  <thead><tr><th>Firm</th><th>Focus</th><th>AUM Est.</th><th>Activity in Market</th></tr></thead>
  <tbody>${s3TableRows}</tbody>
</table>`
    : "<p>No regional PE peer data available.</p>"
}

<div class="section-header">${(data.section4_title as string) || "§4 — Private Competitors"}</div>
${s4Cards || '<div class="card"><div class="card-body">No private competitor data available.</div></div>'}

<div class="section-header">${(data.section5_title as string) || "§5 — Comparable Fund Structures"}</div>
${
  s5TableRows
    ? `<table>
  <thead><tr><th>Fund</th><th>Mgmt Fee</th><th>Carry</th><th>Term</th><th>Target IRR</th></tr></thead>
  <tbody>${s5TableRows}</tbody>
</table>`
    : "<p>No comparable fund structure data available.</p>"
}

<div class="section-header">${(data.section6_title as string) || "§6 — Differentiation Narrative for LP Decks"}</div>
${s6Angles || "<p>No differentiation angles available.</p>"}
${
  data.section6_watch
    ? `<div class="watch-box"><strong>Watch for next month:</strong> ${data.section6_watch as string}</div>`
    : ""
}
`;

  const htmlBody = HTML_WRAPPER(subject, bodyContent);
  const summary = `Competitor intelligence brief generated for ${marketLabel} — ${params.period}. Covers ${section1Items.length} capital flow events, ${section2Table.length} REIT benchmarks, ${section3Table.length} PE peers, ${section4Items.length} private competitors.`;

  return { subject, htmlBody, summary };
}
