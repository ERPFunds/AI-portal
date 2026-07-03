import { NextRequest, NextResponse } from "next/server";
import { listFolderMessages, getMessageBody } from "@/lib/agents/ir/graph-mailbox";
import { filterUnprocessedMessageIds, markMessageProcessed } from "@/lib/db";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { composeContactNote } from "@/lib/agents/ir/contact-note";

export const maxDuration = 300;

// The shared IR hub. Replies sent from the team@ shared mailbox (in Outlook) OR copied here by
// the app land in team@'s Sent Items. This cron logs the ones that WEREN'T already logged by the
// app's send flow (i.e. replies Meghan/William sent straight from Outlook) to Salesforce.
const TEAM_MAILBOX = process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";
const MAX_PER_RUN = 15; // cap Claude/SF work per run; the cron catches up over successive runs

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.IR_SENT_LOG_ENABLED === "false") return NextResponse.json({ skipped: "disabled" });
  if (!salesforceConfigured()) return NextResponse.json({ skipped: "no SF creds" });

  try {
    const msgs = await listFolderMessages(TEAM_MAILBOX, "sentitems", 60, "lastModifiedDateTime desc");
    const fresh = await filterUnprocessedMessageIds(TEAM_MAILBOX, msgs.map((m) => m.id));
    const todo = msgs.filter((m) => fresh.has(m.id)).slice(0, MAX_PER_RUN);

    const details: string[] = [];
    let logged = 0;
    for (const m of todo) {
      const external = (m.toRecipients || []).filter((a) => a && !a.toLowerCase().endsWith("@erpfunds.com"));
      if (external.length === 0) {
        // Internal-only sent mail — nothing to log to a CRM contact.
        await markMessageProcessed({ mailbox: TEAM_MAILBOX, messageId: m.id, internetMessageId: m.internetMessageId, isInvestor: false, action: "sent-skip-internal" });
        continue;
      }
      let action = "sent-logged(outlook)";
      try {
        const full = await getMessageBody(TEAM_MAILBOX, m.id);
        const subject = full.subject || m.subject;
        const { note, nextStep } = await composeContactNote({ subject, sentReply: full.bodyText || m.bodyPreview });
        const sentDate = (m.lastModifiedDateTime || m.receivedDateTime || new Date().toISOString());
        for (const to of external) {
          try { await logReplyNote({ contactEmail: to, subject, note, nextStep, sentDate }); logged++; }
          catch (e) { action = `sf-fail(${String(e).slice(0, 40)})`; }
        }
        if (details.length < 6) details.push(`${external.join(",")} — ${subject}`);
      } catch (e) {
        action = `err(${String(e).slice(0, 60)})`;
      }
      await markMessageProcessed({ mailbox: TEAM_MAILBOX, messageId: m.id, internetMessageId: m.internetMessageId, isInvestor: true, action });
    }

    console.log("[ir-sent-log]", JSON.stringify({ scanned: msgs.length, processed: todo.length, logged, sample: details }));
    return NextResponse.json({ ok: true, scanned: msgs.length, processed: todo.length, logged, details });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
