import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { SCAN_MAILBOXES } from "@/lib/agents/acq/inbound-scan";

// Leasing inquiries also sweep Hannah Powell's inbox (leasing coordination) on top of the
// acquisition principals' mailboxes used for inbound listings.
const LEASING_MAILBOXES = [...SCAN_MAILBOXES, "hpowell@erpfunds.com"];

// Inbound Leasing Inquiries scanner. The demand-side complement to the inbound-listings scanner:
// reads the same mailboxes for emails where a prospective TENANT (or their broker) is asking to
// LEASE space — a storage yard, warehouse, flex/office, IOS — extracts what they need, and matches
// it against ERP's available (vacant) properties so it ties back to the Properties tab. Read-only.

const GRAPH = "https://graph.microsoft.com/v1.0";
const anthropic = new Anthropic();

// Demand-side signals — someone looking to lease/rent space (not a for-sale listing, not IR).
const LEASING_HINT =
  /\b(lease|leasing|for rent|rent|renting|sublease|space available|available space|looking for|in the market for|need(?:ing)?|require|storage yard|laydown yard|yard space|warehouse space|shop space|square (?:feet|foot|footage)|sq\.?\s?ft|\bsf\b|\bIOS\b|tenant|occupy|move[- ]in)\b/i;

type Msg = { id: string; from: string; fromName: string; subject: string; preview: string; received: string };

async function readMailboxSince(mailbox: string, sinceIso: string, max: number): Promise<Msg[]> {
  const t = await getGraphToken();
  if (!t) throw new Error("AZURE credentials not configured");
  const h = { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' };
  const excluded = new Set<string>();
  for (const wk of ["deleteditems", "junkemail", "drafts", "sentitems"]) {
    try {
      const r = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${wk}?$select=id`, { headers: h });
      if (r.ok) { const d = await r.json(); if (d.id) excluded.add(d.id as string); }
    } catch { /* best-effort */ }
  }
  const out: Msg[] = [];
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$select=id,subject,from,bodyPreview,receivedDateTime,parentFolderId` +
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
        id: (m.id as string) || "", from: fromObj?.address || "", fromName: fromObj?.name || "",
        subject: (m.subject as string) || "", preview: (m.bodyPreview as string) || "", received: (m.receivedDateTime as string) || "",
      });
      if (out.length >= max) break;
    }
    url = (data["@odata.nextLink"] as string) || null;
  }
  return out;
}

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["index", "isLeasingInquiry", "contactName", "contactCompany", "contactEmail", "contactPhone", "inquiryType", "sfNeeded", "acreageNeeded", "needsYard", "needsCrane", "officeNeeded", "market", "submarket", "budgetPsf", "timeline", "summary"],
        properties: {
          index: { type: "integer" },
          isLeasingInquiry: { type: "boolean", description: "true only if a prospective tenant OR their broker is asking to lease/rent space (incl. storage/laydown yard, warehouse, flex, IOS). False for for-sale listings, vendor/IR/admin, and existing-tenant matters." },
          contactName: { anyOf: [{ type: "string" }, { type: "null" }] },
          contactCompany: { anyOf: [{ type: "string" }, { type: "null" }] },
          contactEmail: { anyOf: [{ type: "string" }, { type: "null" }] },
          contactPhone: { anyOf: [{ type: "string" }, { type: "null" }] },
          inquiryType: { type: "string", enum: ["Storage yard", "Warehouse", "Flex/office", "IOS", "Other"] },
          sfNeeded: { anyOf: [{ type: "integer" }, { type: "null" }] },
          acreageNeeded: { anyOf: [{ type: "number" }, { type: "null" }] },
          needsYard: { type: "boolean" },
          needsCrane: { type: "boolean" },
          officeNeeded: { type: "boolean" },
          market: { anyOf: [{ type: "string", enum: ["Permian", "Space Coast", "Other"] }, { type: "null" }] },
          submarket: { anyOf: [{ type: "string" }, { type: "null" }] },
          budgetPsf: { anyOf: [{ type: "number" }, { type: "null" }] },
          timeline: { anyOf: [{ type: "string" }, { type: "null" }] },
          summary: { type: "string", description: "one line: who wants what" },
        },
      },
    },
  },
} as const;

type Extracted = {
  index: number; isLeasingInquiry: boolean; contactName: string | null; contactCompany: string | null; contactEmail: string | null; contactPhone: string | null;
  inquiryType: string; sfNeeded: number | null; acreageNeeded: number | null; needsYard: boolean; needsCrane: boolean; officeNeeded: boolean;
  market: string | null; submarket: string | null; budgetPsf: number | null; timeline: string | null; summary: string;
};

type VacProp = { id: number; address: string; total: number | null; acres: number | null; exterior: string | null; notes: string | null; cranes: string | null; washBay: string | null };

// Match an inquiry to the best available (vacant) ERP property. All ERP properties are Permian (TX),
// so FL/Other inquiries won't match. Scores on size fit + yard/crane needs.
function bestMatch(x: Extracted, vac: VacProp[]): { p: VacProp; note: string } | null {
  if (x.market === "Space Coast") return null; // no FL inventory
  let best: { p: VacProp; score: number; note: string } | null = null;
  for (const p of vac) {
    const notes: string[] = [];
    let score = 1; // in-market vacant industrial
    if (x.sfNeeded && p.total) {
      const r = p.total / x.sfNeeded;
      if (r >= 0.6 && r <= 1.8) { score += 3; notes.push(`${p.total.toLocaleString()} SF fits ~${x.sfNeeded.toLocaleString()} SF need`); }
      else notes.push(`${p.total.toLocaleString()} SF vs ${x.sfNeeded.toLocaleString()} SF need`);
    }
    const yardText = `${p.exterior ?? ""} ${p.notes ?? ""}`.toLowerCase();
    const hasYard = (p.acres ?? 0) >= 3 || /yard|caliche|laydown|storage/.test(yardText);
    if (x.needsYard) { if (hasYard) { score += 3; notes.push(`${p.acres ?? "?"}-ac yard`); } else notes.push("limited yard"); }
    if (x.needsCrane && p.cranes && p.cranes !== "None") { score += 1; notes.push("crane on site"); }
    if (!best || score > best.score) best = { p, score, note: notes.join("; ") };
  }
  return best && best.score > 1 ? { p: best.p, note: best.note } : null;
}

export type LeasingScanSummary = {
  ok: boolean;
  perMailbox: { mailbox: string; scanned: number; candidates: number; error?: string }[];
  extracted: number; inserted: number; matched: number; skippedExisting: number;
};

export async function runLeasingScan(opts?: { days?: number; maxPerMailbox?: number; mailboxes?: string[] }): Promise<LeasingScanSummary> {
  const days = Math.min(Math.max(opts?.days ?? 90, 1), 365);
  const maxPerMailbox = Math.min(Math.max(opts?.maxPerMailbox ?? 250, 20), 800);
  const mailboxes = opts?.mailboxes ?? LEASING_MAILBOXES;

  const since = new Date(); since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  const admin = createAdminClient();
  const { data: props } = await admin.from("properties").select("id, address, total, acres, exterior, notes, cranes, washBay, tenant, units");
  const vac = ((props ?? []) as (VacProp & { tenant: string; units: unknown[] | null })[])
    .filter((p) => (!p.units || p.units.length === 0) && (p.tenant || "").trim().toLowerCase() === "vacant");

  const perMailbox: LeasingScanSummary["perMailbox"] = [];
  const candidates: (Msg & { mailbox: string })[] = [];
  for (const mailbox of mailboxes) {
    try {
      const msgs = await readMailboxSince(mailbox, sinceIso, maxPerMailbox);
      const hits = msgs.filter((m) => LEASING_HINT.test(`${m.subject} ${m.preview}`));
      hits.forEach((m) => candidates.push({ ...m, mailbox }));
      perMailbox.push({ mailbox, scanned: msgs.length, candidates: hits.length });
    } catch (e) {
      perMailbox.push({ mailbox, scanned: 0, candidates: 0, error: String(e).slice(0, 200) });
    }
  }

  const ids = candidates.map((c) => c.id).filter(Boolean);
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await admin.from("leasing_inquiries").select("message_id").in("message_id", ids.slice(i, i + 200));
    (data ?? []).forEach((r: { message_id: string }) => seen.add(r.message_id));
  }
  const fresh = candidates.filter((c) => c.id && !seen.has(c.id));
  const skippedExisting = candidates.length - fresh.length;

  let extracted = 0, inserted = 0, matched = 0;
  const BATCH = 15;
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    const digest = batch.map((m, j) => `${j}. <${m.from}> "${m.subject}" :: ${(m.preview || "").replace(/\s+/g, " ").slice(0, 240)}`).join("\n");
    let items: Extracted[] = [];
    try {
      const msg = await anthropic.messages.create({
        model: "claude-opus-4-8", max_tokens: 4000,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        system: [{ type: "text" as const, text:
`You triage an industrial real estate owner's inbox (ERP — Permian Basin, TX and Brevard/Space Coast, FL) for INBOUND LEASING INQUIRIES: a prospective tenant, or a broker representing one, asking to lease/rent space from ERP — a storage/laydown yard, warehouse, flex/office, or IOS. Set isLeasingInquiry=false for for-sale listings sent by brokers, existing-tenant matters, vendors, investor relations, and internal admin.

For each inquiry, extract the contact (name, company, email, phone), what they're looking for (inquiry type; square footage; acreage; whether they need a yard, a crane, office), the market (Permian / Space Coast / Other) and submarket, budget $/SF if stated, and timeline — nulls where not stated — plus a one-line summary. Be evidence-based.` }],
        messages: [{ role: "user", content: `Emails:\n${digest}\n\nReturn one item per email, echoing its index.` }],
      });
      const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
      items = (JSON.parse(text).items ?? []) as Extracted[];
    } catch (e) { console.error("[leasing-scan] extraction failed:", String(e).slice(0, 200)); continue; }

    for (const it of items) {
      if (!it.isLeasingInquiry) continue;
      const m = batch[it.index];
      if (!m) continue;
      extracted++;
      const match = bestMatch(it, vac);
      if (match) matched++;
      const { error } = await admin.from("leasing_inquiries").insert({
        message_id: m.id, source_mailbox: m.mailbox, received_at: m.received || null,
        from_email: m.from, from_name: m.fromName,
        contact_name: it.contactName || m.fromName || null, contact_company: it.contactCompany,
        contact_email: it.contactEmail || m.from || null, contact_phone: it.contactPhone,
        inquiry_type: it.inquiryType, sf_needed: it.sfNeeded, acreage_needed: it.acreageNeeded,
        needs_yard: it.needsYard, needs_crane: it.needsCrane, office_needed: it.officeNeeded,
        market: it.market, submarket: it.submarket, budget_psf: it.budgetPsf, timeline: it.timeline,
        summary: it.summary,
        status: match ? "matched" : "new",
        matched_property_id: match?.p.id ?? null, matched_address: match?.p.address ?? null, match_note: match?.note ?? null,
        raw_subject: m.subject, preview: (m.preview || "").slice(0, 500),
      });
      if (!error) inserted++;
      else console.error("[leasing-scan] insert failed:", error.message);
    }
  }

  return { ok: true, perMailbox, extracted, inserted, matched, skippedExisting };
}
