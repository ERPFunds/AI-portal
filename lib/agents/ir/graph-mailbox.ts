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

export interface MailFolder {
  id: string;
  displayName: string;
  totalItemCount: number;
  unreadItemCount: number;
  childFolderCount: number;
}

/** Richer message shape used by the Agent Inbox view (adds recipients, webLink, draft flag). */
export interface MailItem extends InboxMessage {
  toRecipients: string[];
  webLink: string | null;
  isDraft: boolean;
  lastModifiedDateTime: string | null;
  conversationId: string | null;
}

/** List a folder's immediate child folders (id, name, counts). */
export async function listChildFolders(mailbox: string, parentFolderId: string): Promise<MailFolder[]> {
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${parentFolderId}/childFolders` +
    `?$select=id,displayName,totalItemCount,unreadItemCount,childFolderCount&$top=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Graph child folders ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(
    (f: {
      id: string;
      displayName?: string;
      totalItemCount?: number;
      unreadItemCount?: number;
      childFolderCount?: number;
    }): MailFolder => ({
      id: f.id,
      displayName: f.displayName || "",
      totalItemCount: f.totalItemCount ?? 0,
      unreadItemCount: f.unreadItemCount ?? 0,
      childFolderCount: f.childFolderCount ?? 0,
    })
  );
}

/**
 * List messages in any folder (by folder id or a well-known name like "drafts"/"inbox").
 * Returns the richer MailItem shape. `orderBy` defaults to receivedDateTime desc; pass
 * "lastModifiedDateTime desc" for Drafts (which have no meaningful received date).
 */
export async function listFolderMessages(
  mailbox: string,
  folderIdOrWellKnown: string,
  top = 25,
  orderBy = "receivedDateTime desc"
): Promise<MailItem[]> {
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${folderIdOrWellKnown}/messages` +
    `?$select=id,internetMessageId,subject,from,toRecipients,bodyPreview,receivedDateTime,lastModifiedDateTime,webLink,isDraft,conversationId` +
    `&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph list folder messages ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(
    (m: {
      id: string;
      internetMessageId?: string;
      subject?: string;
      bodyPreview?: string;
      receivedDateTime: string;
      lastModifiedDateTime?: string;
      webLink?: string;
      isDraft?: boolean;
      conversationId?: string;
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: { emailAddress?: { address?: string } }[];
    }): MailItem => ({
      id: m.id,
      internetMessageId: m.internetMessageId ?? null,
      subject: m.subject || "",
      fromAddress: m.from?.emailAddress?.address || "",
      fromName: m.from?.emailAddress?.name ?? null,
      bodyPreview: m.bodyPreview || "",
      receivedDateTime: m.receivedDateTime,
      lastModifiedDateTime: m.lastModifiedDateTime ?? null,
      webLink: m.webLink ?? null,
      isDraft: m.isDraft ?? false,
      conversationId: m.conversationId ?? null,
      toRecipients: (m.toRecipients || [])
        .map((r) => r.emailAddress?.address || "")
        .filter(Boolean),
    })
  );
}

/**
 * List Inbox messages received on/after `sinceIso`, paginating up to `max` (newest first).
 * Used by the on-demand backfill to catch up historical investor emails past the live cap.
 */
export async function listInboxMessagesSince(mailbox: string, sinceIso: string, max = 250): Promise<InboxMessage[]> {
  const t = await token();
  const out: InboxMessage[] = [];
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages` +
    `?$select=id,internetMessageId,subject,from,bodyPreview,receivedDateTime` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
    `&$orderby=receivedDateTime desc&$top=50`;
  while (url && out.length < max) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) throw new Error(`Graph list inbox since ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const m of (data.value || []) as {
      id: string;
      internetMessageId?: string;
      subject?: string;
      bodyPreview?: string;
      receivedDateTime: string;
      from?: { emailAddress?: { address?: string; name?: string } };
    }[]) {
      out.push({
        id: m.id,
        internetMessageId: m.internetMessageId ?? null,
        subject: m.subject || "",
        fromAddress: m.from?.emailAddress?.address || "",
        fromName: m.from?.emailAddress?.name ?? null,
        bodyPreview: m.bodyPreview || "",
        receivedDateTime: m.receivedDateTime,
      });
      if (out.length >= max) break;
    }
    url = data["@odata.nextLink"] || null;
  }
  return out;
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

/** Create a child folder under a parent (idempotent callers should resolve first). Returns its id. */
export async function createChildFolder(mailbox: string, parentFolderId: string, displayName: string): Promise<string> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${parentFolderId}/childFolders`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    }
  );
  if (!res.ok) throw new Error(`Graph create child folder ${res.status}: ${await res.text()}`);
  return (await res.json()).id as string;
}

/**
 * Resolve a "Parent / Child" subfolder, CREATING the parent and/or child if they don't exist.
 * Use for destination folders that must exist (e.g. the team hub's IR routing subfolders).
 */
export async function ensureSubfolderId(mailbox: string, parentName: string, childName: string): Promise<string> {
  const t = await token();
  // Ensure the top-level parent exists.
  let parentId = await resolveFolderId(mailbox, parentName);
  if (!parentId) {
    const res = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: parentName }),
    });
    if (!res.ok) throw new Error(`Graph create folder ${res.status}: ${await res.text()}`);
    parentId = (await res.json()).id as string;
  }
  const childId = await resolveSubfolderId(mailbox, parentName, childName);
  if (childId) return childId;
  return createChildFolder(mailbox, parentId, childName);
}

/**
 * Move a message to another folder within the same mailbox.
 * A move creates a new message resource in the destination — returns its new id
 * (needed to then PATCH read state / read the filed copy).
 */
export async function moveMessage(
  mailbox: string,
  messageId: string,
  destinationFolderId: string
): Promise<string> {
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
  const data = await res.json();
  return data.id as string;
}

/** Set a message's read/unread state (isRead=false keeps it bold/unread in Outlook). */
export async function setMessageRead(mailbox: string, messageId: string, isRead: boolean): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isRead }),
    }
  );
  if (!res.ok) throw new Error(`Graph set read ${res.status}: ${await res.text()}`);
}

/** Fetch a message's raw MIME (RFC822), base64-encoded — for copying it into another mailbox. */
export async function getMessageMime(mailbox: string, messageId: string): Promise<string> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/$value`,
    { headers: { Authorization: `Bearer ${t}` } }
  );
  if (!res.ok) throw new Error(`Graph get mime ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer()).toString("base64");
}

/**
 * Import a base64-encoded MIME message into a folder (by id) in any mailbox — a faithful copy
 * that preserves the original sender, recipients, and received date. Returns the new message id.
 */
export async function importMimeMessage(
  destMailbox: string,
  destFolderId: string,
  base64Mime: string
): Promise<string> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(destMailbox)}/mailFolders/${destFolderId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "text/plain" },
      body: base64Mime,
    }
  );
  if (!res.ok) throw new Error(`Graph import mime ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id as string;
}

/** Read a single message's subject, recipients, text body, and conversation id. */
export async function getMessageBody(
  mailbox: string,
  messageId: string
): Promise<{ subject: string; to: string[]; bodyText: string; conversationId: string | null; from: string; fromName: string | null; receivedDateTime: string | null }> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
      `?$select=subject,toRecipients,body,conversationId,from,receivedDateTime`,
    { headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' } }
  );
  if (!res.ok) throw new Error(`Graph get message ${res.status}: ${await res.text()}`);
  const m = await res.json();
  return {
    subject: m.subject || "",
    to: (m.toRecipients || [])
      .map((r: { emailAddress?: { address?: string } }) => r.emailAddress?.address || "")
      .filter(Boolean),
    bodyText: m.body?.content || "",
    conversationId: m.conversationId ?? null,
    from: m.from?.emailAddress?.address || "",
    fromName: m.from?.emailAddress?.name ?? null,
    receivedDateTime: m.receivedDateTime ?? null,
  };
}

/**
 * List messages in a conversation across the whole mailbox (all folders). No server-side
 * $orderby (combining it with a conversationId filter is rejected by Graph) — sort client-side.
 */
export async function listConversationMessages(
  mailbox: string,
  conversationId: string,
  top = 25
): Promise<{ id: string; from: string; fromName: string | null; subject: string; receivedDateTime: string; isDraft: boolean }[]> {
  const t = await token();
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$filter=${encodeURIComponent(`conversationId eq '${conversationId.replace(/'/g, "''")}'`)}` +
    `&$select=id,subject,from,receivedDateTime,isDraft&$top=${top}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph list conversation ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map(
    (m: {
      id: string;
      subject?: string;
      receivedDateTime: string;
      isDraft?: boolean;
      from?: { emailAddress?: { address?: string; name?: string } };
    }) => ({
      id: m.id,
      from: m.from?.emailAddress?.address || "",
      fromName: m.from?.emailAddress?.name ?? null,
      subject: m.subject || "",
      receivedDateTime: m.receivedDateTime,
      isDraft: m.isDraft ?? false,
    })
  );
}

/** Send an existing draft message (by id) from the mailbox. Irreversible — sends the email. */
export async function sendDraftMessage(mailbox: string, messageId: string): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}/send`,
    { method: "POST", headers: { Authorization: `Bearer ${t}` } }
  );
  if (!res.ok) throw new Error(`Graph send draft ${res.status}: ${await res.text()}`);
}

/** Send a NEW message as `mailbox` (e.g. mberry@) — used to reply from a person's own address. */
export async function sendMailAs(
  mailbox: string,
  p: { to: string[]; subject: string; content: string; contentType?: "Text" | "HTML" }
): Promise<void> {
  const t = await token();
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: p.subject,
        body: { contentType: p.contentType ?? "Text", content: p.content },
        toRecipients: p.to.map((a) => ({ emailAddress: { address: a } })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Graph sendMail ${res.status}: ${await res.text()}`);
}

/** Delete a message (moves it to Deleted Items). */
export async function deleteMessage(mailbox: string, messageId: string): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${t}` } }
  );
  if (!res.ok) throw new Error(`Graph delete ${res.status}: ${await res.text()}`);
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
