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
