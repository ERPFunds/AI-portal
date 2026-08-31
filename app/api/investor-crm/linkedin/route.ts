import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Finds a contact's LinkedIn profile and the bio they publish on it.
//
// Deliberately narrower than the account-level About pass: About is general web research
// about the investing entity, whereas the bio here is only what the person says about
// themselves on LinkedIn — their headline and About section. That keeps the two fields
// telling the IR team different things, and keeps the bio attributable to the person.
//
// The profile must be tied to the right individual. A same-name profile with no link to
// the account is the failure mode this population invites — 526 prospect contacts, most
// with no email and no title on file — so an unconfirmed match is recorded as nothing.

const SYSTEM = `You locate LinkedIn profiles for the investor-relations CRM of ERP Funds, a commercial real estate private equity firm.

You are given a person's name and the investing account they sit under (usually their employer or family entity), and sometimes a title, email or notes.

TASK
Search the public web for that person's LinkedIn profile, then report two things.

1. linkedin_url — the canonical profile URL, in the form https://www.linkedin.com/in/<slug>. Never a company page (/company/), a post, a job listing, a search results page, or a directory mirror that merely republishes LinkedIn data.

2. bio — what the person themselves publishes on that LinkedIn profile: their headline, and the substance of their About section if one is visible. Up to about 60 words. Write it as plain descriptive prose in the third person; do not copy long passages verbatim, and do not quote more than a short phrase.

IDENTIFYING THE RIGHT PERSON — this decides everything
- The profile must be tied to the account you were given: it names that company or entity as employer, or the person is publicly documented as its principal, partner, family member, or officer.
- A name match alone is never enough. Neither is a shared city, a shared industry, or a plausible-sounding job.
- Common names are the main failure mode here. If several people share the name and nothing distinguishes which one belongs to this account, return empty strings.
- If you cannot find a LinkedIn profile at all, return empty strings. Many of these people have none. That is a normal and useful answer.

BIO RULES
- The bio must come from the LinkedIn profile. If all you can find is a third-party page about the person — a company bio, a press mention, a conference listing — return the linkedin_url if you are confident of it, and an empty bio. Do not substitute another source's description.
- Never write "appears to be", "likely", "may be", "possibly", "seems", "presumably". If you would need a hedge word, you have not confirmed it: return empty strings instead.
- No speculation about wealth, capacity to invest, or their interest in ERP Funds.

Reply with ONLY a JSON object, no markdown fence:
{"linkedin_url": "...", "bio": "...", "confidence": "high" | "medium" | "low"}
Use confidence "low" only alongside empty strings.`;

const anthropic = new Anthropic();

const HEDGE = /(appears? to be|appear to be|likely|may be|possibly|presumably|probably|suggests?|is believed|could be|seems? to|we believe|unclear)/i;
const PROFILE = /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\/\s?#]+/i;
// Errors that are about the account or the service, not about this particular contact.
// These must not mark a row as attempted, or an outage quietly empties the queue.
const GLOBAL_FAILURE = /credit balance|rate.?limit|429|overloaded|529|authentication|invalid x-api-key|permission/i;

type Row = {
  id: string;
  investor_key: string;
  investor: string | null;
  name: string;
  title: string | null;
  email: string | null;
  notes: string | null;
};

async function research(row: Row, accountAbout: string | null) {
  const facts = [
    `Person: ${row.name}`,
    `Account they sit under: ${row.investor ?? row.investor_key}`,
    row.title ? `Title on file: ${row.title}` : "",
    row.email ? `Email on file: ${row.email}` : "",
    row.notes ? `CRM notes: ${row.notes}` : "",
    accountAbout ? `What we know about the account: ${accountAbout}` : "",
  ].filter(Boolean).join("\n");

  const res = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1200,
    system: [{ type: "text" as const, text: SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [
      { type: "web_search_20250305" as "web_search_20250305", name: "web_search", max_uses: 5 } as unknown as Anthropic.Tool,
    ],
    messages: [{ role: "user", content: `${facts}\n\nFind this person's LinkedIn profile and return the JSON object.` }],
  });

  const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  const stripped = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = stripped.indexOf("{"), b = stripped.lastIndexOf("}");
  let parsed: { linkedin_url?: string; bio?: string; confidence?: string } = {};
  if (a >= 0 && b > a) { try { parsed = JSON.parse(stripped.slice(a, b + 1)); } catch { /* treated as empty */ } }

  let url = String(parsed.linkedin_url ?? "").trim();
  // Anything that is not a personal profile URL is not what was asked for.
  if (url && !PROFILE.test(url)) url = "";
  if (url) url = url.split(/[?#]/)[0].replace(/\/$/, "");
  let bio = String(parsed.bio ?? "").trim();
  if (HEDGE.test(bio)) bio = "";
  // A bio with no profile behind it is by definition not from LinkedIn.
  if (!url) bio = "";
  return { url, bio, confidence: String(parsed.confidence ?? "") };
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
  const cols = "id, investor_key, investor, name, title, email, notes";

  let targets: Row[] = [];
  if (body.all) {
    // Prospect contacts by default; population "lps" covers the LP side instead.
    const wantLp = body.population === "lps";
    const { data: accounts } = await supabase.from("investor_crm")
      .select("investor_key").eq("archived", false).eq("is_lp", wantLp);
    const keys = ((accounts ?? []) as { investor_key: string }[]).map((r) => r.investor_key);
    if (!keys.length) return NextResponse.json({ count: 0, results: [] });
    const { data, error } = await supabase.from("investor_contacts").select(cols)
      .in("investor_key", keys).is("bio_researched_at", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    targets = ((data ?? []) as Row[]).slice(0, Math.min(Number(body.limit) || 20, 60));
  } else {
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data, error } = await supabase.from("investor_contacts").select(cols).eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No such contact" }, { status: 404 });
    targets = [data as Row];
  }

  // The account's About line is useful corroboration for who the person should be.
  const keys = [...new Set(targets.map((t) => t.investor_key))];
  const { data: accts } = await supabase.from("investor_crm")
    .select("investor_key, about").in("investor_key", keys.length ? keys : ["_none_"]);
  const aboutBy = new Map(((accts ?? []) as { investor_key: string; about: string | null }[])
    .map((r) => [r.investor_key, r.about]));

  const results: { name: string; investor: string; linkedin_url: string; bio: string; confidence: string }[] = [];
  for (const row of targets) {
    try {
      const r = await research(row, aboutBy.get(row.investor_key) ?? null);
      await supabase.from("investor_contacts").update({
        linkedin_url: r.url || null,
        bio: r.bio || null,
        bio_researched_at: new Date().toISOString(),
      }).eq("id", row.id);
      results.push({ name: row.name, investor: row.investor ?? row.investor_key, linkedin_url: r.url, bio: r.bio, confidence: r.confidence });
    } catch (e) {
      const msg = String(e);
      if (GLOBAL_FAILURE.test(msg)) {
        // Nothing is wrong with this contact — stop, leave the queue intact, and say so.
        return NextResponse.json({
          count: results.length,
          profiles: results.filter((r) => r.linkedin_url).length,
          bios: results.filter((r) => r.bio).length,
          halted: msg.slice(0, 200),
          results,
        });
      }
      // A failure specific to this row: stamp it so the batch does not spin on it.
      await supabase.from("investor_contacts")
        .update({ bio_researched_at: new Date().toISOString() }).eq("id", row.id);
      results.push({ name: row.name, investor: row.investor ?? row.investor_key, linkedin_url: "", bio: "", confidence: `error: ${msg.slice(0, 160)}` });
    }
  }

  return NextResponse.json({
    count: results.length,
    profiles: results.filter((r) => r.linkedin_url).length,
    bios: results.filter((r) => r.bio).length,
    results,
  });
}
