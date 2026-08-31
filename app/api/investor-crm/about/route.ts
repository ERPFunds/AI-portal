import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Researches public-source detail for an investor account — the "About" line, plus the
// entity's website and business address — via Claude's web_search tool, and writes it back
// to investor_crm. The drawer fields stay hand-editable.
//
// Accuracy over coverage: these are real LPs, so the model is told to return an empty
// string rather than guess when it cannot identify the entity with confidence. Website and
// address are only ever filled in where the record has none, so hand-entered values and the
// addresses that came off the LP spreadsheets are never overwritten.

const normKey = (investor: string) => investor.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SYSTEM = `You research investors for the investor-relations CRM of ERP Funds, a commercial real estate private equity firm (industrial/IOS assets, Permian Basin and secondary markets).

Given the name of an investing entity — and possibly the name of the individual behind it — search the public web (LinkedIn, company websites, professional bios, press, filings) and return what you can verify for the CRM record.

ABOUT
- 1-2 sentences, under 45 words. No preamble, no "This entity appears to be".
- Say who they are: profession or role, firm or company, city/region, and anything about their wealth source or investing background that helps an IR team hold a conversation.
- Family trusts, IRAs and custodial accounts: describe the PERSON or FAMILY behind the account, not the legal wrapper. A custodian (Goldstar, Strata, Millennium, Equity Trust) is not the investor.
- No commentary on their investment in ERP Funds, and no speculation about capacity to invest.

WEBSITE
- The entity's own site, or the site of the operating company the individual runs or leads. Full https URL.
- Never a LinkedIn profile, Bloomberg/ZoomInfo/Crunchbase listing, news article, or any other directory or aggregator page. If the entity has no site of its own, return an empty string.

ADDRESS
- BUSINESS or office address only — street, city, state, ZIP on one line.
- Never a private individual's home or residential address. If the only address you can find for a person is where they live, return an empty string. For an operating company, LLC or fund, the corporate office is fine.

CLOSELY-HELD ENTITIES
- Many of these accounts are small Texas LLCs, LPs and Inc.s with no web presence at all — Johnston Properties Inc., Dog Canyon Investments LP and the like. A plain name search returns unrelated companies for these.
- For those, search state business registries and filing records (Texas Comptroller and Secretary of State, Bizapedia, OpenCorporates, SEC Form D filings, county records) and identify the entity by its FILING: state and year of formation, registered city, and the officer, manager, general partner or registered agent named on it.
- Cross-check against the contact name on the account. An entity whose officer or agent matches the account's contact is the right entity; one that does not is not, however similar the name.
- A line like "Texas limited partnership formed in 1998, based in Midland; managed by <name>, who also runs <company>" is a good result. Say what the filing says and stop there.
- These registries are acceptable evidence for the ABOUT and the ADDRESS. They are still not acceptable as the WEBSITE.

RULES THAT OVERRIDE EVERYTHING ABOVE
- Only state what you actually found in a source. Never infer a job, employer, website, or address from a name.
- Common names are the main failure mode. If you cannot tell which person or company a name refers to, or the searches return nothing specific, return empty strings. An empty result is correct and useful; a plausible guess about a real client is not.

Reply with ONLY a JSON object, no markdown fence:
{"about": "...", "website": "...", "address": "...", "confidence": "high" | "medium" | "low", "sources": ["url", ...]}
Use confidence "low" only alongside an empty about.`;

const anthropic = new Anthropic();

type Row = {
  investor_key: string;
  investor: string;
  contact: string | null;
  fund: string | null;
  notes: string | null;
  address: string | null;
  website: string | null;
  about: string | null;
};

const BAD_SITE = /linkedin\.com|bloomberg\.com|zoominfo|crunchbase|dnb\.com|facebook\.com|twitter\.com|wikipedia/i;
const URL_RE = /https?:\/\/[^\s"'\\]+/g;

async function research(row: Row, contacts: string[]) {
  const facts = [
    `Investing entity: ${row.investor}`,
    row.contact ? `Contact on the account: ${row.contact}` : "",
    contacts.length ? `Known people at this account: ${contacts.join(", ")}` : "",
    row.address ? `Address already on file (do not contradict it): ${row.address}` : "",
    row.website ? `Website already on file: ${row.website}` : "",
    row.notes ? `CRM notes: ${row.notes}` : "",
  ].filter(Boolean).join("\n");

  const res = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [
      { type: "web_search_20250305" as "web_search_20250305", name: "web_search", max_uses: 6 } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: `${facts}\n\nResearch this investor and return the JSON object.` }],
  });

  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  let parsed: { about?: string; website?: string; address?: string; confidence?: string; sources?: string[] } = {};
  if (start >= 0 && end > start) {
    try { parsed = JSON.parse(stripped.slice(start, end + 1)); } catch { /* fall through to empty */ }
  }

  const about = String(parsed.about ?? "").trim();
  let website = String(parsed.website ?? "").trim();
  // Directory and profile pages are not the entity's own site, whatever the model decided.
  if (BAD_SITE.test(website)) website = "";
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  const address = String(parsed.address ?? "").trim().replace(/\s*\n\s*/g, ", ");
  // URLs the search actually returned, as a fallback when the model omits its sources.
  const found = (JSON.stringify(res.content).match(URL_RE) ?? [])
    .filter((u) => !u.includes("anthropic") && !u.includes("api."));
  const sources = (Array.isArray(parsed.sources) && parsed.sources.length ? parsed.sources : found).slice(0, 6);
  return { about, website, address, confidence: String(parsed.confidence ?? ""), sources };
}

export async function POST(req: NextRequest) {
  const supabase = createAdminClient();
  const cron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron) {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const cols = "investor_key, investor, contact, fund, notes, address, website, about";

  // Batch mode fills in accounts not yet researched — used by the backfill, not the UI.
  // what: "contact" drives the website/address pass, which covers accounts the earlier
  // About-only pass already went through.
  let targets: Row[] = [];
  if (body.all) {
    const q = supabase.from("investor_crm").select(cols).eq("archived", false).eq("is_lp", true);
    const { data, error } = body.what === "contact"
      ? await q.is("contact_researched_at", null)
      : await q.is("about", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targets = ((data ?? []) as Row[]).slice(0, Math.min(Number(body.limit) || 25, 60));
  } else {
    const investor = String(body.investor ?? "").trim();
    if (!investor) return NextResponse.json({ error: "investor required" }, { status: 400 });
    const { data, error } = await supabase.from("investor_crm").select(cols)
      .eq("investor_key", normKey(investor)).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such investor" }, { status: 404 });
    targets = [data as Row];
  }

  const keys = targets.map((t) => t.investor_key);
  const { data: people } = await supabase.from("investor_contacts")
    .select("investor_key, name, title").in("investor_key", keys.length ? keys : ["_none_"]);
  const byKey = new Map<string, string[]>();
  for (const p of (people ?? []) as { investor_key: string; name: string | null; title: string | null }[]) {
    if (!p.name) continue;
    const list = byKey.get(p.investor_key) ?? [];
    list.push(p.title ? `${p.name} (${p.title})` : p.name);
    byKey.set(p.investor_key, list);
  }

  const results: { investor: string; about: string; website: string; address: string; confidence: string; sources: string[] }[] = [];
  // Serial: the web_search calls are slow and this runs against a shared rate limit.
  for (const row of targets) {
    try {
      const r = await research(row, byKey.get(row.investor_key) ?? []);
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { about_researched_at: now, contact_researched_at: now };
      // An empty About is stored as "" (not null) so the backfill treats the account as
      // already attempted and does not re-research it every run. A blank result never
      // overwrites an About someone has written by hand.
      if (r.about || row.about == null) patch.about = r.about;
      // Sources are only meaningful next to a line they support. When the model declines
      // to identify the entity, the pages it happened to open are noise, not evidence.
      patch.about_sources = r.about && r.sources.length ? r.sources : null;
      // Only ever fill a gap — spreadsheet and hand-entered values win.
      if (r.website && !row.website) patch.website = r.website;
      if (r.address && !row.address) patch.address = r.address;
      await supabase.from("investor_crm").update(patch).eq("investor_key", row.investor_key);
      results.push({ investor: row.investor, ...r });
    } catch (e) {
      results.push({ investor: row.investor, about: "", website: "", address: "", confidence: "error", sources: [String(e).slice(0, 200)] });
    }
  }

  return NextResponse.json({
    count: results.length,
    found: results.filter((r) => r.about).length,
    websites: results.filter((r) => r.website).length,
    addresses: results.filter((r) => r.address).length,
    results,
  });
}
