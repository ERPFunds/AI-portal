import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface WeeklyMarketUpdateOutput {
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
  .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 14px 0; }
  .stat-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; text-align: center; }
  .stat-box .stat-value { font-size: 22px; font-weight: 700; color: #0f172a; }
  .stat-box .stat-label { font-size: 11px; color: #64748b; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
  .stat-box .stat-change { font-size: 12px; margin-top: 2px; }
  .stat-change.up { color: #16a34a; }
  .stat-change.down { color: #dc2626; }
  .bullet-list { list-style: none; padding: 0; margin: 10px 0; }
  .bullet-list li { padding: 6px 0 6px 18px; position: relative; font-size: 13px; color: #334155; border-bottom: 1px solid #f1f5f9; line-height: 1.5; }
  .bullet-list li::before { content: "▸"; position: absolute; left: 0; color: #0f172a; font-size: 11px; top: 8px; }
  .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 40px; font-size: 11px; color: #94a3b8; text-align: center; }
  p { font-size: 13px; line-height: 1.6; color: #475569; margin: 8px 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>${subject}</h1>
    <p class="subtitle">ERP Funds — Weekly Market Update</p>
  </div>
  <div class="verified-banner">Verified Research — Internal Use Only</div>
  <div class="body">
    ${bodyContent}
  </div>
  <div class="footer">ERP Funds Internal Research System &bull; Confidential &bull; Not for distribution</div>
</div>
</body>
</html>`;

export async function runWeeklyMarketUpdate(params: {
  market: string;
  period: string;
}): Promise<WeeklyMarketUpdateOutput> {
  const marketLabel = params.market.charAt(0).toUpperCase() + params.market.slice(1);

  const marketFullName =
    params.market.toLowerCase() === "permian"
      ? "Permian Basin (Midland-Odessa, TX) industrial CRE"
      : params.market.toLowerCase() === "brevard"
      ? "Brevard County, FL (Space Coast) industrial CRE"
      : `${marketLabel} industrial CRE`;

  const ask = `Weekly market update for ${marketFullName}: recent industrial transactions, macro indicators (oil price, logistics indices, employment), supply/demand signals (vacancy rate, absorption, new deliveries), notable news or lease signings, period: ${params.period}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${marketLabel} Weekly Market Update ${params.period}`,
    workflowId: "weekly-market-update",
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 5000,
    system: `You are a CRE market analyst for ERP Funds, producing concise weekly market update briefs for the investment team. ERP Funds is an industrial CRE firm focused on service yards, IOS, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets including Brevard County FL.

Tone: professional, punchy, data-first. Weekly cadence means shorter and more focused than a monthly report — prioritize the most actionable signals. No filler.`,
    messages: [
      {
        role: "user",
        content: `Generate a weekly market update brief for ${marketFullName}, period: ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

---
Produce a JSON object with this exact structure:
{
  "subject": "string — e.g. 'Weekly Market Update: Permian Basin — Week of May 12, 2026'",
  "key_stats": [
    { "value": "x.x%", "label": "Industrial Vacancy", "change": "+0.2pp WoW", "direction": "up" },
    { "value": "$x.xx", "label": "Avg NNN Rent/SF", "change": "-$0.05 WoW", "direction": "down" },
    { "value": "x,xxx sf", "label": "Net Absorption", "change": "vs prior week", "direction": "up" }
  ],
  "section1_title": "§1 — Recent Transactions",
  "section1_items": [
    { "title": "transaction headline", "body": "address, size, buyer/seller, price/PSF, significance" }
  ],
  "section2_title": "§2 — Macro Indicators",
  "section2_items": [
    { "title": "indicator name", "body": "current reading, trend, relevance to market" }
  ],
  "section3_title": "§3 — Supply & Demand Signals",
  "section3_narrative": "2-3 sentences on current vacancy, absorption trend, and pipeline pressure",
  "section3_bullets": ["bullet 1", "bullet 2", "bullet 3"],
  "section4_title": "§4 — Notable News",
  "section4_items": [
    { "title": "headline", "body": "summary and ERP relevance" }
  ],
  "bottom_line": "One sentence: the most important takeaway for ERP this week"
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
    data = { subject: `Weekly Market Update: ${marketLabel} — ${params.period}` };
  }

  const subject = (data.subject as string) || `Weekly Market Update: ${marketLabel} — ${params.period}`;

  const keyStats = (data.key_stats as Array<{ value: string; label: string; change: string; direction: string }> | undefined) ?? [];
  const section1Items = (data.section1_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section2Items = (data.section2_items as Array<{ title: string; body: string }> | undefined) ?? [];
  const section3Bullets = (data.section3_bullets as string[] | undefined) ?? [];
  const section4Items = (data.section4_items as Array<{ title: string; body: string }> | undefined) ?? [];

  const statBoxes = keyStats
    .map(
      (s) => `<div class="stat-box">
  <div class="stat-value">${s.value}</div>
  <div class="stat-label">${s.label}</div>
  <div class="stat-change ${s.direction === "down" ? "down" : "up"}">${s.change}</div>
</div>`
    )
    .join("\n");

  const s1Cards = section1Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s2Cards = section2Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const s3Bullets = section3Bullets
    .map((b) => `<li>${b}</li>`)
    .join("\n");

  const s4Cards = section4Items
    .map((i) => `<div class="card"><div class="card-title">${i.title}</div><div class="card-body">${i.body}</div></div>`)
    .join("\n");

  const bodyContent = `
${
  keyStats.length > 0
    ? `<div class="stat-grid">${statBoxes}</div>`
    : ""
}
${
  data.bottom_line
    ? `<div class="highlight-box"><strong>Bottom line:</strong> ${data.bottom_line as string}</div>`
    : ""
}

<div class="section-header">${(data.section1_title as string) || "§1 — Recent Transactions"}</div>
${s1Cards || '<div class="card"><div class="card-body">No notable transactions this week.</div></div>'}

<div class="section-header">${(data.section2_title as string) || "§2 — Macro Indicators"}</div>
${s2Cards || '<div class="card"><div class="card-body">No macro indicator updates this week.</div></div>'}

<div class="section-header">${(data.section3_title as string) || "§3 — Supply & Demand Signals"}</div>
<p>${(data.section3_narrative as string) || ""}</p>
${s3Bullets ? `<ul class="bullet-list">${s3Bullets}</ul>` : ""}

<div class="section-header">${(data.section4_title as string) || "§4 — Notable News"}</div>
${s4Cards || '<div class="card"><div class="card-body">No notable news this week.</div></div>'}
`;

  const htmlBody = HTML_WRAPPER(subject, bodyContent);
  const summary = `Weekly market update generated for ${marketLabel} — ${params.period}. Covers ${section1Items.length} transactions, ${section2Items.length} macro indicators, ${section4Items.length} news items.`;

  return { subject, htmlBody, summary };
}
