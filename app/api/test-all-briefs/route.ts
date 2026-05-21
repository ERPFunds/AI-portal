import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getGraphToken } from "@/lib/agents/graph-token";
import { runWeeklyMarketUpdate } from "@/lib/agents/workflows/weekly-market-update";
import { runSubmarketIntelligence } from "@/lib/agents/workflows/submarket-intelligence";
import { runCompetitorIntelligence } from "@/lib/agents/workflows/competitor-intelligence";
import { generateBrevardSubmarketBrief, generateBrevardFundCompetitorBrief } from "@/lib/agents/workflows/brevard-merged-briefs";

export const maxDuration = 300;

// Only this address receives test emails — never the full team list
const TEST_RECIPIENT = "mparad@erpfunds.com";
const SENDER_MAILBOX = "mparad@erpfunds.com";

function getCurrentPeriod(): string {
  const now = new Date();
  return `Week of ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;
}

async function sendEmailViaGraph(params: {
  subject: string;
  htmlBody: string;
}): Promise<{ success: boolean; message: string }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { success: false, message: `Auth failed: ${String(err)}` };
  }
  if (!token) return { success: false, message: "AZURE credentials not configured" };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: `[TEST] ${params.subject}`,
          body: { contentType: "HTML", content: params.htmlBody },
          toRecipients: [{ emailAddress: { address: TEST_RECIPIENT } }],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, message: `Graph API ${res.status}: ${err}` };
  }
  return { success: true, message: `Sent to ${TEST_RECIPIENT}` };
}

export async function POST(req: NextRequest) {
  // Require a valid Supabase session
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const period = getCurrentPeriod();
  const results: Record<string, { success: boolean; subject?: string; error?: string }> = {};

  const briefDefs = [
    { id: "Permian — Monday Brief",             run: () => runWeeklyMarketUpdate({ market: "permian" as const, period }) },
    { id: "Brevard — Monday Brief",             run: () => runWeeklyMarketUpdate({ market: "brevard" as const, period }) },
    { id: "Permian — Submarket Intelligence",   run: () => runSubmarketIntelligence({ market: "permian" as const, period }) },
    { id: "Brevard — Submarket Brief",          run: () => generateBrevardSubmarketBrief(period) },
    { id: "Permian — Fund Landscape Brief",     run: () => runCompetitorIntelligence({ market: "permian" as const, period }) },
    { id: "Brevard — Competitive & Fund Brief", run: () => generateBrevardFundCompetitorBrief(period) },
  ];

  // Run all 6 in parallel — total time = slowest single brief (~3-4 min) not sum of all
  await Promise.all(
    briefDefs.map(async (brief) => {
      try {
        const { subject, htmlBody } = await brief.run();
        const emailResult = await sendEmailViaGraph({ subject, htmlBody });
        results[brief.id] = { success: emailResult.success, subject: `[TEST] ${subject}` };
        if (!emailResult.success) results[brief.id].error = emailResult.message;
      } catch (err) {
        results[brief.id] = { success: false, error: String(err) };
        console.error(`[test-all-briefs] ${brief.id} failed:`, err);
      }
    })
  );

  const successCount = Object.values(results).filter((r) => r.success).length;
  return NextResponse.json({
    success: successCount > 0,
    sentTo: TEST_RECIPIENT,
    period,
    successCount,
    totalCount: briefs.length,
    results,
  });
}
