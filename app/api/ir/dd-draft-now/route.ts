import { NextResponse } from "next/server";
import { listInboxMessagesSince } from "@/lib/agents/ir/graph-mailbox";
import { buildDueDiligenceReply, getMessageBodyText } from "@/lib/agents/ir/dd-responder";
import { createReplyDraft } from "@/lib/agents/ir/graph-mail";
import { addAttachmentsToDraft } from "@/lib/agents/ir/draft-attachments";
import { getAnthropicFileBytes } from "@/lib/agents/ir/file-text";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ONE-TIME: find the WealthForge DD questionnaire in Meghan's inbox and create a grounded, threaded
// reply draft in her Drafts. Temporary — remove after use.
export async function GET() {
  const mailbox = "mberry@erpfunds.com";
  const since = new Date(Date.now() - 45 * 86400000).toISOString().split(".")[0] + "Z";
  const msgs = await listInboxMessagesSince(mailbox, since, 300);
  const target =
    msgs.find((m) => /wealthforge/i.test(m.fromAddress) && /due diligence/i.test(m.subject)) ||
    msgs.find((m) => /wealthforge/i.test(m.fromAddress)) ||
    msgs.find((m) => /wealthforge due diligence/i.test(m.subject));
  if (!target) return NextResponse.json({ found: false, scanned: msgs.length });

  const fullBody = (await getMessageBodyText(mailbox, target.id)) || target.bodyPreview;
  const dd = await buildDueDiligenceReply({ from: target.fromAddress, subject: target.subject, body: fullBody, contactName: "Philip Scheurer" });
  const r = await createReplyDraft({ mailbox, originalMessageId: target.id, htmlBody: dd.draftHtml, categories: ["IR: Meghan"] });

  let attached: string[] = [];
  if (r.draftId && dd.attachments.length) {
    const atts: { filename: string; mimeType: string; bytes: Buffer }[] = [];
    for (const a of dd.attachments) {
      const b = await getAnthropicFileBytes(a.fileId);
      if (b) atts.push({ filename: a.filename, mimeType: a.mimeType || "application/octet-stream", bytes: b });
    }
    if (atts.length) attached = (await addAttachmentsToDraft(mailbox, r.draftId, atts)).attached;
  }

  return NextResponse.json({
    found: true,
    from: target.fromAddress,
    subject: target.subject,
    draftCreated: r.success,
    draftId: r.draftId,
    draftMessage: r.message,
    usedDocCount: dd.usedDocCount,
    draftLength: dd.draftHtml.length,
    attachmentsOffered: dd.attachments.map((a) => a.filename),
    attachmentsAdded: attached,
  });
}
