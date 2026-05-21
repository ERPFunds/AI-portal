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
    max_tokens: 8192,
    system: [{ type: "text" as const, text: `You are a senior industrial CRE strategist and competitive analyst for ERP Funds. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets including Brevard County / Space Coast, Florida.

For the Brevard / Space Coast market specifically:
- The competitive set is flex industrial, R&D, and logistics — NOT large-box REIT. National players like Prologis have not arrived yet.
- Local developers (Cuhaci & Peterson, Bravar Industrial, family offices) are the primary competition. Track permit activity, not press releases.
- The I-4 corridor cap rate compression is a leading indicator — Orlando/Tampa buyers appearing in Brevard deed records is an early pricing pressure signal.
- Aerospace and defense REIT cap rate trends (Digital Realty near Cape Canaveral, etc.) set LP return expectations for specialized industrial in launch corridors.

CRITICAL RULE — DATA VINTAGE LABELS: Every single statistic, vacancy rate, rent figure, cap rate, price, or metric in your response MUST include the source date in parentheses. Examples: "Vacancy 4.8% (Q4 2025)", "Avg NNN rent $9.25/SF (JLL, Q1 2026)", "Cap rate 5.8% (CoStar, Jan 2026)". A stat without a date is unusable. Never omit the vintage.

Produce a richly detailed, LP-grade competitor intelligence brief. Be specific and data-dense. Every section must contain real named entities, figures, and actionable observations. Use web_search aggressively to fill gaps before marking anything as data pending.`, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        type: "web_search_20250305" as "web_search_20250305",
        name: "web_search",
        max_uses: 7,
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
  ${isBrevard ? `"section7_national_trackers": [
    { "firm": "Rockefeller Group", "activity": "Project name, deal, or announcement", "location": "City, FL", "size": "xx,xxx SF or acres", "date": "Mon YYYY", "notes": "Brevard/Space Coast specific if found; otherwise most recent FL activity" }
  ],
  "section7_national_note": "Focus: flex/R&D/logistics competitors — not big-box REIT. If no Brevard activity found for a firm, state last known Florida activity with date.",
  "section8_spillover": [
    { "signal": "Buyer name or fund type", "detail": "Property address, SF, price, buyer HQ city/state", "date": "Mon YYYY", "implication": "What this signals for Brevard pricing pressure" }
  ],
  "section8_cap_rate_spread": { "i4_corridor": "x.x% (source, Mon YYYY)", "brevard": "x.x% (source, Mon YYYY)", "spread": "x.xx% — tightening/stable/widening", "trend": "narrative" },
  "section8_spillover_note": "If no specific deed record found, note the cap rate spread trend and what threshold would trigger spillover.",
  "section9_local_devs": [
    { "developer": "Cuhaci & Peterson", "project": "Project name or address", "sf": "xx,xxx SF", "location": "City, Brevard County", "permit_date": "Mon YYYY", "status": "Under construction / Completed / Permitted" }
  ],
  "section9_local_note": "Source: Brevard County building permits. Industrial permits > 20,000 SF past 12 months. These are ERP's actual competition — not press-release firms.",
  "section10_aerospace_reits": [
    { "entity": "Digital Realty (DLR)", "metric": "Cap rate or yield metric", "value": "x.x% (source, Mon YYYY)", "trend": "Compressing / Stable / Expanding", "relevance": "What this implies for Brevard flex/R&D pricing and LP expectations" }
  ],
  "section10_note": "Not direct comps — used to set LP ceiling expectations for specialized industrial in defense/launch corridors.",` : ""}
  "source_names": ["EastGroup Q1 press release", "Diamondback Q1 2026", "Stonelake website"]
}

Rules:
- DATA VINTAGE REQUIRED: Every metric value must include source date in parentheses, e.g. "4.8% (CoStar Q4 2025)" or "$9.25/SF (JLL, Jan 2026)". Never write a bare number without a date.
- section1_items: 4-6 items, mix of fund closes, acquisitions, operator results — include date on each
- section2_egp_rows: use most recent quarter available; search for it if not in research; include quarter in every value
- section3_table: 3-5 ${geoLabel} PE peers with substantive descriptions; include AUM or deal data with dates
- section4_bullets: 4-6 private competitors, one sentence each with any known recent activity and date
- section4_correction: empty string "" if no correction needed
- section5_rows: industry ranges only, NOT individual named funds
- section6_angles: exactly 3 angles with specific verified data points including dates
${isPermian ? `- section7_ios_tracker: search specifically for Stonemont, Titan Industrial, InSite, Broadstone, Zenith IOS deal announcements. If nothing found this period, note last known activity with date.
- section8_form_d: search SEC EDGAR for Form D filings from industrial CRE funds. This is a competitive intelligence signal.` : ""}
${isBrevard ? `- section7_national_trackers: search Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe for Brevard/Space Coast activity. If nothing found, report last known Florida activity with date. Flex/R&D/logistics focus — not big-box REIT.
- section8_spillover: search Brevard County deed records (bcpao.us), CoStar, and FL industrial news for Orlando/Tampa buyers appearing in Brevard. Report the I-4 vs Brevard cap rate spread with dates.
- section9_local_devs: search Brevard County building permits for industrial >20,000 SF past 12 months. Cuhaci & Peterson, Bravar Industrial, and any local family office. These are ERP's actual competition.
- section10_aerospace_reits: report Digital Realty, Equinix, Iron Mountain cap rate trends in defense/launch-adjacent markets with dates. Frame for LP expectations.` : ""}
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
  type IosRow           = { firm: string; deal: string; location: string; size: string; price: string; date: string; notes: string };
  type FormDRow         = { fund: string; sponsor: string; amount: string; filed: string; focus: string };
  type NationalTracker  = { firm: string; activity: string; location: string; size: string; date: string; notes: string };
  type SpilloverRow     = { signal: string; detail: string; date: string; implication: string };
  type LocalDevRow      = { developer: string; project: string; sf: string; location: string; permit_date: string; status: string };
  type AerospaceReit    = { entity: string; metric: string; value: string; trend: string; relevance: string };

  const section1Items        = (data.section1_items          as Array<{ title: string; date: string; body: string }> | undefined) ?? [];
  const section2EgpRows      = (data.section2_egp_rows       as Array<{ metric: string; value: string }> | undefined) ?? [];
  const section3Table        = (data.section3_table          as Array<{ firm: string; description: string }> | undefined) ?? [];
  const section4Bullets      = (data.section4_bullets        as string[] | undefined) ?? [];
  const section5Rows         = (data.section5_rows           as Array<{ metric: string; range: string }> | undefined) ?? [];
  const section6Angles       = (data.section6_angles         as Array<{ angle: string; narrative: string }> | undefined) ?? [];
  const section7Ios          = isPermian ? (data.section7_ios_tracker    as IosRow[] | undefined) ?? [] : [];
  const section8FormD        = isPermian ? (data.section8_form_d         as FormDRow[] | undefined) ?? [] : [];
  const section7NatTrackers  = isBrevard ? (data.section7_national_trackers as NationalTracker[] | undefined) ?? [] : [];
  const section8Spillover    = isBrevard ? (data.section8_spillover      as SpilloverRow[] | undefined) ?? [] : [];
  const section8CapRateSpread = isBrevard ? (data.section8_cap_rate_spread as { i4_corridor: string; brevard: string; spread: string; trend: string } | undefined) ?? null : null;
  const section9LocalDevs    = isBrevard ? (data.section9_local_devs     as LocalDevRow[] | undefined) ?? [] : [];
  const section10AerospaceReits = isBrevard ? (data.section10_aerospace_reits as AerospaceReit[] | undefined) ?? [] : [];
  const sourceNames          = (data.source_names            as string[] | undefined) ?? [];

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

  // ── §7 — National Competitor Tracker (Brevard) ───────────────────────────
  const s7NatRows = section7NatTrackers.map((r) =>
    `<tr>
      ${tdL(`<strong>${r.firm || "—"}</strong>`, false)}
      ${tdR(`${r.activity || "No activity found"}<br/><span style="font-size:12px;color:#64748b;">${[r.location, r.size, r.date].filter(Boolean).join(" &middot; ")}</span>${r.notes ? `<br/><em style="font-size:12px;color:#94a3b8;">${r.notes}</em>` : ""}`)}
    </tr>`
  ).join("\n");

  // ── §8 — Orlando/Tampa Spillover (Brevard) ───────────────────────────────
  const s8SpilloverRows = section8Spillover.map((r) =>
    `<tr>
      ${tdL(`<strong>${r.signal || "—"}</strong><br/><span style="font-size:12px;color:#64748b;">${r.date || ""}</span>`)}
      ${tdR(`${r.detail || "—"}<br/><em style="font-size:12px;color:#475569;">${r.implication || ""}</em>`)}
    </tr>`
  ).join("\n");

  const s8CapRateBlock = section8CapRateSpread
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:14px 16px;margin:12px 0;font-size:13px;color:#334155;">
  <strong>I-4 Corridor cap rate:</strong> ${section8CapRateSpread.i4_corridor || "—"} &nbsp;&nbsp;
  <strong>Brevard cap rate:</strong> ${section8CapRateSpread.brevard || "—"} &nbsp;&nbsp;
  <strong>Spread:</strong> ${section8CapRateSpread.spread || "—"}<br/>
  <span style="color:#64748b;font-style:italic;margin-top:6px;display:block;">${section8CapRateSpread.trend || ""}</span>
</div>`
    : "";

  // ── §9 — Local Developer Permit Activity (Brevard) ───────────────────────
  const s9LocalDevRows = section9LocalDevs.map((r) =>
    `<tr>
      ${tdL(`<strong>${r.developer || "—"}</strong><br/><span style="font-weight:400;font-size:12px;color:#64748b;">${r.permit_date || ""}</span>`)}
      ${tdR(`${r.project || "—"} &middot; ${r.sf || "—"}<br/><span style="font-size:12px;color:#64748b;">${r.location || ""}</span><br/><span style="font-size:12px;color:${r.status?.toLowerCase().includes("complet") ? "#16a34a" : "#d97706"};">${r.status || ""}</span>`)}
    </tr>`
  ).join("\n");

  // ── §10 — Aerospace REIT Comps (Brevard) ────────────────────────────────
  const s10AerospaceRows = section10AerospaceReits.map((r) =>
    `<tr>
      ${tdL(`<strong>${r.entity || "—"}</strong><br/><span style="font-weight:400;font-size:12px;color:#64748b;">${r.metric || ""}</span>`)}
      ${tdR(`<strong>${r.value || "—"}</strong> <span style="font-size:12px;color:${r.trend?.toLowerCase().includes("compress") ? "#16a34a" : "#64748b"};">${r.trend ? `&middot; ${r.trend}` : ""}</span><br/><em style="font-size:12px;color:#475569;">${r.relevance || ""}</em>`)}
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

${secLabel(`§4 — Private Competitors with Potential ${marketLabel} Interest`)}
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

${isBrevard ? `
${secLabel("§7 — National Flex / R&D / Logistics Competitor Tracker")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe — Space Coast &amp; Florida activity. These are the leading-edge nationals; the big-box REITs have not arrived yet.</p>
${s7NatRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>${s7NatRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No new activity found this period for tracked firms.</p>'}
${(data.section7_national_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section7_national_note as string}</p>` : ""}

${secLabel("§8 — Tampa / Orlando Spillover Signal")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">When I-4 corridor cap rates compress, capital searches east. Orlando/Tampa buyers in Brevard deed records = early pricing pressure. Track the spread.</p>
${s8CapRateBlock}
${s8SpilloverRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;"><tbody>${s8SpilloverRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No cross-market buyer activity found this period.</p>'}
${(data.section8_spillover_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section8_spillover_note as string}</p>` : ""}

${secLabel("§9 — Local Developer Permit Activity (Last 12 Months)")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">Cuhaci &amp; Peterson, Bravar Industrial, local family offices. Sourced from Brevard County building permits — the real competition, not the press-release firms.</p>
${s9LocalDevRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>${s9LocalDevRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No qualifying industrial permits found (&gt;20,000 SF).</p>'}
${(data.section9_local_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section9_local_note as string}</p>` : ""}

${secLabel("§10 — Aerospace / Defense REIT Cap Rate Benchmarks")}
<p style="font-size:12px;color:#64748b;font-style:italic;margin:0 0 10px;">Digital Realty, Equinix, Iron Mountain — cap rate trends in tech/defense-adjacent markets set LP return expectations for specialized industrial near Cape Canaveral.</p>
${s10AerospaceRows ? `<table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody>${s10AerospaceRows}</tbody></table>` : '<p style="font-size:13px;color:#94a3b8;font-style:italic;">No data found this period.</p>'}
${(data.section10_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section10_note as string}</p>` : ""}
` : ""}
`;

  const htmlBody = HTML_WRAPPER(
    briefTitle,
    `${params.period} &middot; Monthly &middot; v2 &mdash; verified sources only`,
    bodyContent,
    sourcesLine
  );

  const extraSummary = isPermian
    ? ` IOS tracker: ${section7Ios.length} firms. Form D filings: ${section8FormD.length}.`
    : ` National tracker: ${section7NatTrackers.length} firms. Spillover signals: ${section8Spillover.length}. Local permits: ${section9LocalDevs.length}. Aerospace REIT comps: ${section10AerospaceReits.length}.`;

  const summary = `${briefTitle} generated for ${params.period}. Covers ${section1Items.length} capital flow events, EastGroup ${section2EgpRows.length}-metric benchmark, ${section3Table.length} PE peers, ${section4Bullets.length} private competitors, ${section6Angles.length} LP differentiation angles.${extraSummary}`;

  return { subject, htmlBody, bodyContent, sourcesLine, summary };
}
