import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { saveToOneDrive } from "@/lib/agents/file-handler";

const DOC_TYPE_LABELS: Record<string, string> = {
  freeform: "Draft",
  "om-section": "OM Section",
  "lp-memo": "LP Memo",
  "deal-summary": "Deal Summary",
  "email-draft": "Email Draft",
  "market-brief": "Market Brief",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, docType = "freeform", title } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const label = DOC_TYPE_LABELS[docType] ?? "Draft";
  const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Use provided title slug or fall back to doc type label
  const slug = (title ?? label)
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 50);

  const filename = `${slug}-${dateStr}.docx`;
  const folder = `Drafting/${monthYear}`;
  const docTitle = title ?? `${label} - ${dateStr}`;

  const result = await saveToOneDrive({ content, filename, folder, title: docTitle });

  return NextResponse.json(result);
}
