import { NextRequest, NextResponse } from "next/server";
import { listMessagesFrom } from "@/lib/agents/ir/graph-mailbox";
import { getMessageBodyText } from "@/lib/agents/ir/dd-responder";
import { classifyInvestorEmail } from "@/lib/agents/ir/email-classifier";
import { createReplyDraft } from "@/lib/agents/ir/graph-mail";
import { markMessageProcessed } from "@/lib/db";

export const maxDuration = 120;

// Targeted "find & draft": search a mailbox (ALL folders — inbox + subfolders) for the most recent
// email from `sender` and prepare a threaded reply draft (Arial 10 + signature, IR: Meghan tag), the
// same as the sweep. Use to draft a reply for a message that never made it through the sweep (e.g.
// filed to a subfolder, or classified out before the known-sender fix). Auth: Bearer CRON_SECRET.
//   ?sender=ethan@g3capitalwealth.com   (required)
//   ?mailbox=mberry@erpfunds.com,team@erpfunds.com   (default; searched in order)
//   ?max=1   how many of the most-recent matches to draft (1–5)
//   ?dryRun=1   list matches without drafting
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sender = (req.nextUrl.searchParams.get("sender") || "").trim().toLowerCase();
  if (!sender || !sender.includes("@")) return NextResponse.json({ error: "sender=<email> required" }, { status: 400 });
  const mailboxes = (req.nextUrl.searchParams.get("mailbox") || "mberry@erpfunds.com,team@erpfunds.com")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const max = Math.min(Math.max(Number(req.nextUrl.searchParams.get("max")) || 1, 1), 5);
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  const results: Record<string, unknown>[] = [];
  let drafted = 0;
  try {
    for (const mailbox of mailboxes) {
      let hits;
      try { hits = await listMessagesFrom(mailbox, sender, 25); }
      catch (e) { results.push({ mailbox, error: String(e).slice(0, 120) }); continue; }
      const real = hits.filter((h) => !h.isDraft).slice(0, max);
      if (real.length === 0) { results.push({ mailbox, found: 0 }); continue; }

      for (const h of real) {
        if (dryRun) { results.push({ mailbox, subject: h.subject, date: h.receivedDateTime.slice(0, 10), action: "would-draft" }); continue; }
        const body = (await getMessageBodyText(mailbox, h.id)) || "";
        const c = await classifyInvestorEmail({ from: sender, subject: h.subject, body, signAs: "Meghan Berry" });
        const r = await createReplyDraft({ mailbox, originalMessageId: h.id, htmlBody: c.draftHtml, categories: ["IR: Meghan"] });
        if (r.success) drafted++;
        await markMessageProcessed({ mailbox, messageId: h.id, internetMessageId: null, isInvestor: true, action: r.success ? "manual-drafted" : `manual-draft-fail`, fromAddress: sender, subject: h.subject });
        results.push({ mailbox, subject: h.subject, date: h.receivedDateTime.slice(0, 10), drafted: r.success, isEscalation: c.isEscalation, message: r.message });
      }
      if (drafted > 0) break; // drafted from the first mailbox that had the original; stop
    }
    return NextResponse.json({ ok: true, sender, dryRun, drafted, results });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
