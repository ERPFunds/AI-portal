import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listInboxMessages } from "@/lib/agents/ir/graph-mailbox";

export const dynamic = "force-dynamic";

// Read-only diagnostic: shows why the IR inbox sweep is/ isn't running. Session-authed
// (no CRON_SECRET needed). Never exposes secret VALUES — only presence + gating state.
function withinCentralBusinessHours(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(new Date())
  );
  return hour >= 8 && hour < 20;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const mailboxes = (process.env.IR_SWEEP_MAILBOXES || "").split(",").map((s) => s.trim()).filter(Boolean);

  const perMailbox: Array<{ mailbox: string; ok: boolean; inboxSample?: number; error?: string }> = [];
  for (const mb of mailboxes) {
    try {
      const msgs = await listInboxMessages(mb, 5);
      perMailbox.push({ mailbox: mb, ok: true, inboxSample: msgs.length });
    } catch (e) {
      perMailbox.push({ mailbox: mb, ok: false, error: String(e).slice(0, 180) });
    }
  }

  return NextResponse.json({
    enabled: process.env.IR_SWEEP_ENABLED === "true",
    enabledValuePresent: process.env.IR_SWEEP_ENABLED !== undefined,
    mailboxesConfigured: mailboxes,
    withinBusinessHoursCT: withinCentralBusinessHours(),
    nowCT: new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "short", timeStyle: "short" }).format(new Date()),
    cronSecretSet: !!process.env.CRON_SECRET,
    graphConfigured: !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET),
    perMailbox,
    note: "sweep runs only when enabled===true AND mailboxesConfigured is non-empty AND withinBusinessHoursCT. perMailbox errors reveal Graph/permission issues.",
  });
}
