import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface CompetitorIntelligenceOutput {
  subject: string;
  htmlBody: string;
  bodyContent: string;
  sourcesLine: string;
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
  const isBrevard = !isPermian;
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
   For each: fund name, sponsor/GP, raise amount, date filed, industrial focus description.` : ""}
${isBrevard ? `8. Flex/R&D/logistics national competitor tracker — These national firms are active in Florida industrial and are the real competition for Brevard/Space Coast assets (not Prologis or large-box REIT players — they haven't arrived yet). Search specifically for Brevard County / Space Coast activity, and if none found, note their most recent Florida activity:
   - Rockefeller Group (NYC-based, active Florida industrial development)
   - Exeter Property Group (industrial/logistics, Sunbelt focus)
   - Cabot Properties / Centerbridge Partners (Cabot acquired by Centerbridge; Florida logistics)
   - GreenPointe Holdings (Jacksonville-based developer, Central/NE Florida industrial and mixed-use)
   For each: any Brevard County or Space Coast deal, development start, lease, or announcement. Include date.
9. Tampa / Orlando spillover signal — I-4 corridor industrial cap rates are compressing. As they do, capital searches east toward Brevard. This is a leading pricing indicator. Search for:
   - Recent industrial sales in Brevard County where the buyer is headquartered in Orange County (Orlando), Hillsborough (Tampa), or a major out-of-state metro fund
   - Current I-4 corridor industrial cap rates vs Brevard County cap rates — what is the spread and how has it moved?
   - Any fund or operator announcement naming "Space Coast", "Brevard", or "I-95 corridor east of Orlando" as a target market
   Search sources: CoStar news, Globe St, Brevard County Property Appraiser deed records (bcpao.us), CBRE/JLL Florida industrial reports
10. Local developer activity — National REITs have not discovered Brevard. The real competition is local developers. Search Brevard County building permit data for industrial permits in the last 12 months:
    - Cuhaci & Peterson Architects / Developers (Orlando-area, active Central FL industrial)
    - Bravar Industrial (local Brevard developer)
    - Local family offices with Brevard industrial holdings
    - Any industrial permit > 20,000 SF issued by Brevard County Building Department (brevardfl.gov or permits.brevardfl.gov)
    For each: developer/owner, project name or address, SF, city/submarket, permit date, current status (under construction / completed)
11. Aerospace / defense REIT cap rate comps — For LP benchmarking in a space/defense-adjacent market, these REITs set return expectations:
    - Digital Realty (DLR) — data center cap rates near launch corridors (Cape Canaveral, Vandenberg SFB)
    - Equinix (EQIX) — any Florida data center or tech-adjacent industrial activity
    - Iron Mountain (IRM) — defense-adjacent secure storage/data; FL activity
    - What cap rate compression in tech/defense-adjacent specialized industrial signals for Brevard flex/R&D pricing relative to LP expectations
    Note: these are not direct comps but set the ceiling for specialized industrial in defense corridors` : ""}`;


  const research = await runResearchAgent({
    ask,
    projectContext: `${briefTitle} ${params.period}`,
    workflowId: "competitor-intelligence",
    market: params.market,
  });

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4000,
    system: [{ type: "text" as const, text: `You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets including Brevard County / Space Coast, Florida.

CRITICAL RULE — DATA VINTAGE LABELS: Every stat, vacancy rate, rent, cap rate, or metric MUST include the source date in parentheses, e.g. "Vacancy 4.8% (Q4 2025)". Never omit the vintage.

CRITICAL OUTPUT RULE: Return ONLY valid JSON — absolutely no markdown, no code fences, no preamble, no text before or after the JSON object. The response must start with { and end with }.

Every item object MUST have a "source" field (the publication, outlet, or firm name). All body/narrative fields must be plain text with no HTML tags.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a competitor intelligence brief for the ${marketLabel} industrial CRE market for ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

---
Return ONLY valid JSON (no markdown, no code fences, no text outside the JSON object):

{
  "subject": "${briefTitle} — ${params.period}",
  "headline": "Single most important competitive signal this period (≤20 words)",
  "capital_items": [
    { "source": "GlobeSt", "title": "Deal or fund name", "url": "https://source.com", "date": "May 2026", "body": "1-2 sentences with named firms, dollar figures, and date vintage in parentheses." }
  ],
  "egp_items": [
    { "source": "EastGroup (EGP)", "title": "Q1 2026 Earnings", "url": "https://investor.eastgroup.net/", "date": "Apr 2026", "body": "FFO/share, same-store NOI, leasing spread, dev starts — key metrics with quarter vintage. 1-sentence market signal." },
    { "source": "Prologis (PLD)", "title": "Q1 2026 Results", "url": "https://ir.prologis.com/", "date": "Apr 2026", "body": "Key metrics with date vintage. 1 sentence on secondary market relevance." }
  ],
  "peer_items": [
    { "source": "Stonelake Capital Partners", "title": "Latest fund or deal", "url": "https://stonelakecapital.com", "date": "Mon YYYY", "body": "AUM, most recent activity with dollar figures and geography." }
  ],
  "competitor_items": [
    { "source": "Hillwood", "title": "Most recent activity", "url": "https://hillwood.com", "date": "Mon YYYY", "body": "Latest deal, announcement, or market position with specifics." }
  ],
  "tracker_items": [
    { "source": "${isPermian ? "Stonemont Financial" : "Rockefeller Group"}", "title": "Deal or project name", "url": "https://source.com", "date": "Mon YYYY", "body": "Location, size, price/cap rate if known. What it signals for ERP." }
  ],
  "signal_items": [
    { "source": "${isPermian ? "SEC EDGAR" : "CoStar"}", "title": "Signal headline", "url": "https://source.com", "date": "Mon YYYY", "body": "Specific data point with date vintage and investment implication for ERP." }
  ],
  "fund_structure": [
    { "metric": "Management fee", "range": "1.5–2.0% on committed capital" },
    { "metric": "Carried interest", "range": "20% above 8% preferred return" },
    { "metric": "Fund term", "range": "7–10 years" },
    { "metric": "Target IRR", "range": "14–18% net" }
  ],
  "lp_angles": [
    { "source": "CoStar", "title": "Angle title (≤6 words)", "url": "https://source.com", "narrative": "Specific data point with vintage and what it means for ERP's LP pitch." }
  ],
  "lp_narrative": "2 sentences of LP-grade investment prose summarizing ERP's positioning this period.",
  "lp_watch": "One sentence: what to monitor next period.",
  "source_names": ["EastGroup Q1 2026", "CoStar", "GlobeSt"]
}

Rules:
- capital_items: 3 items. source = publication, title = fund/deal name.
- egp_items: 2 items — EastGroup first, then Prologis or Rexford. source = "Ticker (Name)".
- peer_items: 3 items — top ${geoLabel} PE peers. source = firm name.
- competitor_items: 3 items — source = firm name.
- tracker_items: 3 items — ${isPermian ? "IOS/service yard firms: Stonemont, Titan, InSite, Broadstone, Zenith IOS." : "Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe."} source = firm name.
- signal_items: 3 items — ${isPermian ? "SEC EDGAR Form D $50M+ industrial fund raises." : "I-4 spillover signals, local permits, aerospace REIT cap rates."} source = data outlet.
- fund_structure: exactly 4 rows as shown above (industry ranges only, not named funds).
- lp_angles: 3 items — source = publication/outlet, title ≤ 6 words.
- "source" field is REQUIRED on every item in every array. Use the publication, outlet, or firm name.
- All url fields: use real source URLs from the research. Never use example.com or placeholder URLs.
- All body/narrative fields: plain text only, no HTML.`,
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
    console.error("[competitor-intelligence] JSON parse failed — rendering research fallback. Raw:", rawText.slice(0, 400));
    // Fallback: render research findings directly so the email is never blank
    const fallbackSubject = `${briefTitle} — ${params.period}`;
    const fallbackHtml = HTML_WRAPPER(
      fallbackSubject, `Competitive Intelligence · ${params.period}`,
      `<p style="font-size:13px;color:#dc2626;margin:0 0 16px;font-weight:600;">Note: structured formatting unavailable this run — raw research below.</p>` +
      research.findings.split("\n\n").map((p) => `<p style="font-size:13px;line-height:1.7;color:#374151;margin:0 0 14px;">${p}</p>`).join(""),
      research.sources.join(" · ") || "Web research"
    );
    return { subject: fallbackSubject, htmlBody: fallbackHtml, bodyContent: fallbackHtml, sourcesLine: "", summary: research.findings.slice(0, 300) };
  }

  const subject = (data.subject as string) || `${briefTitle} — ${params.period}`;

  // ── Parse sections ────────────────────────────────────────────────────────
  type CardItem = { source?: string; title: string; url?: string; date?: string; body: string };
  type FundRow  = { metric: string; range: string };
  type LpAngle  = { source?: string; title: string; url?: string; narrative: string };

  const capitalItems    = (data.capital_items    as CardItem[]  | undefined) ?? [];
  const egpItems        = (data.egp_items        as CardItem[]  | undefined) ?? [];
  const peerItems       = (data.peer_items       as CardItem[]  | undefined) ?? [];
  const competitorItems = (data.competitor_items as CardItem[]  | undefined) ?? [];
  const trackerItems    = (data.tracker_items    as CardItem[]  | undefined) ?? [];
  const signalItems     = (data.signal_items     as CardItem[]  | undefined) ?? [];
  const fundStructure   = (data.fund_structure   as FundRow[]   | undefined) ?? [];
  const lpAngles        = (data.lp_angles        as LpAngle[]   | undefined) ?? [];
  const lpNarrative     = (data.lp_narrative     as string      | undefined) ?? "";
  const lpWatch         = (data.lp_watch         as string      | undefined) ?? "";
  const sourceNames     = (data.source_names     as string[]    | undefined) ?? [];
  const headline        = (data.headline         as string      | undefined) ?? "";

  // ── HTML helpers ──────────────────────────────────────────────────────────
  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const renderCards = (items: Array<{ source?: string; title: string; url?: string; date?: string; body: string }>) =>
    items.map(item => {
      const url = item.url && item.url.startsWith("http") && !item.url.includes("example.com") ? item.url : null;
      const sourceEl = item.source
        ? (url
            ? `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${item.source}</a>`
            : `<strong style="font-weight:700;color:#0f172a;">${item.source}</strong>`)
        : "";
      const titleEl = url
        ? `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${item.title}</a>`
        : `<strong style="color:#0f172a;">${item.title}</strong>`;
      const sourcePart = sourceEl ? `${sourceEl}<span style="color:#94a3b8;margin:0 5px;">&middot;</span>` : "";
      const datePart = item.date ? `<span style="color:#94a3b8;margin:0 5px;">&middot;</span><span style="color:#94a3b8;">${item.date}</span>` : "";
      return `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;">
  <p style="font-size:12px;margin:0 0 4px;line-height:1.5;">${sourcePart}${titleEl}${datePart}</p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${item.body}</p>
</div>`;
    }).join("\n");

  // ── Headline box (amber) ──────────────────────────────────────────────────
  const headlineHtml = headline
    ? `<div style="border-left:4px solid #d97706;background:#fffbeb;padding:12px 16px;margin:0 0 24px;border-radius:0 4px 4px 0;font-size:13px;color:#1c1917;line-height:1.65;">&#128276; <strong>Headline this period:</strong> ${headline}</div>`
    : "";

  // ── EGP cards ─────────────────────────────────────────────────────────────
  const egpCardsHtml = egpItems.length > 0
    ? renderCards(egpItems)
    : '<p style="font-size:13px;color:#94a3b8;">No EGP data this period.</p>';

  // ── Fund structure table ───────────────────────────────────────────────────
  const fundRows = fundStructure.map((r) =>
    `<tr>
  <td style="text-align:left;padding:9px 12px 9px 0;border-bottom:1px solid #f1f5f9;color:#334155;font-weight:600;">${r.metric}</td>
  <td style="text-align:left;padding:9px 0 9px 0;border-bottom:1px solid #f1f5f9;color:#334155;">${r.range}</td>
</tr>`
  ).join("\n");

  const fundTableHtml = fundStructure.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Metric</th>
    <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px;border-bottom:2px solid #0f172a;">Industry Range</th>
  </tr></thead>
  <tbody>${fundRows}</tbody>
</table>`
    : "";

  // ── LP narrative ──────────────────────────────────────────────────────────
  const lpNarrativeHtml = lpNarrative
    .split(/\n\n+/)
    .filter(Boolean)
    .map(p => `<p style="font-size:13.5px;line-height:1.8;color:#1e293b;margin:0 0 14px;">${p.trim()}</p>`)
    .join("\n");

  // ── Watch box (blue) ──────────────────────────────────────────────────────
  const watchHtml = lpWatch
    ? `<div style="border-left:4px solid #2563eb;background:#eff6ff;padding:12px 16px;margin:14px 0;border-radius:0 4px 4px 0;font-size:13px;color:#1d4ed8;line-height:1.6;"><strong>${lpWatch}</strong></div>`
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

  const trackerLabel = isPermian
    ? "§6 &mdash; IOS / Service Yard Tracker"
    : "§6 &mdash; National Flex / R&D / Logistics Tracker";

  const signalLabel = isPermian
    ? "§7 &mdash; SEC EDGAR Form D &mdash; New Industrial Fund Raises"
    : "§7 &mdash; Market Signals (Spillover &middot; Local Permits &middot; Aerospace REITs)";

  // ── Body ──────────────────────────────────────────────────────────────────
  const bodyContent = [
    headlineHtml,

    secLabel("§1 &mdash; Industrial Capital Flowing"),
    capitalItems.length > 0 ? renderCards(capitalItems) : '<p style="font-size:13px;color:#94a3b8;">No capital flow events found this period.</p>',

    secLabel("§2 &mdash; EastGroup Benchmark (EGP)"),
    egpCardsHtml,

    secLabel(`§3 &mdash; ${geoLabel} PE &amp; Institutional Peers`),
    peerItems.length > 0 ? renderCards(peerItems) : '<p style="font-size:13px;color:#94a3b8;">No peer data available.</p>',

    secLabel("§4 &mdash; Private Competitors"),
    competitorItems.length > 0 ? renderCards(competitorItems) : '<p style="font-size:13px;color:#94a3b8;">No competitor data available.</p>',

    secLabel("§5 &mdash; Comparable Fund Structures"),
    fundTableHtml || '<p style="font-size:13px;color:#94a3b8;">No fund structure data available.</p>',

    secLabel(trackerLabel),
    trackerItems.length > 0 ? renderCards(trackerItems) : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No activity found this period.</p>',

    secLabel(signalLabel),
    signalItems.length > 0 ? renderCards(signalItems) : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No signals found this period.</p>',

    secLabel("§8 &mdash; LP Differentiation Angles"),
    lpAngles.length > 0 ? renderCards(lpAngles.map(a => ({ source: a.source, title: a.title, url: a.url, date: undefined, body: a.narrative }))) : "",

    secLabel("§9 &mdash; LP Narrative Read"),
    lpNarrativeHtml ? `<div>${lpNarrativeHtml}</div>` : "",

    watchHtml,
  ].filter(Boolean).join("\n");

  const htmlBody = HTML_WRAPPER(
    briefTitle,
    `${params.period} &middot; Monthly &middot; v2 &mdash; verified sources only`,
    bodyContent,
    sourcesLine
  );

  const summary = `${briefTitle} generated for ${params.period}. Covers ${capitalItems.length} capital flow events, ${egpItems.length} REIT benchmark cards, ${peerItems.length} PE peers, ${competitorItems.length} private competitors, ${trackerItems.length} tracker items, ${signalItems.length} signals, ${lpAngles.length} LP angles.`;

  return { subject, htmlBody, bodyContent, sourcesLine, summary };
}
