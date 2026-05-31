import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Maps each connection ID to the env var(s) that must ALL be non-empty for it to be "connected"
const CONN_ENV_MAP: Record<string, string[]> = {
  onedrive:   ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'],
  powerpoint: ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'],
  anthropic:  ['ANTHROPIC_API_KEY'],
  fred:       ['FRED_API_KEY'],
  eia:        ['EIA_API_KEY'],
  bls:        ['BLS_API_KEY'],
  census:     ['CENSUS_API_KEY'],
  apify:      ['APIFY_API_TOKEN'],
};

// GET /api/env-status
// Returns { status: { connId: 'connected' | 'disconnected' } }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const status: Record<string, 'connected' | 'disconnected'> = {};

  for (const [connId, vars] of Object.entries(CONN_ENV_MAP)) {
    const allSet = vars.every((v) => {
      const val = process.env[v];
      return typeof val === 'string' && val.trim().length > 0;
    });
    status[connId] = allSet ? 'connected' : 'disconnected';
  }

  return NextResponse.json({ status });
}
