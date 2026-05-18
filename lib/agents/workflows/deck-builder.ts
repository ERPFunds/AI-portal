import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

export interface DeckBuilderOutput {
  summary: string;
  slideContent: string;
  outputType: "deck";
}

export async function runDeckBuilder(params: {
  ask: string;
  projectContext: string;
  researchFindings?: string;
  attachmentContent?: string;
  fileId?: string;
  mode?: "new-draft" | "edit-existing";
}): Promise<DeckBuilderOutput> {
  const mode = params.mode ?? "new-draft";

  const contextData = [
    params.researchFindings && `Market Research:\n${params.researchFindings}`,
    params.attachmentContent && `Internal Data (fund performance / portfolio / underwriting):\n${params.attachmentContent}`,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const modeInstruction =
    mode === "edit-existing"
      ? "Edit and tighten the deck per the request. Revise specific slides as directed."
      : "Create a complete LP deck outline with all slides structured and content-filled.";

  const promptText = `${modeInstruction}

Request: ${params.ask}
Project: ${params.projectContext}

${contextData || "No internal data attached — build from ERP context and flag where internal data should be inserted with [INSERT: description]."}

---
Produce a complete deck outline. Standard LP update structure:
1. Cover / Title
2. Executive Summary
3. Portfolio Overview
4. Market Conditions (Permian + relevant secondary)
5. Performance Highlights
6. Portfolio Deep Dive (1-2 slides on key assets)
7. Investment Strategy & Pipeline
8. Outlook / Forward Guidance
9. Appendix markers (Fund terms, team, disclosures)

For each slide, use this format:
---
**[Slide N] — [Title]**
Headline: [one sentence]
• [bullet]
• [bullet]
• [bullet]
[Visual: suggested chart or exhibit]
---`;

  const userContent: Anthropic.MessageParam["content"] = params.fileId
    ? [
        { type: "document", source: { type: "file", file_id: params.fileId } } as any,
        { type: "text", text: promptText },
      ]
    : promptText;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 5000,
    system: [{ type: "text" as const, text: `You are an LP investor deck builder for ERP Industrials. Your output is structured slide content for Meghan or William to refine in PowerPoint.

ERP Industrials context:
- Industrial CRE: Permian Basin service yards, IOS (industrial outdoor storage), logistics, cold storage
- Institutional LP base — sophisticated family offices, endowments, pension advisors
- Fund IV currently raising
- Core thesis: energy-adjacent industrial demand in Permian Basin; occupancy held low 90s through last cycle; rent-per-acre growth on IOS
- Tone: data-driven, thesis-forward, direct. Not promotional — institutional grade.

For each slide, produce:
- Slide number and title
- Headline: one punchy, thesis-reinforcing sentence
- 3-4 bullet points (data-forward, citable)
- Visual note: suggested chart type or data exhibit`, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  const slideContent = response.content[0].type === "text" ? response.content[0].text : "";
  const slideCount = (slideContent.match(/^\*\*\[Slide/gm) ?? []).length;
  const summary = `LP deck ${mode === "edit-existing" ? "edits" : "draft"} complete for ${params.projectContext}. ${slideCount} slides outlined. Ready for PowerPoint build.`;

  return { summary, slideContent, outputType: "deck" };
}
