import Anthropic from "@anthropic-ai/sdk";
import { runResearchAgent } from "@/lib/agents/research";
import { fetchFredMacro } from "@/lib/macro/fred";
import { fetchEiaMacro } from "@/lib/macro/eia";
import { fetchBlsMacro } from "@/lib/macro/bls";
import { fetchCensusMacro } from "@/lib/macro/census";
import { fetchLaunchData } from "@/lib/macro/launches";

const anthropic = new Anthropic();

export interface WeeklyMarketUpdateOutput {
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

  const briefTitle =
    params.market.toLowerCase() === "permian"
      ? "Permian Industrial — Monday Brief"
      : params.market.toLowerCase() === "brevard"
      ? "Space Coast Industrial — Monday Brief"
      : `${marketLabel} Industrial — Monday Brief`;

  const macroIndicatorList =
    params.market.toLowerCase() === "permian"
      ? "WTI spot (Cushing), WTI 12M strip, Permian rig count, DUC inventory (Permian), Midland MSA mining jobs, Odessa MSA mining jobs, Dallas Fed Energy Survey sentiment"
      : "FL industrial vacancy rate, Orlando MSA logistics jobs, FL asking NNN rent/SF, SpaceX/Blue Origin launch cadence, Brevard County employment, FL industrial net absorption";

  const ask = `Weekly market update for ${marketFullName}: recent industrial transactions, macro indicators (${macroIndicatorList}), supply/demand signals (vacancy rate, absorption, new deliveries), notable news or lease signings, period: ${params.period}`;

  // Fetch all macro sources + research in parallel
  const isBrevard = params.market.toLowerCase() === "brevard";
  const [research, fredRows, eiaRows, blsRows, censusRows, launchRows] = await Promise.all([
    runResearchAgent({
      ask,
      projectContext: `${marketLabel} Weekly Market Update ${params.period}`,
      workflowId: "weekly-market-update",
      market: params.market,
    }),
    fetchFredMacro(params.market),
    fetchEiaMacro(params.market),
    fetchBlsMacro(params.market),
    fetchCensusMacro(params.market),
    isBrevard ? fetchLaunchData() : Promise.resolve(null),
  ]);

  console.log(`[weekly] macro raw — fred:${fredRows?.length ?? "null"} eia:${eiaRows?.length ?? "null"} bls:${blsRows?.length ?? "null"} census:${censusRows?.length ?? "null"}`);

  // Merge: FRED → EIA → BLS → Census → Launches, deduplicating by indicator label
  const seen = new Set<string>();
  const preFetchedRows = [
    ...(fredRows    ?? []),
    ...(eiaRows     ?? []),
    ...(blsRows     ?? []),
    ...(censusRows  ?? []),
    ...(launchRows  ?? []),
  ].filter(r => {
    if (seen.has(r.indicator)) return false;
    seen.add(r.indicator);
    return true;
  });

  console.log(`[weekly] preFetchedRows total: ${preFetchedRows.length} — ${preFetchedRows.map(r => r.indicator).join(", ") || "none"}`);

  // Build macro context string for the prompt
  const fredContext = preFetchedRows.length > 0
    ? `\n--- PRE-FETCHED MACRO DATA (use these exact values in macro_table) ---\n` +
      preFetchedRows.map(r =>
        `${r.indicator}: latest=${r.latest}, MoM/WoW=${r.wow} (${r.wow_dir}), YoY=${r.yoy} (${r.yoy_dir})`
      ).join("\n") +
      `\n--- END MACRO DATA ---\n`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 5500,
    system: [{ type: "text" as const, text: `You are a CRE market analyst for ERP Funds producing weekly email briefs for the investment team. ERP Funds is an industrial CRE firm focused on service yards, IOS, flex industrial, logistics, and cold storage in the Permian Basin and secondary markets including Brevard County FL.

Tone: professional, data-first, punchy. Use real numbers from the research. LP narrative should be polished investment-grade prose — direct, specific, defensible. No filler sentences.`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Generate a weekly market brief for ${marketFullName}, period: ${params.period}.
${fredContext}
Research findings:
${research.findings}

${research.sources.length > 0 ? `Source URLs (match to articles where possible):\n${research.sources.join("\n")}` : ""}

---
Return ONLY valid JSON — no markdown, no code fences, no extra text. Use this exact structure:

{
  "subject": "${briefTitle} · ${params.period}",
  "display_title": "${briefTitle}",
  "display_date": "Week of ${params.period}",
  "macro_table": [
    {
      "indicator": "WTI spot (Cushing)",
      "latest": "$111.20",
      "wow": "+$9.50",
      "wow_dir": "up",
      "yoy": "+$32.80",
      "yoy_dir": "up",
      "trend": "up"
    }
  ],
  "headline": "Single most important sentence for ERP this week — no fluff",
  "articles": [
    {
      "source": "CBRE",
      "title": "Q1 2026 West Texas Industrial Marketbeat",
      "date": "May 7",
      "body": "Midland-Odessa vacancy 4.8%, asking rents $11.40/SF NNN (+6.2% YoY). Sublease space ticked up 40 bps — first uptick in 6 quarters.",
      "url": "https://example.com/article"
    }
  ],
  "narrative": "Full LP narrative. Use <strong> for emphasis. Separate paragraphs with double newline (\\n\\n). Write 2-3 substantial paragraphs.",
  "source_names": ["CBRE Research", "JLL Research", "Bisnow", "GlobeSt"]
}

Rules:
- macro_table: Include ONLY indicators NOT already covered in the PRE-FETCHED MACRO DATA block above. Add remaining indicators from ${macroIndicatorList} using research findings. Direction fields: "up", "down", or "neutral". Use "—" if truly unavailable — do NOT guess numbers. Leave macro_table as [] if research has nothing to add (pre-fetched data will be used automatically).
- articles: include ALL newsworthy items from the research (aim for 4-8). Use the source URL where you can match it from the source URLs list above.
- narrative: synthesize the week for LP communication — what it means for ERP's thesis, what to watch.
- source_names: list every publication used.`,
      },
    ],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "{}";
  const cleanText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(cleanText);
    const mt = data.macro_table as unknown[];
    console.log(`[weekly] Claude macro_table rows: ${Array.isArray(mt) ? mt.length : "not-array"}`);
  } catch (e) {
    console.error("[weekly-market-update] JSON parse failed. Raw output:", rawText.slice(0, 800));
    data = {
      subject: `${briefTitle} · ${params.period}`,
      display_title: briefTitle,
      display_date: `Week of ${params.period}`,
    };
  }

  const subject = (data.subject as string) || `${briefTitle} · ${params.period}`;
  const displayTitle = (data.display_title as string) || briefTitle;
  const displayDate = (data.display_date as string) || `Week of ${params.period}`;
  const headline = (data.headline as string) || "";
  // Merge: preFetchedRows are authoritative (real API data); Claude adds any research-only rows
  const claudeMacroTable = (data.macro_table as Array<{
    indicator: string; latest: string;
    wow: string; wow_dir: string;
    yoy: string; yoy_dir: string;
    trend: string;
  }> | undefined) ?? [];

  // Build final macro table: start with pre-fetched (guaranteed correct),
  // then append Claude rows whose indicators don't overlap with pre-fetched ones
  const preFetchedIndicators = new Set(preFetchedRows.map(r => r.indicator.toLowerCase()));
  const claudeOnlyRows = claudeMacroTable.filter(
    r => !preFetchedIndicators.has(r.indicator.toLowerCase())
      && r.latest !== "—"   // drop rows Claude couldn't fill
      && r.latest !== ""
  );
  const macroTable = [...preFetchedRows, ...claudeOnlyRows];
  const articles = (data.articles as Array<{
    source: string; title: string; date: string; body: string; url?: string;
  }> | undefined) ?? [];
  const narrative = (data.narrative as string) || "";
  const sourceNames = (data.source_names as string[] | undefined) ?? [];

  // ── Macro table ──────────────────────────────────────────────────────────────
  function colorVal(val: string, dir: string): string {
    if (!val || val === "—") return `<span style="color:#94a3b8;">—</span>`;
    if (dir === "up")   return `<span style="color:#16a34a;font-weight:600;">${val}</span>`;
    if (dir === "down") return `<span style="color:#dc2626;font-weight:600;">${val}</span>`;
    return `<span style="color:#334155;">${val}</span>`;
  }
  function trendArrow(dir: string): string {
    if (dir === "up")   return `<span style="color:#16a34a;">&#9650;</span>`;
    if (dir === "down") return `<span style="color:#dc2626;">&#9660;</span>`;
    return `<span style="color:#94a3b8;">&#8212;</span>`;
  }

  const macroRows = macroTable.map((row, i) => {
    const bold = i === 0 ? "font-weight:700;font-size:14px;" : "";
    return `<tr>
  <td style="text-align:left;padding:9px 12px 9px 0;border-bottom:1px solid #f1f5f9;color:#334155;${bold}">${row.indicator}</td>
  <td style="text-align:right;padding:9px 6px;border-bottom:1px solid #f1f5f9;color:#0f172a;${bold}">${row.latest || "—"}</td>
  <td style="text-align:right;padding:9px 6px;border-bottom:1px solid #f1f5f9;">${colorVal(row.wow, row.wow_dir)}</td>
  <td style="text-align:right;padding:9px 6px;border-bottom:1px solid #f1f5f9;">${colorVal(row.yoy, row.yoy_dir)}</td>
  <td style="text-align:center;padding:9px 0 9px 6px;border-bottom:1px solid #f1f5f9;">${trendArrow(row.trend)}</td>
</tr>`;
  }).join("\n");

  const macroTableHtml = macroTable.length > 0
    ? `<table style="width:100%;border-collapse:collapse;font-size:13px;">
  <thead>
    <tr>
      <th style="text-align:left;font-size:11px;font-weight:600;color:#64748b;padding:0 12px 8px 0;border-bottom:2px solid #0f172a;">Indicator</th>
      <th style="text-align:right;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">Latest</th>
      <th style="text-align:right;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">WoW</th>
      <th style="text-align:right;font-size:11px;font-weight:600;color:#64748b;padding:0 6px 8px;border-bottom:2px solid #0f172a;">YoY</th>
      <th style="text-align:center;font-size:11px;font-weight:600;color:#64748b;padding:0 0 8px 6px;border-bottom:2px solid #0f172a;">Trend</th>
    </tr>
  </thead>
  <tbody>
    ${macroRows}
  </tbody>
</table>`
    : `<p style="font-size:13px;color:#94a3b8;">Macro data not available this week.</p>`;

  // ── Headline box ─────────────────────────────────────────────────────────────
  const headlineHtml = headline
    ? `<div style="border-left:4px solid #d97706;background:#fffbeb;padding:12px 16px;margin:20px 0 0;border-radius:0 4px 4px 0;font-size:13px;color:#1c1917;line-height:1.65;">&#128276; <strong>Headline this week:</strong> ${headline}</div>`
    : "";

  // ── Article cards ─────────────────────────────────────────────────────────────
  const hasUrl = (a: { url?: string }) => a.url && a.url !== "https://example.com/article" && a.url.startsWith("http");

  const articlesHtml = articles.map(a => {
    const url = hasUrl(a) ? a.url! : null;

    // Source: always bold; linked + underlined when URL exists
    const sourceEl = url
      ? `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${a.source}</a>`
      : `<strong style="font-weight:700;color:#0f172a;">${a.source}</strong>`;

    // Title: linked + underlined when URL exists, otherwise plain bold
    const titleEl = url
      ? `<a href="${url}" style="font-weight:700;color:#1d4ed8;text-decoration:underline;">${a.title}</a>`
      : `<strong style="color:#0f172a;">${a.title}</strong>`;

    return `<div style="border-left:3px solid #cbd5e1;padding:6px 0 6px 14px;margin:0 0 16px;">
  <p style="font-size:12px;margin:0 0 4px;line-height:1.5;">${sourceEl}<span style="color:#94a3b8;margin:0 5px;">&middot;</span>${titleEl}<span style="color:#94a3b8;margin:0 5px;">&middot;</span><span style="color:#94a3b8;">${a.date || ""}</span></p>
  <p style="font-size:13px;color:#475569;line-height:1.6;margin:0;">${a.body}</p>
</div>`;
  }).join("\n");

  // ── LP Narrative ─────────────────────────────────────────────────────────────
  const narrativeHtml = narrative
    .split(/\n\n+/)
    .filter(Boolean)
    .map(p => `<p style="font-size:13.5px;line-height:1.8;color:#1e293b;margin:0 0 14px;">${p.trim()}</p>`)
    .join("\n");

  // ── Sources footer line ───────────────────────────────────────────────────────
  const sourcesLine = sourceNames.length > 0
    ? `<strong style="color:#475569;">Sources:</strong> ${sourceNames.join(" &middot; ")}`
    : "";

  // ── Assemble body ─────────────────────────────────────────────────────────────
  const secLabel = (text: string) =>
    `<p style="font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#94a3b8;margin:28px 0 12px;">${text}</p>`;

  const bodyContent = [
    secLabel("§1 &mdash; Macro Signals"),
    macroTableHtml,
    headlineHtml,
    articles.length > 0 ? secLabel("§2 &mdash; Industry &amp; Deal Activity") + "\n" + articlesHtml : "",
    narrativeHtml ? secLabel("§3 &mdash; LP Narrative Read") + `\n<div>${narrativeHtml}</div>` : "",
  ].filter(Boolean).join("\n");

  const htmlBody = HTML_WRAPPER(displayTitle, displayDate, bodyContent, sourcesLine);
  const summary = `Weekly market brief generated for ${marketLabel} — ${params.period}. Covers ${macroTable.length} macro indicators, ${articles.length} industry articles.`;

  return { subject, htmlBody, summary };
}
