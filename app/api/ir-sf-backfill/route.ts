import { NextRequest, NextResponse } from "next/server";
import { listFolderMessagesSince, getMessageBody } from "@/lib/agents/ir/graph-mailbox";
import { getAlreadyLoggedSentIds, recordSentLogged } from "@/lib/db";
import { salesforceConfigured, logReplyNote } from "@/lib/agents/ir/salesforce";
import { loadInvestorLookup } from "@/lib/agents/ir/lp-lookup";

export const maxDuration = 300;

// Retroactively log Meghan's PAST sent replies to investors into Salesforce — creating the Contact
// (linked to its Account when we can match one) and logging the actual email as a completed activity.
// Only replies to KNOWN INVESTORS (from the LP Directory) are logged, so personal mail is left alone.
//
// Auth: Bearer CRON_SECRET.  Dry-run by default — pass ?apply=1 to actually write to Salesforce.
//   ?months=6         how far back to scan (1–36, default 6)
//   ?mailbox=...      default mberry@erpfunds.com
//   ?max=150          max messages to LOG per run (dedup lets you re-run to continue)
//   ?scan=1500        max sent messages to fetch/scan per run
//   ?apply=1          WRITE to Salesforce (omit for a dry run that changes nothing)
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!salesforceConfigured()) return NextResponse.json({ error: "no SF creds" }, { status: 503 });

  const p = req.nextUrl.searchParams;
  const apply = p.get("apply") === "1";
  const months = Math.min(Math.max(Number(p.get("months")) || 6, 1), 36);
  const mailbox = (p.get("mailbox") || "mberry@erpfunds.com").trim();
  const maxLog = Math.min(Math.max(Number(p.get("max")) || 150, 1), 500);
  const scanMax = Math.min(Math.max(Number(p.get("scan")) || 1500, 50), 4000);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceIso = since.toISOString().split(".")[0] + "Z";

  try {
    const investors = await loadInvestorLookup();
    if (investors.emailToName.size === 0) {
      return NextResponse.json({ error: "LP directory investor list is empty — sync the LP directory first" }, { status: 409 });
    }

    const msgs = await listFolderMessagesSince(mailbox, "sentitems", sinceIso, "sentDateTime", scanMax);
    const alreadyLogged = await getAlreadyLoggedSentIds(mailbox, msgs.map((m) => m.id));

    // Candidate = a fresh sent message with at least one known-investor recipient.
    type Cand = { id: string; iid: string | null; to: string[]; subject: string; date: string };
    const candidates: Cand[] = [];
    const distinctContacts = new Set<string>();
    for (const m of msgs) {
      if (alreadyLogged.has(m.id)) continue;
      const targets = (m.toRecipients || [])
        .filter((a) => a && !a.toLowerCase().endsWith("@erpfunds.com") && investors.isInvestor(a));
      if (targets.length === 0) continue;
      targets.forEach((t) => distinctContacts.add(t.toLowerCase()));
      candidates.push({ id: m.id, iid: m.internetMessageId, to: targets, subject: m.subject, date: m.lastModifiedDateTime || m.receivedDateTime || "" });
    }

    if (!apply) {
      return NextResponse.json({
        dryRun: true, mailbox, months, scanned: msgs.length,
        candidateMessages: candidates.length, distinctInvestorContacts: distinctContacts.size,
        note: "Nothing was written. Re-run with &apply=1 to log these to Salesforce.",
        sample: candidates.slice(0, 12).map((c) => ({ to: c.to.join(", "), subject: c.subject, date: c.date.slice(0, 10) })),
      });
    }

    // Apply: log each candidate (up to maxLog) to Salesforce, then mark it so re-runs continue.
    let logged = 0;
    const contactsTouched = new Set<string>();
    const errors: string[] = [];
    for (const c of candidates.slice(0, maxLog)) {
      let action = "sf-backfill-logged";
      try {
        const full = await getMessageBody(mailbox, c.id);
        const body = full.bodyText || "";
        const subject = full.subject || c.subject;
        const sentDate = c.date || new Date().toISOString();
        for (const to of c.to) {
          try {
            await logReplyNote({ contactEmail: to, subject, note: "", nextStep: "none", sentDate, emailBody: body, investorName: investors.nameFor(to) });
            logged++; contactsTouched.add(to.toLowerCase());
          } catch (e) { errors.push(`${to}: ${String(e).slice(0, 80)}`); action = "sf-backfill-partial"; }
        }
      } catch (e) {
        errors.push(`${c.id}: ${String(e).slice(0, 80)}`); action = "sf-backfill-err";
      }
      await recordSentLogged(mailbox, c.id, c.iid, action);
    }

    return NextResponse.json({
      dryRun: false, mailbox, months, scanned: msgs.length,
      candidateMessages: candidates.length, processed: Math.min(candidates.length, maxLog),
      logged, contactsTouched: contactsTouched.size,
      remaining: Math.max(0, candidates.length - maxLog),
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
