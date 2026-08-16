import { NextRequest, NextResponse } from "next/server";
import { salesforceConfigured, listRecentAgentAdditions, type AgentAdditions } from "@/lib/agents/ir/salesforce";
import { sendMailAs } from "@/lib/agents/ir/graph-mailbox";

export const maxDuration = 120;

// Weekly digest to Meghan + Michele: what the IR agent added to Salesforce in the last 7 days —
// new contacts (created) and emails logged as activities. Auth: Bearer CRON_SECRET.
//   ?days=7   window (default 7)     ?send=0   preview the payload without emailing
const DEFAULT_TO = "mberry@erpfunds.com,mparad@erpfunds.com";

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const d = (iso: string) => (iso || "").slice(0, 10);

function buildHtml(add: AgentAdditions, days: number, rangeLabel: string): string {
  const S = "font-family:Arial,Helvetica,sans-serif;";
  const th = `style="${S}text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;border-bottom:1px solid #e5e7eb;padding:6px 10px;"`;
  const td = `style="${S}font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;padding:6px 10px;vertical-align:top;"`;
  const contactRows = add.contacts.length
    ? add.contacts.map((c) => `<tr><td ${td}>${esc(c.name)}</td><td ${td}>${esc(c.email)}</td><td ${td}>${esc(c.account || "—")}</td><td ${td}>${d(c.created)}</td></tr>`).join("")
    : `<tr><td ${td} colspan="4"><em>No new contacts created this week.</em></td></tr>`;
  const taskRows = add.tasks.length
    ? add.tasks.map((t) => `<tr><td ${td}>${esc(t.who || "—")}</td><td ${td}>${esc(t.subject.replace(/^Email:\s*/i, ""))}</td><td ${td}>${d(t.created)}</td></tr>`).join("")
    : `<tr><td ${td} colspan="3"><em>No emails logged this week.</em></td></tr>`;

  return `<div style="${S}max-width:720px;color:#111827;">
    <h2 style="${S}font-size:18px;margin:0 0 4px;">Salesforce — IR activity this week</h2>
    <div style="${S}font-size:12px;color:#6b7280;margin-bottom:16px;">${rangeLabel} · last ${days} days</div>
    <div style="${S}font-size:14px;margin-bottom:18px;">
      <strong>${add.contacts.length}</strong> new contact${add.contacts.length === 1 ? "" : "s"} created ·
      <strong>${add.tasks.length}</strong> email${add.tasks.length === 1 ? "" : "s"} logged to contacts.
    </div>
    <h3 style="${S}font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 6px;">New contacts</h3>
    <table style="${S}border-collapse:collapse;width:100%;margin-bottom:22px;"><thead><tr>
      <th ${th}>Name</th><th ${th}>Email</th><th ${th}>Account</th><th ${th}>Created</th></tr></thead>
      <tbody>${contactRows}</tbody></table>
    <h3 style="${S}font-size:13px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin:0 0 6px;">Emails logged</h3>
    <table style="${S}border-collapse:collapse;width:100%;"><thead><tr>
      <th ${th}>Contact</th><th ${th}>Subject</th><th ${th}>Logged</th></tr></thead>
      <tbody>${taskRows}</tbody></table>
    <div style="${S}font-size:11px;color:#9ca3af;margin-top:20px;">Automated from the ERP Funds AI portal. Contacts are auto-created from investor correspondence and linked to their Account when matched.</div>
  </div>`;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!salesforceConfigured()) return NextResponse.json({ skipped: "no SF creds" });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 7, 1), 31);
  const doSend = req.nextUrl.searchParams.get("send") !== "0";
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString().split(".")[0] + "Z";
  const rangeLabel = `${sinceIso.slice(0, 10)} → ${new Date().toISOString().slice(0, 10)}`;

  // Retry transient failures (a Graph token blip or a slow Salesforce query once caused the weekly
  // send to 500 and silently skip). Two extra attempts with a short backoff makes the digest robust.
  const retry = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try { return await fn(); }
      catch (e) { lastErr = e; if (i < 2) await new Promise((r) => setTimeout(r, 1500 * (i + 1))); }
    }
    throw new Error(`${label} failed after retries: ${String(lastErr).slice(0, 200)}`);
  };

  try {
    const add = await retry("sf-query", () => listRecentAgentAdditions(sinceIso));
    const html = buildHtml(add, days, rangeLabel);
    const subject = `Salesforce IR digest — ${add.contacts.length} new contact${add.contacts.length === 1 ? "" : "s"}, ${add.tasks.length} email${add.tasks.length === 1 ? "" : "s"} logged`;
    const to = (process.env.IR_DIGEST_TO || DEFAULT_TO).split(",").map((s) => s.trim()).filter(Boolean);
    // Send via Microsoft Graph (app-only) — the tenant blocks basic-auth SMTP.
    const from = process.env.IR_DIGEST_FROM || process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";

    if (doSend) await retry("send", () => sendMailAs(from, { to, subject, content: html, contentType: "HTML" }));

    return NextResponse.json({ ok: true, sent: doSend, from, to, contacts: add.contacts.length, tasks: add.tasks.length, subject });
  } catch (e) {
    // Surface failures instead of dropping the weekly email silently — alert the operator via Graph.
    console.error("[ir-sf-digest] failed:", String(e));
    try {
      const alertTo = (process.env.ALERT_EMAIL_TO || "mparad@erpfunds.com").split(",").map((s) => s.trim()).filter(Boolean);
      const from = process.env.IR_DIGEST_FROM || process.env.IR_TEAM_MAILBOX || "team@erpfunds.com";
      await sendMailAs(from, { to: alertTo, subject: "⚠ Salesforce IR digest failed to send", content: `The weekly Salesforce digest failed:<br><br>${String(e).slice(0, 400)}`, contentType: "HTML" });
    } catch { /* alert is best-effort */ }
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
