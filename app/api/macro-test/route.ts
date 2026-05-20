import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetchFredMacro } from "@/lib/macro/fred";
import { fetchEiaMacro } from "@/lib/macro/eia";
import { fetchBlsMacro } from "@/lib/macro/bls";
import { fetchCensusMacro } from "@/lib/macro/census";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs: { name: string; value: string; options: CookieOptions }[]) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const market = req.nextUrl.searchParams.get("market") ?? "permian";

  // Which env vars are actually present?
  const envCheck = {
    FRED_API_KEY:    !!process.env.FRED_API_KEY,
    FRED_KEY:        !!process.env.FRED_KEY,
    API_KEY:         !!process.env.API_KEY,
    FRED_API:        !!process.env.FRED_API,
    EIA_API_KEY:     !!process.env.EIA_API_KEY,
    EIA_KEY:         !!process.env.EIA_KEY,
    EIA_API:         !!process.env.EIA_API,
    BLS_API_KEY:     !!process.env.BLS_API_KEY,
    BLS_KEY:         !!process.env.BLS_KEY,
    BLS_API:         !!process.env.BLS_API,
    CENSUS_API_KEY:  !!process.env.CENSUS_API_KEY,
    CENSUS_KEY:      !!process.env.CENSUS_KEY,
  };

  const [fredRows, eiaRows, blsRows, censusRows] = await Promise.all([
    fetchFredMacro(market).catch((e: unknown) => ({ error: String(e) })),
    fetchEiaMacro(market).catch((e: unknown) => ({ error: String(e) })),
    fetchBlsMacro(market).catch((e: unknown) => ({ error: String(e) })),
    fetchCensusMacro(market).catch((e: unknown) => ({ error: String(e) })),
  ]);

  return NextResponse.json({
    market,
    envCheck,
    results: {
      fred:   { rows: fredRows,   count: Array.isArray(fredRows)   ? fredRows.length   : null },
      eia:    { rows: eiaRows,    count: Array.isArray(eiaRows)    ? eiaRows.length    : null },
      bls:    { rows: blsRows,    count: Array.isArray(blsRows)    ? blsRows.length    : null },
      census: { rows: censusRows, count: Array.isArray(censusRows) ? censusRows.length : null },
    },
  });
}
