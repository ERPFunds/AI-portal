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

export interface InteractionMaps {
  /** counterparty email(lowercased) -> most-recent interaction */
  byEmail: Record<string, Interaction>;
  /** counterparty display name(lowercased, normalized) -> most-recent interaction */
  byName: Record<string, Interaction>;
}

let cache: { at: number; maps: InteractionMaps } | null = null;

// Normalize a display name for matching: lowercase, strip punctuation, collapse spaces.
function normName(s: string | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

async function scan(): Promise<InteractionMaps> {
  const t = await getGraphToken();
  if (!t) return { byEmail: {}, byName: {} };
  const byEmail: Record<string, Interaction> = {};
  const byName: Record<string, Interaction> = {};
  const putInto = (map: Record<string, Interaction>, key: string, it: Interaction) => {
    if (!key) return;
    const ex = map[key];
    if (!ex || new Date(it.date).getTime() > new Date(ex.date).getTime()) map[key] = it;
  };
  const put = (addr: { address?: string; name?: string } | undefined, it: Interaction) => {
    if (!addr) return;
    putInto(byEmail, (addr.address || "").toLowerCase().trim(), it);
    putInto(byName, normName(addr.name), it);
  };

  for (const mb of mailboxes()) {
    // Inbox — the counterparty is the sender.
    try {
      const url = `${GRAPH}/users/${encodeURIComponent(mb)}/mailFolders/inbox/messages?$select=from,subject,receivedDateTime&$orderby=receivedDateTime desc&$top=${TOP}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) for (const m of ((await r.json()).value ?? []) as any[]) {
        put(m.from?.emailAddress, { date: m.receivedDateTime, subject: m.subject || "", mailbox: mb, direction: "received" });
      }
    } catch { /* skip */ }
    // Sent — the counterparties are the recipients.
    try {
      const url = `${GRAPH}/users/${encodeURIComponent(mb)}/mailFolders/sentitems/messages?$select=toRecipients,subject,sentDateTime&$orderby=sentDateTime desc&$top=${TOP}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) for (const m of ((await r.json()).value ?? []) as any[]) {
        for (const rc of (m.toRecipients ?? [])) put(rc.emailAddress, { date: m.sentDateTime, subject: m.subject || "", mailbox: mb, direction: "sent" });
      }
    } catch { /* skip */ }
  }
  return { byEmail, byName };
}

/** Most-recent interaction across the IR mailboxes, keyed by email AND by display name. Cached 15 min. */
export async function getInteractions(): Promise<InteractionMaps> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.maps;
  const maps = await scan();
  cache = { at: Date.now(), maps };
  return maps;
}

/** Back-compat: email(lowercased) -> most-recent interaction. */
export async function getInteractionsByEmail(): Promise<Record<string, Interaction>> {
  return (await getInteractions()).byEmail;
}
