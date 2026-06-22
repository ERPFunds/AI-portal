import { NextRequest, NextResponse } from "next/server";
import { classifyInquiry } from "@/lib/agents/ir/inquiry-classifier";
import {
  listInboxMessages,
  resolveFolderId,
  moveMessage,
  forwardMessage,
} from "@/lib/agents/ir/graph-mailbox";
import { filterUnprocessedMessageIds, markMessageProcessed } from "@/lib/db";
import { logCorrespondence, salesforceConfigured } from "@/lib/agents/ir/salesforce";

export const maxDuration = 300;

const TEAM_INBOX = "team@erpfunds.com";
const IR_FOLDER = "Investor Relations";
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
  dryRun: boolean
): Promise<{ mailbox: string; scanned: number; fresh: number; investor: number; details: string[] }> {
  const details: string[] = [];
  const messages = await listInboxMessages(mailbox, TOP_PER_MAILBOX);
  const fresh = await filterUnprocessedMessageIds(
    mailbox,
    messages.map((m) => m.id)
  );
  // oldest first so the dedup ledger fills in chronological order
  const todo = messages.filter((m) => fresh.has(m.id)).reverse();

  // resolve the IR folder once per mailbox (only needed if we'll move something)
  let folderId: string | null = null;
  let investorCount = 0;

  for (const m of todo) {
    const verdict = await classifyInquiry({ from: m.fromAddress, subject: m.subject, body: m.bodyPreview });
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
      details.push(`IGNORE ${m.fromAddress} — ${verdict.reason}`);
      continue;
    }

    investorCount++;
    if (dryRun) {
      details.push(`INVESTOR(dry) ${m.fromAddress} (${verdict.contact.firstName ?? ""} ${verdict.contact.lastName}) — ${verdict.reason}`);
      continue;
    }

    const actions: string[] = [];

    // 1) forward to the team hub (best-effort)
    try {
      await forwardMessage(
        mailbox,
        m.id,
        TEAM_INBOX,
        `IR auto-triage — investor/broker inquiry received in ${mailbox}. ${verdict.reason}`
      );
      actions.push("forwarded");
    } catch (e) {
      actions.push(`forward-fail(${String(e).slice(0, 60)})`);
    }

    // 2) Salesforce: find-or-create the Contact + log a correspondence Task (direct REST)
    actions.push(
      await logToSalesforce({
        investorEmail: m.fromAddress,
        firstName: verdict.contact.firstName ?? "",
        lastName: verdict.contact.lastName,
        subject: m.subject,
        snippet: m.bodyPreview.slice(0, 500),
        receivedDate: m.receivedDateTime,
        sourceMailbox: mailbox,
      })
    );

    // 3) file into the Investor Relations folder (best-effort; needs Mail.ReadWrite)
    try {
      if (folderId === null) folderId = await resolveFolderId(mailbox, IR_FOLDER);
      if (folderId) {
        await moveMessage(mailbox, m.id, folderId);
        actions.push("filed");
      } else {
        actions.push("file-skip(no IR folder)");
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
  const mailboxOverride = params.get("mailbox")?.trim();

  if (!force && process.env.IR_SWEEP_ENABLED !== "true") {
    return NextResponse.json({ skipped: "IR_SWEEP_ENABLED is not 'true'" });
  }
  if (!force && !withinCentralBusinessHours()) {
    return NextResponse.json({ skipped: "outside 8am-8pm CT" });
  }

  const mailboxes = mailboxOverride ? [mailboxOverride] : sweepMailboxes();
  if (mailboxes.length === 0) {
    return NextResponse.json({ skipped: "no mailboxes configured (set IR_SWEEP_MAILBOXES)" });
  }

  const results = [];
  for (const mailbox of mailboxes) {
    try {
      results.push(await handleMailbox(mailbox, dryRun));
    } catch (e) {
      results.push({ mailbox, error: String(e) });
    }
  }
  return NextResponse.json({ ok: true, dryRun, ranAt: new Date().toISOString(), results });
}
