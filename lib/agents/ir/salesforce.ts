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

/** Describe an object's fields including reference targets — for mapping relationships (lookups). */
export async function describeFieldsRaw(
  objectName: string
): Promise<{ name: string; label: string; type: string; referenceTo: string[] }[]> {
  const res = await sfFetch(`/sobjects/${encodeURIComponent(objectName)}/describe`);
  if (!res.ok) throw new Error(`SF describe ${objectName} ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const data = await res.json();
  return (data.fields ?? []).map(
    (f: { name: string; label: string; type: string; referenceTo?: string[] }) => ({
      name: f.name,
      label: f.label,
      type: f.type,
      referenceTo: f.referenceTo ?? [],
    })
  );
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
 * Deep diagnostic: hunt for where an LP's broker/advisor is recorded in Salesforce —
 * relationship objects, Opportunity lookups, and the LP Account's related Contacts/Opportunities.
 * Returns compact log lines.
 */
export async function salesforceBrokerProbe(names: string[]): Promise<string[]> {
  const lines: string[] = [];
  const take = (recs: unknown, f: (r: Record<string, unknown>) => string, n = 10): string[] =>
    Array.isArray(recs) ? recs.slice(0, n).map((r) => f(r as Record<string, unknown>)) : [];

  try {
    const r = await sfFetch(`/sobjects`);
    if (r.ok) {
      const objs = ((await r.json()).sobjects ?? []) as { name: string; queryable: boolean }[];
      lines.push("relObjects=" + JSON.stringify(objs.filter((s) => s.queryable && /oppor|invest|commit|deal|relationship|broker|advisor|placement|subscription|referr|holding/i.test(s.name)).map((s) => s.name)));
    }
  } catch (e) { lines.push("objectsErr=" + String(e).slice(0, 100)); }

  try {
    const opp = await describeFieldsRaw("Opportunity");
    lines.push("oppFields=" + JSON.stringify(opp.filter((f) => f.referenceTo.length || /broker|advisor|referr|\brep\b|firm|partner|source|dealer/i.test(f.label)).map((f) => `${f.label} (${f.name})${f.referenceTo.length ? "->" + f.referenceTo.join("/") : ""}`)));
  } catch (e) { lines.push("oppErr=" + String(e).slice(0, 100)); }

  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 200);
  if (clean.length) {
    const inList = clean.map((n) => `'${soql(n)}'`).join(",");
    const accRes = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Id, Name FROM Account WHERE Name IN (${inList}) LIMIT 5`)}`);
    if (accRes.ok) {
      const accs = ((await accRes.json()).records ?? []) as Record<string, unknown>[];
      lines.push("sampleAccts=" + JSON.stringify(accs.map((a) => a.Name)));
      const ids = accs.map((a) => `'${String(a.Id)}'`).join(",");
      if (ids) {
        try {
          const c = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Name, Title, Account.Name FROM Contact WHERE AccountId IN (${ids})`)}`);
          if (c.ok) lines.push("relatedContacts=" + JSON.stringify(take((await c.json()).records, (r) => `${String(r.Name)}${r.Title ? " / " + String(r.Title) : ""}`)));
          else lines.push("contactsQ=" + c.status);
        } catch (e) { lines.push("contactsErr=" + String(e).slice(0, 100)); }
        try {
          const o = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Id, Name, StageName FROM Opportunity WHERE AccountId IN (${ids})`)}`);
          if (o.ok) { const od = await o.json(); lines.push(`relatedOpps(${od.totalSize ?? 0})=` + JSON.stringify(take(od.records, (r) => String(r.Name)))); }
          else lines.push("oppQ=" + o.status);
        } catch (e) { lines.push("oppsErr=" + String(e).slice(0, 100)); }
      }
    }
  }
  return lines;
}

/**
 * Resolve LP data from Salesforce ACCOUNTS, matched by the LP entity/company NAME (the
 * commitment schedule has no emails, and the LP is an Account, not a Contact). Per-investor
 * Called / Distributions / LP Type are not stored on the Account in this org, so they stay
 * null unless a matching field is found by label (override via SF_LP_TYPE_FIELD /
 * SF_CALLED_FIELD / SF_DISTRIB_FIELD). Broker/advisor firm defaults to the Account's Parent
 * Account (override via SF_BROKER_COMPANY_FIELD); rep via SF_BROKER_CONTACT_FIELD.
 */
export async function fetchLpSalesforceData(
  names: string[]
): Promise<{ byName: Record<string, LpSfData>; fieldMap: LpSfFieldMap; matched: number }> {
  const byName: Record<string, LpSfData> = {};
  const fieldMap: LpSfFieldMap = { lpType: null, called: null, distributions: null, brokerCompany: null, brokerContact: null };
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (clean.length === 0) return { byName, fieldMap, matched: 0 };

  // Optional financial fields on Account (this org has none → stay null; env override supported).
  const fields = await describeFields("Account");
  const lpTypeAcc = fieldAccessor(fields, pickField(fields, process.env.SF_LP_TYPE_FIELD,
    [/^lp\s*type$/i, /investor\s*type/i, /lp\s*class/i], [/lp_?type/i, /investor_?type/i]));
  const calledName = pickField(fields, process.env.SF_CALLED_FIELD,
    [/capital\s*called/i, /called\s*to\s*date/i, /total\s*called/i, /paid[\s-]*in/i], [/capital_?call/i, /\bcalled\b/i, /paid_?in/i]);
  const distribName = pickField(fields, process.env.SF_DISTRIB_FIELD, [/distribution/i], [/distrib/i]);
  fieldMap.lpType = lpTypeAcc ? lpTypeAcc.expr : null;
  fieldMap.called = calledName;
  fieldMap.distributions = distribName;
  fieldMap.brokerCompany = "Opportunity.Partner_Advisor/Brokerage/Broker_Dealer__r.Name";
  fieldMap.brokerContact = "Opportunity.Partner_Advisor_Contact__r.Name";

  const acctSel = ["Id", "Name"];
  if (lpTypeAcc) acctSel.push(lpTypeAcc.expr);
  if (calledName) acctSel.push(calledName);
  if (distribName) acctSel.push(distribName);

  // 1) Match LP entities to Accounts by company name.
  const idToKey: Record<string, string> = {};
  let matched = 0;
  for (let i = 0; i < clean.length; i += 200) {
    const inList = clean.slice(i, i + 200).map((n) => `'${soql(n)}'`).join(",");
    const q = `SELECT ${[...new Set(acctSel)].join(", ")} FROM Account WHERE Name IN (${inList})`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error(`SF LP account query ${res.status}: ${(await res.text()).slice(0, 200)}`);
    for (const rec of ((await res.json()).records ?? []) as Record<string, unknown>[]) {
      const key = String(rec.Name ?? "").toLowerCase().trim();
      if (!key) continue;
      const id = String(rec.Id);
      byName[key] = {
        crmId: id,
        lpType: lpTypeAcc ? lpTypeAcc.read(rec) : null,
        called: calledName ? toNum(rec[calledName]) : null,
        distributions: distribName ? toNum(rec[distribName]) : null,
        brokerCompany: null,
        brokerContact: null,
      };
      idToKey[id] = key;
    }
  }

  // 2) Pull broker/advisor from each LP's Opportunities (partner lookups), newest first.
  const rel = (v: unknown): string | null => {
    const o = v as { Name?: unknown } | null | undefined;
    return o?.Name != null && String(o.Name).trim() ? String(o.Name) : null;
  };
  const ids = Object.keys(idToKey);
  for (let i = 0; i < ids.length; i += 200) {
    const inList = ids.slice(i, i + 200).map((id) => `'${id}'`).join(",");
    const q =
      `SELECT AccountId, Partner_Advisor__r.Name, Partner_Brokerage__r.Name, Partner_Broker_Dealer__r.Name, Partner_Advisor_Contact__r.Name ` +
      `FROM Opportunity WHERE AccountId IN (${inList}) ORDER BY CloseDate DESC NULLS LAST`;
    const res = await sfFetch(`/query?q=${encodeURIComponent(q)}`);
    if (!res.ok) { console.log("[lp-opp-debug] query failed", res.status, (await res.text()).slice(0, 200)); continue; } // best-effort
    const oppData = await res.json();
    console.log("[lp-opp-debug] batch", (oppData.records ?? []).length, "sample", JSON.stringify((oppData.records ?? []).slice(0, 3)));
    for (const rec of ((oppData.records ?? []) as Record<string, unknown>[])) {
      const row = byName[idToKey[String(rec.AccountId)] ?? ""];
      if (!row) continue;
      const firm = rel(rec.Partner_Advisor__r) || rel(rec.Partner_Brokerage__r) || rel(rec.Partner_Broker_Dealer__r);
      const contact = rel(rec.Partner_Advisor_Contact__r);
      if (firm && !row.brokerCompany) row.brokerCompany = firm;
      if (contact && !row.brokerContact) row.brokerContact = contact;
    }
  }

  return { byName, fieldMap, matched };
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
  contactCustomFields: string[];
  accountCustomFields: string[];
  customObjects: string[];
  contactEmailMatches: number;
  accountNameMatches: number;
  sampleAccountNames: string[];
  emailsWithValue: number;
  namesCount: number;
}> {
  const contactCustomFields = (await describeFields("Contact")).filter((f) => f.custom).map((f) => `${f.label} (${f.name})`);
  const accountCustomFields = (await describeFields("Account")).filter((f) => f.custom).map((f) => `${f.label} (${f.name})`);
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

  return {
    contactCustomFields, accountCustomFields, customObjects,
    contactEmailMatches, accountNameMatches, sampleAccountNames,
    emailsWithValue: cleanEmails.length, namesCount: cleanNames.length,
  };
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
