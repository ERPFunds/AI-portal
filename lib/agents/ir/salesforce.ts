/**
 * Minimal Salesforce REST client for the IR inbox sweep.
 * Auth: OAuth 2.0 client-credentials flow against a Connected App.
 *
 * Required env (set in Vercel once the SF admin creates the Connected App):
 *   SF_TOKEN_URL     e.g. https://erpfunds.my.salesforce.com/services/oauth2/token
 *   SF_CLIENT_ID     Connected App consumer key
 *   SF_CLIENT_SECRET Connected App consumer secret
 *
 * The token response carries instance_url + access_token; we cache the token
 * in-process until shortly before it expires.
 */

const API_VERSION = "v60.0";

interface SfToken {
  accessToken: string;
  instanceUrl: string;
  expiresAt: number; // epoch ms
}

let cached: SfToken | null = null;

export function salesforceConfigured(): boolean {
  return !!(process.env.SF_TOKEN_URL && process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET);
}

async function getToken(): Promise<SfToken> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached;

  const tokenUrl = process.env.SF_TOKEN_URL!;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.SF_CLIENT_ID!,
    client_secret: process.env.SF_CLIENT_SECRET!,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`SF auth ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  if (!data.access_token || !data.instance_url) {
    throw new Error(`SF auth missing token/instance_url: ${JSON.stringify(data).slice(0, 300)}`);
  }
  // client_credentials tokens don't return expires_in on all orgs; assume ~2h, cache 90 min.
  cached = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url.replace(/\/$/, ""),
    expiresAt: Date.now() + 90 * 60_000,
  };
  return cached;
}

async function sfFetch(path: string, init?: RequestInit): Promise<Response> {
  const t = await getToken();
  return fetch(`${t.instanceUrl}/services/data/${API_VERSION}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t.accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

/** SOQL string-literal escape. */
function soql(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export interface SfFieldInfo {
  name: string;   // API name, e.g. "Capital_Called__c"
  label: string;  // human label, e.g. "Capital Called"
  type: string;   // currency, picklist, double, string, …
  custom: boolean;
}

/** Describe an object's fields (used to discover custom LP fields without guessing API names). */
export async function describeFields(objectName: string): Promise<SfFieldInfo[]> {
  const res = await sfFetch(`/sobjects/${encodeURIComponent(objectName)}/describe`);
  if (!res.ok) throw new Error(`SF describe ${objectName} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.fields ?? []).map((f: { name: string; label: string; type: string; custom: boolean }) => ({
    name: f.name, label: f.label, type: f.type, custom: !!f.custom,
  }));
}

/** List queryable custom objects (e.g. a Commitments/Investments object where fund financials may live). */
export async function listCustomObjects(): Promise<{ name: string; label: string }[]> {
  const res = await sfFetch(`/sobjects`);
  if (!res.ok) throw new Error(`SF list objects ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.sobjects ?? [])
    .filter((s: { custom: boolean; queryable: boolean }) => s.custom && s.queryable)
    .map((s: { name: string; label: string }) => ({ name: s.name, label: s.label }));
}

export interface LpSfData {
  crmId: string;
  lpType: string | null;
  called: number | null;
  distributions: number | null;
}
export interface LpSfFieldMap {
  lpType: string | null;
  called: string | null;
  distributions: string | null;
}

/** Pick a field API name: env override first, then by label patterns, then by name patterns. */
function pickField(fields: SfFieldInfo[], override: string | undefined, labelPats: RegExp[], namePats: RegExp[]): string | null {
  if (override && fields.some((f) => f.name === override)) return override;
  for (const re of labelPats) { const f = fields.find((x) => re.test(x.label)); if (f) return f.name; }
  for (const re of namePats)  { const f = fields.find((x) => re.test(x.name));  if (f) return f.name; }
  return null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve LP financial data from Salesforce Contacts, matched by email.
 * Auto-discovers the LP Type / Capital Called / Distributions fields by label
 * (override via SF_LP_TYPE_FIELD / SF_CALLED_FIELD / SF_DISTRIB_FIELD). Only fills
 * a column when a field is confidently resolved — never guesses numbers.
 */
export async function fetchLpSalesforceData(
  emails: string[]
): Promise<{ byEmail: Record<string, LpSfData>; fieldMap: LpSfFieldMap; matched: number }> {
  const byEmail: Record<string, LpSfData> = {};
  const fieldMap: LpSfFieldMap = { lpType: null, called: null, distributions: null };
  const clean = [...new Set(emails.map((e) => e.trim()).filter(Boolean))];
  if (clean.length === 0) return { byEmail, fieldMap, matched: 0 };

  const fields = await describeFields("Contact");
  fieldMap.lpType = pickField(fields, process.env.SF_LP_TYPE_FIELD,
    [/^lp\s*type$/i, /investor\s*type/i, /lp\s*class/i, /investor\s*class/i, /share\s*class/i],
    [/lp_?type/i, /investor_?type/i]);
  fieldMap.called = pickField(fields, process.env.SF_CALLED_FIELD,
    [/capital\s*called/i, /called\s*to\s*date/i, /total\s*called/i, /paid[\s-]*in/i, /contribut/i],
    [/capital_?call/i, /called/i, /paid_?in/i, /contribut/i]);
  fieldMap.distributions = pickField(fields, process.env.SF_DISTRIB_FIELD,
    [/distribution/i],
    [/distrib/i]);

  const extra = [fieldMap.lpType, fieldMap.called, fieldMap.distributions].filter(Boolean) as string[];
  const selectFields = ["Id", "Email", ...extra].join(", ");

  let matched = 0;
  for (let i = 0; i < clean.length; i += 200) {
    const inList = clean.slice(i, i + 200).map((e) => `'${soql(e)}'`).join(",");
    const q = `SELECT ${selectFields} FROM Contact WHERE Email IN (${inList})`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`SF LP query ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    for (const rec of (data.records ?? []) as Record<string, unknown>[]) {
      const email = String(rec.Email ?? "").toLowerCase().trim();
      if (!email) continue;
      byEmail[email] = {
        crmId: String(rec.Id),
        lpType: fieldMap.lpType && rec[fieldMap.lpType] != null ? String(rec[fieldMap.lpType]) : null,
        called: fieldMap.called ? toNum(rec[fieldMap.called]) : null,
        distributions: fieldMap.distributions ? toNum(rec[fieldMap.distributions]) : null,
      };
      matched++;
    }
  }
  return { byEmail, fieldMap, matched };
}

/** Find a Contact Id by exact email match; returns the first match or null. */
export async function findContactByEmail(email: string): Promise<string | null> {
  const q = `SELECT Id FROM Contact WHERE Email = '${soql(email)}' LIMIT 1`;
  const res = await sfFetch(`/query?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`SF query ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.records?.[0]?.Id ?? null;
}

export async function createContact(p: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<string> {
  const res = await sfFetch(`/sobjects/Contact`, {
    method: "POST",
    body: JSON.stringify({
      FirstName: p.firstName || undefined,
      LastName: p.lastName || "Unknown",
      Email: p.email,
      LeadSource: "Inbound Email",
    }),
  });
  if (!res.ok) throw new Error(`SF create contact ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.id as string;
}

export async function createTask(p: {
  whoId: string;
  subject: string;
  description: string;
  activityDate: string; // YYYY-MM-DD
}): Promise<string> {
  const res = await sfFetch(`/sobjects/Task`, {
    method: "POST",
    body: JSON.stringify({
      WhoId: p.whoId,
      Subject: p.subject,
      Description: p.description,
      Status: "Completed",
      Type: "Email",
      ActivityDate: p.activityDate,
    }),
  });
  if (!res.ok) throw new Error(`SF create task ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.id as string;
}

/**
 * Find-or-create the Contact, then log a correspondence Task on it.
 * Returns a short status string for the sweep log.
 */
export async function logCorrespondence(p: {
  investorEmail: string;
  firstName: string;
  lastName: string;
  subject: string;
  snippet: string;
  receivedDate: string;
  sourceMailbox: string;
}): Promise<string> {
  let contactId = await findContactByEmail(p.investorEmail);
  let created = false;
  if (!contactId) {
    contactId = await createContact({ firstName: p.firstName, lastName: p.lastName, email: p.investorEmail });
    created = true;
  }
  const activityDate = (p.receivedDate || new Date().toISOString()).slice(0, 10);
  await createTask({
    whoId: contactId,
    subject: `Email: ${p.subject}`.slice(0, 255),
    description:
      `Inbound investor email received ${p.receivedDate} via ${p.sourceMailbox}.\n` +
      `From: ${p.investorEmail}\nSubject: ${p.subject}\n\n${p.snippet}`,
    activityDate,
  });
  return created ? "sf-created-contact+task" : "sf-task(existing-contact)";
}
