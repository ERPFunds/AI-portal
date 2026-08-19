import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Picker source for the Drafting Workspace "Vacancies" grounding option. Mirrors the Vacancies
// board: a property is "available" if it's a vacant single-tenant building, has one or more vacant
// units, or carries a LoopNet listing link.
type Unit = { unit: string; tenant: string; expiry: string | null; sf?: number | null };

function describe(p: Record<string, unknown>): { available: boolean; label: string; sub: string } {
  const units: Unit[] = Array.isArray(p.units) ? (p.units as Unit[]) : [];
  const vacantUnits = units.filter((u) => (u.tenant || "").trim().toLowerCase() === "vacant");
  const singleVacant = units.length === 0 && String(p.tenant || "").trim().toLowerCase() === "vacant";
  const listed = !!p.loopnetUrl;
  const sf = (p.total as number) || (p.warehouse as number) || null;
  const status = [
    singleVacant ? "Vacant" : "",
    vacantUnits.length ? `${vacantUnits.length} vacant unit${vacantUnits.length > 1 ? "s" : ""}` : "",
    listed ? "Listed" : "",
  ].filter(Boolean).join(", ");
  const sub = [p.corridor, p.entity, sf ? `${Number(sf).toLocaleString()} SF` : "", status].filter(Boolean).join(" · ");
  return { available: singleVacant || vacantUnits.length > 0 || listed, label: String(p.address || "Property"), sub };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", rows: [] }, { status: 401 });

  const { data, error } = await supabase.from("properties").select("*").order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message, rows: [] }, { status: 500 });

  const rows = (data ?? [])
    .map((p) => ({ id: String((p as Record<string, unknown>).id), ...describe(p as Record<string, unknown>) }))
    .filter((r) => r.available)
    .map(({ id, label, sub }) => ({ id, label, sub }));

  return NextResponse.json({ rows });
}
