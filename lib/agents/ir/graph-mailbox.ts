import { getGraphToken } from "@/lib/agents/graph-token";
import { stripMimecastNoise } from "@/lib/agents/ir/sanitize-email";

const GRAPH = "https://graph.microsoft.com/v1.0";

export interface InboxMessage {
  id: string;
  internetMessageId: string | null;
  subject: string;
  fromAddress: string;
  fromName: string | null;
  bodyPreview: string;
  receivedDateTime: string;
  recipients: string[]; // To + CC addresses (lowercased) — used to route ownership
  toRecipients: string[]; // To addresses only (lowercased) — used to detect mail addressed directly to an IR lead
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
    `?$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime` +
    `&$orderby=receivedDateTime desc&$top=${top}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph list inbox ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || []).map((m: RawGraphMessage): InboxMessage => toInboxMessage(m));
}

type RawGraphMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string } }[];
};

function toInboxMessage(m: RawGraphMessage): InboxMessage {
  const toOnly = (m.toRecipients || [])
    .map((r) => (r.emailAddress?.address || "").toLowerCase().trim())
    .filter(Boolean);
  const recips = [...toOnly, ...(m.ccRecipients || [])
    .map((r) => (r.emailAddress?.address || "").toLowerCase().trim())
    .filter(Boolean)];
  return {
    id: m.id,
    internetMessageId: m.internetMessageId ?? null,
    subject: m.subject || "",
    fromAddress: m.from?.emailAddress?.address || "",
    fromName: m.from?.emailAddress?.name ?? null,
    bodyPreview: stripMimecastNoise(m.bodyPreview || ""),
    receivedDateTime: m.receivedDateTime,
    recipients: recips,
    toRecipients: toOnly,
  };
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
  categories: string[];
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
    `?$select=id,internetMessageId,subject,from,toRecipients,bodyPreview,receivedDateTime,lastModifiedDateTime,webLink,isDraft,conversationId,categories` +
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
      categories?: string[];
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: { emailAddress?: { address?: string } }[];
    }): MailItem => ({
      id: m.id,
      internetMessageId: m.internetMessageId ?? null,
      subject: m.subject || "",
      fromAddress: m.from?.emailAddress?.address || "",
      fromName: m.from?.emailAddress?.name ?? null,
      bodyPreview: stripMimecastNoise(m.bodyPreview || ""),
      receivedDateTime: m.receivedDateTime,
      lastModifiedDateTime: m.lastModifiedDateTime ?? null,
      webLink: m.webLink ?? null,
      isDraft: m.isDraft ?? false,
      conversationId: m.conversationId ?? null,
      categories: m.categories ?? [],
      toRecipients: (m.toRecipients || [])
        .map((r) => r.emailAddress?.address || "")
        .filter(Boolean),
      recipients: (m.toRecipients || [])
        .map((r) => (r.emailAddress?.address || "").toLowerCase().trim())
        .filter(Boolean),
    })
  );
}

/**
 * List a folder's messages with `dateField` on/after `sinceIso`, paginating up to `max`
 * (newest first). Returns the richer MailItem shape (recipients, conversationId, draft flag).
 * Used e.g. to show Drafts going back N months rather than just the newest page.
 */
export async function listFolderMessagesSince(
  mailbox: string,
  folderIdOrWellKnown: string,
  sinceIso: string,
  dateField = "receivedDateTime",
  max = 300
): Promise<MailItem[]> {
  const t = await token();
  const out: MailItem[] = [];
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${folderIdOrWellKnown}/messages` +
    `?$select=id,internetMessageId,subject,from,toRecipients,bodyPreview,receivedDateTime,lastModifiedDateTime,webLink,isDraft,conversationId,categories` +
    `&$filter=${encodeURIComponent(`${dateField} ge ${sinceIso}`)}` +
    `&$orderby=${encodeURIComponent(`${dateField} desc`)}&$top=50`;
  while (url && out.length < max) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) throw new Error(`Graph list folder since ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const m of (data.value || []) as {
      id: string;
      internetMessageId?: string;
      subject?: string;
      bodyPreview?: string;
      receivedDateTime: string;
      lastModifiedDateTime?: string;
      webLink?: string;
      isDraft?: boolean;
      conversationId?: string;
      categories?: string[];
      from?: { emailAddress?: { address?: string; name?: string } };
      toRecipients?: { emailAddress?: { address?: string } }[];
    }[]) {
      out.push({
        id: m.id,
        internetMessageId: m.internetMessageId ?? null,
        subject: m.subject || "",
        fromAddress: m.from?.emailAddress?.address || "",
        fromName: m.from?.emailAddress?.name ?? null,
        bodyPreview: stripMimecastNoise(m.bodyPreview || ""),
        receivedDateTime: m.receivedDateTime,
        lastModifiedDateTime: m.lastModifiedDateTime ?? null,
        webLink: m.webLink ?? null,
        isDraft: m.isDraft ?? false,
        conversationId: m.conversationId ?? null,
        categories: m.categories ?? [],
        toRecipients: (m.toRecipients || []).map((r) => r.emailAddress?.address || "").filter(Boolean),
        recipients: (m.toRecipients || []).map((r) => (r.emailAddress?.address || "").toLowerCase().trim()).filter(Boolean),
      });
      if (out.length >= max) break;
    }
    url = data["@odata.nextLink"] || null;
  }
  return out;
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
    `?$select=id,internetMessageId,subject,from,toRecipients,ccRecipients,bodyPreview,receivedDateTime` +
    `&$filter=${encodeURIComponent(`receivedDateTime ge ${sinceIso}`)}` +
    `&$orderby=receivedDateTime desc&$top=50`;
  while (url && out.length < max) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!res.ok) throw new Error(`Graph list inbox since ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const m of (data.value || []) as RawGraphMessage[]) {
      out.push(toInboxMessage(m));
      if (out.length >= max) break;
    }
    url = data["@odata.nextLink"] || null;
  }
  return out;
}

/**
 * List recent messages in a mailbox sent FROM a given address (across all folders), newest first.
 * Used to find the inbound investor email a standalone draft is replying to (drafts don't share
 * the original's conversationId, so we match on sender + subject instead).
 */
export async function listMessagesFrom(
  mailbox: string,
  fromAddress: string,
  top = 25
): Promise<{ id: string; from: string; fromName: string | null; subject: string; receivedDateTime: string; isDraft: boolean }[]> {
  const t = await token();
  // Use $search (KQL) rather than a $filter on from/emailAddress/address — the latter is rejected
  // by many tenants. $search can't be combined with $orderby, so we sort by date in code.
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$search="${encodeURIComponent(`from:${fromAddress}`)}"` +
    `&$select=id,subject,from,receivedDateTime,isDraft&$top=${top}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`Graph list from ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.value || [])
    .map(
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
    )
    .sort((a: { receivedDateTime: string }, b: { receivedDateTime: string }) =>
      new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime()
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
  // Graph accepts MIME create only at the mailbox level (POST /messages). Posting MIME to a
  // specific folder's /messages collection is rejected with 400 "UnableToDeserialize" — so create
  // it at the top level, then move the new message into the destination folder.
  const createRes = await fetch(`${GRAPH}/users/${encodeURIComponent(destMailbox)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "text/plain" },
    body: base64Mime,
  });
  if (!createRes.ok) throw new Error(`Graph import mime ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`);
  const newId = (await createRes.json()).id as string;
  const moveRes = await fetch(
    `${GRAPH}/users/${encodeURIComponent(destMailbox)}/messages/${encodeURIComponent(newId)}/move`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({ destinationId: destFolderId }),
    }
  );
  if (!moveRes.ok) return newId; // created in the mailbox but couldn't be filed — still surfaces
  return ((await moveRes.json()).id as string) || newId;
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
    bodyText: stripMimecastNoise(m.body?.content || ""),
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
  p: { to: string[]; subject: string; content: string; contentType?: "Text" | "HTML"; bcc?: string[]; categories?: string[] }
): Promise<void> {
  const t = await token();
  const message: Record<string, unknown> = {
    subject: p.subject,
    body: { contentType: p.contentType ?? "Text", content: p.content },
    toRecipients: p.to.map((a) => ({ emailAddress: { address: a } })),
  };
  if (p.bcc && p.bcc.length) message.bccRecipients = p.bcc.map((a) => ({ emailAddress: { address: a } }));
  // Tag the Sent Items copy so the IR Inbox "Sent" tab can show only agent-assisted replies.
  if (p.categories && p.categories.length) message.categories = p.categories;
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
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

/**
 * Find a message ANYWHERE in the mailbox (any folder, incl. Deleted Items) by its RFC
 * internetMessageId. Returns its current id + parent folder id, or null if not found. Uses a
 * server-side $filter so it isn't limited by folder size/paging.
 */
export async function findMessageByInternetId(
  mailbox: string,
  internetMessageId: string
): Promise<{ id: string; parentFolderId: string | null } | null> {
  const t = await token();
  const filter = `internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`;
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages` +
    `?$select=id,parentFolderId&$filter=${encodeURIComponent(filter)}&$top=1`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`Graph find-by-internetId ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const m = (data.value || [])[0];
  return m ? { id: m.id as string, parentFolderId: (m.parentFolderId as string) ?? null } : null;
}

/** Delete a mail folder (and its contents) — moves it to Deleted Items. */
export async function deleteFolder(mailbox: string, folderId: string): Promise<void> {
  const t = await token();
  const res = await fetch(
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${encodeURIComponent(folderId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${t}` } }
  );
  if (!res.ok) throw new Error(`Graph delete folder ${res.status}: ${await res.text()}`);
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
