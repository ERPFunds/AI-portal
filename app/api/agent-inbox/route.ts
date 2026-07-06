import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveFolderId,
  listChildFolders,
  listFolderMessages,
  listFolderMessagesSince,
  getMessageBody,
  listConversationMessages,
  listMessagesFrom,
  sendMailAs,
  deleteMessage,
  importMimeMessage,
  moveMessage,
  deleteFolder,
  type MailItem,
} from "@/lib/agents/ir/graph-mailbox";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { composeContactNote } from "@/lib/agents/ir/contact-note";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
import { markMessageProcessed, logAgentRun } from "@/lib/db";
import { draftLpOutreach, type LpOutreachInput } from "@/lib/agents/ir/lp-outreach";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shared mailbox the IR (Agent 2) traffic lands in. Overridable via env.
const TEAM_MAILBOX = process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";
// Replies are sent AS this mailbox (the IR lead's own address), even though triage/drafting
// happens in the team hub. Overridable via env.
const SEND_AS_MAILBOX = process.env.IR_SEND_AS_MAILBOX || "mberry@erpfunds.com";
// Top-level folder whose subtree we mirror into the Agent Inbox.
const IR_FOLDER = process.env.IR_FOLDER_NAME || "Investor Relations";
const PER_FOLDER = 30; // messages to pull per folder
const DRAFTS_TOP = 250; // max drafts across the rolling window (see IR_DRAFTS_MONTHS)

type ItemStatus = "active-thread" | "pending" | "handled" | "needs-review";

export interface AgentInboxItem {
  id: string;
  from: string;
  fromName: string | null;
  to: string[];
  subject: string;
  preview: string;
  receivedISO: string;
  folder: string; // display path, e.g. "Investor Relations / Escalate"
  folderKind: "ir" | "escalate" | "forwarded-drafts" | "draft" | "sent";
  status: ItemStatus;
  isDraft: boolean;
  webLink: string | null;
  conversationId: string | null;
  owner: "Meghan" | "William" | null; // which IR lead's thread this belongs to
  originalReceivedISO: string | null;  // when the inbound email this draft replies to arrived
  sentBody?: string;                    // full body for a sent reply (folderKind === "sent")
  mailbox: string;                      // the mailbox this item lives in (for send/read actions)
}

// Which IR lead a message belongs to, from its recipients (the mailbox the investor wrote to).
function ownerOf(addrs: string[]): "Meghan" | "William" | null {
  const s = addrs.map((a) => a.toLowerCase());
  if (s.some((a) => a.includes("mberry@"))) return "Meghan";
  if (s.some((a) => a.includes("wmeyer@"))) return "William";
  return null;
}

// Drafts are tagged with the signer at creation via an Outlook category ("IR: Meghan" / "IR: William"),
// so a draft's owner is known reliably without matching it back to an inbound email.
function ownerFromCategories(cats: string[]): "Meghan" | "William" | null {
  for (const c of cats) {
    const n = c.toLowerCase();
    if (n.includes("william")) return "William";
    if (n.includes("meghan")) return "Meghan";
  }
  return null;
}

export interface AgentInboxFolder {
  name: string; // display path
  kind: AgentInboxItem["folderKind"];
  count: number;
}

// Classify a folder by its display name into the kinds the UI cares about.
function folderKind(name: string): AgentInboxItem["folderKind"] {
  const n = name.toLowerCase();
  if (/escalat/.test(n)) return "escalate";
  if (/draft/.test(n)) return "forwarded-drafts";
  return "ir";
}

// Escalations and the forwarded-draft queue both surface as "needs-review"
// (a human still has to act on them); everything else in the IR tree is an active thread.
function statusForFolder(kind: AgentInboxItem["folderKind"]): ItemStatus {
  if (kind === "escalate") return "needs-review";
  if (kind === "forwarded-drafts") return "needs-review";
  return "active-thread";
}

function toItem(
  m: MailItem,
  folderPath: string,
  kind: AgentInboxItem["folderKind"],
  mailbox: string = TEAM_MAILBOX
): AgentInboxItem {
  const isDraft = kind === "draft" || m.isDraft;
  return {
    mailbox,
    id: m.id,
    from: m.fromAddress,
    fromName: m.fromName,
    to: m.toRecipients,
    subject: m.subject,
    preview: m.bodyPreview,
    receivedISO: isDraft ? m.lastModifiedDateTime || m.receivedDateTime : m.receivedDateTime,
    folder: folderPath,
    folderKind: kind,
    status: isDraft ? "needs-review" : statusForFolder(kind),
    isDraft,
    webLink: m.webLink,
    conversationId: m.conversationId,
    // Drafts always sort to an IR lead: use the signer category, else default to Meghan (primary IR lead).
    owner: isDraft ? (ownerFromCategories(m.categories) ?? "Meghan") : ownerOf(m.toRecipients),
    originalReceivedISO: isDraft ? null : m.receivedDateTime,
  };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // On-demand full body for one message (the list only carries the short bodyPreview).
  const messageId = req.nextUrl.searchParams.get("message");
  if (messageId) {
    try {
      const mb = req.nextUrl.searchParams.get("mailbox") || TEAM_MAILBOX;
      const m = await getMessageBody(mb, messageId);
      return NextResponse.json({ id: messageId, subject: m.subject, to: m.to, body: m.bodyText });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // The original inbound email a draft is replying to. Drafts are created as standalone messages
  // (no shared conversationId with the original), so we try the conversation first, then fall back
  // to matching by the investor (the draft's recipient) + subject. Searches the team hub + send-as.
  const originalOf = req.nextUrl.searchParams.get("original");
  if (originalOf) {
    try {
      const draftMailbox = req.nextUrl.searchParams.get("mailbox") || TEAM_MAILBOX;
      const draft = await getMessageBody(draftMailbox, originalOf);
      const searchMailboxes = [draftMailbox, TEAM_MAILBOX, SEND_AS_MAILBOX].filter((v, i, a) => a.indexOf(v) === i);
      const mine = new Set(searchMailboxes.map((a) => a.toLowerCase()));
      type Hit = { id: string; subject: string; from: string; fromName: string | null; receivedDateTime: string };
      let hit: Hit | null = null;
      let hostMailbox = TEAM_MAILBOX;

      // 1) Same conversation (works when a draft was created as a real reply).
      if (draft.conversationId) {
        for (const mb of searchMailboxes) {
          const msgs = await listConversationMessages(mb, draft.conversationId);
          const cands = msgs
            .filter((m) => m.id !== originalOf && !m.isDraft && m.from)
            .sort((a, b) => new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime());
          const pick = cands.find((m) => !mine.has(m.from.toLowerCase())) || cands[0];
          if (pick) { hit = pick; hostMailbox = mb; break; }
        }
      }

      // 2) Fallback: the inbound email from the investor (draft recipient) with a matching subject.
      if (!hit) {
        const investor = draft.to.find((a) => !mine.has(a.toLowerCase())) || draft.to[0];
        const strip = (s: string) => (s || "").toLowerCase().replace(/^\s*((re|fw|fwd)\s*:\s*)+/i, "").trim();
        const want = strip(draft.subject);
        if (investor) {
          for (const mb of searchMailboxes) {
            const msgs = (await listMessagesFrom(mb, investor)).filter((m) => !m.isDraft);
            const pick = msgs.find((m) => strip(m.subject) === want) || msgs[0];
            if (pick) { hit = pick; hostMailbox = mb; break; }
          }
        }
      }

      if (!hit) {
        console.log("[ir-original] not-found", JSON.stringify({ to: draft.to, subject: draft.subject, hasConv: Boolean(draft.conversationId) }));
        return NextResponse.json({ original: null });
      }
      const full = await getMessageBody(hostMailbox, hit.id);
      return NextResponse.json({
        original: {
          id: hit.id, subject: hit.subject, from: hit.from, fromName: hit.fromName,
          receivedISO: hit.receivedDateTime, body: full.bodyText,
        },
      });
    } catch (err) {
      console.log("[ir-original] error", String(err).slice(0, 200));
      return NextResponse.json({ error: String(err), original: null }, { status: 200 });
    }
  }

  const diagnostics: Record<string, unknown> = { mailbox: TEAM_MAILBOX, irFolder: IR_FOLDER };

  try {
    const items: AgentInboxItem[] = [];
    const folders: AgentInboxFolder[] = [];

    // 1) The Investor Relations folder + its subfolders (one level of nesting).
    const irFolderId = await resolveFolderId(TEAM_MAILBOX, IR_FOLDER);
    diagnostics.irFolderFound = Boolean(irFolderId);

    if (irFolderId) {
      // Parent folder messages
      const parentMsgs = await listFolderMessages(TEAM_MAILBOX, irFolderId, PER_FOLDER);
      parentMsgs.forEach((m) => items.push(toItem(m, IR_FOLDER, "ir")));
      folders.push({ name: IR_FOLDER, kind: "ir", count: parentMsgs.length });

      // Subfolders (Escalate, Forwarded Drafts, anything else the user created)
      const children = await listChildFolders(TEAM_MAILBOX, irFolderId);
      diagnostics.subfolders = children.map((c) => c.displayName);
      console.log("[ir-folders]", JSON.stringify({
        parentId: irFolderId,
        children: children.map((c) => ({ name: c.displayName, id: c.id.slice(-12), items: c.totalItemCount })),
      }));
      // Merge subfolders that share a display name — some team@ mailboxes ended up with duplicate
      // "Escalate" / "Forwarded Drafts" folders, which otherwise show as duplicate pills. Group by
      // normalized name, pull messages from every matching folder, and dedupe by message id.
      const byName = new Map<string, { name: string; kind: AgentInboxItem["folderKind"]; ids: string[] }>();
      for (const child of children) {
        const key = child.displayName.trim().toLowerCase();
        const g = byName.get(key);
        if (g) g.ids.push(child.id);
        else byName.set(key, { name: child.displayName, kind: folderKind(child.displayName), ids: [child.id] });
      }
      for (const g of byName.values()) {
        const path = `${IR_FOLDER} / ${g.name}`;
        const seen = new Set<string>();
        let count = 0;
        for (const fid of g.ids) {
          const msgs = await listFolderMessages(TEAM_MAILBOX, fid, PER_FOLDER);
          for (const m of msgs) {
            if (seen.has(m.id)) continue;
            seen.add(m.id);
            items.push(toItem(m, path, g.kind));
            count++;
          }
        }
        folders.push({ name: path, kind: g.kind, count });
      }
    }

    // 2) Drafts awaiting approval — show a rolling window (default 3 months) rather than just the
    //    newest page, so older prepared replies stay reviewable. Ordered by last modified, paginated.
    const draftMonths = Math.min(Math.max(Number(process.env.IR_DRAFTS_MONTHS) || 3, 1), 24);
    const draftsSince = new Date();
    draftsSince.setMonth(draftsSince.getMonth() - draftMonths);
    // Drafts now live in each IR lead's OWN mailbox (threaded replies created there), so read Drafts
    // across all of them (team@ kept for any legacy drafts). Owner falls back to the mailbox.
    const draftMailboxes = (process.env.IR_DRAFT_MAILBOXES || `${SEND_AS_MAILBOX},wmeyer@erpfunds.com,${TEAM_MAILBOX}`)
      .split(",").map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const draftSinceIso = draftsSince.toISOString().split(".")[0] + "Z";
    let draftTotal = 0;
    for (const mb of draftMailboxes) {
      try {
        const drafts = await listFolderMessagesSince(mb, "drafts", draftSinceIso, "lastModifiedDateTime", DRAFTS_TOP);
        for (const m of drafts) {
          const it = toItem(m, "Drafts", "draft", mb);
          if (!it.owner) it.owner = mb.includes("wmeyer") ? "William" : mb.includes("mberry") ? "Meghan" : null;
          items.push(it);
          draftTotal++;
        }
      } catch { /* skip a mailbox we can't read */ }
    }

    // Attribute each draft to an IR lead (Meghan/William) + surface when the email it replies to
    // arrived, by matching the draft's conversation to the inbound message in the synced folders.
    const inboundByConversation = new Map<string, AgentInboxItem>();
    for (const it of items) {
      if (it.isDraft || !it.conversationId) continue;
      const prev = inboundByConversation.get(it.conversationId);
      // Prefer the message that tells us the owner; otherwise keep the most recent.
      if (!prev || (!prev.owner && it.owner) ||
          (Boolean(prev.owner) === Boolean(it.owner) && (it.receivedISO || "") > (prev.receivedISO || "")))
        inboundByConversation.set(it.conversationId, it);
    }
    for (const it of items) {
      if (!it.isDraft || !it.conversationId) continue;
      const inbound = inboundByConversation.get(it.conversationId);
      if (inbound) {
        if (!it.owner) it.owner = inbound.owner; // keep the category-derived owner when present
        it.originalReceivedISO = inbound.receivedISO;
      }
    }

    // Divide the drafts queue by IR lead (Meghan / William) instead of one lump. Drafts we can't
    // attribute fall under "Unassigned". Each becomes its own folder/pill in the inbox.
    const draftCounts: Record<string, number> = {};
    for (const it of items) {
      if (!it.isDraft) continue;
      const who = it.owner ?? "Unassigned";
      it.folder = `Drafts · ${who}`;
      draftCounts[who] = (draftCounts[who] ?? 0) + 1;
    }
    for (const who of ["Meghan", "William", "Unassigned"]) {
      if (draftCounts[who]) folders.push({ name: `Drafts · ${who}`, kind: "draft", count: draftCounts[who] });
    }

    // 3) Sent — read each IR lead's Sent Items directly, so this captures replies sent from
    //    OUTLOOK (not just ones sent through the app; app-sends also land in Sent Items). Skip
    //    purely-internal mail. Body loads on demand via ?message=&mailbox.
    let sentCount = 0;
    const sentMailboxes = (process.env.IR_SENT_MAILBOXES || `${SEND_AS_MAILBOX},wmeyer@erpfunds.com`)
      .split(",").map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    const sentSeen = new Set<string>();
    for (const mb of sentMailboxes) {
      const owner: "Meghan" | "William" | null = mb.includes("wmeyer") ? "William" : mb.includes("mberry") ? "Meghan" : null;
      try {
        const sent = await listFolderMessages(mb, "sentitems", 60);
        for (const m of sent) {
          const recips = m.toRecipients ?? [];
          if (recips.length && recips.every((a) => a.toLowerCase().endsWith("@erpfunds.com"))) continue; // internal-only
          if (sentSeen.has(m.internetMessageId || m.id)) continue;
          sentSeen.add(m.internetMessageId || m.id);
          const it = toItem(m, "Sent", "sent", mb);
          it.status = "handled";
          it.owner = owner;
          items.push(it);
          sentCount++;
        }
      } catch { /* skip a mailbox we can't read */ }
    }
    if (sentCount) folders.push({ name: "Sent", kind: "sent", count: sentCount });

    return NextResponse.json({
      mailbox: TEAM_MAILBOX,
      folders,
      items,
      itemCount: items.length,
      draftCount: draftTotal,
      needsReviewCount: items.filter((i) => i.status === "needs-review").length,
      syncedAt: new Date().toISOString(),
      diagnostics,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err), diagnostics },
      { status: 500 }
    );
  }
}

// Approve & send a draft that lives in the team mailbox's Drafts. Irreversible.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    action?: string; id?: string; body?: string; from?: string; to?: string; subject?: string;
    ai?: boolean; context?: LpOutreachInput; mailbox?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Merge duplicate IR subfolders: keep the canonical "Escalate" / "Forwarded Drafts", move any
  // messages out of stray duplicates (e.g. "IR Escalations", "IR Forward Drafts") into them, delete the dupes.
  if (body.action === "merge-ir-folders") {
    try {
      const irId = await resolveFolderId(TEAM_MAILBOX, IR_FOLDER);
      if (!irId) return NextResponse.json({ error: `No "${IR_FOLDER}" folder in ${TEAM_MAILBOX}` }, { status: 404 });
      const children = await listChildFolders(TEAM_MAILBOX, irId);
      const canonEsc = children.find((c) => c.displayName.toLowerCase() === "escalate");
      const canonDrafts = children.find((c) => c.displayName.toLowerCase() === "forwarded drafts");
      const results: string[] = [];
      for (const c of children) {
        const nm = c.displayName.toLowerCase();
        if (nm === "escalate" || nm === "forwarded drafts") continue; // canonical — keep
        const target = /escalat/.test(nm) ? canonEsc : /draft/.test(nm) ? canonDrafts : null;
        if (!target) continue; // not a recognized duplicate — leave untouched
        let moved = 0;
        if (c.totalItemCount > 0) {
          const msgs = await listFolderMessages(TEAM_MAILBOX, c.id, 200);
          for (const m of msgs) { try { await moveMessage(TEAM_MAILBOX, m.id, target.id); moved++; } catch { /* skip */ } }
        }
        try { await deleteFolder(TEAM_MAILBOX, c.id); results.push(`"${c.displayName}" → merged into "${target.displayName}" (${moved} moved), deleted`); }
        catch (e) { results.push(`"${c.displayName}": delete failed — ${String(e).slice(0, 60)}`); }
      }
      return NextResponse.json({ ok: true, merged: results });
    } catch (e) {
      return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
    }
  }

  // Delete a draft so the AI never sends it (moves it to Deleted Items — recoverable in Outlook).
  if (body.action === "delete-draft") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    try {
      await deleteMessage(TEAM_MAILBOX, body.id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: `Delete failed: ${String(e).slice(0, 150)}` }, { status: 500 });
    }
  }

  // Create a new draft in the team hub (surfaces in the IR Inbox for review/send). Used by the
  // "Email" button in the LP directory to start an outreach to an investor. With ai:true it
  // AI-drafts a tailored outreach from the LP context; otherwise it uses the given subject/body.
  if (body.action === "create-draft") {
    const to = (body.to || "").trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 });
    }
    let subject = (body.subject || "").trim() || "ERP Industrials";
    let text = (body.body || "").trim();
    if (body.ai && body.context) {
      try {
        const drafted = await draftLpOutreach(body.context);
        if (drafted.subject) subject = drafted.subject;
        if (drafted.bodyText) text = drafted.bodyText;
      } catch (e) {
        return NextResponse.json({ error: `AI draft failed: ${String(e).slice(0, 150)}` }, { status: 500 });
      }
    }
    const htmlBody = text
      ? text.split(/\n{2,}/).map((p) => `<p>${p.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")
      : "<p></p>";
    // Tag the signer so the draft sorts to Meghan/William in the IR Inbox (default Meghan), and put
    // it in that person's OWN Drafts (mberry@/wmeyer@) so it shows in their Outlook.
    const signer = body.from === "William" ? "William" : "Meghan";
    const draftMailbox = signer === "William" ? "wmeyer@erpfunds.com" : SEND_AS_MAILBOX;
    const r = await saveDraftToOutlook({ toEmail: to, mailboxEmail: draftMailbox, subject, htmlBody, categories: [`IR: ${signer}`] });
    if (!r.success) return NextResponse.json({ error: r.message || "Draft failed" }, { status: 500 });
    return NextResponse.json({ ok: true, draftId: r.draftId });
  }

  // AI-draft an outreach and RETURN it (no send/save) so the compose popup can show it for editing.
  if (body.action === "outreach-preview") {
    if (!body.context) return NextResponse.json({ error: "context required" }, { status: 400 });
    try {
      const d = await draftLpOutreach(body.context);
      return NextResponse.json({ subject: d.subject, body: d.bodyText });
    } catch (e) {
      return NextResponse.json({ error: `AI draft failed: ${String(e).slice(0, 150)}` }, { status: 500 });
    }
  }

  // Compose-and-send from the LP directory popup: sends AS Meghan or William, logs to Salesforce,
  // and drops a copy in team@ Sent (same as the draft-approval path).
  if (body.action === "send-compose") {
    const to = (body.to || "").trim();
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: "A valid recipient email is required" }, { status: 400 });
    }
    const content = (body.body || "").trim();
    if (!content) return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    const subject = (body.subject || "").trim() || "ERP Industrials";
    const sendFrom = body.from === "William" ? "wmeyer@erpfunds.com" : SEND_AS_MAILBOX;
    const senderName = body.from === "William" ? "William Meyer" : "Meghan Berry";
    try {
      await sendMailAs(sendFrom, { to: [to], subject, content, contentType: "Text" });
      // team@ Sent copy (so it shows in team@ Outlook + the app Sent section)
      try {
        const mime = [
          `From: ${senderName} <${sendFrom}>`, `To: ${to}`, `Subject: ${subject}`,
          `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
          "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: 8bit", "", content,
        ].join("\r\n");
        const copyId = await importMimeMessage(TEAM_MAILBOX, "sentitems", Buffer.from(mime, "utf-8").toString("base64"));
        try { await markMessageProcessed({ mailbox: TEAM_MAILBOX, messageId: copyId, internetMessageId: null, isInvestor: true, action: "sent-logged(app)" }); } catch { /* non-fatal */ }
      } catch { /* non-fatal */ }
      // Salesforce log + app Sent-section log
      try {
        await supabase.from("ir_sent").insert({ from_mailbox: sendFrom, to_email: to, subject, body: content, owner: body.from === "William" ? "William" : "Meghan" });
      } catch { /* non-fatal */ }
      if (salesforceConfigured()) {
        try {
          const { note, nextStep } = await composeContactNote({ subject, sentReply: content });
          await logReplyNote({ contactEmail: to, subject, note, nextStep, sentDate: new Date().toISOString() });
        } catch { /* non-fatal */ }
      }
      try { await logAgentRun({ agentId: "ir", workflowId: "ir-reply", status: "success", summary: `Reply sent to ${to} — ${subject}`.slice(0, 200) }); } catch { /* best-effort */ }
      return NextResponse.json({ ok: true, sentFrom: sendFrom });
    } catch (e) {
      return NextResponse.json({ error: `Send failed: ${String(e).slice(0, 200)}` }, { status: 500 });
    }
  }

  // Purge DocuSign notifications from the IR inboxes (moves them to Deleted Items, recoverable).
  if (body.action === "purge-docusign") {
    const targets = (process.env.IR_DOCUSIGN_PURGE_MAILBOXES || `${TEAM_MAILBOX},${SEND_AS_MAILBOX}`)
      .split(",").map((s) => s.trim()).filter(Boolean);
    let deleted = 0;
    const errors: string[] = [];
    for (const mb of targets) {
      try {
        const msgs = await listFolderMessages(mb, "inbox", 150);
        for (const m of msgs) {
          if (/docusign/i.test(m.fromAddress) || /docusign/i.test(m.fromName || "")) {
            try { await deleteMessage(mb, m.id); deleted++; }
            catch (e) { errors.push(`${mb}:${String(e).slice(0, 40)}`); }
          }
        }
      } catch (e) { errors.push(`${mb}:${String(e).slice(0, 60)}`); }
    }
    return NextResponse.json({ ok: true, deleted, errors });
  }

  if (body.action !== "send" || !body.id) {
    return NextResponse.json({ error: "Expected { action: 'send', id }" }, { status: 400 });
  }

  try {
    // The draft lives in the IR lead's own mailbox (or team@ for legacy drafts) — read it from
    // there. The reply is SENT AS a person's own mailbox (default mberry@). We compose a fresh
    // message (edited text wins over the draft body), then remove the now-obsolete draft.
    const draftMailbox = body.mailbox || TEAM_MAILBOX;
    const detail = await getMessageBody(draftMailbox, body.id);
    if (!detail.to.length) {
      return NextResponse.json({ error: "Draft has no recipient" }, { status: 400 });
    }
    const sendFrom = body.from || SEND_AS_MAILBOX;
    const content = typeof body.body === "string" && body.body.trim() ? body.body : detail.bodyText;

    await sendMailAs(sendFrom, { to: detail.to, subject: detail.subject, content, contentType: "Text" });
    // Clean up the draft where it lived (best-effort).
    try { await deleteMessage(draftMailbox, body.id); } catch { /* leave it if delete fails */ }

    // Drop a faithful copy into team@'s Sent Items so BOTH the app and team@ Outlook show what
    // Meghan and William send (the live send saved to the sender's own Sent; team@ is the shared view).
    const senderName = ownerOf([sendFrom]) === "William" ? "William Meyer" : "Meghan Berry";
    try {
      const mime = [
        `From: ${senderName} <${sendFrom}>`,
        `To: ${detail.to.join(", ")}`,
        `Subject: ${detail.subject}`,
        `Date: ${new Date().toUTCString()}`,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=utf-8",
        "Content-Transfer-Encoding: 8bit",
        "",
        content,
      ].join("\r\n");
      const copyId = await importMimeMessage(TEAM_MAILBOX, "sentitems", Buffer.from(mime, "utf-8").toString("base64"));
      // Mark this copy as already-logged so the sent-log cron (which scans team@ Sent for
      // Outlook-sent replies) doesn't double-log a reply the app already logged to Salesforce.
      try { await markMessageProcessed({ mailbox: TEAM_MAILBOX, messageId: copyId, internetMessageId: null, isInvestor: true, action: "sent-logged(app)" }); } catch { /* non-fatal */ }
    } catch { /* non-fatal: sender's own Sent still has the copy */ }

    // Log the sent reply so it surfaces in the IR Inbox "Sent" section (best-effort).
    try {
      await supabase.from("ir_sent").insert({
        from_mailbox: sendFrom,
        to_email: detail.to[0] ?? null,
        subject: detail.subject,
        body: content,
        owner: ownerOf([sendFrom]),
      });
    } catch { /* non-fatal */ }
    // Feed the AI Command Center activity log.
    try { await logAgentRun({ agentId: "ir", workflowId: "ir-reply", status: "success", summary: `Reply sent to ${detail.to[0] ?? ""} — ${detail.subject}`.slice(0, 200) }); } catch { /* best-effort */ }

    // Workflow #3: AI-driven note from what was actually sent, logged to the Salesforce contact(s).
    let note = "note-skip(no SF creds)";
    if (salesforceConfigured()) {
      try {
        const { note: noteText, nextStep } = await composeContactNote({ subject: detail.subject, sentReply: content });
        const recipients = detail.to.filter((a) => !a.toLowerCase().endsWith("@erpfunds.com"));
        const sentDate = new Date().toISOString();
        const results = await Promise.all(
          recipients.map((to) =>
            logReplyNote({ contactEmail: to, subject: detail.subject, note: noteText, nextStep, sentDate })
              .catch((e) => `sf-fail(${String(e).slice(0, 60)})`)
          )
        );
        note = recipients.length ? `note-logged: ${results.join("; ")}` : "note-skip(no external recipient)";
      } catch (e) {
        note = `note-fail(${String(e).slice(0, 80)})`;
      }
    }

    return NextResponse.json({ ok: true, sent: body.id, sentFrom: sendFrom, note });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
