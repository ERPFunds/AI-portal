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

// Entity/trust name noise words stripped before name matching, so what remains is person names.
const NAME_STOP = new Set([
  "the", "and", "of", "for", "trust", "trustee", "trustees", "family", "revocable", "irrevocable",
  "living", "dated", "created", "estate", "llc", "lp", "llp", "inc", "co", "company", "corp",
  "partnership", "partners", "fund", "properties", "property", "associates", "holdings", "group",
  "investments", "investment", "capital", "ii", "iii", "iv", "jr", "sr", "dds", "md", "phd", "esq",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december", "revocable",
]);

/** Significant name tokens (surnames / first names) from an entity or person name, for matching. */
function personTokens(s: string): Set<string> {
  return new Set(
    (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NAME_STOP.has(w))
  );
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
  brokerCompany: string | null;   // LP primary contact's firm (from the contact->Account resolution)
  brokerContact: string | null;   // LP primary contact's name
  advisorFirm: string | null;     // real broker/advisor firm (from the LP's Opportunity partner fields)
  advisorContact: string | null;  // broker/advisor rep
  contactEmail: string | null;    // LP primary contact's email (for last-interaction matching)
  advisorEmail: string | null;    // broker/advisor rep's email
}
export interface LpSfFieldMap {
  lpType: string | null;
  called: string | null;
  distributions: string | null;
  brokerCompany: string | null; // SOQL select expr used (e.g. "Account.Name" or a custom field)
  brokerContact: string | null;
}

/** A DST/1031 investor pulled from the Salesforce broker book (not in the Fund IV schedule). */
export interface DstInvestor {
  investor: string;
  commitment: string;
  commitmentUsd: number;
  advisorFirm: string | null;
  advisorContact: string | null;
  advisorEmail: string | null;
  stage: string | null;
  crmId: string | null;
}

/** Custodian-wrapped IRA accounts read like "STRATA Trust Company Custodian FBO (Jane Doe) IRA
 *  (# 12345)" — surface the underlying investor name when we can and drop trailing account #s. */
function cleanDstName(raw: string): string {
  const fbo = raw.match(/\bFBO\b[:\s]*\(?\s*([A-Za-z][A-Za-z.'\-& ]+?)\s*\)?\s*(?:\b(?:IRA|Roth|SEP|SIMPLE|401k?|traditional|inherited|custodian|beneficiary)\b|\(#|$)/i);
  let name = fbo ? fbo[1] : raw;
  name = name.replace(/\s*\(#[^)]*\)/g, "").replace(/\s+/g, " ").trim();
  return name || raw.trim();
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
  lps: { investor: string; contact: string }[]
): Promise<{ byName: Record<string, LpSfData>; fieldMap: LpSfFieldMap; matched: number; dstInvestors: DstInvestor[] }> {
  const byName: Record<string, LpSfData> = {};
  const fieldMap: LpSfFieldMap = { lpType: null, called: null, distributions: null, brokerCompany: null, brokerContact: null };
  const clean = [...new Set(lps.map((l) => l.investor.trim()).filter(Boolean))];
  if (clean.length === 0) return { byName, fieldMap, matched: 0, dstInvestors: [] };

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
  fieldMap.brokerCompany = "Contact[primaryContact].Account.Name";
  fieldMap.brokerContact = "Contact[primaryContact].Name";

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
        advisorFirm: null,
        advisorContact: null,
        contactEmail: null,
        advisorEmail: null,
      };
      idToKey[id] = key;
      matched++;
    }
  }

  const rel = (v: unknown): string | null => {
    const o = v as { Name?: unknown } | null | undefined;
    return o?.Name != null && String(o.Name).trim() ? String(o.Name) : null;
  };

  // 1b) LP Type + real broker/advisor from each LP's Opportunity (Account = the LP; the Partner_*
  //     lookups point to the broker/advisor Account; Type = the Investment Type e.g. "DST").
  const accIds = Object.keys(idToKey);
  let oppCount = 0, oppWithPartner = 0;
  for (let i = 0; i < accIds.length; i += 200) {
    const idList = accIds.slice(i, i + 200).map((id) => `'${id}'`).join(",");
    try {
      const oq = `SELECT AccountId, Type, Partner_Advisor__r.Name, Partner_Brokerage__r.Name, Partner_Broker_Dealer__r.Name, Partner_Advisor_Contact__r.Name, Partner_Advisor_Contact__r.Email FROM Opportunity WHERE AccountId IN (${idList}) ORDER BY CreatedDate DESC`;
      const ores = await sfFetch(`/query?q=${encodeURIComponent(oq)}`);
      if (!ores.ok) { console.log("[lp-opp] query", ores.status, (await ores.text()).slice(0, 150)); continue; }
      for (const o of (((await ores.json()).records ?? []) as Record<string, unknown>[])) {
        oppCount++;
        if (o.Partner_Advisor__r || o.Partner_Brokerage__r || o.Partner_Broker_Dealer__r || o.Partner_Advisor_Contact__r) oppWithPartner++;
        const row = byName[idToKey[String(o.AccountId)] ?? ""];
        if (!row) continue;
        if (!row.lpType && o.Type != null && String(o.Type).trim()) row.lpType = String(o.Type);
        const firm = rel(o.Partner_Advisor__r) || rel(o.Partner_Brokerage__r) || rel(o.Partner_Broker_Dealer__r);
        const repName = rel(o.Partner_Advisor_Contact__r);
        const repEmail = (o.Partner_Advisor_Contact__r as { Email?: unknown } | null)?.Email;
        if (firm && !row.advisorFirm) row.advisorFirm = firm;
        if (repName && !row.advisorContact) row.advisorContact = repName;
        if (repEmail != null && String(repEmail).trim() && !row.advisorEmail) row.advisorEmail = String(repEmail);
      }
    } catch (e) { console.log("[lp-opp] err", String(e).slice(0, 120)); }
  }
  // 1c) Cross-product broker match. Brokers live on the DST/1031 book — a DIFFERENT set of accounts
  //     than the Fund IV schedule (e.g. "The Weisenseel Family Trust" => Concorde). Fetch that book
  //     and match each Fund IV LP to it by PERSON-NAME tokens (surnames/first names), conservatively
  //     so common surnames (Brown, Davis) don't cross-attribute.
  const scheduleSet = new Set(clean.map((n) => n.toLowerCase().trim()));
  // DST/1031 investors: broker-book accounts that aren't Fund IV schedule LPs, keyed by account.
  const dstByAcct = new Map<string, { name: string; id: string | null; firm: string; rep: string | null; repEmail: string | null; amountUsd: number; stage: string | null }>();
  const brokerBook: { toks: Set<string>; firm: string; rep: string | null; repEmail: string | null; acct: string }[] = [];
  try {
    let path: string | null = `/query?q=${encodeURIComponent(
      "SELECT Account.Id, Account.Name, Amount, StageName, Partner_Broker_Dealer__r.Name, Partner_Advisor__r.Name, Partner_Brokerage__r.Name, Partner_Advisor_Contact__r.Name, Partner_Advisor_Contact__r.Email FROM Opportunity WHERE Partner_Broker_Dealer__c != null OR Partner_Advisor__c != null OR Partner_Brokerage__c != null"
    )}`;
    let guard = 0;
    while (path && guard++ < 25) {
      const br: Response = await sfFetch(path);
      if (!br.ok) { console.log("[lp-broker-book] query", br.status, (await br.text()).slice(0, 150)); break; }
      const j = await br.json();
      for (const o of ((j.records ?? []) as Record<string, unknown>[])) {
        const acct = rel(o.Account);
        const firm = rel(o.Partner_Broker_Dealer__r) || rel(o.Partner_Advisor__r) || rel(o.Partner_Brokerage__r);
        if (!acct || !firm) continue;
        const repRec = o.Partner_Advisor_Contact__r as { Email?: unknown } | null;
        const rep = rel(o.Partner_Advisor_Contact__r);
        const repEmail = repRec?.Email != null && String(repRec.Email).trim() ? String(repRec.Email) : null;
        brokerBook.push({ toks: personTokens(acct), firm, rep, repEmail, acct });
        // Surface as a DST/1031 investor row when it isn't already a Fund IV schedule LP.
        const key = acct.toLowerCase().trim();
        if (!scheduleSet.has(key)) {
          const acctObj = o.Account as { Id?: unknown } | null;
          const amt = toNum(o.Amount) ?? 0;
          const stage = o.StageName != null && String(o.StageName).trim() ? String(o.StageName) : null;
          const ex = dstByAcct.get(key);
          if (!ex) dstByAcct.set(key, { name: acct, id: acctObj?.Id != null ? String(acctObj.Id) : null, firm, rep, repEmail, amountUsd: amt, stage });
          else { ex.amountUsd += amt; if (!ex.rep) ex.rep = rep; if (!ex.repEmail) ex.repEmail = repEmail; if (!ex.stage) ex.stage = stage; }
        }
      }
      path = j.done === false && j.nextRecordsUrl ? String(j.nextRecordsUrl).replace(/^.*\/services\/data\/v[\d.]+/, "") : null;
    }
  } catch (e) { console.log("[lp-broker-book] err", String(e).slice(0, 120)); }

  const matchLog: string[] = [];
  for (const l of lps) {
    const row = byName[l.investor.toLowerCase().trim()];
    if (!row || row.advisorFirm) continue; // keep any direct-Opportunity match
    const lpToks = personTokens(`${l.investor} ${l.contact || ""}`);
    if (lpToks.size === 0) continue;
    let best: { entry: typeof brokerBook[number]; shared: number; maxLen: number } | null = null;
    for (const b of brokerBook) {
      let shared = 0, maxLen = 0;
      for (const t of lpToks) if (b.toks.has(t)) { shared++; if (t.length > maxLen) maxLen = t.length; }
      // Confident match ONLY on a full person: 2+ shared name tokens (a single shared first name
      // or surname is NOT enough — that cross-attributed unrelated investors/brokers).
      const ok = shared >= 2 && maxLen >= 4;
      if (ok && (!best || shared > best.shared || (shared === best.shared && maxLen > best.maxLen))) best = { entry: b, shared, maxLen };
    }
    if (best) {
      row.advisorFirm = best.entry.firm;
      if (best.entry.rep && !row.advisorContact) row.advisorContact = best.entry.rep;
      if (best.entry.repEmail && !row.advisorEmail) row.advisorEmail = best.entry.repEmail;
      if (matchLog.length < 12) matchLog.push(`${l.investor} => ${best.entry.firm} [${best.entry.acct}] (${best.shared}tok)`);
    }
  }
  console.log("[lp-broker-match]", JSON.stringify({
    matchedAccts: accIds.length, oppCount, oppWithPartner, brokerBook: brokerBook.length,
    withAdvisor: Object.values(byName).filter((r) => r.advisorFirm).length, samples: matchLog,
  }));
  if (!fieldMap.lpType) fieldMap.lpType = "Opportunity.Type";

  // 2) Broker/advisor: each LP's primary contact (from the schedule) is a Salesforce Contact whose
  //    Account is the broker/advisor firm. Match Contacts by name, then map back to each LP row.
  const contactNames = [...new Set(lps.map((l) => (l.contact || "").trim()).filter(Boolean))];
  const contactByName: Record<string, { name: string; firm: string | null; type: string | null; email: string | null }> = {};
  for (let i = 0; i < contactNames.length; i += 200) {
    const inList = contactNames.slice(i, i + 200).map((n) => `'${soql(n)}'`).join(",");
    const res = await sfFetch(`/query?q=${encodeURIComponent(`SELECT Id, Name, Email, Account.Name, Account.Type FROM Contact WHERE Name IN (${inList})`)}`);
    if (!res.ok) { console.log("[lp-contact-debug] query failed", res.status, (await res.text()).slice(0, 200)); continue; }
    const cData = await res.json();
    console.log("[lp-contact-debug] batch", (cData.records ?? []).length, "of", contactNames.length, "names; sample", JSON.stringify((cData.records ?? []).slice(0, 5)));
    for (const c of ((cData.records ?? []) as Record<string, unknown>[])) {
      const key = String(c.Name ?? "").toLowerCase().trim();
      if (!key || contactByName[key]) continue;
      const acc = c.Account as { Name?: unknown; Type?: unknown } | null | undefined;
      contactByName[key] = { name: String(c.Name), firm: rel(c.Account), type: acc?.Type != null ? String(acc.Type) : null, email: c.Email != null && String(c.Email).trim() ? String(c.Email) : null };
    }
  }
  // Route the primary contact by its Account TYPE: if the contact belongs to a
  // Broker/Advisor/Brokerage/Broker-Dealer account, it's the real broker → Broker/Advisor
  // column. Otherwise (Investor etc.) it's the LP's own person → LP Primary Contact.
  const BROKER_ACCT_TYPE = /broker|advisor|dealer|brokerage/i;
  for (const l of lps) {
    const row = byName[l.investor.toLowerCase().trim()];
    if (!row) continue;
    const ci = contactByName[(l.contact || "").toLowerCase().trim()];
    if (!ci) continue;
    if (BROKER_ACCT_TYPE.test(ci.type || "")) {
      if (ci.firm && !row.advisorFirm) row.advisorFirm = ci.firm;
      if (ci.name && !row.advisorContact) row.advisorContact = ci.name;
      if (ci.email && !row.advisorEmail) row.advisorEmail = ci.email;
    } else {
      if (ci.firm && !row.brokerCompany) row.brokerCompany = ci.firm;
      if (ci.name && !row.brokerContact) row.brokerContact = ci.name;
      if (ci.email && !row.contactEmail) row.contactEmail = ci.email;
    }
  }

  const dstInvestors: DstInvestor[] = [...dstByAcct.values()].map((d) => ({
    investor: cleanDstName(d.name),
    commitmentUsd: d.amountUsd,
    commitment: d.amountUsd > 0 ? `$${Math.round(d.amountUsd).toLocaleString("en-US")}` : "",
    advisorFirm: d.firm,
    advisorContact: d.rep,
    advisorEmail: d.repEmail,
    stage: d.stage,
    crmId: d.id,
  }));
  console.log("[lp-dst]", JSON.stringify({
    count: dstInvestors.length,
    sample: dstInvestors.slice(0, 8).map((d) => ({ n: d.investor, f: d.advisorFirm, amt: d.commitmentUsd, st: d.stage })),
  }));

  return { byName, fieldMap, matched, dstInvestors };
}

// ── Two-way sync: write LP directory edits back to Salesforce ─────────────────────
// Guardrails: we only write when the target SF record is matched UNAMBIGUOUSLY (exactly one
// Account/Contact/Opportunity by exact name). We never create records. Every field reports its
// own outcome so the UI can show exactly what synced and what was skipped and why.

export interface SfWriteResult { field: string; status: "updated" | "skipped" | "error"; detail?: string }

async function sfQuery(soqlStr: string): Promise<Record<string, unknown>[]> {
  const res = await sfFetch(`/query?q=${encodeURIComponent(soqlStr)}`);
  if (!res.ok) throw new Error(`SF query ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return ((await res.json()).records ?? []) as Record<string, unknown>[];
}

async function sfUpdate(objectType: string, id: string, fields: Record<string, unknown>): Promise<{ ok: boolean; detail?: string }> {
  const res = await sfFetch(`/sobjects/${objectType}/${id}`, { method: "PATCH", body: JSON.stringify(fields) });
  if (res.status === 204) return { ok: true };
  const txt = (await res.text().catch(() => "")).slice(0, 200);
  return { ok: false, detail: `${res.status} ${res.status === 403 || res.status === 401 ? "(integration user lacks edit rights)" : ""} ${txt}`.trim() };
}

export async function applyLpEditToSalesforce(params: {
  investor: string;
  contact?: string;
  edits: { email?: string; phone?: string; notes?: string; commitmentUsd?: number; brokerFirm?: string; brokerContact?: string };
}): Promise<SfWriteResult[]> {
  if (!salesforceConfigured()) return [{ field: "salesforce", status: "skipped", detail: "not configured" }];
  const { investor, contact, edits } = params;
  const out: SfWriteResult[] = [];
  try {
    const accts = await sfQuery(`SELECT Id FROM Account WHERE Name = '${soql(investor)}'`);
    const accountId = accts.length === 1 ? String(accts[0].Id) : null;

    // Notes -> Account.Description (direct write to the matched Account)
    if (edits.notes !== undefined) {
      if (!accountId) out.push({ field: "notes", status: "skipped", detail: `${accts.length} SF accounts match "${investor}"` });
      else { const r = await sfUpdate("Account", accountId, { Description: edits.notes }); out.push(r.ok ? { field: "notes", status: "updated" } : { field: "notes", status: "error", detail: r.detail }); }
    }

    // Email / Phone -> the LP's primary Contact (exact name, preferring one under this Account)
    if (edits.email !== undefined || edits.phone !== undefined) {
      const cname = (contact || "").trim();
      if (!cname) out.push({ field: "email/phone", status: "skipped", detail: "no contact name on this row" });
      else {
        let cons = accountId ? await sfQuery(`SELECT Id FROM Contact WHERE Name = '${soql(cname)}' AND AccountId = '${accountId}'`) : [];
        if (cons.length === 0) cons = await sfQuery(`SELECT Id FROM Contact WHERE Name = '${soql(cname)}'`);
        if (cons.length === 1) {
          const f: Record<string, unknown> = {};
          if (edits.email !== undefined) f.Email = edits.email;
          if (edits.phone !== undefined) f.Phone = edits.phone;
          const r = await sfUpdate("Contact", String(cons[0].Id), f);
          out.push(r.ok ? { field: "email/phone", status: "updated" } : { field: "email/phone", status: "error", detail: r.detail });
        } else out.push({ field: "email/phone", status: "skipped", detail: `${cons.length} contacts match "${cname}"` });
      }
    }

    // Commitment + Broker need the LP's single Opportunity
    const needOpp = edits.commitmentUsd !== undefined || (edits.brokerFirm ?? "") !== "" || (edits.brokerContact ?? "") !== "";
    let oppId: string | null = null;
    let oppCount = 0;
    if (needOpp && accountId) {
      const opps = await sfQuery(`SELECT Id FROM Opportunity WHERE AccountId = '${accountId}' ORDER BY CreatedDate DESC`);
      oppCount = opps.length;
      oppId = opps.length === 1 ? String(opps[0].Id) : null;
    }
    const oppSkip = !accountId ? `LP account not uniquely matched (${accts.length})` : `${oppCount} opportunities for this LP`;

    if (edits.commitmentUsd !== undefined) {
      if (!oppId) out.push({ field: "commitment", status: "skipped", detail: oppSkip });
      else { const r = await sfUpdate("Opportunity", oppId, { Amount: edits.commitmentUsd }); out.push(r.ok ? { field: "commitment", status: "updated" } : { field: "commitment", status: "error", detail: r.detail }); }
    }

    if ((edits.brokerFirm ?? "") !== "") {
      if (!oppId) out.push({ field: "broker firm", status: "skipped", detail: oppSkip });
      else {
        const b = await sfQuery(`SELECT Id FROM Account WHERE Name = '${soql(edits.brokerFirm!)}'`);
        if (b.length === 1) { const r = await sfUpdate("Opportunity", oppId, { Partner_Advisor__c: String(b[0].Id) }); out.push(r.ok ? { field: "broker firm", status: "updated", detail: `linked Partner_Advisor → "${edits.brokerFirm}"` } : { field: "broker firm", status: "error", detail: r.detail }); }
        else out.push({ field: "broker firm", status: "skipped", detail: `"${edits.brokerFirm}" ${b.length === 0 ? "not found" : "ambiguous"} in SF (won't create)` });
      }
    }

    if ((edits.brokerContact ?? "") !== "") {
      if (!oppId) out.push({ field: "broker rep", status: "skipped", detail: oppSkip });
      else {
        const c = await sfQuery(`SELECT Id FROM Contact WHERE Name = '${soql(edits.brokerContact!)}'`);
        if (c.length === 1) { const r = await sfUpdate("Opportunity", oppId, { Partner_Advisor_Contact__c: String(c[0].Id) }); out.push(r.ok ? { field: "broker rep", status: "updated" } : { field: "broker rep", status: "error", detail: r.detail }); }
        else out.push({ field: "broker rep", status: "skipped", detail: `"${edits.brokerContact}" ${c.length === 0 ? "not found" : "ambiguous"}` });
      }
    }
  } catch (e) {
    out.push({ field: "salesforce", status: "error", detail: String(e).slice(0, 200) });
  }
  return out;
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
      // NOTE: no `Type` — the Task.Type picklist isn't enabled in this org (returns a 400).
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
