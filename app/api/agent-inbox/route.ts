import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveFolderId,
  listChildFolders,
  listFolderMessages,
  getMessageBody,
  sendDraftMessage,
  type MailItem,
} from "@/lib/agents/ir/graph-mailbox";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { composeContactNote } from "@/lib/agents/ir/contact-note";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Shared mailbox the IR (Agent 2) traffic lands in. Overridable via env.
const TEAM_MAILBOX = process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";
// Top-level folder whose subtree we mirror into the Agent Inbox.
const IR_FOLDER = process.env.IR_FOLDER_NAME || "Investor Relations";
const PER_FOLDER = 30; // messages to pull per folder
const DRAFTS_TOP = 30;

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
      for (const child of children) {
        const path = `${IR_FOLDER} / ${child.displayName}`;
        const kind = folderKind(child.displayName);
        const msgs = await listFolderMessages(TEAM_MAILBOX, child.id, PER_FOLDER);
        msgs.forEach((m) => items.push(toItem(m, path, kind)));
        folders.push({ name: path, kind, count: msgs.length });
      }
    }

    // 2) Drafts awaiting approval (drafts have no received date — order by last modified).
    const drafts = await listFolderMessages(
      TEAM_MAILBOX,
      "drafts",
      DRAFTS_TOP,
      "lastModifiedDateTime desc"
    );
    drafts.forEach((m) => items.push(toItem(m, "Drafts (awaiting approval)", "draft")));
    folders.push({ name: "Drafts (awaiting approval)", kind: "draft", count: drafts.length });

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

  let body: { action?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action !== "send" || !body.id) {
    return NextResponse.json({ error: "Expected { action: 'send', id }" }, { status: 400 });
  }

  try {
    // Read the reply content BEFORE sending (it leaves Drafts once sent).
    let detail: { subject: string; to: string[]; bodyText: string } | null = null;
    try {
      detail = await getMessageBody(TEAM_MAILBOX, body.id);
    } catch {
      detail = null;
    }

    await sendDraftMessage(TEAM_MAILBOX, body.id);

    // Workflow #3: AI-driven note from what was sent, logged to the Salesforce contact(s).
    let note = "note-skip(no SF creds)";
    if (detail && salesforceConfigured()) {
      try {
        const { note: noteText, nextStep } = await composeContactNote({
          subject: detail.subject,
          sentReply: detail.bodyText,
        });
        const recipients = detail.to.filter((a) => !a.toLowerCase().endsWith("@erpfunds.com"));
        const sentDate = new Date().toISOString();
        const results = await Promise.all(
          recipients.map((to) =>
            logReplyNote({ contactEmail: to, subject: detail!.subject, note: noteText, nextStep, sentDate })
              .catch((e) => `sf-fail(${String(e).slice(0, 60)})`)
          )
        );
        note = recipients.length ? `note-logged: ${results.join("; ")}` : "note-skip(no external recipient)";
      } catch (e) {
        note = `note-fail(${String(e).slice(0, 80)})`;
      }
    }

    return NextResponse.json({ ok: true, sent: body.id, sentBy: user.email ?? null, note });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
