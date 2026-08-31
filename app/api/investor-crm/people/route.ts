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
const OVL = "id, investor_key, match_key, name, title, email, phone_office, phone_cell, address, notes, is_primary, linkedin_url, bio";
interface Ovl {
  id: string; investor_key: string; match_key: string; name: string; title: string | null;
  linkedin_url?: string | null; bio?: string | null;
  email: string | null; phone_office: string | null; phone_cell: string | null;
  address: string | null; notes: string | null; is_primary: boolean;
}

export async function GET(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const investor = (req.nextUrl.searchParams.get("investor") ?? "").trim();

  const { data, error } = await supabase
    .from("lp_prior_contacts")
    .select("investor_name, fund_label, first_name, last_name, email, company, city, state, phone");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!investor) {
    // Contacts across every entity: the imported list plus anything entered in the portal.
    const perEntity = new Map<string, Map<string, { name: string; email: string; primary: boolean }>>();
    const put = (k: string, id: string, v: { name: string; email: string; primary: boolean }) => {
      if (!k || !id || id === "n:") return;
      if (!perEntity.has(k)) perEntity.set(k, new Map());
      const m = perEntity.get(k)!;
      const prev = m.get(id);
      if (!prev || (v.primary && !prev.primary)) m.set(id, v);
    };
    for (const r of (data ?? []) as PriorRow[]) {
      const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      const email = (r.email || "").trim();
      put(norm(r.investor_name), email ? `e:${email.toLowerCase()}` : `n:${norm(name)}`, { name, email, primary: false });
    }
    const { data: allOvl } = await supabase
      .from("investor_contacts").select("investor_key, match_key, name, email, is_primary");
    for (const r of ((allOvl ?? []) as { investor_key: string; match_key: string; name: string; email: string | null; is_primary: boolean }[])) {
      put(r.investor_key, r.match_key, { name: r.name, email: r.email ?? "", primary: !!r.is_primary });
    }

    const counts: Record<string, number> = {};
    const primary: Record<string, { name: string; email: string; more: number }> = {};
    for (const [k, m] of perEntity) {
      const list = [...m.values()];
      counts[k] = list.length;
      // Name comes from the primary contact, but the address from whoever actually has one —
      // Fund II/III primaries were imported name-only, so the two are often different people.
      const pick = list.find((x) => x.primary) ?? list.find((x) => x.email) ?? list[0];
      const withEmail = list.find((x) => x.email);
      if (pick) primary[k] = { name: pick.name, email: pick.email || withEmail?.email || "", more: list.length - 1 };
    }
    return NextResponse.json({ counts, primary });
  }

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

  // Layer the portal-owned contact detail (title / office+cell / address) over the import,
  // and include any contacts added by hand that aren't in the imported list.
  const { data: ovlRows } = await supabase
    .from("investor_contacts").select(OVL).eq("investor_key", target);
  const ovl = new Map<string, Ovl>();
  for (const r of ((ovlRows ?? []) as Ovl[])) ovl.set(r.match_key, r);

  const people = [...byPerson.entries()].map(([key, p]) => {
    const ov = ovl.get(key);
    if (ov) ovl.delete(key);
    return {
      match_key: key,
      id: ov?.id ?? null,
      name: ov?.name || p.name,
      title: ov?.title ?? null,
      email: ov?.email || p.email,
      phone_office: ov?.phone_office ?? null,
      phone_cell: ov?.phone_cell ?? p.phone,
      address: ov?.address ?? p.location,
      notes: ov?.notes ?? null,
      is_primary: ov?.is_primary ?? false,
      linkedin_url: ov?.linkedin_url ?? null,
      bio: ov?.bio ?? null,
      company: p.company,
      funds: [...p.funds].sort(),
    };
  });
  // Hand-added contacts with no imported counterpart
  for (const ov of ovl.values()) {
    people.push({
      match_key: ov.match_key, id: ov.id, name: ov.name, title: ov.title, email: ov.email,
      phone_office: ov.phone_office, phone_cell: ov.phone_cell, address: ov.address,
      notes: ov.notes, is_primary: ov.is_primary,
      linkedin_url: ov.linkedin_url ?? null, bio: ov.bio ?? null,
      company: null, funds: [],
    });
  }
  people.sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.name.localeCompare(b.name));

  return NextResponse.json({ people, entity: investor });
}

// Create or update one contact's portal-owned detail for an account.
export async function PATCH(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();

  const body = await req.json().catch(() => ({}));
  const investor = String(body.investor ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!investor || !name) return NextResponse.json({ error: "investor and name required" }, { status: 400 });

  const email = String(body.email ?? "").trim();
  const matchKey = String(body.match_key ?? "").trim() || (email ? `e:${email.toLowerCase()}` : `n:${norm(name)}`);
  const str = (v: unknown) => { const t = String(v ?? "").trim(); return t || null; };

  const { data, error } = await supabase.from("investor_contacts").upsert({
    investor_key: norm(investor), investor, match_key: matchKey, name,
    title: str(body.title), email: email || null,
    phone_office: str(body.phone_office), phone_cell: str(body.phone_cell),
    address: str(body.address), notes: str(body.notes),
    is_primary: !!body.is_primary,
    updated_by: user.email ?? user.id, updated_at: new Date().toISOString(),
  }, { onConflict: "investor_key,match_key" }).select(OVL).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}

// Remove a hand-added contact (imported people reappear from the import).
export async function DELETE(req: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const supabase = createAdminClient();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { error } = await supabase.from("investor_contacts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
