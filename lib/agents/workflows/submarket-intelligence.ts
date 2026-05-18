import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface SubmarketIntelligenceOutput {
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
  .metrics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin: 16px 0; }
  .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 16px; }
  .metric-card .metric-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #64748b; margin-bottom: 4px; }
  .metric-card .metric-value { font-size: 20px; font-weight: 700; color: #0f172a; }
  .metric-card .metric-sub { font-size: 12px; color: #94a3b8; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px; }
  thead tr { background: #0f172a; color: #ffffff; }
  thead th { padding: 9px 12px; text-align: left; font-weight: 600; font-size: 12px; letter-spacing: 0.3px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 8px 12px; color: #334155; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .pipeline-bar { height: 8px; background: #e2e8f0; border-radius: 4px; margin: 6px 0; overflow: hidden; }
  .pipeline-bar-fill { height: 100%; background: #0f172a; border-radius: 4px; }
  .bullet-list { list-style: none; padding: 0; margin: 10px 0; }
  .bullet-list li { padding: 6px 0 6px 18px; position: relative; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; line-height: 1.5; }
  .bullet-list li::before { content: "▸"; position: absolute; left: 0; color: #0f172a; font-size: 11px; top: 8px; }
  .outlook-box { background: #eff6ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 14px 0; border-radius: 0 4px 4px 0; font-size: 13px; color: #1d4ed8; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  p { font-size: 13px; line-height: 1.6; color: #475569; margin: 8px 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${subject}</h1>
    <p class="subtitle">ERP Funds — Submarket Intelligence Report</p>
  </div>
  <div class="verified-banner">Verified Research — Internal Use Only</div>
  <div class="body">
    ${bodyContent}
  </div>
  <div class="footer">ERP Funds Internal Research System &bull; Confidential &bull; Not for distribution</div>
</div>
</body>
</html>`;

export async function runSubmarketIntelligence(params: {
  market: string;
  period: string;
}): Promise<SubmarketIntelligenceOutput> {
  const marketLabel = params.market.charAt(0).toUpperCase() + params.market.slice(1);

  const marketFullName =
    params.market.toLowerCase() === "permian"
      ? "Permian Basin (Midland-Odessa, TX) industrial CRE"
      : params.market.toLowerCase() === "brevard"
      ? "Brevard County, FL (Space Coast / Melbourne-Titusville) industrial CRE"
      : `${marketLabel} industrial CRE`;

  const ask = `Monthly submarket intelligence deep dive for ${marketFullName}: vacancy rates by submarket, net absorption trends, new supply pipeline and deliveries, rent trends (NNN rate $/SF, triple net, rent escalations), notable lease signings and sales, development activity and land constraints, period: ${params.period}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${marketLabel} Submarket Intelligence ${params.period}`,
    workflowId: "submarket-intelligence",
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 5500,
    system: [{ type: "text" as const, text: `You are a senior CRE submarket analyst for ERP Funds, producing monthly deep-dive intelligence reports. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.

Produce LP-grade submarket intelligence: specific data points, named assets and transactions, trend analysis, and clear investment implications. Be precise, data-dense, and direct.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a monthly submarket intelligence report for ${marketFullName}, period: ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

---
Produce a JSON object with this exact structure:
{
  "subject": "string — e.g. 'Submarket Intelligence: Permian Basin — May 2026'",
  "key_metrics": [
    { "label": "Overall Vacancy Rate", "value": "x.x%", "sub": "vs x.x% prior month" },
    { "label": "Net Absorption (MTD)", "value": "xxx,xxx SF", "sub": "vs xxx,xxx SF prior month" },
    { "label": "Avg NNN Rent/SF", "value": "$x.xx", "sub": "+x.x% YoY" },
    { "label": "Under Construction", "value": "xxx,xxx SF", "sub": "x projects" }
  ],
  "section1_title": "§1 — Vacancy & Absorption",
  "section1_narrative": "2-3 sentences on current vacancy and absorption trend",
  "section1_table": [
    { "submarket": "name", "vacancy": "x.x%", "absorption_sf": "xxx,xxx", "trend": "tightening/rising/stable" }
  ],
  "section2_title": "§2 — New Supply Pipeline",
  "section2_narrative": "1-2 sentences on supply pressure",
  "section2_items": [
    { "title": "project name/address", "body": "size, developer, delivery date, preleased %" }
  ],
  "section3_title": "§3 — Rent Trends",
  "section3_narrative": "2 sentences on rent trajectory",
  "section3_table": [
    { "asset_type": "type", "asking_rent": "$x.xx/SF NNN", "effective_rent": "$x.xx/SF", "yoy_change": "+x.x%", "cap_rate": "x.x%" }
  ],
  "section4_title": "§4 — Notable Leases & Sales",
  "section4_items": [
    { "title": "transaction headline", "body": "tenant/buyer, address, size, terms, ERP relevance" }
  ],
  "section5_title": "§5 — Development Activity",
  "section5_items": [
    { "title": "development name/area", "body": "status, land constraints, developer, completion estimate" }
  ],
  "section6_title": "§6 — Investment Outlook",
  "section6_narrative": "2-3 sentences on overall investment thesis for ERP in this submarket this month",
  "section6_bullets": ["watch item 1", "watch item 2", "watch item 3"]
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
    data = { subject: `Submarket Intelligence: ${marketLabel} — ${params.period}` };
  }

  const subject = (data.subject as string) || `Submarket Intelligence: ${marketLabel} — ${params.period}`;

  const keyMetrics = (data.key_metrics as Array<{ label: string; value: string; sub: string }> | undefined) ?? [];
  const section1Table = (data.section1_table as Array<Record<string, string>> | undefined) ?? [];
  const section2Items = (data.section2_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section3Table = (data.section3_table as Array<Record<string, string>> | undefined) ?? [];
  const section4Items = (data.section4_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section5Items = (data.section5_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section6Bullets = (data.section6_bullets as string[] | undefined) ?? [];

  const metricsGrid = keyMetrics
    .map(
      (m) => `<div class="metric-card">
  <div class="metric-label">${m.label}</div>
  <div class="metric-value">${m.value}</div>
  <div class="metric-sub">${m.sub}</div>
</div>`
    )
    .join("\n");

  const s1TableRows = section1Table
    .map(
      (r) =>
        `<tr><td><strong>${r.submarket ?? ""}</strong></td><td>${r.vacancy ?? "—"}</td><td>${r.absorption_sf ?? "—"}</td><td>${r.trend ?? "—"}</td></tr>`
    )
    .join("\n");

  const s2Cards = section2Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s3TableRows = section3Table
    .map(
      (r) =>
        `<tr><td><strong>${r.asset_type ?? ""}</strong></td><td>${r.asking_rent ?? "—"}</td><td>${r.effective_rent ?? "—"}</td><td>${r.yoy_change ?? "—"}</td><td>${r.cap_rate ?? "—"}</td></tr>`
    )
    .join("\n");

  const s4Cards = section4Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s5Cards = section5Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s6Bullets = section6Bullets
    .map((b) => `<li>${b}</li>`)
    .join("\n");

  const bodyContent = `
${
  keyMetrics.length > 0
    ? `<div class="metrics-grid">${metricsGrid}</div>`
    : ""
}

<div class="section-header">${(data.section1_title as string) || "§1 — Vacancy & Absorption"}</div>
<p>${(data.section1_narrative as string) || ""}</p>
${
  s1TableRows
    ? `<table>
  <thead><tr><th>Submarket</th><th>Vacancy</th><th>Net Absorption (SF)</th><th>Trend</th></tr></thead>
  <tbody>${s1TableRows}</tbody>
</table>`
    : ""
}

<div class="section-header">${(data.section2_title as string) || "§2 — New Supply Pipeline"}</div>
<p>${(data.section2_narrative as string) || ""}</p>
${s2Cards || '<div class="card"><div class="card-body">No new supply pipeline data available.</div></div>'}

<div class="section-header">${(data.section3_title as string) || "§3 — Rent Trends"}</div>
<p>${(data.section3_narrative as string) || ""}</p>
${
  s3TableRows
    ? `<table>
  <thead><tr><th>Asset Type</th><th>Asking Rent</th><th>Effective Rent</th><th>YoY Change</th><th>Cap Rate</th></tr></thead>
  <tbody>${s3TableRows}</tbody>
</table>`
    : ""
}

<div class="section-header">${(data.section4_title as string) || "§4 — Notable Leases & Sales"}</div>
${s4Cards || '<div class="card"><div class="card-body">No notable transactions this month.</div></div>'}

<div class="section-header">${(data.section5_title as string) || "§5 — Development Activity"}</div>
${s5Cards || '<div class="card"><div class="card-body">No development activity data available.</div></div>'}

<div class="section-header">${(data.section6_title as string) || "§6 — Investment Outlook"}</div>
<p>${(data.section6_narrative as string) || ""}</p>
${
  s6Bullets
    ? `<div class="outlook-box"><strong>Watch this month:</strong><ul class="bullet-list" style="margin-top:8px;">${s6Bullets}</ul></div>`
    : ""
}
`;

  const htmlBody = HTML_WRAPPER(subject, bodyContent);
  const summary = `Submarket intelligence report generated for ${marketLabel} — ${params.period}. Covers ${section1Table.length} submarkets, ${section2Items.length} pipeline projects, ${section4Items.length} notable transactions.`;

  return { subject, htmlBody, summary };
}
