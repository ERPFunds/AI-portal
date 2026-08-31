import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Researches a one-or-two-sentence "About" line for an investor account from public
// sources (LinkedIn, company sites, press) via Claude's web_search tool. Written back to
// investor_crm.about so the CRM keeps it; the drawer field stays hand-editable.
//
// Accuracy over coverage: these are real LPs, so the model is told to return an empty
// string rather than guess when it cannot identify the entity with confidence.

const normKey = (investor: string) => investor.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const SYSTEM = `You research investors for the investor-relations CRM of ERP Funds, a commercial real estate private equity firm (industrial/IOS assets, Permian Basin and secondary markets).

Given the name of an investing entity — and possibly the name of the individual behind it — search the public web (LinkedIn, company websites, professional bios, press, filings) and write a short factual "About" line for the CRM record.

RULES
- 1-2 sentences, under 45 words. No preamble, no "This entity appears to be".
- Say who they are: profession or role, firm or company, city/region, and anything about their wealth source or investing background that helps an IR team hold a conversation.
- Family trusts, IRAs and custodial accounts: describe the PERSON or FAMILY behind the account, not the legal wrapper. A custodian (Goldstar, Strata, Millennium, Equity Trust) is not the investor.
- Only state what you actually found in a source. Never infer a job, employer, or net worth from a name.
- Common names are the main failure mode. If you cannot tell which person a name refers to, or the searches return nothing specific, return an empty about string. An empty result is correct and useful; a plausible guess about a real client is not.
- No commentary on their investment in ERP Funds, and no speculation about capacity to invest.

Reply with ONLY a JSON object, no markdown fence:
{"about": "...", "confidence": "high" | "medium" | "low", "sources": ["url", ...]}
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

async function research(row: Row, contacts: string[]) {
  const facts = [
    `Investing entity: ${row.investor}`,
    row.contact ? `Contact on the account: ${row.contact}` : "",
    contacts.length ? `Known people at this account: ${contacts.join(", ")}` : "",
    row.address ? `Address on file: ${row.address}` : "",
    row.website ? `Website on file: ${row.website}` : "",
    row.notes ? `CRM notes: ${row.notes}` : "",
  ].filter(Boolean).join("\n");

  const res = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [
      { type: "web_search_20250305" as "web_search_20250305", name: "web_search", max_uses: 5 } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: `${facts}\n\nResearch this investor and return the JSON object.` }],
  });

  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  const json = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = json.indexOf("{");
  const end = json.lastIndexOf("}");
  let parsed: { about?: string; confidence?: string; sources?: string[] } = {};
  if (start >= 0 && end > start) {
    try { parsed = JSON.parse(json.slice(start, end + 1)); } catch { /* fall through to empty */ }
  }
  const about = String(parsed.about ?? "").trim();
  // URLs the search actually returned, as a fallback when the model omits its sources.
  const found = (JSON.stringify(res.content).match(/https?:\/\/[^\s"\\]+/g) ?? [])
    .filter((u) => !u.includes("anthropic") && !u.includes("api."));
  const sources = (Array.isArray(parsed.sources) && parsed.sources.length ? parsed.sources : found).slice(0, 6);
  return { about, confidence: String(parsed.confidence ?? ""), sources };
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

  // Batch mode fills in accounts that have no About yet — used by the backfill, not the UI.
  let targets: Row[] = [];
  if (body.all) {
    const { data, error } = await supabase.from("investor_crm").select(cols)
      .eq("archived", false).eq("is_lp", true).is("about", null);
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

  const results: { investor: string; about: string; confidence: string; sources: string[] }[] = [];
  // Serial: the web_search calls are slow and this runs against a shared rate limit.
  for (const row of targets) {
    try {
      const r = await research(row, byKey.get(row.investor_key) ?? []);
      // An empty About is stored as "" (not null) so the backfill treats the account as
      // already attempted and does not re-research it every run.
      await supabase.from("investor_crm").update({
        about: r.about,
        about_sources: r.sources.length ? r.sources : null,
        about_researched_at: new Date().toISOString(),
      }).eq("investor_key", row.investor_key);
      results.push({ investor: row.investor, ...r });
    } catch (e) {
      results.push({ investor: row.investor, about: "", confidence: "error", sources: [String(e).slice(0, 200)] });
    }
  }

  return NextResponse.json({
    count: results.length,
    found: results.filter((r) => r.about).length,
    results,
  });
}
