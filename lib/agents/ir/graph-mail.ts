import { getGraphToken } from "@/lib/agents/graph-token";
import { stripMimecastHtml } from "@/lib/agents/ir/sanitize-email";

export interface DraftResult {
  draftId: string | null;
  success: boolean;
  message: string;
}

export async function saveDraftToOutlook(params: {
  toEmail: string;
  mailboxEmail: string;
  subject: string;
  htmlBody: string;
  categories?: string[];
}): Promise<DraftResult> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { draftId: null, success: false, message: `Auth failed: ${String(err)}` };
  }

  if (!token) {
    return { draftId: null, success: false, message: "AZURE credentials not configured" };
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.mailboxEmail)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: params.subject,
        body: { contentType: "HTML", content: params.htmlBody },
        toRecipients: [{ emailAddress: { address: params.toEmail } }],
        ...(params.categories?.length ? { categories: params.categories } : {}),
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { draftId: null, success: false, message: `Graph API ${res.status}: ${err}` };
  }

  const data = await res.json();
  return { draftId: data.id, success: true, message: "Draft saved to Outlook" };
}

/**
 * Create a THREADED reply draft in `mailbox`'s Drafts, linked to `originalMessageId` (which must
 * live in that mailbox). Outlook then shows the draft in the original conversation and keeps the
 * quoted original beneath the AI text — so the reviewer sees exactly what they're replying to.
 * The original message must NOT have been moved/deleted yet (reply is created against its id).
 */
export async function createReplyDraft(params: {
  mailbox: string;
  originalMessageId: string;
  htmlBody: string;
  categories?: string[];
}): Promise<DraftResult> {
  let token: string | null;
  try { token = await getGraphToken(); } catch (err) { return { draftId: null, success: false, message: `Auth failed: ${String(err)}` }; }
  if (!token) return { draftId: null, success: false, message: "AZURE credentials not configured" };

  const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(params.mailbox)}`;
  const h = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // 1) createReply → a draft reply in Drafts, threaded, body pre-filled with the quoted original.
  const cr = await fetch(`${base}/messages/${params.originalMessageId}/createReply`, { method: "POST", headers: h, body: "{}" });
  if (!cr.ok) return { draftId: null, success: false, message: `createReply ${cr.status}: ${(await cr.text()).slice(0, 150)}` };
  const draft = await cr.json();
  const draftId: string = draft.id;
  const quoted: string = stripMimecastHtml(draft.body?.content ?? "");

  // 2) put the AI reply ABOVE the quoted original (keep the quote so the reviewer sees the thread).
  const patch: Record<string, unknown> = { body: { contentType: "HTML", content: `${params.htmlBody}<br><br>${quoted}` } };
  if (params.categories?.length) patch.categories = params.categories;
  const up = await fetch(`${base}/messages/${draftId}`, { method: "PATCH", headers: h, body: JSON.stringify(patch) });
  if (!up.ok) return { draftId, success: false, message: `patch draft ${up.status}: ${(await up.text()).slice(0, 150)}` };

  return { draftId, success: true, message: "Reply draft created" };
}
