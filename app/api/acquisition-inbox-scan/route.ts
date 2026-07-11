import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { listInboxMessagesSince } from "@/lib/agents/ir/graph-mailbox";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic();

// Read-only, principal-gated. Reads a mailbox's Inbox for the last N months (via the app's
// application Graph token — the same access the IR sweep uses) and runs ONE categorization pass to
// surface the recurring TYPES of acquisition-related email, mapped against the planned
// "Acquisition Assistant" agent workflows. Result is stored in acquisition_inbox_scan and returned.
// No mail is modified, moved, or drafted; only subject + sender + 255-char preview are read.

const PRINCIPALS = ["mparad@erpfunds.com", "mberry@erpfunds.com"];
const DEFAULT_MAILBOX = "mberry@erpfunds.com";

// The 9 planned Acquisition Assistant workflows — given to the model so it maps findings to them
// and calls out gaps (email types with no matching workflow yet).
const EXISTING_WORKFLOWS = [
  "Acquisition Checklist Automator",
  "Investment Committee Memo Drafter",
  "Email Triage & Prioritization",
  "Daily Priority List (Inbox Analysis)",
  "Closing Document Auditor",
  "Document Signing Queue",
  "Broker/Seller/Lender/Vendor Contact Auto-Capture",
  "Deal Pipeline Status Board",
  "Deal File Organizer & Data Extractor",
];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["totalScanned", "acquisitionCategories", "otherCategories", "gaps", "summary"],
  properties: {
    totalScanned: { type: "integer" },
    acquisitionCategories: {
      type: "array",
      description: "Recurring types of acquisition/deal-related mail (broker, seller, lender, counsel, title, LOI/PSA, DD, closing, signatures, deal-related invoices, etc.)",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "count", "exampleSubjects", "typicalSenders", "suggestedAutomation", "mapsToWorkflow"],
        properties: {
          name: { type: "string" },
          count: { type: "integer", description: "approx number of emails in this bucket" },
          exampleSubjects: { type: "array", items: { type: "string" }, description: "2-3 real example subjects" },
          typicalSenders: { type: "array", items: { type: "string" }, description: "sender domains or names typical of this bucket" },
          suggestedAutomation: { type: "string", description: "what an agent could do with this" },
          mapsToWorkflow: { anyOf: [{ type: "string" }, { type: "null" }], description: "which existing workflow this maps to, or null if it's a gap" },
        },
      },
    },
    otherCategories: {
      type: "array",
      description: "Non-acquisition buckets in the inbox (for broadening general email triage): e.g. investor/IR, accounting, leasing, vendor, personal, newsletters/noise",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "count"],
        properties: { name: { type: "string" }, count: { type: "integer" } },
      },
    },
    gaps: { type: "array", items: { type: "string" }, description: "acquisition email patterns seen that NO existing workflow covers" },
    summary: { type: "string" },
  },
} as const;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const email = (user.email ?? "").toLowerCase();
  if (!PRINCIPALS.includes(email)) {
    return NextResponse.json({ error: "Restricted to principals" }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const mailbox = (params.get("mailbox")?.trim() || DEFAULT_MAILBOX).toLowerCase();
  const months = Math.min(Math.max(Number(params.get("months")) || 3, 1), 12);
  const max = Math.min(Math.max(Number(params.get("max")) || 400, 20), 600);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  let messages;
  try {
    messages = await listInboxMessagesSince(mailbox, sinceIso, max);
  } catch (e) {
    return NextResponse.json({ error: `Graph read failed: ${String(e).slice(0, 300)}` }, { status: 502 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, mailbox, months, scanned: 0, note: "No inbox messages returned for that window." });
  }

  // Compact one-line-per-email digest (subject + sender + short preview) — no bodies fetched.
  const digest = messages
    .map((m, i) => `${i + 1}. [${m.receivedDateTime.slice(0, 10)}] <${m.fromAddress}> ${m.subject} :: ${(m.bodyPreview || "").replace(/\s+/g, " ").slice(0, 180)}`)
    .join("\n");

  let result: unknown;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 5000,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: [{ type: "text" as const, text:
`You analyze an executive's email inbox to inform the design of an "Acquisition Executive Assistant" AI agent for ERP Industrials (a private equity industrial real estate firm — Permian Basin & Brevard County). The agent is the EA layer around the deal pipeline (LOI → closing): coordination, correspondence, and document logistics.

You are given a digest of inbox emails (one per line: date, sender, subject, preview snippet). Identify the recurring TYPES of ACQUISITION / deal-related email (broker outreach & availabilities, seller/counterparty correspondence, lender/financing, legal/counsel, title & escrow, LOI/PSA execution, due-diligence document exchange, inspection/environmental, closing coordination, signature requests, deal-related invoices/payments, IC/underwriting handoffs, etc.). For each bucket give an approximate count, 2-3 real example subjects, typical senders, a concrete automation the agent could perform, and which existing planned workflow it maps to (or null if it is a gap not yet covered).

Existing planned Acquisition Assistant workflows (map findings to these, and flag gaps):
${EXISTING_WORKFLOWS.map((w) => `- ${w}`).join("\n")}

Also bucket the NON-acquisition mail briefly (otherCategories) — investor/IR, accounting, leasing, vendor, internal, newsletters/noise — with counts, to inform broadening general email triage. Be concrete and evidence-based; do not invent categories that aren't represented in the digest.` }],
      messages: [{ role: "user", content: `Inbox digest (${messages.length} emails, last ${months} months, mailbox ${mailbox}):\n\n${digest}` }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    result = JSON.parse(text);
  } catch (e) {
    return NextResponse.json({ error: `Analysis failed: ${String(e).slice(0, 300)}` }, { status: 500 });
  }

  // Store the analysis + a compact raw sample (metadata only) for drill-down.
  const sample = messages.slice(0, max).map((m) => ({ date: m.receivedDateTime.slice(0, 10), from: m.fromAddress, subject: m.subject }));
  const { data: row, error } = await supabase
    .from("acquisition_inbox_scan")
    .insert({ requested_by: email, mailbox, months, scanned_count: messages.length, result: { analysis: result, sample } })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: `Store failed: ${error.message}`, analysis: result }, { status: 500 });

  return NextResponse.json({ ok: true, scanId: row.id, mailbox, months, scanned: messages.length, analysis: result });
}
