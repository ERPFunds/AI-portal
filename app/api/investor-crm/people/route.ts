import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// The people associated with one investor entity (the "account"). The investor entity is the
// company/trust/LLC; these are the individuals under it. Sourced from the imported prior-fund
// contact list (lp_prior_contacts), which carries several people per entity across Fund II/III —
// so rows are de-duplicated by email (falling back to name) and their fund labels merged.
// RLS-locked → service-role client.

interface PriorRow {
  investor_name: string; fund_label: string | null;
  first_name: string | null; last_name: string | null; email: string | null;
  company: string | null; city: string | null; state: string | null; phone: string | null;
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const investor = (req.nextUrl.searchParams.get("investor") ?? "").trim();
  if (!investor) return NextResponse.json({ error: "investor required" }, { status: 400 });

  const { data, error } = await supabase
    .from("lp_prior_contacts")
    .select("investor_name, fund_label, first_name, last_name, email, company, city, state, phone");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const target = norm(investor);
  const rows = ((data ?? []) as PriorRow[]).filter((r) => norm(r.investor_name) === target);

  // De-duplicate people: same email (or same name when no email) => one person, funds merged.
  const byPerson = new Map<string, {
    name: string; email: string | null; phone: string | null;
    company: string | null; location: string | null; funds: Set<string>;
  }>();
  for (const r of rows) {
    const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
    const email = (r.email || "").trim() || null;
    const key = email ? `e:${email.toLowerCase()}` : `n:${norm(name)}`;
    if (!key || key === "n:") continue;
    let p = byPerson.get(key);
    if (!p) {
      p = {
        name: name || email || "—", email, phone: (r.phone || "").trim() || null,
        company: (r.company || "").trim() || null,
        location: [r.city, r.state].filter(Boolean).join(", ") || null,
        funds: new Set<string>(),
      };
      byPerson.set(key, p);
    }
    if (r.fund_label) p.funds.add(r.fund_label);
    if (!p.email && email) p.email = email;
    if (!p.phone && r.phone) p.phone = r.phone.trim();
    if (!p.company && r.company) p.company = r.company.trim();
  }

  const people = [...byPerson.values()]
    .map((p) => ({ ...p, funds: [...p.funds].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ people, entity: investor });
}
