import { getGraphToken } from "@/lib/agents/graph-token";

const GRAPH = "https://graph.microsoft.com/v1.0";
// Graph allows up to 1,000 messages per page; 500 keeps responses a sane size while cutting
// the number of round trips by five.
const PAGE = 500;
// The old cap was 30 pages of 100 -- 3,000 messages per folder, newest first. A busy shared
// inbox blows through that in a couple of months, so everything older came back with ZERO
// received messages while Sent Items (much smaller) still reached the start of the window.
// Every contact whose conversation predated the cut-off then looked one-way and was filtered
// out as "nobody replied", which is the opposite of the truth. 40 x 500 = 20,000 per folder.
const MAX_PAGES = 40;
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
  // Traffic with this counterparty across the whole scan window. A single inbound message is
  // usually a stranger or a blast; a two-way thread is an actual relationship, and the New
  // Contacts capture leans on that distinction to keep its list short.
  sentCount?: number;          // messages ERP sent them
  receivedCount?: number;      // messages they sent ERP
  firstDate?: string;          // earliest message either way
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
/** Set when a folder hit the page cap, meaning its history is incomplete for the window. */
export type FolderResult = { msgs: any[]; truncated: boolean };

async function fetchFolder(
  token: string, mailbox: string, folder: "inbox" | "sentitems", dateField: string, sinceIso: string,
): Promise<FolderResult> {
  const select = folder === "inbox"
    ? "from,subject,bodyPreview,receivedDateTime"
    : "toRecipients,subject,bodyPreview,sentDateTime";
  let url: string | null =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/${folder}/messages` +
    `?$select=${select}&$filter=${encodeURIComponent(`${dateField} ge ${sinceIso}`)}` +
    `&$orderby=${encodeURIComponent(`${dateField} desc`)}&$top=${PAGE}`;
  const out: any[] = [];
  let page = 0;
  for (; url && page < MAX_PAGES; page++) {
    const r: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
    });
    if (!r.ok) break;
    const j = await r.json();
    for (const m of (j.value ?? [])) out.push(m);
    url = j["@odata.nextLink"] ?? null;
  }
  // Still a next link after the last allowed page means we stopped early and the oldest part
  // of the window is missing. Silent truncation here is what made every older contact look
  // like nobody had ever replied to them, so it is reported rather than swallowed.
  return { msgs: out, truncated: page >= MAX_PAGES && !!url };
}

async function scan(): Promise<InteractionMaps> {
  const t = await getGraphToken();
  if (!t) return { byEmail: {}, byName: {} };
  const byEmail: Record<string, Interaction> = {};
  const byName: Record<string, Interaction> = {};
  const putInto = (map: Record<string, Interaction>, key: string, it: Interaction) => {
    if (!key) return;
    const ex = map[key];
    if (!ex) {
      map[key] = { ...it, sentCount: 0, receivedCount: 0, firstDate: it.date };
    } else if (new Date(it.date).getTime() > new Date(ex.date).getTime()) {
      // Keep the running tallies while replacing the "most recent" detail.
      map[key] = { ...it, sentCount: ex.sentCount, receivedCount: ex.receivedCount, firstDate: ex.firstDate };
    }
    const row = map[key];
    if (it.direction === "sent") row.sentCount = (row.sentCount ?? 0) + 1;
    else row.receivedCount = (row.receivedCount ?? 0) + 1;
    if (!row.firstDate || new Date(it.date).getTime() < new Date(row.firstDate).getTime()) row.firstDate = it.date;
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
  type Job = { mb: string; dir: "received" | "sent"; msgs: any[]; truncated: boolean };
  const jobs: Promise<Job>[] = [];
  const empty = (mb: string, dir: "received" | "sent"): Job => ({ mb, dir, msgs: [], truncated: false });
  for (const mb of mailboxes()) {
    jobs.push(fetchFolder(t, mb, "inbox", "receivedDateTime", sinceIso)
      .then((r) => ({ mb, dir: "received" as const, msgs: r.msgs, truncated: r.truncated }))
      .catch(() => empty(mb, "received")));
    jobs.push(fetchFolder(t, mb, "sentitems", "sentDateTime", sinceIso)
      .then((r) => ({ mb, dir: "sent" as const, msgs: r.msgs, truncated: r.truncated }))
      .catch(() => empty(mb, "sent")));
  }
  const results = await Promise.all(jobs);
  // A truncated folder means the counts below understate one side of the conversation, which
  // silently turns two-way relationships into apparent one-way ones. Say so loudly.
  for (const r of results) {
    if (r.truncated) {
      console.warn(`[mailbox-interactions] TRUNCATED: ${r.mb} ${r.dir === "received" ? "inbox" : "sentitems"} ` +
        `hit the ${MAX_PAGES}-page cap (${r.msgs.length} messages). Older history is missing and ` +
        `reply counts for it will read as zero. Raise MAX_PAGES or shorten IR_INTERACTION_MONTHS.`);
    }
  }
  for (const { mb, dir, msgs } of results) {
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
