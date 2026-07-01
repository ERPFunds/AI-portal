import { getGraphToken } from "@/lib/agents/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOP = 250; // recent messages per folder per mailbox
const TTL_MS = 15 * 60_000;

// Mailboxes whose inbox + sent are scanned for LP/broker interactions.
function mailboxes(): string[] {
  return (process.env.IR_INTERACTION_MAILBOXES || "mberry@erpfunds.com,wmeyer@erpfunds.com,team@erpfunds.com")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

export interface Interaction {
  date: string;
  subject: string;
  mailbox: string;
  direction: "sent" | "received";
}

let cache: { at: number; map: Record<string, Interaction> } | null = null;

async function scan(): Promise<Record<string, Interaction>> {
  const t = await getGraphToken();
  if (!t) return {};
  const map: Record<string, Interaction> = {};
  const put = (email: string | undefined, it: Interaction) => {
    const k = (email || "").toLowerCase().trim();
    if (!k) return;
    const ex = map[k];
    if (!ex || new Date(it.date).getTime() > new Date(ex.date).getTime()) map[k] = it;
  };

  for (const mb of mailboxes()) {
    // Inbox — the counterparty is the sender.
    try {
      const url = `${GRAPH}/users/${encodeURIComponent(mb)}/mailFolders/inbox/messages?$select=from,subject,receivedDateTime&$orderby=receivedDateTime desc&$top=${TOP}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) for (const m of ((await r.json()).value ?? []) as any[]) {
        put(m.from?.emailAddress?.address, { date: m.receivedDateTime, subject: m.subject || "", mailbox: mb, direction: "received" });
      }
    } catch { /* skip */ }
    // Sent — the counterparties are the recipients.
    try {
      const url = `${GRAPH}/users/${encodeURIComponent(mb)}/mailFolders/sentitems/messages?$select=toRecipients,subject,sentDateTime&$orderby=sentDateTime desc&$top=${TOP}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) for (const m of ((await r.json()).value ?? []) as any[]) {
        for (const rc of (m.toRecipients ?? [])) put(rc.emailAddress?.address, { date: m.sentDateTime, subject: m.subject || "", mailbox: mb, direction: "sent" });
      }
    } catch { /* skip */ }
  }
  return map;
}

/** email(lowercased) -> most-recent interaction across the IR mailboxes. Cached 15 min. */
export async function getInteractionsByEmail(): Promise<Record<string, Interaction>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const map = await scan();
  cache = { at: Date.now(), map };
  return map;
}
