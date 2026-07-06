import { getGraphToken } from "@/lib/agents/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const INLINE_LIMIT = 3 * 1024 * 1024; // Graph allows ~3MB inline; larger needs an upload session
const CHUNK = 3_932_160; // 12 × 320 KiB (Graph requires multiples of 320 KiB except the last chunk)

export interface DraftAttachment {
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

async function token(): Promise<string> {
  const t = await getGraphToken();
  if (!t) throw new Error("AZURE credentials not configured");
  return t;
}

/**
 * Create an Outlook draft (in the given mailbox) with file attachments. Used by the DD
 * responder so the reply lands in Drafts with the relevant fund docs already attached,
 * for human review before sending. Returns which attachments succeeded/failed (non-fatal).
 */
export async function saveDraftWithAttachments(params: {
  mailboxEmail: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  attachments: DraftAttachment[];
  categories?: string[];
}): Promise<{ draftId: string; webLink: string | null; attached: string[]; failed: string[] }> {
  const t = await token();
  const base = `${GRAPH}/users/${encodeURIComponent(params.mailboxEmail)}`;

  const createRes = await fetch(`${base}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: params.subject,
      body: { contentType: "HTML", content: params.htmlBody },
      toRecipients: [{ emailAddress: { address: params.toEmail } }],
      ...(params.categories?.length ? { categories: params.categories } : {}),
    }),
  });
  if (!createRes.ok) throw new Error(`Graph create draft ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`);
  const draft = await createRes.json();
  const draftId: string = draft.id;
  const webLink: string | null = draft.webLink ?? null;

  const attached: string[] = [];
  const failed: string[] = [];

  for (const a of params.attachments) {
    try {
      if (a.bytes.length <= INLINE_LIMIT) {
        const r = await fetch(`${base}/messages/${draftId}/attachments`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            "@odata.type": "#microsoft.graph.fileAttachment",
            name: a.filename,
            contentType: a.mimeType || "application/octet-stream",
            contentBytes: a.bytes.toString("base64"),
          }),
        });
        if (!r.ok) throw new Error(`inline ${r.status}`);
      } else {
        const sessRes = await fetch(`${base}/messages/${draftId}/attachments/createUploadSession`, {
          method: "POST",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            AttachmentItem: { attachmentType: "file", name: a.filename, size: a.bytes.length, contentType: a.mimeType || "application/octet-stream" },
          }),
        });
        if (!sessRes.ok) throw new Error(`session ${sessRes.status}`);
        const { uploadUrl } = await sessRes.json();
        const total = a.bytes.length;
        for (let start = 0; start < total; start += CHUNK) {
          const end = Math.min(start + CHUNK, total) - 1;
          const slice = a.bytes.subarray(start, end + 1);
          const put = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Range": `bytes ${start}-${end}/${total}` },
            body: new Uint8Array(slice),
          });
          if (!put.ok && put.status !== 200 && put.status !== 201) throw new Error(`chunk ${put.status}`);
        }
      }
      attached.push(a.filename);
    } catch {
      failed.push(a.filename);
    }
  }
  return { draftId, webLink, attached, failed };
}
