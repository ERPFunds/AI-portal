import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { listAllCorrections, type AgentCorrection } from "@/lib/agents/ir/corrections-store";

const anthropic = new Anthropic();

// Auto-generated, always-current doc of what the IR agent has LEARNED by comparing its drafts
// against the replies Meghan/William actually sent. Separate from the Learned Q&A doc. Filed
// alongside the other agent working guides so the team can read (and prune) what the agent
// believes. Regenerated whenever the draft-outcomes cron adds/changes a correction.
const DOC_CATEGORY = process.env.AGENT_CORRECTIONS_DOC_CATEGORY || "Agent Working Guides";
const DOC_SUBFOLDER = process.env.AGENT_CORRECTIONS_DOC_SUBFOLDER || "Agent 2 - Investor Relations";
const DOC_NAME = "IR Agent Corrections.md";

const TYPE_HEADING: Record<string, string> = {
  "correction": "Corrections (facts/answers fixed by the IR team)",
  "negative-rule": "Rules (content the IR team removes — the agent must not include)",
  "kb-gap": "KB gaps (asked by investors, not answerable from the current documents)",
};

function buildMarkdown(rows: AgentCorrection[]): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const active = rows.filter((r) => r.status === "active");
  let out = `# IR Agent Corrections\n\n_Auto-learned by comparing the agent's draft replies against what the IR team actually sent — ${active.length} entr${active.length === 1 ? "y" : "ies"}, updated ${stamp} UTC. Entries here feed every future draft. Delete anything wrong and it stays deleted._\n`;
  if (active.length === 0) {
    return out + "\n_No learnings yet — entries appear as sent replies are compared against their drafts._\n";
  }
  for (const type of ["correction", "negative-rule", "kb-gap"] as const) {
    const items = active.filter((r) => r.type === type);
    if (items.length === 0) continue;
    out += `\n## ${TYPE_HEADING[type]}\n\n`;
    for (const it of items) {
      const provisional = type === "negative-rule" && it.occurrences < 2 ? " _(provisional — seen once, not yet applied to drafts)_" : "";
      out += `- ${it.learning}${provisional}\n`;
      if (it.evidence) out += `  - _Evidence:_ ${it.evidence}\n`;
      out += `  - _Seen ${it.occurrences}×${it.source_subject ? `, last in "${it.source_subject}"` : ""}, ${it.updated_at.slice(0, 10)}_\n`;
    }
  }
  return out;
}

/** Rebuild the IR Agent Corrections doc: replace the prior auto-generated file + markdown layer. */
export async function regenerateCorrectionsDoc(): Promise<{ ok: boolean; count: number; fileId?: string; error?: string }> {
  try {
    const rows = await listAllCorrections();
    const md = buildMarkdown(rows);
    const supabase = await createClient();

    // Remove the prior auto-generated doc (Anthropic file + uploaded_files + markdown rows).
    const { data: prior } = await supabase.from("uploaded_files").select("file_id").eq("filename", DOC_NAME);
    for (const p of (prior ?? []) as { file_id: string }[]) {
      try { await (anthropic.beta as any).files.delete(p.file_id); } catch { /* may be gone */ }
      await supabase.from("uploaded_files").delete().eq("file_id", p.file_id);
      await supabase.from("document_markdown").delete().eq("file_id", p.file_id);
    }

    const uploaded = await (anthropic.beta as any).files.upload({
      file: await toFile(Buffer.from(md, "utf-8"), DOC_NAME, { type: "text/markdown" }),
    });
    await supabase.from("uploaded_files").insert({
      file_id: uploaded.id,
      filename: DOC_NAME,
      size_bytes: md.length,
      mime_type: "text/markdown",
      category: DOC_CATEGORY,
      project_tag: DOC_SUBFOLDER,
      uploaded_by: "draft-outcomes-auto",
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await supabase.from("document_markdown").upsert(
      { file_id: uploaded.id, filename: DOC_NAME, category: DOC_CATEGORY, doc_type: "agent-corrections", markdown: md, char_count: md.length, extracted_at: new Date().toISOString() },
      { onConflict: "file_id" }
    );

    return { ok: true, count: rows.filter((r) => r.status === "active").length, fileId: uploaded.id };
  } catch (e) {
    return { ok: false, count: 0, error: String(e).slice(0, 200) };
  }
}
