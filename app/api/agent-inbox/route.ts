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
  type MailItem,
} from "@/lib/agents/ir/graph-mailbox";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { composeContactNote } from "@/lib/agents/ir/contact-note";
import { saveDraftToOutlook } from "@/lib/agents/ir/graph-mail";
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
  folderKind: "ir" | "escalate" | "forwarded-drafts" | "draft";
  status: ItemStatus;
  isDraft: boolean;
  webLink: string | null;
  conversationId: string | null;
  owner: "Meghan" | "William" | null; // which IR lead's thread this belongs to
  originalReceivedISO: string | null;  // when the inbound email this draft replies to arrived
}

// Which IR lead a message belongs to, from its recipients (the mailbox the investor wrote to).
function ownerOf(addrs: string[]): "Meghan" | "William" | null {
  const s = addrs.map((a) => a.toLowerCase());
  if (s.some((a) => a.includes("mberry@"))) return "Meghan";
  if (s.some((a) => a.includes("wmeyer@"))) return "William";
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

// Folders flagged for review surface as "needs-review"; the forwarded-draft
// queue is "pending"; everything else in the IR tree is an active thread.
function statusForFolder(kind: AgentInboxItem["folderKind"]): ItemStatus {
  if (kind === "escalate") return "needs-review";
  if (kind === "forwarded-drafts") return "pending";
  return "active-thread";
}

function toItem(
  m: MailItem,
  folderPath: string,
  kind: AgentInboxItem["folderKind"]
): AgentInboxItem {
  const isDraft = kind === "draft" || m.isDraft;
  return {
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
    owner: isDraft ? null : ownerOf(m.toRecipients),
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
      const m = await getMessageBody(TEAM_MAILBOX, messageId);
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
      const draft = await getMessageBody(TEAM_MAILBOX, originalOf);
      const searchMailboxes = [TEAM_MAILBOX, SEND_AS_MAILBOX].filter((v, i, a) => a.indexOf(v) === i);
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
      for (const child of children) {
        const path = `${IR_FOLDER} / ${child.displayName}`;
        const kind = folderKind(child.displayName);
        const msgs = await listFolderMessages(TEAM_MAILBOX, child.id, PER_FOLDER);
        msgs.forEach((m) => items.push(toItem(m, path, kind)));
        folders.push({ name: path, kind, count: msgs.length });
      }
    }

    // 2) Drafts awaiting approval — show a rolling window (default 3 months) rather than just the
    //    newest page, so older prepared replies stay reviewable. Ordered by last modified, paginated.
    const draftMonths = Math.min(Math.max(Number(process.env.IR_DRAFTS_MONTHS) || 3, 1), 24);
    const draftsSince = new Date();
    draftsSince.setMonth(draftsSince.getMonth() - draftMonths);
    const drafts = await listFolderMessagesSince(
      TEAM_MAILBOX,
      "drafts",
      draftsSince.toISOString().split(".")[0] + "Z",
      "lastModifiedDateTime",
      DRAFTS_TOP
    );
    drafts.forEach((m) => items.push(toItem(m, "Drafts (awaiting approval)", "draft")));
    folders.push({ name: "Drafts (awaiting approval)", kind: "draft", count: drafts.length });

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
        it.owner = inbound.owner;
        it.originalReceivedISO = inbound.receivedISO;
      }
    }

    return NextResponse.json({
      mailbox: TEAM_MAILBOX,
      folders,
      items,
      itemCount: items.length,
      draftCount: drafts.length,
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
    ai?: boolean; context?: LpOutreachInput;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
    const r = await saveDraftToOutlook({ toEmail: to, mailboxEmail: TEAM_MAILBOX, subject, htmlBody });
    if (!r.success) return NextResponse.json({ error: r.message || "Draft failed" }, { status: 500 });
    return NextResponse.json({ ok: true, draftId: r.draftId });
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
    // Read the draft's recipients/subject/body. The reply is SENT AS a person's own mailbox
    // (default mberry@) — not from the team hub where it was triaged/drafted — so it comes from
    // Meghan. We compose a fresh message (edited text wins over the draft body), then remove the
    // now-obsolete team@ draft.
    const detail = await getMessageBody(TEAM_MAILBOX, body.id);
    if (!detail.to.length) {
      return NextResponse.json({ error: "Draft has no recipient" }, { status: 400 });
    }
    const sendFrom = body.from || SEND_AS_MAILBOX;
    const content = typeof body.body === "string" && body.body.trim() ? body.body : detail.bodyText;

    await sendMailAs(sendFrom, { to: detail.to, subject: detail.subject, content, contentType: "Text" });
    // Clean up the draft that lived in the team hub (best-effort).
    try { await deleteMessage(TEAM_MAILBOX, body.id); } catch { /* leave it if delete fails */ }

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
