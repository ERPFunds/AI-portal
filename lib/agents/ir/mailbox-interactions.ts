import { getGraphToken } from "@/lib/agents/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
const PAGE = 100;              // messages per Graph page
const MAX_PAGES = 30;          // safety cap => up to 3,000 msgs per folder in the window
const TTL_MS = 15 * 60_000;

// How many months of history to scan (default 18). Override with IR_INTERACTION_MONTHS.
function monthsBack(): number {
  const n = parseInt(process.env.IR_INTERACTION_MONTHS || "18", 10);
  return Number.isFinite(n) && n > 0 ? n : 18;
}

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
  counterparty: string;        // display name (or email) of the LP/broker on the other side
  counterpartyEmail: string;   // their email address (for one-click drafting)
  preview: string;             // short body snippet for context
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

// A readable counterparty label from a Graph emailAddress object.
function label(addr: { name?: string; address?: string } | undefined): string {
  const name = (addr?.name || "").trim();
  const email = (addr?.address || "").trim();
  if (name && !/^[\w.+-]+@[\w.-]+$/.test(name)) return name; // real name, not just the email echoed
  return email || name;
}

// Fetch every message in the window for one folder, following @odata.nextLink.
async function fetchFolder(
  token: string, mailbox: string, folder: "inbox" | "sentitems", dateField: string, sinceIso: string,
): Promise<any[]> {
  const select = folder === "inbox"
    ? "from,subject,bodyPreview,receivedDateTime"
    : "toRecipients,subject,bodyPreview,sentDateTime";
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages` +
    `?$select=${select}&$filter=${encodeURIComponent(`${dateField} ge ${sinceIso}`)}` +
    `&$orderby=${encodeURIComponent(`${dateField} desc`)}&$top=${PAGE}`;
  const out: any[] = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const r: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!r.ok) break;
    const j = await r.json();
    for (const m of (j.value ?? [])) out.push(m);
    url = j["@odata.nextLink"] ?? null;
  }
  return out;
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

  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack());
  const sinceIso = since.toISOString();

  // Fan out all folders (inbox + sent across every mailbox) in parallel — each folder still pages
  // sequentially, but the folders no longer wait on each other.
  const jobs: Promise<{ mb: string; dir: "received" | "sent"; msgs: any[] }>[] = [];
  for (const mb of mailboxes()) {
    jobs.push(fetchFolder(t, mb, "inbox", "receivedDateTime", sinceIso).then((msgs) => ({ mb, dir: "received" as const, msgs })).catch(() => ({ mb, dir: "received" as const, msgs: [] })));
    jobs.push(fetchFolder(t, mb, "sentitems", "sentDateTime", sinceIso).then((msgs) => ({ mb, dir: "sent" as const, msgs })).catch(() => ({ mb, dir: "sent" as const, msgs: [] })));
  }
  for (const { mb, dir, msgs } of await Promise.all(jobs)) {
    if (dir === "received") {
      for (const m of msgs) {
        const from = m.from?.emailAddress;
        put(from, {
          date: m.receivedDateTime, subject: m.subject || "", mailbox: mb, direction: "received",
          counterparty: label(from), counterpartyEmail: (from?.address || "").trim(),
          preview: (m.bodyPreview || "").replace(/\s+/g, " ").trim(),
        });
      }
    } else {
      for (const m of msgs) {
        for (const rc of (m.toRecipients ?? [])) {
          const to = rc.emailAddress;
          put(to, {
            date: m.sentDateTime, subject: m.subject || "", mailbox: mb, direction: "sent",
            counterparty: label(to), counterpartyEmail: (to?.address || "").trim(),
            preview: (m.bodyPreview || "").replace(/\s+/g, " ").trim(),
          });
        }
      }
    }
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
