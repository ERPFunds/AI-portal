import { getGraphToken } from "@/lib/agents/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface InboxMessage {
  id: string;
  internetMessageId: string | null;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  bodyPreview: string;
  receivedDateTime: string;
}

async function token(): Promise<string> {
  const t = await getGraphToken();
  if (!t) throw new Error("AZURE credentials not configured");
  return t;
}

/** List the most recent messages in a mailbox's Inbox (newest first). */
export async function listInboxMessages(mailbox: string, top = 25): Promise<InboxMessage[]> {
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
    `?$select=id,internetMessageId,subject,from,bodyPreview,receivedDateTime` +
    `&$orderby=receivedDateTime desc&$top=${top}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph list inbox ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(
    (m: {
      id: string;
      internetMessageId?: string;
      subject?: string;
      bodyPreview?: string;
      receivedDateTime: string;
      from?: { emailAddress?: { address?: string; name?: string } };
    }): InboxMessage => ({
      id: m.id,
      internetMessageId: m.internetMessageId ?? null,
      subject: m.subject || "",
      fromAddress: m.from?.emailAddress?.address || "",
      fromName: m.from?.emailAddress?.name ?? null,
      bodyPreview: m.bodyPreview || "",
      receivedDateTime: m.receivedDateTime,
    })
  );
}

/** Resolve a mail folder's id by display name (e.g., "Investor Relations"). Returns null if not found. */
export async function resolveFolderId(mailbox: string, displayName: string): Promise<string | null> {
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders` +
    `?$filter=${encodeURIComponent(`displayName eq '${displayName.replace(/'/g, "''")}'`)}&$select=id,displayName&$top=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Graph resolve folder ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.value?.[0]?.id ?? null;
}

/** Resolve a child folder's id by name under a named parent (e.g., "Investor Relations" → "Escalate"). */
export async function resolveSubfolderId(
  mailbox: string,
  parentName: string,
  childName: string
): Promise<string | null> {
  const parentId = await resolveFolderId(mailbox, parentName);
  if (!parentId) return null;
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${parentId}/childFolders` +
    `?$filter=${encodeURIComponent(`displayName eq '${childName.replace(/'/g, "''")}'`)}&$select=id,displayName&$top=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Graph resolve subfolder ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.value?.[0]?.id ?? null;
}

/** Move a message to another folder within the same mailbox. */
export async function moveMessage(mailbox: string, messageId: string, destinationFolderId: string): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/move`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: destinationFolderId }),
    }
  );
  if (!res.ok) throw new Error(`Graph move ${res.status}: ${await res.text()}`);
}

/** Forward a message to a recipient, with an optional comment, sent as the mailbox. */
export async function forwardMessage(
  mailbox: string,
  messageId: string,
  toEmail: string,
  comment = ""
): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/forward`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        comment,
        toRecipients: [{ emailAddress: { address: toEmail } }],
      }),
    }
  );
  if (!res.ok) throw new Error(`Graph forward ${res.status}: ${await res.text()}`);
}
