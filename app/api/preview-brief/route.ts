import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runCompetitorIntelligence } from "@/lib/agents/workflows/competitor-intelligence";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";
import { runSubmarketIntelligence } from "@/lib/agents/workflows/submarket-intelligence";

export const maxDuration = 300;

type Market = "permian" | "brevard";
type ReportType = "weekly-update" | "submarket-intelligence" | "competitor-intelligence" | "submarket-brief" | "fund-competitor-brief";

function getCurrentPeriod(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export async function POST(req: NextRequest) {
  // Auth: require a valid Supabase session
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { market: Market; reportType: ReportType };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { market, reportType } = body;

  if (!market || !["permian", "brevard"].includes(market)) {
    return NextResponse.json({ error: "Invalid market" }, { status: 400 });
  }
  if (!reportType || !["weekly-update", "submarket-intelligence", "competitor-intelligence", "submarket-brief", "fund-competitor-brief"].includes(reportType)) {
    return NextResponse.json({ error: "Invalid reportType" }, { status: 400 });
  }

  const period = getCurrentPeriod();

  try {
    let result: { subject: string; htmlBody: string; summary: string };

    if (reportType === "weekly-update") {
      result = await runWeeklyMarketUpdate({ market, period });
    } else if (reportType === "submarket-intelligence" || reportType === "submarket-brief") {
      // submarket-brief is the merged weekly Brevard version — previewed via submarket-intelligence
      result = await runSubmarketIntelligence({ market, period });
    } else {
      // competitor-intelligence and fund-competitor-brief both preview via competitor-intelligence
      result = await runCompetitorIntelligence({ market, period });
    }

    return NextResponse.json({
      success: true,
      market,
      reportType,
      subject: result.subject,
      summary: result.summary,
      htmlBody: result.htmlBody,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "workflow-failed", message: String(err) },
      { status: 500 }
    );
  }
}
