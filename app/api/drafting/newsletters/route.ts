import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sql } from "@/lib/sql";
import { getGraphToken } from "@/lib/agents/graph-token";
import { parseBytes } from "@/lib/agents/ir/markdown-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const AGENT_LABELS: Record<string, string> = {
  "brevard-weekly":           "Brevard Weekly Market Update",
  "brevard-submarket":        "Brevard Submarket Watch",
  "brevard-fund":             "Brevard Fund Landscape",
  "brevard-submarket-watch":  "Brevard Submarket Watch",
  "brevard-fund-landscape":   "Brevard Fund Landscape",
  "brevard-vacancy":          "Brevard Vacancy Report",
  "permian-brief":            "Permian Weekly Market Update",
  "permian-submarket-watch":  "Permian Submarket Watch",
  "permian-fund-landscape":   "Permian Fund Landscape",
  "permian-vacancy":          "Permian Vacancy Report",
  "submarket-watch":          "Submarket Watch",
  "fund-landscape-brief":     "Fund Landscape Brief",
};

function driveBase(): string | null {
  const siteId = process.env.SHAREPOINT_SITE_ID;
  const userEmail = process.env.SMTP_USER;
  if (siteId) return `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`;
  if (userEmail) return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive`;
  return null;
}

// List historical newsletter files from the SharePoint "Newsletters" folder (research files).
async function sharepointNewsletters(token: string) {
  const base = driveBase();
  if (!base) return [];
  const headers = { Authorization: `Bearer ${token}` };
  const out: { name: string; path: string; webUrl: string; sentAt: string }[] = [];
  async function walk(segments: string[], depth: number) {
    const encoded = segments.map(encodeURIComponent).join("/");
    const url = `${base}/root:/${encoded}:/children?$select=name,folder,file,webUrl,lastModifiedDateTime&$top=200`;
    const res = await fetch(url, { headers });
    if (!res.ok) return;
    for (const item of ((await res.json()).value ?? []) as any[]) {
      if (item.file) out.push({ name: item.name, path: `${segments.join("/")}/${item.name}`, webUrl: item.webUrl, sentAt: item.lastModifiedDateTime });
      else if (item.folder && depth < 3) await walk([...segments, item.name], depth + 1);
    }
  }
  await walk(["Newsletters"], 1);
  return out;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const briefs: { id: string; label: string; subject: string; sentAt: string; narrative: string; source: string; path?: string }[] = [];

  // 1) Archived research briefs (DB) — carry their narrative text inline.
  try {
    const { rows } = await sql`
      SELECT id, agent_name, subject, sent_at, narrative
      FROM briefs ORDER BY sent_at DESC LIMIT 60
    `;
    for (const r of rows) {
      briefs.push({
        id: `brief:${r.id}`,
        label: AGENT_LABELS[r.agent_name as string] ?? (r.agent_name as string),
        subject: (r.subject as string) || "",
        sentAt: r.sent_at as string,
        narrative: (r.narrative as string) || "",
        source: "brief",
      });
    }
  } catch { /* briefs table may be unavailable */ }

  // 2) Historical newsletters saved to SharePoint (research files) — text loaded on demand (POST).
  try {
    const token = await getGraphToken();
    if (token) {
      for (const f of await sharepointNewsletters(token)) {
        briefs.push({
          id: `sp:${f.path}`,
          label: f.name.replace(/\.(html?|docx|pdf|md|txt)$/i, ""),
          subject: f.name,
          sentAt: f.sentAt,
          narrative: "",       // fetched lazily via POST when selected
          source: "sharepoint",
          path: f.path,
        });
      }
    }
  } catch { /* SharePoint optional */ }

  briefs.sort((a, b) => new Date(b.sentAt || 0).getTime() - new Date(a.sentAt || 0).getTime());
  return NextResponse.json({ briefs });
}

// Fetch the text of one SharePoint newsletter (by path) for use as drafting context.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let path = "";
  try { path = String((await req.json()).path || ""); } catch { /* ignore */ }
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  try {
    const token = await getGraphToken();
    const base = driveBase();
    if (!token || !base) return NextResponse.json({ error: "SharePoint not configured" }, { status: 503 });
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${base}/root:/${encoded}:/content`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return NextResponse.json({ error: `Download failed ${res.status}` }, { status: 502 });
    const buf = Buffer.from(await res.arrayBuffer());
    const name = path.split("/").pop() || "newsletter";
    const text = (await parseBytes(buf, name, null)).slice(0, 40_000);
    return NextResponse.json({ narrative: text });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
