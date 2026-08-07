import { NextRequest, NextResponse } from "next/server";
import {
  resolveFolderId,
  ensureSubfolderId,
  listChildFolders,
  listFolderMessages,
  moveMessage,
} from "@/lib/agents/ir/graph-mailbox";

export const maxDuration = 300;

// Archive stale IR reply drafts: any unsent agent draft (IR: category) older than ARCHIVE_DAYS is
// moved out of the active queue into "Investor Relations / Archive" — decluttering both Outlook and
// the app's Drafts view, while staying fully visible/recoverable under the app's Archive folder.
// Escalation drafts are archived on the same clock. Auth: Bearer CRON_SECRET.  ?dryRun=1 to preview.
const IR_FOLDER = process.env.IR_FOLDER_NAME || "Investor Relations";
const ARCHIVE_SUB = "Archive";
const ARCHIVE_DAYS = Math.min(Math.max(Number(process.env.IR_DRAFTS_ARCHIVE_DAYS) || 30, 7), 365);
const irTag = /^ir:/i;

function isStaleDraft(m: { isDraft: boolean; categories: string[]; lastModifiedDateTime: string | null; receivedDateTime: string }, cutoffMs: number): boolean {
  if (!m.isDraft) return false;
  if (!(m.categories ?? []).some((c) => irTag.test(c.trim()))) return false; // only agent IR drafts
  const t = new Date(m.lastModifiedDateTime || m.receivedDateTime || 0).getTime();
  return Number.isFinite(t) && t > 0 && t < cutoffMs;
}

export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const mailboxes = (process.env.IR_DRAFT_MAILBOXES || "mberry@erpfunds.com,team@erpfunds.com")
    .split(",").map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
  const cutoffMs = Date.now() - ARCHIVE_DAYS * 86400000;

  const results: Record<string, unknown>[] = [];
  try {
    for (const mb of mailboxes) {
      const irId = await resolveFolderId(mb, IR_FOLDER);
      const stale: { id: string; subject: string }[] = [];

      // a) unfiled drafts in the well-known Drafts folder
      try {
        const drafts = await listFolderMessages(mb, "drafts", 250, "lastModifiedDateTime desc");
        for (const m of drafts) if (isStaleDraft(m, cutoffMs)) stale.push({ id: m.id, subject: m.subject });
      } catch { /* skip */ }

      // b) drafts filed into the IR routing subfolders (Escalate / Forwarded Drafts)
      if (irId) {
        try {
          for (const k of await listChildFolders(mb, irId)) {
            if (!/escalat|draft/i.test(k.displayName)) continue; // don't rescan Archive itself
            const msgs = await listFolderMessages(mb, k.id, 100);
            for (const m of msgs) if (isStaleDraft(m, cutoffMs)) stale.push({ id: m.id, subject: m.subject });
          }
        } catch { /* skip */ }
      }

      if (stale.length === 0 || !irId) { results.push({ mailbox: mb, stale: stale.length, moved: 0 }); continue; }
      if (dryRun) { results.push({ mailbox: mb, stale: stale.length, sample: stale.slice(0, 8).map((s) => s.subject) }); continue; }

      const archiveId = await ensureSubfolderId(mb, IR_FOLDER, ARCHIVE_SUB);
      let moved = 0;
      const errors: string[] = [];
      if (archiveId) {
        for (const s of stale) {
          try { await moveMessage(mb, s.id, archiveId); moved++; }
          catch (e) { errors.push(String(e).slice(0, 60)); }
        }
      }
      results.push({ mailbox: mb, stale: stale.length, moved, errors: errors.slice(0, 5) });
    }
    return NextResponse.json({ ok: true, dryRun, archiveDays: ARCHIVE_DAYS, results });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
