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
    market: params.market,
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
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanText);
  } catch (e) {
    console.error("[submarket-intelligence] JSON parse failed. Raw Claude output:", rawText.slice(0, 500));
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

  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const metricsGrid = keyMetrics
    .map(
      (m) => `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;">
  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#64748b;margin-bottom:4px;">${m.label}</div>
  <div style="font-size:20px;font-weight:700;color:#0f172a;">${m.value}</div>
  <div style="font-size:12px;color:#94a3b8;margin-top:3px;">${m.sub}</div>
</div>`
    )
    .join("\n");

  const s1TableRows = section1Table
    .map(
      (r) =>
        `<tr><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;"><strong>${r.submarket ?? ""}</strong></td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.vacancy ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.absorption_sf ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.trend ?? "—"}</td></tr>`
    )
    .join("\n");

  const s2Cards = section2Items
    .map((i) => `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${i.title}</p><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p></div>`)
    .join("\n");

  const s3TableRows = section3Table
    .map(
      (r) =>
        `<tr><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;"><strong>${r.asset_type ?? ""}</strong></td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.asking_rent ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.effective_rent ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.yoy_change ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.cap_rate ?? "—"}</td></tr>`
    )
    .join("\n");

  const s4Cards = section4Items
    .map((i) => `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${i.title}</p><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p></div>`)
    .join("\n");

  const s5Cards = section5Items
    .map((i) => `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${i.title}</p><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p></div>`)
    .join("\n");

  const s6Bullets = section6Bullets
    .map((b) => `<li style="font-size:13px;color:#1d4ed8;margin-bottom:4px;">${b}</li>`)
    .join("\n");

  const bodyContent = `
${
  keyMetrics.length > 0
    ? `<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin:16px 0 24px;">${metricsGrid}</div>`
    : ""
}

${secLabel((data.section1_title as string) || "§1 — Vacancy &amp; Absorption")}
<p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 10px;">${(data.section1_narrative as string) || ""}</p>
${
  s1TableRows
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Submarket</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Vacancy</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Net Absorption (SF)</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Trend</th>
  </tr></thead>
  <tbody>${s1TableRows}</tbody>
</table>`
    : ""
}

${secLabel((data.section2_title as string) || "§2 — New Supply Pipeline")}
<p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 10px;">${(data.section2_narrative as string) || ""}</p>
${s2Cards || '<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">No new supply pipeline data available.</p></div>'}

${secLabel((data.section3_title as string) || "§3 — Rent Trends")}
<p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 10px;">${(data.section3_narrative as string) || ""}</p>
${
  s3TableRows
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Asset Type</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Asking Rent</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Effective Rent</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">YoY Change</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Cap Rate</th>
  </tr></thead>
  <tbody>${s3TableRows}</tbody>
</table>`
    : ""
}

${secLabel((data.section4_title as string) || "§4 — Notable Leases &amp; Sales")}
${s4Cards || '<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">No notable transactions this month.</p></div>'}

${secLabel((data.section5_title as string) || "§5 — Development Activity")}
${s5Cards || '<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">No development activity data available.</p></div>'}

${secLabel((data.section6_title as string) || "§6 — Investment Outlook")}
<p style="font-size:13px;color:#475569;line-height:1.6;margin:0 0 10px;">${(data.section6_narrative as string) || ""}</p>
${
  s6Bullets
    ? `<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin:14px 0;border-radius:0 4px 4px 0;font-size:13px;color:#1d4ed8;"><strong>Watch this month:</strong><ul style="margin:8px 0 0;padding-left:18px;">${s6Bullets}</ul></div>`
    : ""
}
`;

  const htmlBody = HTML_WRAPPER(subject, `${params.period}`, bodyContent, "");
  const summary = `Submarket intelligence report generated for ${marketLabel} — ${params.period}. Covers ${section1Table.length} submarkets, ${section2Items.length} pipeline projects, ${section4Items.length} notable transactions.`;

  return { subject, htmlBody, summary };
}
