import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { saveToOneDrive } from "@/lib/agents/file-handler";

const anthropic = new Anthropic();

const DOC_TYPE_LABELS: Record<string, string> = {
  freeform: "Draft",
  "om-section": "OM Section",
  "lp-memo": "LP Memo",
  "deal-summary": "Deal Summary",
  "email-draft": "Email Draft",
  "market-brief": "Market Brief",
};

interface SaveTarget {
  title: string;   // e.g. "Odessa IOS Market Overview"
  folder: string;  // e.g. "ERP Deal Pipelines/Odessa IOS" or "ERP Funds IV" or "Drafting/July 2026"
}

async function extractSaveTarget(prompt: string, docType: string, monthYear: string): Promise<SaveTarget> {
  const label = DOC_TYPE_LABELS[docType] ?? "Draft";

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are a file-naming assistant for ERP Industrials, an industrial real estate fund.

Given this drafting request, return a JSON object with two fields:
- "title": a concise, meaningful document title (max 60 chars, no date needed — just the substance)
- "folder": the most appropriate SharePoint folder path

Available folder options:
- "ERP Deal Pipelines/{Deal Name}" — if the prompt is about a specific property, deal, or acquisition
- "ERP Funds IV" — if the prompt is about the fund, LPs, fundraising, capital raise, or investor communications
- "Drafting/${monthYear}" — for general research, briefs, or anything that doesn't fit the above

Doc type: ${label}
Prompt: ${prompt.slice(0, 400)}

Respond with ONLY valid JSON, no explanation. Example: {"title":"Odessa IOS Market Overview","folder":"ERP Deal Pipelines/Odessa IOS"}`,
        },
      ],
    });

    const text = res.content[0].type === "text" ? res.content[0].text.trim() : "";
    const parsed = JSON.parse(text) as SaveTarget;
    if (parsed.title && parsed.folder) return parsed;
  } catch {
    // Fall through to default
  }

  // Default fallback
  return {
    title: `${label} - ${new Date().toISOString().split("T")[0]}`,
    folder: `Drafting/${monthYear}`,
  };
}

function toSlug(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { content, docType = "freeform", prompt = "", title: userTitle, folder: userFolder } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content required" }, { status: 400 });

  const dateStr = new Date().toISOString().split("T")[0];
  const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Honor a user-chosen name and/or folder; only ask the model to fill in whichever wasn't provided.
  const hasTitle = typeof userTitle === "string" && userTitle.trim();
  const hasFolder = typeof userFolder === "string" && userFolder.trim();
  const auto = (hasTitle && hasFolder) ? null : await extractSaveTarget(prompt, docType, monthYear);
  const title = (hasTitle ? userTitle.trim() : auto!.title).slice(0, 80);
  const folder = hasFolder ? userFolder.trim().replace(/^\/+|\/+$/g, "") : auto!.folder;

  // A user-named file uses the name as-is (re-saving overwrites that same doc — expected when
  // iterating). An auto-named file gets a date suffix so successive drafts don't collide.
  const filename = hasTitle ? `${toSlug(title)}.docx` : `${toSlug(title)}-${dateStr}.docx`;
  const result = await saveToOneDrive({
    content,
    filename,
    folder,
    title,
  });

  return NextResponse.json({ ...result, resolvedTitle: title, resolvedFolder: folder, filename });
}
