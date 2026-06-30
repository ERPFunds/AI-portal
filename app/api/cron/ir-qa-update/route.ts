import { NextRequest, NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { extractQaPairs } from "@/lib/agents/ir/qa-extractor";
import { insertPendingQa, filterUnprocessedSentIds, markSentProcessed } from "@/lib/agents/ir/qa-store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Mailboxes whose SENT replies are mined for Q&A (the people who answer investors).
function qaMailboxes(): string[] {
  return (process.env.IR_QA_MAILBOXES || "mberry@erpfunds.com")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

const LOOKBACK_DAYS = 3;
const MAX_PER_MAILBOX = 40;

interface SentMsg {
  id: string;
  internetMessageId: string | null;
  subject: string;
  body: string;
  sentDateTime: string;
  external: boolean;
}

async function fetchRecentSent(token: string, mailbox: string): Promise<SentMsg[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().split(".")[0] + "Z";
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/mailFolders/sentitems/messages` +
    `?$filter=${encodeURIComponent(`sentDateTime ge ${since}`)}` +
    `&$select=id,internetMessageId,subject,sentDateTime,toRecipients,body&$orderby=sentDateTime desc&$top=${MAX_PER_MAILBOX}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  if (!res.ok) throw new Error(`Graph sent ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.value || []).map((m: {
    id: string; internetMessageId?: string; subject?: string; sentDateTime: string;
    toRecipients?: { emailAddress?: { address?: string } }[]; body?: { content?: string };
  }): SentMsg => {
    const to = (m.toRecipients || []).map((r) => r.emailAddress?.address || "");
    return {
      id: m.id,
      internetMessageId: m.internetMessageId ?? null,
      subject: m.subject || "",
      body: m.body?.content || "",
      sentDateTime: m.sentDateTime,
      external: to.some((a) => a && !a.toLowerCase().endsWith("@erpfunds.com")),
    };
  });
}

async function handleMailbox(token: string, mailbox: string, dryRun: boolean) {
  const sent = (await fetchRecentSent(token, mailbox)).filter((m) => m.external);
  const fresh = await filterUnprocessedSentIds(mailbox, sent.map((m) => m.id));
  const todo = sent.filter((m) => fresh.has(m.id)).reverse(); // oldest first

  let scanned = 0, added = 0;
  for (const m of todo) {
    scanned++;
    let pairs: { question: string; answer: string; category: string }[] = [];
    try {
      pairs = await extractQaPairs({ subject: m.subject, body: m.body });
    } catch { /* skip this message on extractor error */ }

    if (!dryRun) {
      if (pairs.length) {
        added += await insertPendingQa(
          pairs.map((p) => ({
            question: p.question, answer: p.answer, category: p.category,
            sourceSubject: m.subject, sourceMailbox: mailbox, sourceSentAt: m.sentDateTime,
          }))
        );
      }
      await markSentProcessed({ mailbox, messageId: m.id, internetMessageId: m.internetMessageId, extracted: pairs.length });
    } else {
      added += pairs.length;
    }
  }
  return { mailbox, sent: sent.length, scanned, added };
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  let token: string | null;
  try { token = await getGraphToken(); } catch (e) { return NextResponse.json({ error: `Graph auth failed: ${String(e)}` }, { status: 500 }); }
  if (!token) return NextResponse.json({ error: "AZURE credentials not configured" }, { status: 503 });

  const results = [];
  for (const mailbox of qaMailboxes()) {
    try { results.push(await handleMailbox(token, mailbox, dryRun)); }
    catch (e) { results.push({ mailbox, error: String(e).slice(0, 200) }); }
  }
  return NextResponse.json({ ok: true, dryRun, ranAt: new Date().toISOString(), results });
}
