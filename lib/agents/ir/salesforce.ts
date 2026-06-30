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

/**
 * Read-only connectivity check: verifies the client-credentials token exchange and that the
 * `api` scope works (via /limits). Writes nothing. Use to confirm creds/Connected App setup.
 */
export async function salesforcePing(): Promise<{
  ok: boolean;
  configured: boolean;
  instanceUrl?: string;
  apiVersion?: string;
  detail?: string;
}> {
  if (!salesforceConfigured()) {
    return { ok: false, configured: false, detail: "SF_TOKEN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET not all set" };
  }
  try {
    const t = await getToken();
    const res = await sfFetch(`/limits`);
    if (!res.ok) {
      return {
        ok: false,
        configured: true,
        instanceUrl: t.instanceUrl,
        detail: `GET /limits ${res.status}: ${(await res.text()).slice(0, 300)}`,
      };
    }
    return { ok: true, configured: true, instanceUrl: t.instanceUrl, apiVersion: API_VERSION };
  } catch (e) {
    return { ok: false, configured: true, detail: String(e).slice(0, 400) };
  }
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
  brokerCompany: string | null;
  brokerContact: string | null;
}
export interface LpSfFieldMap {
  lpType: string | null;
  called: string | null;
  distributions: string | null;
  brokerCompany: string | null; // SOQL select expr used (e.g. "Account.Name" or a custom field)
  brokerContact: string | null;
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

// Resolve a picked Contact field name into a SOQL select expr + a record reader.
// Reference fields (lookups) select the related record's Name (e.g. "Advisor__r.Name").
function fieldAccessor(
  fields: SfFieldInfo[],
  picked: string | null
): { expr: string; read: (rec: Record<string, unknown>) => string | null } | null {
  if (!picked) return null;
  const f = fields.find((x) => x.name === picked);
  if (!f) return null;
  if (f.type === "reference") {
    const rel = f.name.endsWith("__c") ? f.name.replace(/__c$/, "__r") : f.name.replace(/Id$/, "");
    return {
      expr: `${rel}.Name`,
      read: (rec) => {
        const obj = rec[rel] as { Name?: unknown } | null | undefined;
        return obj?.Name != null && String(obj.Name).trim() ? String(obj.Name) : null;
      },
    };
  }
  return {
    expr: f.name,
    read: (rec) => (rec[f.name] != null && String(rec[f.name]).trim() ? String(rec[f.name]) : null),
  };
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
  const fieldMap: LpSfFieldMap = { lpType: null, called: null, distributions: null, brokerCompany: null, brokerContact: null };
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

  // Broker/advisor firm = the Contact's parent Account by default; override with SF_BROKER_COMPANY_FIELD.
  const companyAcc =
    (process.env.SF_BROKER_COMPANY_FIELD ? fieldAccessor(fields, process.env.SF_BROKER_COMPANY_FIELD) : null) ?? {
      expr: "Account.Name",
      read: (rec: Record<string, unknown>) => {
        const a = rec.Account as { Name?: unknown } | null | undefined;
        return a?.Name != null && String(a.Name).trim() ? String(a.Name) : null;
      },
    };
  // Broker/advisor rep — discovered by label; override with SF_BROKER_CONTACT_FIELD.
  const brokerContactField = pickField(fields, process.env.SF_BROKER_CONTACT_FIELD,
    [/financial\s*advisor/i, /^advisor$/i, /selling\s*(rep|agent|advisor)/i, /registered\s*rep/i, /referred\s*by/i, /^broker$/i, /^rep(resentative)?$/i],
    [/financial_?advisor/i, /^advisor/i, /selling_?(rep|agent)/i, /referr/i, /\brep\b/i]);
  const contactAcc = fieldAccessor(fields, brokerContactField);
  fieldMap.brokerCompany = companyAcc.expr;
  fieldMap.brokerContact = contactAcc ? contactAcc.expr : null;

  const selectExprs = ["Id", "Email"];
  for (const fn of [fieldMap.lpType, fieldMap.called, fieldMap.distributions]) if (fn) selectExprs.push(fn);
  selectExprs.push(companyAcc.expr);
  if (contactAcc) selectExprs.push(contactAcc.expr);
  const selectFields = [...new Set(selectExprs)].join(", ");

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
        brokerCompany: companyAcc.read(rec),
        brokerContact: contactAcc ? contactAcc.read(rec) : null,
      };
      matched++;
    }
  }
  return { byEmail, fieldMap, matched };
}

/**
 * Diagnostic probe: given the LP company names + emails from the schedule, report how the data
 * lines up with Salesforce — Contact email matches vs Account NAME matches — plus the available
 * Contact/Account field labels and custom objects. Used to find the right join + fields.
 */
export async function salesforceLpProbe(
  names: string[],
  emails: string[]
): Promise<{
  contactFields: string[];
  accountFields: string[];
  customObjects: string[];
  contactEmailMatches: number;
  accountNameMatches: number;
  sampleAccountNames: string[];
}> {
  const contactFields = (await describeFields("Contact")).map((f) => f.label);
  const accountFields = (await describeFields("Account")).map((f) => f.label);
  const customObjects = (await listCustomObjects()).map((o) => `${o.label} (${o.name})`);

  const cleanEmails = [...new Set(emails.map((e) => e.trim()).filter(Boolean))].slice(0, 200);
  let contactEmailMatches = 0;
  if (cleanEmails.length) {
    const inList = cleanEmails.map((e) => `'${soql(e)}'`).join(",");
    const r = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Id FROM Contact WHERE Email IN (${inList})`)}`);
    if (r.ok) contactEmailMatches = (await r.json()).totalSize ?? 0;
  }

  const cleanNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 200);
  let accountNameMatches = 0;
  const sampleAccountNames: string[] = [];
  if (cleanNames.length) {
    const inList = cleanNames.map((n) => `'${soql(n)}'`).join(",");
    const r = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Id, Name FROM Account WHERE Name IN (${inList})`)}`);
    if (r.ok) {
      const d = await r.json();
      accountNameMatches = d.totalSize ?? 0;
      for (const rec of (d.records ?? []).slice(0, 5)) sampleAccountNames.push(String((rec as { Name?: unknown }).Name ?? ""));
    }
  }

  return { contactFields, accountFields, customObjects, contactEmailMatches, accountNameMatches, sampleAccountNames };
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
 * Log an AI-generated note about the REPLY that was sent to a contact (Workflow #3).
 * Find-or-create the Contact by recipient email, then log a completed Task whose Description
 * is the AI note (plus a Next step line when present). Returns a short status string.
 */
export async function logReplyNote(p: {
  contactEmail: string;
  firstName?: string;
  lastName?: string;
  subject: string;
  note: string;
  nextStep: string;
  sentDate: string;
}): Promise<string> {
  let contactId = await findContactByEmail(p.contactEmail);
  let created = false;
  if (!contactId) {
    contactId = await createContact({
      firstName: p.firstName ?? "",
      lastName: p.lastName || p.contactEmail.split("@")[0] || "Unknown",
      email: p.contactEmail,
    });
    created = true;
  }
  const activityDate = (p.sentDate || new Date().toISOString()).slice(0, 10);
  const hasNext = p.nextStep && p.nextStep.trim().toLowerCase() !== "none";
  const description =
    `Reply sent ${p.sentDate}.\nSubject: ${p.subject}\n\n${p.note}` +
    (hasNext ? `\n\nNext step: ${p.nextStep}` : "");
  await createTask({
    whoId: contactId,
    subject: `Reply: ${p.subject}`.slice(0, 255),
    description,
    activityDate,
  });
  return created ? "sf-created-contact+reply-note" : "sf-reply-note(existing-contact)";
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
