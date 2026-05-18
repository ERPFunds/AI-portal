import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type ReportType = "dst-monthly" | "quarterly-lp";

export interface ReportFormatterOutput {
  formattedReport: string;
  reportType: ReportType;
  period: string;
  summary: string;
  outputType: "report";
}

export interface ReportEmailDraftOutput {
  subject: string;
  htmlBody: string;
  summary: string;
  outputType: "report-email";
}

export async function runReportFormatter(params: {
  rawContent: string;
  reportType: ReportType;
  period: string;
  fundName?: string;
}): Promise<ReportFormatterOutput> {
  const formatInstructions = params.reportType === "quarterly-lp"
    ? `Format as a quarterly LP report package with these sections:
1. Executive Summary (fund highlights, key metrics)
2. Portfolio Performance (asset-by-asset summary)
3. Financial Highlights (distributions, NAV, returns)
4. Market Update (brief Permian Basin / CRE context)
5. Outlook & Strategy
6. Financial Statements Summary`
    : `Format as a monthly DST report package with these sections:
1. Property Overview
2. Monthly Operating Summary (occupancy, NOI, collections)
3. Capital Account Summary
4. Distribution Detail
5. Notable Items & Commentary`;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    system: [{ type: "text" as const, text: `You are a professional IR report formatter for ERP Industrials, an industrial real estate PE firm.
Take raw accounting outputs and format them into a clean, investor-ready reporting package.
Use professional financial formatting. Be precise with numbers — never invent figures not present in the inputs.
If a number is missing, use [TBD] as a placeholder.
${formatInstructions}`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Format this ${params.reportType} report for period: ${params.period}
Fund: ${params.fundName ?? "ERP Industrials"}

RAW INPUTS:
${params.rawContent}`,
      },
    ],
  });

  const formattedReport = msg.content[0].type === "text" ? msg.content[0].text : "";
  const summary = `Formatted ${params.reportType} report for ${params.period} — ${params.fundName ?? "ERP Industrials"}.`;

  return { formattedReport, reportType: params.reportType, period: params.period, summary, outputType: "report" };
}

export async function runReportEmailDrafter(params: {
  formattedReport: string;
  period: string;
  reportType: ReportType;
  fundName?: string;
}): Promise<ReportEmailDraftOutput> {
  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 2000,
    system: [{ type: "text" as const, text: `You draft investor update emails for Meghan Berry at ERP Industrials.
Meghan will add personal commentary and send — this is a draft only, never auto-sent.
Tone: warm, confident, concise. Lead with the most important number or highlight.
Return JSON only: { "subject": string, "htmlBody": string }`, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Draft the LP update email for this ${params.reportType} report (${params.period}):

${params.formattedReport.slice(0, 6000)}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in report email drafter response");

  const { subject, htmlBody } = JSON.parse(jsonMatch[0]);
  const summary = `Drafted ${params.reportType} investor update email for ${params.period}.`;

  return { subject, htmlBody, summary, outputType: "report-email" };
}
