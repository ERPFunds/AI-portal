import { NextRequest, NextResponse } from "next/server";
import { classifyInquiry } from "@/lib/agents/ir/inquiry-classifier";
import { classifyInvestorEmail } from "@/lib/agents/ir/email-classifier";
import {
  listInboxMessages,
  listInboxMessagesSince,
  findMessageByInternetId,
  resolveSubfolderId,
  ensureSubfolderId,
  resolveFolderId,
  listChildFolders,
  moveMessage,
  setMessageRead,
  setMessageCategories,
  getMessageMime,
  importMimeMessage,
  deleteFolder,
  listConversationMessagesWithBody,
} from "@/lib/agents/ir/graph-mailbox";
import { createReplyDraft } from "@/lib/agents/ir/graph-mail";
import { buildDueDiligenceReply, getMessageBodyText } from "@/lib/agents/ir/dd-responder";
import { unwrapForward } from "@/lib/agents/ir/forward-unwrap";
import { addAttachmentsToDraft } from "@/lib/agents/ir/draft-attachments";
import { getAnthropicFileBytes } from "@/lib/agents/ir/file-text";
import { filterUnprocessedMessageIds, markMessageProcessed, logAgentRun, getDeletedDocusignInternetIds, markDocusignRestored } from "@/lib/db";
import { logCorrespondence, salesforceConfigured } from "@/lib/agents/ir/salesforce";

export const maxDuration = 300;

const TEAM_INBOX = "team@erpfunds.com";
// Parent folder + the two routing subfolders an investor email lands in (one or the other).
const IR_FOLDER = "Investor Relations";
const SUB_ESCALATE = "Escalate"; // high-stakes / needs the fund manager
const SUB_DRAFTS = "Forwarded Drafts"; // routine — a draft reply is prepared for review
const TOP_PER_MAILBOX = 25;

// Comma-separated list of mailboxes to sweep, e.g. "mberry@erpfunds.com,wmeyer@erpfunds.com".
// Empty by default so nothing runs until explicitly configured. Once active, BOTH IR leads'
// inboxes (Meghan + William) are always swept so each gets their own drafts.
function sweepMailboxes(): string[] {
  const configured = (process.env.IR_SWEEP_MAILBOXES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (configured.length === 0) return []; // safe default: dormant until configured
  const seen = new Set(configured.map((m) => m.toLowerCase()));
  for (const required of ["mberry@erpfunds.com", "wmeyer@erpfunds.com"]) {
    if (!seen.has(required)) { configured.push(required); seen.add(required); }
  }
  return configured;
}

// Is "now" within 8am–8pm Central Time? (handles CDT/CST via the IANA zone)
function withinCentralBusinessHours(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    }).format(new Date())
  );
  return hour >= 8 && hour < 20;
}

async function logToSalesforce(payload: {
  investorEmail: string;
  firstName: string;
  lastName: string;
  subject: string;
  snippet: string;
  receivedDate: string;
  sourceMailbox: string;
  company?: string;
  title?: string;
}): Promise<string> {
  if (!salesforceConfigured()) return "sf-skip(no SF creds)";
  try {
    return await logCorrespondence(payload);
  } catch (e) {
    return `sf-fail(${String(e).slice(0, 100)})`;
  }
}

async function handleMailbox(
  mailbox: string,
  dryRun: boolean,
  opts?: { sinceIso?: string; max?: number; reimport?: boolean }
): Promise<{ mailbox: string; scanned: number; fresh: number; investor: number; details: string[] }> {
  const details: string[] = [];
  const messages = opts?.sinceIso
    ? await listInboxMessagesSince(mailbox, opts.sinceIso, opts.max ?? 250)
    : await listInboxMessages(mailbox, TOP_PER_MAILBOX);
  // Normally skip anything already in the dedup ledger. `reimport` bypasses that so a message
  // that was marked processed but never successfully filed/drafted gets another pass. (Emails
  // already filed have moved out of the Inbox, so this only re-touches ones still sitting here.)
  const fresh = opts?.reimport
    ? new Set(messages.map((m) => m.id))
    : await filterUnprocessedMessageIds(mailbox, messages.map((m) => m.id));
  // oldest first so the dedup ledger fills in chronological order
  const todo = messages.filter((m) => fresh.has(m.id)).reverse();

  // resolve the two routing subfolders once per mailbox (lazily; only if we'll move something)
  let escalateFolderId: string | null | undefined; // undefined = not yet resolved
  let draftsFolderId: string | null | undefined;
  // same two subfolders in the shared team hub, where we drop a triaged COPY
  let teamEscalateFolderId: string | null | undefined;
  let teamDraftsFolderId: string | null | undefined;
  let investorCount = 0;
  const sourceIsWilliam = mailbox.toLowerCase().includes("wmeyer");

  for (const m of todo) {
    // Draft/sign-off owner: William if this is his mailbox OR he's a To/CC recipient (route by
    // recipient); otherwise Meghan. Per-message so a William thread in Meghan's inbox sorts to him.
    const signer = (sourceIsWilliam || (m.recipients || []).some((a) => a.includes("wmeyer@")))
      ? "William Meyer"
      : "Meghan Berry";
    // Classify and draft from the FULL body — bodyPreview is Graph's ~255-char snippet, which
    // hid everything below the fold (follow-up questions, amounts, the sender's signature).
    let fromAddr = m.fromAddress;
    let bodyText = (await getMessageBodyText(mailbox, m.id)) || m.bodyPreview;
    // Unwrap forwarded IR emails (e.g. forwarded into team@) so we classify the ORIGINAL
    // investor + their message, not the internal person who forwarded it.
    {
      const uw = unwrapForward({ subject: m.subject, body: bodyText, from: m.fromAddress });
      if (uw.isForward) {
        fromAddr = uw.originalFrom;
        bodyText = uw.content || bodyText;
      }
    }

    // DocuSign automated notifications: leave them in the inbox (never delete/move them — they're
    // the investor's own signing mail), but never draft a reply to them. Just mark processed so we
    // skip them on future sweeps.
    if (/docusign/i.test(fromAddr) || /docusign/i.test(m.fromAddress)) {
      if (!dryRun) {
        await markMessageProcessed({
          mailbox,
          messageId: m.id,
          internetMessageId: m.internetMessageId,
          isInvestor: false,
          action: "ignored-docusign",
        });
      }
      details.push(`IGNORE ${fromAddr || m.fromAddress} — DocuSign notification (left in inbox, no draft)`);
      continue;
    }

    // Classify first. A genuine investor / due-diligence inquiry is triaged even when it's sent
    // DIRECTLY to an IR lead (e.g. a WealthForge DD questionnaire to Meghan) — the reviewer still
    // approves the draft. Anything the classifier doesn't consider an investor inquiry is left
    // alone; when it was addressed straight to a lead we note it as their personal correspondence.
    const verdict = await classifyInquiry({ from: fromAddr, subject: m.subject, body: bodyText });
    if (!verdict.isInvestorInquiry) {
      const directToLead = (m.toRecipients || []).some((a) => a.includes("mberry@") || a.includes("wmeyer@"));
      if (!dryRun) {
        await markMessageProcessed({
          mailbox,
          messageId: m.id,
          internetMessageId: m.internetMessageId,
          isInvestor: false,
          action: directToLead ? "ignored-direct-to-lead" : "ignored",
        });
      }
      details.push(`IGNORE ${fromAddr} — ${directToLead ? "personal (direct to IR lead), " : ""}${verdict.reason}`);
      continue;
    }

    investorCount++;

    // Pull the rest of the Outlook conversation (prior messages, oldest first) so the drafter
    // sees the FULL thread — what was already asked and answered — not just the newest email.
    let threadContext = "";
    try {
      if (m.conversationId) {
        const prior = (await listConversationMessagesWithBody(mailbox, m.conversationId, 15))
          .filter((t) => t.id !== m.id && !t.isDraft && t.bodyText.trim())
          .sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime))
          .slice(-4); // last 4 prior messages is plenty of context without blowing up the prompt
        threadContext = prior
          .map((t) => `--- ${t.receivedDateTime} · ${t.fromName || t.from} <${t.from}> ---\n${t.bodyText.slice(0, 2000)}`)
          .join("\n\n");
      }
    } catch { /* thread context is best-effort — draft from the single email if it fails */ }

    // Investor email: classify for routing + draft (escalate XOR forwarded-drafts).
    const triage = await classifyInvestorEmail({
      from: fromAddr,
      subject: m.subject,
      body: bodyText,
      signAs: signer,
      threadContext: threadContext || undefined,
    });
    const route = triage.isEscalation ? "escalate" : "draft";

    // Outlook categories: owner tag always; escalations also get a tag naming WHY it was
    // escalated (short classifier reason, falling back to the escalation category).
    const cats = [`IR: ${signer.split(" ")[0]}`];
    if (route === "escalate") {
      const CAT_LABEL: Record<string, string> = {
        "escalation-complaint": "Complaint",
        "escalation-legal": "Legal",
        "escalation-redemption": "Redemption",
        "escalation-new-inquiry": "New Inquiry",
        "escalation-other": "Needs Review",
      };
      const reason = (triage.escalationReason || "").trim().replace(/\s+/g, " ");
      cats.push(`Escalated: ${reason ? reason.slice(0, 40) : (CAT_LABEL[triage.category] ?? "Needs Review")}`);
    }

    if (dryRun) {
      details.push(
        `INVESTOR(dry) ${fromAddr} (${verdict.contact.firstName ?? ""} ${verdict.contact.lastName}) ` +
          `→ ${route}${triage.isEscalation ? ` [${triage.escalationReason ?? triage.category}]` : ""} — ${verdict.reason}`
      );
      continue;
    }

    const actions: string[] = [route];
    const subName = route === "escalate" ? SUB_ESCALATE : SUB_DRAFTS;

    // 1) drop a triaged COPY into the team hub's matching IR subfolder (Escalate XOR Forwarded
    //    Drafts), kept unread, so it surfaces in the portal Agent Inbox. The original stays in
    //    the source mailbox's IR subfolder (step 4) — i.e. a copy lives in BOTH places.
    if (mailbox === TEAM_INBOX) {
      // Source IS the team hub (e.g. a forwarded email) — step 4 already files it here; no copy needed.
      actions.push("team-copy-skip(source=team hub)");
    } else try {
      let teamDestId: string | null;
      // The team hub is our destination — create the routing subfolders if they don't exist yet.
      if (route === "escalate") {
        if (teamEscalateFolderId === undefined) teamEscalateFolderId = await ensureSubfolderId(TEAM_INBOX, IR_FOLDER, SUB_ESCALATE);
        teamDestId = teamEscalateFolderId;
      } else {
        if (teamDraftsFolderId === undefined) teamDraftsFolderId = await ensureSubfolderId(TEAM_INBOX, IR_FOLDER, SUB_DRAFTS);
        teamDestId = teamDraftsFolderId;
      }
      if (teamDestId) {
        const mime = await getMessageMime(mailbox, m.id);
        const copyId = await importMimeMessage(TEAM_INBOX, teamDestId, mime);
        try {
          await setMessageRead(TEAM_INBOX, copyId, false);
          actions.push("team-copied-unread");
        } catch (e) {
          actions.push(`team-copied(unread-fail:${String(e).slice(0, 40)})`);
        }
        // Tag the team copy too (owner + escalation reason) so the Agent Inbox and Outlook
        // both show why it's there.
        try { await setMessageCategories(TEAM_INBOX, copyId, cats); } catch { /* best-effort */ }
      } else {
        actions.push(`team-copy-skip(no "${subName}" subfolder in ${TEAM_INBOX})`);
      }
    } catch (e) {
      console.log("[ir-sweep] team-copy-fail", String(e).slice(0, 400));
      actions.push(`team-copy-fail(${String(e).slice(0, 250)})`);
    }

    // 2) Salesforce: find-or-create the Contact + log a correspondence Task (direct REST)
    actions.push(
      await logToSalesforce({
        investorEmail: fromAddr,
        firstName: verdict.contact.firstName ?? "",
        lastName: verdict.contact.lastName,
        subject: m.subject,
        snippet: bodyText.slice(0, 500),
        receivedDate: m.receivedDateTime,
        sourceMailbox: mailbox,
        company: verdict.contact.company ?? undefined,
        title: verdict.contact.title ?? undefined,
      })
    );

    // 3) prepare a draft reply for BOTH routes. Escalations now get a best-effort draft too — the
    //    human reviews/edits/sends or deletes it — but the escalation draft is filed into the
    //    Escalate folder (rather than the general Drafts queue) so it sits with the escalation.
    //    Drafts land in team@erpfunds.com so they surface in the portal Agent Inbox for approval.
    try {
      // Create the reply as a THREADED draft in THIS mailbox (Meghan's for mberry@, William's for
      // wmeyer@) — created against the original BEFORE it's filed (step 4) — so it shows in their
      // own Outlook Drafts with the original email beneath it. The draft STAYS in Drafts (per
      // Meghan/William: no IR-subfolder move) — they review and send from their Drafts folder.
      if (triage.isDueDiligence) {
        // bodyText is already the full (unwrapped) body, fetched above for classification.
        const ddName = verdict.contact.fullName || [verdict.contact.firstName, verdict.contact.lastName].filter(Boolean).join(" ");
        const dd = await buildDueDiligenceReply({ from: fromAddr, subject: m.subject, body: bodyText, contactName: ddName, signAs: signer, threadContext: threadContext || undefined });
        const atts: { filename: string; mimeType: string; bytes: Buffer }[] = [];
        for (const a of dd.attachments) {
          const bytes = await getAnthropicFileBytes(a.fileId);
          if (bytes) atts.push({ filename: a.filename, mimeType: a.mimeType || "application/octet-stream", bytes });
          else actions.push(`att-fetch-fail(${a.filename})`);
        }
        const r = await createReplyDraft({ mailbox, originalMessageId: m.id, htmlBody: dd.draftHtml || triage.draftHtml, categories: cats });
        if (r.draftId && atts.length) {
          const att = await addAttachmentsToDraft(mailbox, r.draftId, atts);
          actions.push(`dd-drafted(${att.attached.length} attached${att.failed.length ? `, failed: ${att.failed.join("; ")}` : ""})`);
        } else actions.push(r.success ? "dd-drafted" : `draft-fail(${(r.message || "").slice(0, 40)})`);
      } else {
        const d = await createReplyDraft({ mailbox, originalMessageId: m.id, htmlBody: triage.draftHtml, categories: cats });
        actions.push(d.success ? "drafted" : `draft-fail(${(d.message || "").slice(0, 40)})`);
      }
    } catch (e) {
      actions.push(`draft-fail(${String(e).slice(0, 60)})`);
    }

    // Tag the inbound original with the same categories (owner + escalation reason) — the tag
    // survives the move in step 4, and shows even when the IR subfolders don't exist.
    try { await setMessageCategories(mailbox, m.id, cats); actions.push("tagged"); } catch { /* best-effort */ }

    // 4) file into exactly ONE IR subfolder — Escalate XOR Forwarded Drafts (best-effort;
    //    needs Mail.ReadWrite). Per Meghan: filed emails must stay UNREAD so she can find
    //    them and not miss any, so we mark the moved copy unread after filing.
    try {
      let destId: string | null;
      if (route === "escalate") {
        if (escalateFolderId === undefined) escalateFolderId = await resolveSubfolderId(mailbox, IR_FOLDER, SUB_ESCALATE);
        destId = escalateFolderId;
      } else {
        if (draftsFolderId === undefined) draftsFolderId = await resolveSubfolderId(mailbox, IR_FOLDER, SUB_DRAFTS);
        destId = draftsFolderId;
      }
      if (destId) {
        const movedId = await moveMessage(mailbox, m.id, destId);
        // keep it unread in the destination folder
        try {
          await setMessageRead(mailbox, movedId, false);
          actions.push("filed-unread");
        } catch (e) {
          actions.push(`filed(unread-fail:${String(e).slice(0, 40)})`);
        }
      } else {
        actions.push(`file-skip(no "${route === "escalate" ? SUB_ESCALATE : SUB_DRAFTS}" subfolder)`);
      }
    } catch (e) {
      actions.push(`move-fail(${String(e).slice(0, 60)})`);
    }

    await markMessageProcessed({
      mailbox,
      messageId: m.id,
      internetMessageId: m.internetMessageId,
      isInvestor: true,
      action: actions.join("|"),
    });
    // Feed the AI Command Center activity log.
    try {
      const who = `${verdict.contact.firstName ?? ""} ${verdict.contact.lastName}`.trim() || fromAddr;
      await logAgentRun({
        agentId: "ir",
        workflowId: route === "escalate" ? "ir-escalate" : "ir-draft",
        status: "success",
        summary: `${route === "escalate" ? "Escalated" : "Drafted reply for"} ${who} — ${m.subject}`.slice(0, 200),
      });
    } catch { /* logging is best-effort */ }
    details.push(`INVESTOR ${m.fromAddress} → ${actions.join(", ")}`);
  }

  return { mailbox, scanned: messages.length, fresh: todo.length, investor: investorCount, details };
}

// Self-heal: delete stray EMPTY IR subfolders in the team hub (e.g. "IR Escalations",
// "IR Forward Drafts") left over from earlier naming — keeps the canonical Escalate / Forwarded
// Drafts. Never touches a folder that still has messages, or the canonical two.
async function cleanupStrayTeamFolders(): Promise<string[]> {
  const removed: string[] = [];
  try {
    const irId = await resolveFolderId(TEAM_INBOX, IR_FOLDER);
    if (!irId) return removed;
    for (const c of await listChildFolders(TEAM_INBOX, irId)) {
      const nm = c.displayName.toLowerCase();
      if (nm === "escalate" || nm === "forwarded drafts") continue; // canonical
      if (!/escalat|draft/.test(nm)) continue;                       // unrelated folder
      if (c.totalItemCount > 0) continue;                            // has messages — leave it
      try { await deleteFolder(TEAM_INBOX, c.id); removed.push(c.displayName); } catch { /* ignore */ }
    }
  } catch { /* non-fatal */ }
  return removed;
}

// Recovery: DocuSign notifications the sweep previously DELETED (moved to Deleted Items) get moved
// back to the Inbox. Precise — only touches messages WE deleted, identified by the internetMessageId
// in the processed ledger, so mail the user deleted themselves is left alone. Idempotent: each
// restored message's ledger row flips to "restored-docusign" so it's never retried.
async function restoreDeletedDocusigns(mailbox: string): Promise<{ mailbox: string; wanted: number; found: number; restored: number; error?: string }> {
  const out = { mailbox, wanted: 0, found: 0, restored: 0 } as { mailbox: string; wanted: number; found: number; restored: number; error?: string };
  try {
    const wantedIds = await getDeletedDocusignInternetIds(mailbox);
    out.wanted = wantedIds.length;
    if (wantedIds.length === 0) return out;
    for (const iid of wantedIds) {
      try {
        // Look the message up directly by internetMessageId so the huge Deleted Items volume doesn't
        // matter. Check Deleted Items first (where soft-deletes land), then fall back to a
        // whole-mailbox lookup. Move whatever we find back to the Inbox.
        const found =
          (await findMessageByInternetId(mailbox, iid, "deleteditems")) ||
          (await findMessageByInternetId(mailbox, iid));
        if (!found) continue;
        out.found++;
        await moveMessage(mailbox, found.id, "inbox");
        await markDocusignRestored(mailbox, iid);
        out.restored++;
      } catch (e) { out.error = `${String(e).slice(0, 140)}`; }
    }
    return out;
  } catch (e) {
    out.error = String(e).slice(0, 160);
    return out;
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const force = params.get("force") === "1"; // bypass enabled-flag + hours gate for manual testing
  const dryRun = params.get("dryRun") === "1"; // classify + report only, no move/forward/log/mark
  const mailboxOverride = params.get("mailbox")?.trim(); // one or comma-separated
  // Historical catch-up: scan the Inbox back this many months (paginated past the live cap).
  const sinceMonths = Math.min(Number(params.get("sinceMonths")) || 0, 24);
  const max = Math.min(Math.max(Number(params.get("max")) || 60, 1), 300);
  const reimport = params.get("reimport") === "1"; // ignore the dedup ledger (re-process already-seen)
  let opts: { sinceIso: string; max: number; reimport: boolean } | undefined;
  if (sinceMonths > 0) {
    const since = new Date();
    since.setMonth(since.getMonth() - sinceMonths);
    opts = { sinceIso: since.toISOString().split(".")[0] + "Z", max, reimport };
  }

  if (!force && process.env.IR_SWEEP_ENABLED !== "true") {
    console.log("[ir-sweep] skipped: IR_SWEEP_ENABLED is not 'true'");
    return NextResponse.json({ skipped: "IR_SWEEP_ENABLED is not 'true'" });
  }
  if (!force && !withinCentralBusinessHours()) {
    console.log("[ir-sweep] skipped: outside 8am-8pm CT");
    return NextResponse.json({ skipped: "outside 8am-8pm CT" });
  }

  const mailboxes = mailboxOverride
    ? mailboxOverride.split(",").map((s) => s.trim()).filter(Boolean)
    : sweepMailboxes();
  if (mailboxes.length === 0) {
    console.log("[ir-sweep] skipped: no mailboxes configured (set IR_SWEEP_MAILBOXES)");
    return NextResponse.json({ skipped: "no mailboxes configured (set IR_SWEEP_MAILBOXES)" });
  }

  // Self-heal duplicate/stray IR subfolders in the team hub before triaging.
  let strayRemoved: string[] = [];
  if (!dryRun) {
    strayRemoved = await cleanupStrayTeamFolders();
    if (strayRemoved.length) console.log("[ir-sweep] removed stray folders", JSON.stringify(strayRemoved));
  }

  const results = [];
  const docusignRestore = [];
  for (const mailbox of mailboxes) {
    try {
      // Release any DocuSigns we previously deleted back to this mailbox's Inbox first.
      if (!dryRun) {
        const r = await restoreDeletedDocusigns(mailbox);
        docusignRestore.push(r);
        if (r.restored) console.log(`[ir-sweep] restored ${r.restored} deleted DocuSign(s) to ${mailbox} Inbox`);
      }
      results.push(await handleMailbox(mailbox, dryRun, opts));
    } catch (e) {
      results.push({ mailbox, error: String(e) });
    }
  }
  console.log("[ir-sweep] ran", JSON.stringify(results.map((r) => "scanned" in r
    ? { mailbox: r.mailbox, scanned: r.scanned, fresh: r.fresh, investor: r.investor, sample: r.details.slice(0, 4) }
    : r)));
  return NextResponse.json({ ok: true, dryRun, ranAt: new Date().toISOString(), docusignRestore, results });
}
