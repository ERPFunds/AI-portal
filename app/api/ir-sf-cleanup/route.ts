import { NextRequest, NextResponse } from "next/server";
import { salesforceConfigured, findJunkContacts, deleteContact } from "@/lib/agents/ir/salesforce";

export const maxDuration = 120;

// Remove Salesforce Contacts that were created from non-real addresses (inline-image content-ids,
// no-reply / voicemail / skype notifications, etc.). Deleting a Contact cascades to its Activities.
// Auth: Bearer CRON_SECRET.  Dry-run by default — pass ?apply=1 to actually delete.
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!salesforceConfigured()) return NextResponse.json({ error: "no SF creds" }, { status: 503 });
  const apply = req.nextUrl.searchParams.get("apply") === "1";

  try {
    const junk = await findJunkContacts();
    if (!apply) {
      return NextResponse.json({
        dryRun: true, matched: junk.length,
        note: "Nothing deleted. Re-run with &apply=1 to delete these Contacts (and their activities).",
        contacts: junk.map((c) => ({ name: c.name, email: c.email })),
      });
    }
    let deleted = 0;
    const errors: string[] = [];
    for (const c of junk) {
      try { await deleteContact(c.id); deleted++; }
      catch (e) { errors.push(`${c.email}: ${String(e).slice(0, 80)}`); }
    }
    return NextResponse.json({ dryRun: false, matched: junk.length, deleted, errors: errors.slice(0, 10) });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 300) }, { status: 500 });
  }
}
