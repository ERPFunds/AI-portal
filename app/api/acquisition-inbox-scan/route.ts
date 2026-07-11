import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const anthropic = new Anthropic();
const GRAPH = "https://graph.microsoft.com/v1.0";

// Read-only, principal-gated. Reads a mailbox across ALL folders (excluding Deleted/Junk/Drafts) for
// the last N months via the app's application Graph token — the same access the IR sweep uses — and
// runs ONE categorization pass to surface the recurring TYPES of acquisition-related email, mapped
// against the planned "Acquisition Assistant" agent workflows. Result is stored in
// acquisition_inbox_scan and returned. No mail is modified, moved, or drafted; only subject + sender
// + 255-char preview are read. (Inbox-only was unrepresentative — Meghan files/archives most mail.)

const PRINCIPALS = ["mparad@erpfunds.com", "mberry@erpfunds.com"];
const DEFAULT_MAILBOX = "mberry@erpfunds.com";

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

type Msg = { from: string; fromName: string; subject: string; preview: string; received: string };

// Read every folder's mail since a date (newest first), skipping Deleted Items / Junk / Drafts.
async function readMailboxSince(mailbox: string, sinceIso: string, max: number): Promise<Msg[]> {
  const t = await getGraphToken();
  if (!t) throw new Error("AZURE credentials not configured");
  const h = { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' };

  // Resolve the well-known folders we want to EXCLUDE (noise / non-received mail).
  const excluded = new Set<string>();
  for (const wk of ["deleteditems", "junkemail", "drafts"]) {
    try {
      const r = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${wk}?$select=id`, { headers: h });
      if (r.ok) { const d = await r.json(); if (d.id) excluded.add(d.id as string); }
    } catch { /* best-effort exclusion */ }
  }

  const out: Msg[] = [];
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$select=subject,from,bodyPreview,receivedDateTime,parentFolderId` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
    `&$orderby=receivedDateTime desc&$top=50`;
  while (url && out.length < max) {
    const res: Response = await fetch(url, { headers: h });
    if (!res.ok) throw new Error(`Graph /messages ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    for (const m of (data.value || []) as Record<string, unknown>[]) {
      if (m.parentFolderId && excluded.has(m.parentFolderId as string)) continue;
      const fromObj = (m.from as { emailAddress?: { address?: string; name?: string } })?.emailAddress;
      out.push({
        from: fromObj?.address || "",
        fromName: fromObj?.name || "",
        subject: (m.subject as string) || "",
        preview: (m.bodyPreview as string) || "",
        received: (m.receivedDateTime as string) || "",
      });
      if (out.length >= max) break;
    }
    url = (data["@odata.nextLink"] as string) || null;
  }
  return out;
}

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
      description: "Non-acquisition buckets (for broadening general email triage): investor/IR, accounting, leasing, vendor, internal, newsletters/noise",
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
  if (!PRINCIPALS.includes(email)) return NextResponse.json({ error: "Restricted to principals" }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const mailbox = (params.get("mailbox")?.trim() || DEFAULT_MAILBOX).toLowerCase();
  const months = Math.min(Math.max(Number(params.get("months")) || 3, 1), 12);
  const max = Math.min(Math.max(Number(params.get("max")) || 500, 20), 800);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  let messages: Msg[];
  try {
    messages = await readMailboxSince(mailbox, sinceIso, max);
  } catch (e) {
    return NextResponse.json({ error: `Graph read failed: ${String(e).slice(0, 300)}` }, { status: 502 });
  }

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, mailbox, months, scanned: 0, note: "No messages returned for that window." });
  }

  const digest = messages
    .map((m, i) => `${i + 1}. [${m.received.slice(0, 10)}] <${m.from}> ${m.subject} :: ${(m.preview || "").replace(/\s+/g, " ").slice(0, 180)}`)
    .join("\n");

  let result: unknown;
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 6000,
      output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: [{ type: "text" as const, text:
`You analyze an executive's mailbox to inform the design of an "Acquisition Executive Assistant" AI agent for ERP Industrials (a private equity industrial real estate firm — Permian Basin & Brevard County). The agent is the EA layer around the deal pipeline (LOI → closing): coordination, correspondence, and document logistics.

You are given a digest of the mailbox (one line per email: date, sender, subject, preview snippet) drawn from ALL folders except Deleted/Junk/Drafts. Identify the recurring TYPES of ACQUISITION / deal-related email (broker outreach & availabilities, seller/counterparty correspondence, lender/financing, legal/counsel, title & escrow, LOI/PSA execution, due-diligence document exchange, inspection/environmental, closing coordination, signature requests, deal-related invoices/payments, IC/underwriting handoffs, etc.). For each bucket: an approximate count, 2-3 real example subjects, typical senders, a concrete automation the agent could perform, and which existing planned workflow it maps to (or null if it is a gap not yet covered).

Existing planned Acquisition Assistant workflows (map findings to these, and flag gaps):
${EXISTING_WORKFLOWS.map((w) => `- ${w}`).join("\n")}

Also bucket the NON-acquisition mail briefly (otherCategories) — investor/IR, accounting, leasing, vendor, internal, newsletters/noise — with counts, to inform broadening general email triage. Be concrete and evidence-based; do not invent categories not represented in the digest.` }],
      messages: [{ role: "user", content: `Mailbox digest (${messages.length} emails, all folders except Deleted/Junk/Drafts, last ${months} months, ${mailbox}):\n\n${digest}` }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    result = JSON.parse(text);
  } catch (e) {
    return NextResponse.json({ error: `Analysis failed: ${String(e).slice(0, 300)}` }, { status: 500 });
  }

  const sample = messages.map((m) => ({ date: m.received.slice(0, 10), from: m.from, subject: m.subject }));
  const { data: row, error } = await supabase
    .from("acquisition_inbox_scan")
    .insert({ requested_by: email, mailbox, months, scanned_count: messages.length, result: { analysis: result, sample } })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: `Store failed: ${error.message}`, analysis: result }, { status: 500 });

  return NextResponse.json({ ok: true, scanId: row.id, mailbox, months, scanned: messages.length, scope: "all-folders-except-deleted-junk-drafts", analysis: result });
}
