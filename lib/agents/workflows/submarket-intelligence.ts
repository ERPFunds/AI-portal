import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";

const anthropic = new Anthropic();

export interface SubmarketIntelligenceOutput {
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
    ? "Permian Basin E&P operator CapEx commitments, rig additions, production guidance — specific company names required (Diamondback, ConocoPhillips, ExxonMobil, bpX, SLB, Halliburton, NOV, ProPetro, KLX Energy). Each entry must name the company, action taken, SF/acres, location, and date."
    : "Space Coast aerospace/defense/logistics tenant activity — specific company names required (SpaceX, Blue Origin, L3Harris, Northrop Grumman, Amazon, UPS, CEVA, Lockheed Martin). Each entry must name the company, action, SF, location, and date.";

  const infraContext = isPermian
    ? "Permian pipeline infrastructure: Midland Basin gathering capacity, Waha hub price differentials vs Henry Hub, new pipeline announcements (Gray Oak, EPIC, Permian Highway, Matterhorn), NGL takeaway, TX RRC and NM OCD regulatory items. Include current Waha basis if available."
    : "Space Coast infrastructure: Port Canaveral expansion, broadband/power, SR-528/I-95 corridor access, Brevard County permitting and zoning changes, launch site infrastructure";

  const submarkets = isPermian
    ? "Midland MSA, Odessa MSA, Kermit (Winkler County), Delaware Basin"
    : "Melbourne / Palm Bay, Titusville, Cocoa / Rockledge, Port Canaveral corridor";

  const dealsContext = isPermian
    ? "Industrial CRE sales transactions in Permian Basin (Midland MSA, Odessa MSA, Winkler County): buyer name, seller name, property address or description, SF, sale price, $/SF, close date. Search for 'Midland TX industrial sale 2025' or 'Odessa TX warehouse sold 2025'. IOS land sales especially valuable — include $/acre."
    : "Industrial CRE sales transactions in Brevard County FL: buyer, seller, property, SF, price, $/SF, date. Search 'Brevard County industrial sale 2025' or 'Melbourne FL warehouse sold 2025'.";

  const landCompsContext = isPermian
    ? "Industrial-zoned land sales and asking prices in Midland/Odessa area: $/acre for IOS-suitable land, service yard parcels, outdoor storage yards. Search 'Midland TX industrial land sale $/acre 2025' or 'Permian Basin outdoor storage land value'."
    : "";

  const brevardExtrasContext = isBrevard
    ? `
Tourism and hospitality context affecting industrial demand: Space Coast visitor volume, hotel occupancy, cruise terminal throughput at Port Canaveral, and demand for cold storage / food service distribution driven by tourism activity.
Competitive deliveries by corridor: who is building industrial product, which corridor (I-95, US-1, SR-528, SR-520), size, developer, and pre-leasing status.
Rent premium vs Orlando: current Brevard County average NNN rents vs I-4 corridor / Orlando metro, spread in $/SF, and whether that spread is narrowing (arbitrage closing) or stable.`
    : "";

  const ask = `Monthly submarket intelligence for ${marketFullName}, period: ${params.period}.

Focus areas:
1. National and state-level industrial CRE context (CoStar national vacancy, absorption, completions; EastGroup Sun Belt comp performance)
2. ${baselines} — rents, vacancy, absorption, new deliveries
3. Development pipeline: named projects only — project name, developer, SF, estimated delivery date, pre-leased %. Even estimated figures with a source date are acceptable. DO NOT use vague prose — find specific project names.
4. ${tenantContext}
5. Deals closed this period: ${dealsContext}
${isPermian ? `6. Land comps: ${landCompsContext}` : ""}
${isPermian ? "7." : "6."} ${infraContext}
${isPermian ? "8." : "7."} Submarket priority ranking with investment rationale: ${submarkets}
${brevardExtrasContext}`;

  const research = await runResearchAgent({
    ask,
    projectContext: `${briefTitle} ${params.period}`,
    workflowId: "submarket-intelligence",
    market: params.market,
  });

  // ── Section labels ───────────────────────────────────────────────────────────
  const section2Label = isPermian
    ? "§2 — Midland / Odessa Baselines (TREC TAMU)"
    : "§2 — Space Coast Baselines (CoStar / Local Brokers)";

  const section4Label = isPermian
    ? "§4 — Tenant Watch (Operator Commitments — Named Entities Only)"
    : "§4 — Tenant Watch (Aerospace & Logistics Commitments)";

  const section4ColHeader = isPermian ? "Operator" : "Tenant / Operator";

  const macroNote = isPermian
    ? "Macro signals — Permian rig count, WTI, DUC inventory, permits, employment — covered in the weekly Monday Brief."
    : "Macro signals — Space Coast employment, launch cadence, FL vacancy rate — covered in the weekly Monday Brief.";

  // ── Claude prompt ────────────────────────────────────────────────────────────
  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 7000,
    system: [{ type: "text" as const, text: `You are a senior CRE submarket analyst for ERP Funds producing monthly submarket watch reports. ERP Funds focuses on industrial outdoor storage (IOS), service yards, flex industrial, logistics, and cold storage in the Permian Basin and secondary Sunbelt markets.

STRICT DATA RULES:
- §3 Development Pipeline MUST be a table with specific project names, not prose. If you cannot find a named project, say "No confirmed spec starts this period" — do NOT invent names.
- §4 Tenant Watch MUST use real company names with specific actions: "SLB opened a 40,000 SF completion equipment yard in Midland (Jan 2026)" NOT "oilfield services companies are expanding."
- §5 Deals Closed is the anchor section. Search aggressively for actual transaction comps. Even 1 real deal is better than leaving it empty.
- Use web_search aggressively before marking anything DATA PENDING. Only use "DATA PENDING" if web search also returns nothing.
- Never recommend external reports — find the data yourself via web_search.`, cache_control: { type: "ephemeral" } }],
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
        content: `Generate a monthly submarket watch for ${marketFullName}, period: ${params.period}.

Research findings:
${research.findings}

${research.sources.length > 0 ? `Sources:\n${research.sources.join("\n")}` : ""}

IMPORTANT — use web_search NOW for any missing data, especially:
- §3: "${isPermian ? "Permian Basin" : "Brevard County"} industrial development ${new Date().getFullYear()}" or "${isPermian ? "Midland TX" : "Melbourne FL"} warehouse construction project"
- §4: "${isPermian ? "SLB OR Halliburton OR ProPetro Permian expansion 2025" : "SpaceX OR L3Harris OR Northrop Grumman Brevard expansion 2025"}"
- §5: "${isPermian ? "Midland TX OR Odessa TX industrial sale 2025" : "Brevard County industrial sale 2025"}"
${isPermian ? `- §6: "Midland TX industrial land $/acre 2025" OR "Permian Basin IOS land value"` : ""}
- §7: "${isPermian ? "Waha gas hub price differential 2025 OR Permian pipeline capacity" : "Port Canaveral expansion 2025 OR Brevard County industrial zoning"}"
${isBrevard ? `- Tourism: "Space Coast visitor statistics 2025 OR Port Canaveral cruise volume"
- Corridors: "Brevard County industrial delivery 2025 I-95 corridor"
- Rent spread: "Brevard County industrial rent vs Orlando 2025"` : ""}

---
Return ONLY valid JSON with this exact structure:

{
  "subject": "${briefTitle} — ${params.period}",
  "section1_title": "§1 — National / ${isPermian ? "Texas" : "Florida"} Industrial Context",
  "section1_headline": "One sentence on national industrial vacancy trend with source in parentheses",
  "section1_bullets": [
    "Net absorption figure with period and YoY comparison",
    "12-month cumulative absorption",
    "New supply / completions trend with $/SF context"
  ],
  "section1_reit": "EastGroup Properties — most recent quarter: leased %, FFO YoY, dev pipeline guidance",
  "section2_table": [
    { "submarket": "Midland MSA", "vacancy": "x.x%", "rents": "$xx.xx/SF NNN", "absorption": "+/- x,xxx SF", "commentary": "1 sentence source attribution" }
  ],
  "section2_source_note": "Source and data date",
  "section3_items": [
    { "project": "Project name and address/location", "developer": "Developer or owner name", "sf": "xxx,xxx SF", "delivery": "Q? 20xx", "pre_leased": "xx% or Spec", "source": "Source and date" }
  ],
  "section3_none_verified": "If no confirmed spec starts found, state: 'No confirmed spec starts identified this period — pipeline data pending broker confirmation.'",
  "section4_table": [
    { "operator": "Company name", "activity": "Specific action: facility type, SF or acres, location, date — e.g. 'SLB opened 40,000 SF completion equipment yard at 1234 Industrial Blvd, Midland (Jan 2026)'" }
  ],
  "section5_deals": [
    { "buyer": "Buyer name or type", "seller": "Seller name or type", "property": "Address or description", "sf": "xxx,xxx SF", "price": "$x.xM", "price_per_sf": "$xxx/SF", "date": "Mon YYYY" }
  ],
  "section5_deals_note": "If fewer than 3 comps found, note: 'Transaction data limited this period — sourced from public records and broker reports.'",
  ${isPermian ? `"section6_land_comps": [
    { "area": "Midland / Loop 250 corridor", "price_per_acre": "$xxx,xxx/acre", "comp_date": "Q? 20xx", "notes": "IOS-suitable, utilities, zoning" }
  ],
  "section6_land_note": "Source and any caveats on land comp data",
  "section7_infra": [
    { "item": "Waha Hub Basis Differential", "status": "Current spread vs Henry Hub, trend, and implication for Permian E&P activity" },
    { "item": "Pipeline project name", "status": "Status, capacity, timeline, relevance to basin activity" }
  ],
  "section7_data_note": "Any pending TX RRC / NM OCD data note",` : `"section5_corridor_deliveries": [
    { "corridor": "I-95 / Rockledge", "projects": "Project names, SF, developer", "pre_leasing": "x% pre-leased or spec" }
  ],
  "section5_rent_premium": {
    "brevard_avg": "$x.xx/SF NNN",
    "orlando_avg": "$x.xx/SF NNN",
    "spread": "-$x.xx/SF discount",
    "trend": "narrowing / stable / widening",
    "notes": "Context on when this spread typically compresses and cap rate implications"
  },
  "section6_tourism": {
    "headline": "One sentence on tourism/hospitality activity affecting industrial demand",
    "bullets": [
      "Port Canaveral cruise volume or trend",
      "Hotel occupancy / visitor count",
      "Cold storage or food distribution demand implication"
    ]
  },
  "section7_infra": [
    { "item": "Infrastructure item", "status": "Status, timeline, industrial demand implication" }
  ],
  "section7_data_note": "Any pending infrastructure data note",`}
  "section8_table": [
    { "submarket": "${isPermian ? "Midland MSA" : "Melbourne / Palm Bay"}", "assessment": "2-3 sentence investment priority rationale with rent and vacancy context" }
  ],
  "source_names": ["CoStar", "${isPermian ? "TREC @ TAMU" : "CoStar"}", "ExxonMobil IR"]
}

Rules:
- section1_bullets: exactly 3 bullets, national US industrial stats with actual numbers
- section2_table: ${isPermian ? "REQUIRED: Midland MSA and Odessa MSA rows. Add vacancy column." : "REQUIRED: Melbourne/Palm Bay and Titusville rows. Add vacancy column."}
- section3_items: only NAMED, VERIFIED projects — no generic placeholders. Use section3_none_verified if empty.
- section4_table: ${isPermian ? "MUST name specific companies with specific actions and dates. Minimum 3 rows if any Permian E&P activity found." : "Name specific companies. Minimum 2-3 rows."}
- section5_deals: the ANCHOR section — search hard. Even 1-2 real comps are acceptable. Include $/SF.
${isPermian ? "- section6_land_comps: search for actual Permian IOS/industrial land transactions. $/acre is the key metric." : "- section5_corridor_deliveries: list by corridor — I-95, US-1, SR-528, SR-520.\n- section5_rent_premium: real spread data. If unavailable, estimate directionally with source caveat."}
- section8_table: ${isPermian ? "4 rows: Midland MSA, Odessa MSA, Kermit/Winkler, Delaware Basin" : "4 rows: Melbourne/Palm Bay, Titusville, Port Canaveral corridor, Cocoa/Rockledge"}
- Return ONLY valid JSON, no markdown, no extra text outside the JSON object.`,
      },
    ],
  });

  // Find the last text block
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

  // ── Type-safe field extraction ───────────────────────────────────────────────
  type S2Row  = { submarket: string; vacancy?: string; rents: string; absorption?: string; commentary: string };
  type S3Item = { project: string; developer: string; sf: string; delivery: string; pre_leased: string; source: string };
  type S4Row  = { operator: string; activity: string };
  type S5Deal = { buyer: string; seller: string; property: string; sf: string; price: string; price_per_sf: string; date: string };
  type S6Land = { area: string; price_per_acre: string; comp_date: string; notes: string };
  type InfraRow = { item: string; status: string };
  type S8Row  = { submarket: string; assessment: string };
  type CorridorRow = { corridor: string; projects: string; pre_leasing: string };
  type RentPremium = { brevard_avg: string; orlando_avg: string; spread: string; trend: string; notes: string };
  type TourismData = { headline: string; bullets: string[] };

  const section1Bullets   = (data.section1_bullets as string[] | undefined) ?? [];
  const section2Table     = (data.section2_table as S2Row[] | undefined) ?? [];
  const section3Items     = (data.section3_items as S3Item[] | undefined) ?? [];
  const section4Table     = (data.section4_table as S4Row[] | undefined) ?? [];
  const section5Deals     = (data.section5_deals as S5Deal[] | undefined) ?? [];
  const section6Land      = isPermian ? (data.section6_land_comps as S6Land[] | undefined) ?? [] : [];
  const infraTable        = (data.section7_infra as InfraRow[] | undefined) ?? [];
  const section8Table     = (data.section8_table as S8Row[] | undefined) ?? [];
  const sourceNames       = (data.source_names as string[] | undefined) ?? [];

  // Brevard-only fields
  const corridorDeliveries = isBrevard ? (data.section5_corridor_deliveries as CorridorRow[] | undefined) ?? [] : [];
  const rentPremium        = isBrevard ? (data.section5_rent_premium as RentPremium | undefined) ?? null : null;
  const tourismData        = isBrevard ? (data.section6_tourism as TourismData | undefined) ?? null : null;

  // ── HTML helpers ─────────────────────────────────────────────────────────────
  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const tdCell = (val: string, bold = false, muted = false) => {
    const color = muted ? "#94a3b8" : "#334155";
    return `<td style="padding:9px 8px;border-bottom:1px solid #f1f5f9;color:${color};vertical-align:top;">${bold ? `<strong>${val}</strong>` : val}</td>`;
  };

  const th = (label: string) =>
    `<th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 8px 8px 0;border-bottom:2px solid #0f172a;">${label}</th>`;

  const makeTable = (headers: string[], rows: string) =>
    `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead><tr>${headers.map(h => th(h)).join("")}</tr></thead>
  <tbody>${rows}</tbody>
</table>`;

  // ── §1 ───────────────────────────────────────────────────────────────────────
  const s1BulletsHtml = section1Bullets.length > 0
    ? `<ul style="margin:8px 0 12px;padding-left:20px;">${section1Bullets.map(b => `<li style="font-size:13px;color:#334155;line-height:1.6;margin-bottom:4px;">${b}</li>`).join("")}</ul>`
    : "";

  // ── §2 ───────────────────────────────────────────────────────────────────────
  const s2Rows = section2Table.map(r =>
    `<tr>${tdCell(r.submarket ?? "", true)}${tdCell(r.vacancy ?? "—")}${tdCell(r.rents ?? "—")}${tdCell(r.absorption ?? "—")}${tdCell(r.commentary ?? "")}</tr>`
  ).join("\n");

  // ── §3 — Development Pipeline TABLE ─────────────────────────────────────────
  const s3Rows = section3Items.map(i =>
    `<tr>${tdCell(i.project ?? "", true)}${tdCell(i.developer ?? "—")}${tdCell(i.sf ?? "—")}${tdCell(i.delivery ?? "—")}${tdCell(i.pre_leased ?? "—")}${tdCell(i.source ?? "", false, true)}</tr>`
  ).join("\n");

  // ── §4 ───────────────────────────────────────────────────────────────────────
  const s4Rows = section4Table.map(r =>
    `<tr>${tdCell(r.operator ?? "", true)}${tdCell(r.activity ?? "")}</tr>`
  ).join("\n");

  // ── §5 — Deals Closed ───────────────────────────────────────────────────────
  const s5DealRows = section5Deals.map(r =>
    `<tr>${tdCell(r.property ?? "", true)}${tdCell(r.sf ?? "—")}${tdCell(r.price ?? "—")}${tdCell(r.price_per_sf ?? "—")}${tdCell(r.buyer ?? "—")}${tdCell(r.seller ?? "—")}${tdCell(r.date ?? "—", false, true)}</tr>`
  ).join("\n");

  // ── §6 — Land Comps (Permian) ────────────────────────────────────────────────
  const s6LandRows = section6Land.map(r =>
    `<tr>${tdCell(r.area ?? "", true)}${tdCell(r.price_per_acre ?? "—")}${tdCell(r.comp_date ?? "—")}${tdCell(r.notes ?? "")}</tr>`
  ).join("\n");

  // ── §5b — Corridor Deliveries (Brevard) ──────────────────────────────────────
  const corridorRows = corridorDeliveries.map(r =>
    `<tr>${tdCell(r.corridor ?? "", true)}${tdCell(r.projects ?? "—")}${tdCell(r.pre_leasing ?? "—")}</tr>`
  ).join("\n");

  // ── §7 — Infrastructure ──────────────────────────────────────────────────────
  const s7Rows = infraTable.map(r =>
    `<tr>${tdCell(r.item ?? "", true)}${tdCell(r.status ?? "")}</tr>`
  ).join("\n");

  // ── §8 — Submarket Priority ──────────────────────────────────────────────────
  const s8Rows = section8Table.map(r =>
    `<tr>${tdCell(r.submarket ?? "", true)}${tdCell(r.assessment ?? "")}</tr>`
  ).join("\n");

  // ── Sources footer ────────────────────────────────────────────────────────────
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

  // ── Brevard-specific HTML blocks ─────────────────────────────────────────────
  const brevardExtrasHtml = isBrevard ? `
${corridorDeliveries.length > 0 ? `
${secLabel("§5b — Competitive Deliveries by Corridor")}
${makeTable(["Corridor", "Projects (Developer / SF)", "Pre-leasing"], corridorRows)}` : ""}

${rentPremium ? `
${secLabel("§5c — Rent Premium: Brevard vs Orlando (I-4 Corridor)")}
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
  <thead><tr>${th("Brevard Avg")}${th("Orlando Avg")}${th("Spread")}${th("Trend")}</tr></thead>
  <tbody><tr>
    ${tdCell(rentPremium.brevard_avg ?? "—")}
    ${tdCell(rentPremium.orlando_avg ?? "—")}
    ${tdCell(rentPremium.spread ?? "—", true)}
    ${tdCell(rentPremium.trend ?? "—")}
  </tr></tbody>
</table>
${rentPremium.notes ? `<p style="font-size:12px;color:#64748b;font-style:italic;margin:4px 0 0;">${rentPremium.notes}</p>` : ""}` : ""}

${tourismData ? `
${secLabel("§6 — Tourism & Hospitality Context")}
<p style="font-size:13.5px;font-weight:600;color:#0f172a;margin:0 0 8px;line-height:1.5;">${tourismData.headline ?? ""}</p>
${tourismData.bullets?.length > 0 ? `<ul style="margin:8px 0 12px;padding-left:20px;">${tourismData.bullets.map((b: string) => `<li style="font-size:13px;color:#334155;line-height:1.6;margin-bottom:4px;">${b}</li>`).join("")}</ul>` : ""}` : ""}
` : "";

  // ── Body ──────────────────────────────────────────────────────────────────────
  const bodyContent = `
<!-- Note box -->
<div style="border-left:4px solid #16a34a;background:#f0fdf4;padding:10px 14px;margin:0 0 24px;border-radius:0 4px 4px 0;font-size:13px;color:#166534;line-height:1.6;">
  All figures verified at publication. ${macroNote}
</div>

${secLabel((data.section1_title as string) || "§1 — National Industrial Context")}
<p style="font-size:13.5px;font-weight:600;color:#0f172a;margin:0 0 8px;line-height:1.5;">${(data.section1_headline as string) || ""}</p>
${s1BulletsHtml}
${(data.section1_reit as string) ? `<p style="font-size:13px;color:#334155;line-height:1.6;margin:8px 0 0;"><a href="https://www.eastgroup.net/investors" style="color:#1d4ed8;font-weight:700;text-decoration:underline;">EastGroup Properties (Sun Belt comp):</a> ${data.section1_reit as string}</p>` : ""}

${secLabel(section2Label)}
${s2Rows ? makeTable(["Submarket", "Vacancy", "Rents (NNN)", "Absorption", "Commentary"], s2Rows) : ""}
${(data.section2_source_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section2_source_note as string}</p>` : ""}

${secLabel("§3 — Development Pipeline (Verified Projects Only)")}
${s3Rows
  ? makeTable(["Project / Location", "Developer", "SF", "Delivery", "Pre-leased", "Source"], s3Rows)
  : ""}
${(data.section3_none_verified as string) ? `<div style="border-left:3px solid #f59e0b;padding:6px 0 6px 14px;margin:8px 0;"><p style="font-size:13px;color:#92400e;margin:0;font-style:italic;">${data.section3_none_verified as string}</p></div>` : ""}

${secLabel(section4Label)}
${s4Rows
  ? makeTable([section4ColHeader, "Activity (Named company · Action · SF/Acres · Location · Date)"], s4Rows)
  : `<p style="font-size:13px;color:#94a3b8;">No verified operator commitments this period.</p>`}

${secLabel("§5 — Deals Closed")}
${s5DealRows
  ? makeTable(["Property", "SF", "Price", "$/SF", "Buyer", "Seller", "Date"], s5DealRows)
  : `<p style="font-size:13px;color:#94a3b8;font-style:italic;">No verified transaction comps found this period.</p>`}
${(data.section5_deals_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:6px 0 0;">${data.section5_deals_note as string}</p>` : ""}

${isPermian && section6Land.length > 0 ? `
${secLabel("§6 — Land Comps (Industrial / IOS-Suitable)")}
${makeTable(["Area / Corridor", "$/Acre", "Comp Date", "Notes"], s6LandRows)}
${(data.section6_land_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:6px 0 0;">${data.section6_land_note as string}</p>` : ""}` : ""}

${brevardExtrasHtml}

${secLabel(isPermian ? "§7 — Pipeline &amp; Infrastructure" : "§7 — Regulatory &amp; Infrastructure")}
${s7Rows
  ? makeTable(["Item", "Status / Relevance"], s7Rows)
  : ""}
${(data.section7_data_note as string) ? `<p style="font-size:11px;color:#94a3b8;font-style:italic;margin:8px 0 0;">${data.section7_data_note as string}</p>` : ""}

${secLabel("§8 — Submarket Priority")}
${s8Rows ? makeTable(["Submarket", "Investment Assessment"], s8Rows) : ""}
<p style="font-size:12px;color:#94a3b8;font-style:italic;margin:16px 0 0;">${macroNote}</p>
`;

  const htmlBody = HTML_WRAPPER(
    briefTitle,
    `${params.period} &middot; Monthly &middot; CRE focus, macro covered in Monday Brief`,
    bodyContent,
    sourcesLine
  );

  const summary = `${briefTitle} generated for ${params.period}. Covers ${section2Table.length} submarket baselines, ${section3Items.length} pipeline projects, ${section4Table.length} tenant commitments, ${section5Deals.length} transaction comps${isPermian ? `, ${section6Land.length} land comps` : ""}${isBrevard && corridorDeliveries.length > 0 ? `, ${corridorDeliveries.length} corridor deliveries` : ""}, ${section8Table.length} submarket priorities.`;

  return { subject, htmlBody, bodyContent, sourcesLine, summary };
}
