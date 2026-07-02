import { NextRequest, NextResponse } from "next/server";
import { classifyInquiry } from "@/lib/agents/ir/inquiry-classifier";
import { classifyInvestorEmail } from "@/lib/agents/ir/email-classifier";
import {
  listInboxMessages,
  listInboxMessagesSince,
  resolveSubfolderId,
  ensureSubfolderId,
  moveMessage,
  setMessageRead,
  getMessageMime,
  importMimeMessage,
} from "@/lib/agents/ir/graph-mailbox";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
import { buildDueDiligenceReply, getMessageBodyText } from "@/lib/agents/ir/dd-responder";
import { unwrapForward } from "@/lib/agents/ir/forward-unwrap";
import { saveDraftWithAttachments } from "@/lib/agents/ir/draft-attachments";
import { getAnthropicFileBytes } from "@/lib/agents/ir/file-text";
import { filterUnprocessedMessageIds, markMessageProcessed } from "@/lib/db";
import { logCorrespondence, salesforceConfigured } from "@/lib/agents/ir/salesforce";

export const maxDuration = 300;

const TEAM_INBOX = "team@erpfunds.com";
// Parent folder + the two routing subfolders an investor email lands in (one or the other).
const IR_FOLDER = "Investor Relations";
const SUB_ESCALATE = "Escalate"; // high-stakes / needs the fund manager
const SUB_DRAFTS = "Forwarded Drafts"; // routine — a draft reply is prepared for review
const TOP_PER_MAILBOX = 25;

// Comma-separated list of mailboxes to sweep, e.g. "mberry@erpfunds.com,wmeyer@erpfunds.com".
// Empty by default so nothing runs until explicitly configured.
function sweepMailboxes(): string[] {
  return (process.env.IR_SWEEP_MAILBOXES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
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
  opts?: { sinceIso?: string; max?: number }
): Promise<{ mailbox: string; scanned: number; fresh: number; investor: number; details: string[] }> {
  const details: string[] = [];
  const messages = opts?.sinceIso
    ? await listInboxMessagesSince(mailbox, opts.sinceIso, opts.max ?? 250)
    : await listInboxMessages(mailbox, TOP_PER_MAILBOX);
  const fresh = await filterUnprocessedMessageIds(
    mailbox,
    messages.map((m) => m.id)
  );
  // oldest first so the dedup ledger fills in chronological order
  const todo = messages.filter((m) => fresh.has(m.id)).reverse();

  // resolve the two routing subfolders once per mailbox (lazily; only if we'll move something)
  let escalateFolderId: string | null | undefined; // undefined = not yet resolved
  let draftsFolderId: string | null | undefined;
  // same two subfolders in the shared team hub, where we drop a triaged COPY
  let teamEscalateFolderId: string | null | undefined;
  let teamDraftsFolderId: string | null | undefined;
  let investorCount = 0;
  // Draft/sign-off owner = whose mailbox this is (William signs William's, Meghan signs the rest).
  const signer = mailbox.toLowerCase().includes("wmeyer") ? "William Meyer" : "Meghan Berry";

  for (const m of todo) {
    // Unwrap forwarded IR emails (e.g. forwarded into team@) so we classify the ORIGINAL
    // investor + their message, not the internal person who forwarded it.
    let fromAddr = m.fromAddress;
    let bodyText = m.bodyPreview;
    {
      const uw = unwrapForward({ subject: m.subject, body: m.bodyPreview, from: m.fromAddress });
      if (uw.isForward) {
        const full = await getMessageBodyText(mailbox, m.id);
        const uw2 = unwrapForward({ subject: m.subject, body: full || m.bodyPreview, from: m.fromAddress });
        fromAddr = uw2.originalFrom;
        bodyText = uw2.content || m.bodyPreview;
      }
    }

    // Skip DocuSign automated notifications outright — never pulled into the IR inbox.
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
      details.push(`IGNORE ${fromAddr || m.fromAddress} — DocuSign notification`);
      continue;
    }

    const verdict = await classifyInquiry({ from: fromAddr, subject: m.subject, body: bodyText });
    if (!verdict.isInvestorInquiry) {
      if (!dryRun) {
        await markMessageProcessed({
          mailbox,
          messageId: m.id,
          internetMessageId: m.internetMessageId,
          isInvestor: false,
          action: "ignored",
        });
      }
      details.push(`IGNORE ${fromAddr} — ${verdict.reason}`);
      continue;
    }

    investorCount++;

    // Investor email: classify for routing + draft (escalate XOR forwarded-drafts).
    const triage = await classifyInvestorEmail({
      from: fromAddr,
      subject: m.subject,
      body: bodyText,
      signAs: signer,
    });
    const route = triage.isEscalation ? "escalate" : "draft";

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
      } else {
        actions.push(`team-copy-skip(no "${subName}" subfolder in ${TEAM_INBOX})`);
      }
    } catch (e) {
      actions.push(`team-copy-fail(${String(e).slice(0, 60)})`);
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
      })
    );

    // 3) prepare a draft reply ONLY for the routine (Forwarded Drafts) route. Escalations get NO
    //    draft — if the AI can't answer substantively it escalates, and the human handles it from
    //    the Escalate folder (no filler "thanks, flagging this for review" replies).
    //    Drafts land in team@erpfunds.com so they surface in the portal Agent Inbox for approval.
    if (route !== "draft") {
      actions.push("escalate-no-draft");
    } else try {
      if (triage.isDueDiligence) {
        const fullBody = (await getMessageBodyText(mailbox, m.id)) || bodyText;
        const dd = await buildDueDiligenceReply({ from: fromAddr, subject: m.subject, body: fullBody });
        const atts: { filename: string; mimeType: string; bytes: Buffer }[] = [];
        for (const a of dd.attachments) {
          const bytes = await getAnthropicFileBytes(a.fileId);
          if (bytes) atts.push({ filename: a.filename, mimeType: a.mimeType || "application/octet-stream", bytes });
        }
        const r = await saveDraftWithAttachments({
          mailboxEmail: TEAM_INBOX,
          toEmail: fromAddr,
          subject: dd.draftSubject,
          htmlBody: dd.draftHtml || triage.draftHtml,
          attachments: atts,
        });
        actions.push(`dd-drafted(${r.attached.length} attached${r.failed.length ? `, ${r.failed.length} failed` : ""})`);
      } else {
        const d = await saveDraftToOutlook({
          toEmail: fromAddr,
          mailboxEmail: TEAM_INBOX,
          subject: triage.draftSubject || `Re: ${m.subject}`,
          htmlBody: triage.draftHtml,
        });
        actions.push(d.success ? "drafted" : `draft-fail(${(d.message || "").slice(0, 40)})`);
      }
    } catch (e) {
      actions.push(`draft-fail(${String(e).slice(0, 60)})`);
    }

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
    details.push(`INVESTOR ${m.fromAddress} → ${actions.join(", ")}`);
  }

  return { mailbox, scanned: messages.length, fresh: todo.length, investor: investorCount, details };
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
  let opts: { sinceIso: string; max: number } | undefined;
  if (sinceMonths > 0) {
    const since = new Date();
    since.setMonth(since.getMonth() - sinceMonths);
    opts = { sinceIso: since.toISOString().split(".")[0] + "Z", max };
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

  const results = [];
  for (const mailbox of mailboxes) {
    try {
      results.push(await handleMailbox(mailbox, dryRun, opts));
    } catch (e) {
      results.push({ mailbox, error: String(e) });
    }
  }
  console.log("[ir-sweep] ran", JSON.stringify(results.map((r) => "scanned" in r
    ? { mailbox: r.mailbox, scanned: r.scanned, fresh: r.fresh, investor: r.investor, sample: r.details.slice(0, 4) }
    : r)));
  return NextResponse.json({ ok: true, dryRun, ranAt: new Date().toISOString(), results });
}
