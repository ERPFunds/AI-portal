import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCaptureScan } from "@/app/api/investor-crm/capture/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Daily New Contacts scan. Walking three mailboxes over Graph takes long enough that doing it
// when someone opens the tab is a poor trade — this runs it overnight and writes the result to
// crm_capture_cache, which the tab reads instantly. The tab can still force a live walk.
//
// A failure is recorded on the cache rather than thrown away, so the tab can say the last scan
// failed instead of quietly showing yesterday's list as though it were fresh.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (expected && req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  try {
    const out = await runCaptureScan();
    await supabase.from("crm_capture_cache").upsert({
      id: 1,
      contacts: out.contacts,
      scanned: out.scanned,
      known: out.known,
      scanned_at: new Date().toISOString(),
      error: null,
    });
    return NextResponse.json({ ok: true, found: out.contacts.length, scanned: out.scanned, known: out.known });
  } catch (e) {
    const msg = String(e).slice(0, 300);
    // Keep the previous list; just record that this run failed.
    await supabase.from("crm_capture_cache").update({ error: msg }).eq("id", 1);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
