import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Default source mailboxes for the historical catch-up.
const DEFAULT_MAILBOXES = "mberry@erpfunds.com,wmeyer@erpfunds.com";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Runs the IR inbox sweep over a historical window by calling the (cron-secret-protected)
// sweep endpoint internally with force=1 — so this stays a normal, session-authenticated
// portal action (no cron secret exposed to the client, no waiting for the schedule).
async function runBackfill(req: NextRequest, months: number, dryRun: boolean, mailboxes: string, max: number) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { error: "CRON_SECRET not configured on the server" };
  const url =
    `${req.nextUrl.origin}/api/cron/ir-inbox-sweep` +
    `?force=1&sinceMonths=${months}&max=${max}&dryRun=${dryRun ? 1 : 0}&mailbox=${encodeURIComponent(mailboxes)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  const data = await res.json().catch(() => ({ error: `sweep returned ${res.status}` }));
  return data;
}

// GET — safe preview (dry run by default). e.g. /api/agent-inbox/backfill?months=1
export async function GET(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const months = Math.min(Math.max(Number(p.get("months")) || 1, 1), 24);
  const dryRun = p.get("dryRun") !== "0"; // default: dry run
  const max = Math.min(Math.max(Number(p.get("max")) || 60, 1), 300);
  const mailboxes = p.get("mailboxes")?.trim() || DEFAULT_MAILBOXES;
  return NextResponse.json(await runBackfill(req, months, dryRun, mailboxes, max));
}

// POST — run for real (files into the IR subfolders). Body: { months, dryRun, mailboxes, max }
export async function POST(req: NextRequest) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { mailboxes?: string; months?: number; dryRun?: boolean; max?: number } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const months = Math.min(Math.max(body.months ?? 1, 1), 24);
  const dryRun = body.dryRun ?? false;
  const max = Math.min(Math.max(body.max ?? 60, 1), 300);
  const mailboxes = body.mailboxes?.trim() || DEFAULT_MAILBOXES;
  return NextResponse.json(await runBackfill(req, months, dryRun, mailboxes, max));
}
