import { NextRequest, NextResponse } from "next/server";
import { buildDueDiligenceReply } from "@/lib/agents/ir/dd-responder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Temporary: run the DD responder on a pasted questionnaire and return the grounded draft answers
// (retrieves the fund's DD docs from the KB). Remove after use.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));
  const from = (b.from ?? "pscheurer@wealthforge.com").toString();
  const subject = (b.subject ?? "ERP 1031: WealthForge Due Diligence Questionnaires").toString();
  const body = (b.body ?? "").toString();
  if (!body) return NextResponse.json({ error: "body required" }, { status: 400 });
  try {
    const dd = await buildDueDiligenceReply({ from, subject, body });
    return NextResponse.json({
      draftSubject: dd.draftSubject,
      draftHtml: dd.draftHtml,
      attachments: (dd.attachments ?? []).map((a) => a.filename),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 400) }, { status: 500 });
  }
}
