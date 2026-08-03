import { NextRequest, NextResponse } from "next/server";
import { listFolderMessages, getMessageBody } from "@/lib/agents/ir/graph-mailbox";
import { filterUnprocessedMessageIds, markMessageProcessed } from "@/lib/db";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { composeContactNote } from "@/lib/agents/ir/contact-note";
import { loadInvestorLookup } from "@/lib/agents/ir/lp-lookup";

export const maxDuration = 300;

// The shared IR hub. Replies sent from the team@ shared mailbox (in Outlook) OR copied here by
// the app land in team@'s Sent Items. This cron logs replies that WEREN'T already logged by the
// app's send flow — including replies Meghan sends straight from her own Outlook — to Salesforce.
const TEAM_MAILBOX = process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";
const MAX_PER_RUN = 20; // cap Claude/SF work per run (total across mailboxes); the cron catches up
// Mailboxes whose Sent Items we scan. team@ is the IR-only shared hub, so we log every external
// reply there. The IR leads' own mailboxes also hold personal mail — Meghan replies to investors
// straight from Outlook — so there we log ONLY replies to a KNOWN INVESTOR (from the LP Directory).
const SCAN_MAILBOXES = (process.env.IR_SENT_LOG_MAILBOXES || `${TEAM_MAILBOX},mberry@erpfunds.com`)
  .split(",").map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.IR_SENT_LOG_ENABLED === "false") return NextResponse.json({ skipped: "disabled" });
  if (!salesforceConfigured()) return NextResponse.json({ skipped: "no SF creds" });

  try {
    const investors = await loadInvestorLookup();
    const details: string[] = [];
    let logged = 0, scanned = 0, processed = 0, budget = MAX_PER_RUN;

    for (const mailbox of SCAN_MAILBOXES) {
      if (budget <= 0) break;
      // team@ is IR-only (log every external reply); a lead's personal mailbox is investor-filtered.
      const investorFilter = mailbox.toLowerCase() !== TEAM_MAILBOX.toLowerCase();
      let msgs;
      try { msgs = await listFolderMessages(mailbox, "sentitems", 60, "lastModifiedDateTime desc"); }
      catch { continue; }
      scanned += msgs.length;
      const fresh = await filterUnprocessedMessageIds(mailbox, msgs.map((m) => m.id));
      const todo = msgs.filter((m) => fresh.has(m.id)).slice(0, budget);

      for (const m of todo) {
        const external = (m.toRecipients || []).filter((a) => a && !a.toLowerCase().endsWith("@erpfunds.com"));
        // On a personal mailbox, keep only recipients that are known investors (skip personal mail).
        const targets = investorFilter ? external.filter((a) => investors.isInvestor(a)) : external;
        if (targets.length === 0) {
          const action = external.length === 0 ? "sent-skip-internal" : "sent-skip-non-investor";
          await markMessageProcessed({ mailbox, messageId: m.id, internetMessageId: m.internetMessageId, isInvestor: false, action });
          continue;
        }
        processed++; budget--;
        let action = `sent-logged(${mailbox.split("@")[0]})`;
        try {
          const full = await getMessageBody(mailbox, m.id);
          const subject = full.subject || m.subject;
          const body = full.bodyText || m.bodyPreview;
          const { note, nextStep } = await composeContactNote({ subject, sentReply: body });
          const sentDate = (m.lastModifiedDateTime || m.receivedDateTime || new Date().toISOString());
          for (const to of targets) {
            try { await logReplyNote({ contactEmail: to, subject, note, nextStep, sentDate, emailBody: body, investorName: investors.nameFor(to) }); logged++; }
            catch (e) { action = `sf-fail(${String(e).slice(0, 40)})`; }
          }
          if (details.length < 8) details.push(`${mailbox.split("@")[0]} → ${targets.join(",")} — ${subject}`);
        } catch (e) {
          action = `err(${String(e).slice(0, 60)})`;
        }
        await markMessageProcessed({ mailbox, messageId: m.id, internetMessageId: m.internetMessageId, isInvestor: true, action });
      }
    }

    console.log("[ir-sent-log]", JSON.stringify({ mailboxes: SCAN_MAILBOXES, scanned, processed, logged, sample: details }));
    return NextResponse.json({ ok: true, mailboxes: SCAN_MAILBOXES, scanned, processed, logged, details });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
