import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sql } from "@/lib/sql";
import { getGraphToken } from "@/lib/agents/graph-token";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Map subject keywords → agent_name (matches AGENT_LABELS in drafting/newsletters)
const SUBJECT_TO_AGENT: Array<{ pattern: RegExp; agentName: string }> = [
  { pattern: /brevard.*submarket watch/i,      agentName: "brevard-submarket-watch" },
  { pattern: /brevard.*fund landscape/i,        agentName: "brevard-fund-landscape" },
  { pattern: /brevard.*vacancy/i,               agentName: "brevard-vacancy" },
  { pattern: /space coast.*monday brief/i,      agentName: "brevard-weekly" },
  { pattern: /brevard.*weekly/i,                agentName: "brevard-weekly" },
  { pattern: /permian.*submarket watch/i,       agentName: "permian-submarket-watch" },
  { pattern: /permian.*fund landscape/i,        agentName: "permian-fund-landscape" },
  { pattern: /permian.*vacancy/i,               agentName: "permian-vacancy" },
  { pattern: /permian.*weekly/i,                agentName: "permian-weekly" },
  { pattern: /permian.*brief/i,                 agentName: "permian-brief" },
  { pattern: /space coast.*competitive|brevard.*competitive/i, agentName: "brevard-fund-landscape" },
  { pattern: /permian.*competitive/i,           agentName: "permian-fund-landscape" },
];

function subjectToAgentName(subject: string): string | null {
  // Skip [TEST] emails
  if (/\[TEST\]/i.test(subject)) return null;
  for (const { pattern, agentName } of SUBJECT_TO_AGENT) {
    if (pattern.test(subject)) return agentName;
  }
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&middot;/g, "·")
    .replace(/\s{3,}/g, "\n\n")
    .trim();
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const token = await getGraphToken();
  if (!token) return NextResponse.json({ error: "Graph token unavailable" }, { status: 503 });

  const SENDER = "mparad@erpfunds.com";
  const results: { subject: string; agentName: string; status: string }[] = [];

  // Fetch up to 200 sent items — paginate in batches of 50
  let nextLink: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/mailFolders/SentItems/messages` +
    `?$select=id,subject,sentDateTime,body&$top=50&$orderby=sentDateTime desc`;

  let fetched = 0;
  while (nextLink && fetched < 200) {
    const res: Response = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) break;
    const page: { value?: unknown[]; ["@odata.nextLink"]?: string } = await res.json();
    const messages: any[] = page.value ?? [];

    for (const msg of messages) {
      const agentName = subjectToAgentName(msg.subject ?? "");
      if (!agentName) continue;

      const html: string = msg.body?.content ?? "";
      const narrative = stripHtml(html).slice(0, 40000);
      const sentAt: string = msg.sentDateTime;

      // Skip if already in briefs (match by subject + sent date proximity)
      const { rows: existing } = await sql`
        SELECT id FROM briefs
        WHERE agent_name = ${agentName}
          AND subject = ${msg.subject}
        LIMIT 1
      `;
      if (existing.length > 0) {
        results.push({ subject: msg.subject, agentName, status: "skipped (exists)" });
        continue;
      }

      await sql`
        INSERT INTO briefs (agent_name, subject, html, narrative, macro_data, sent_at)
        VALUES (${agentName}, ${msg.subject}, ${html}, ${narrative}, '{}', ${sentAt})
      `;
      results.push({ subject: msg.subject, agentName, status: "inserted" });
    }

    fetched += messages.length;
    nextLink = page["@odata.nextLink"] ?? null;
  }

  const inserted = results.filter(r => r.status === "inserted").length;
  const skipped  = results.filter(r => r.status.startsWith("skipped")).length;
  return NextResponse.json({ inserted, skipped, total: results.length, results });
}
