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
    <h1 style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 6px;line-height:1.2;">&#128269; ${displayTitle}</h1>
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
  const marketLabel = params.market.charAt(0).toUpperCase() + params.market.slice(1);
  const ask = `Competitor intelligence for industrial CRE market in ${marketLabel}: institutional fundraises, major acquisitions, public REIT performance (EastGroup, Prologis, Rexford, Terreno, STAG, First Industrial), regional PE peers active in ${marketLabel}, private competitors, comparable fund structures (management fee, carry, term, target IRR), period: ${params.period}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${marketLabel} Competitor Intelligence ${params.period}`,
    workflowId: "competitor-intelligence",
    market: params.market,
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
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanText);
  } catch (e) {
    console.error("[competitor-intelligence] JSON parse failed. Raw Claude output:", rawText.slice(0, 500));
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

  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const s1Cards = section1Items
    .map((i) => `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${i.title}</p><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p></div>`)
    .join("\n");

  const s2TableRows = section2Table
    .map(
      (r) =>
        `<tr><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;"><strong>${r.name ?? ""}</strong></td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.ticker ?? ""}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.price ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.ytd ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.ffo_yield ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.div_yield ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.note ?? ""}</td></tr>`
    )
    .join("\n");

  const s3TableRows = section3Table
    .map((r) => `<tr><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;"><strong>${r.firm ?? ""}</strong></td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.focus ?? ""}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.aum_est ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.activity ?? ""}</td></tr>`)
    .join("\n");

  const s4Cards = section4Items
    .map((i) => `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 4px;">${i.title}</p><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${i.body}</p></div>`)
    .join("\n");

  const s5TableRows = section5Table
    .map((r) => `<tr><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;"><strong>${r.fund ?? ""}</strong></td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.mgmt_fee ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.carry ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.term ?? "—"}</td><td style="padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#334155;">${r.target_irr ?? "—"}</td></tr>`)
    .join("\n");

  const s6Angles = section6Angles
    .map((a) => `<div style="margin:8px 0;padding:10px 14px;border-left:4px solid #16a34a;background:#f0fdf4;border-radius:0 4px 4px 0;font-size:13px;color:#15803d;"><strong>${a.angle}</strong> — ${a.narrative}</div>`)
    .join("\n");

  const bodyContent = `
${secLabel((data.section1_title as string) || "§1 — Capital Flowing")}
${s1Cards || '<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">No data available for this period.</p></div>'}

${secLabel((data.section2_title as string) || "§2 — Public Industrial REIT Benchmark")}
<div style="border-left:4px solid #d97706;background:#fffbeb;padding:12px 16px;margin:20px 0 0;border-radius:0 4px 4px 0;font-size:13px;color:#1c1917;line-height:1.65;">EastGroup Properties (EGP) is the closest public comp to ERP's Sunbelt/secondary industrial strategy.</div>
${
  s2TableRows
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">REIT</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Ticker</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Price</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">YTD</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">FFO Yield</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Div Yield</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Note</th>
  </tr></thead>
  <tbody>${s2TableRows}</tbody>
</table>`
    : `<p style="font-size:13px;color:#94a3b8;">Benchmark data not available.</p>`
}
<p style="font-size:13px;color:#475569;line-height:1.6;margin:8px 0;">${(data.section2_narrative as string) || ""}</p>

${secLabel((data.section3_title as string) || "§3 — Regional PE Peers")}
${
  s3TableRows
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Firm</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Focus</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">AUM Est.</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Activity in Market</th>
  </tr></thead>
  <tbody>${s3TableRows}</tbody>
</table>`
    : `<p style="font-size:13px;color:#94a3b8;">No regional PE peer data available.</p>`
}

${secLabel((data.section4_title as string) || "§4 — Private Competitors")}
${s4Cards || '<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;"><p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">No private competitor data available.</p></div>'}

${secLabel((data.section5_title as string) || "§5 — Comparable Fund Structures")}
${
  s5TableRows
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Fund</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Mgmt Fee</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Carry</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Term</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Target IRR</th>
  </tr></thead>
  <tbody>${s5TableRows}</tbody>
</table>`
    : `<p style="font-size:13px;color:#94a3b8;">No comparable fund structure data available.</p>`
}

${secLabel((data.section6_title as string) || "§6 — Differentiation Narrative for LP Decks")}
${s6Angles || `<p style="font-size:13px;color:#94a3b8;">No differentiation angles available.</p>`}
${
  data.section6_watch
    ? `<div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin:14px 0;border-radius:0 4px 4px 0;font-size:13px;color:#1d4ed8;"><strong>Watch for next month:</strong> ${data.section6_watch as string}</div>`
    : ""
}
`;

  // ── Sources footer — hyperlinked with domain label ───────────────────────────
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
    : "";

  const htmlBody = HTML_WRAPPER(subject, `${params.period}`, bodyContent, sourcesLine);
  const summary = `Competitor intelligence brief generated for ${marketLabel} — ${params.period}. Covers ${section1Items.length} capital flow events, ${section2Table.length} REIT benchmarks, ${section3Table.length} PE peers, ${section4Items.length} private competitors.`;

  return { subject, htmlBody, summary };
}
