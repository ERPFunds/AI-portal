import Anthropic from "@anthropic-ai/sdk";
import { readLatestFundsDeck } from "@/lib/agents/sharepoint-files";
import { readCommitmentStatus } from "@/lib/agents/workflows/update-commitment-schedule";
import { generatePptx } from "@/lib/agents/pptx-generator";

const anthropic = new Anthropic();

export interface DeckBuilderOutput {
  summary: string;
  slideContent: string;
  /** Binary .pptx buffer — present when PPTX generation succeeded */
  pptxBuffer?: Buffer;
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

  // In edit mode, read the current deck + raise status from SharePoint in parallel
  const [currentDeck, commitmentStatus] = mode === "edit-existing"
    ? await Promise.all([
        readLatestFundsDeck().catch(() => null),
        readCommitmentStatus().catch(() => null),
      ])
    : [null, null];

  const currentDeckSection = currentDeck?.text
    ? `\n\nCurrent deck content (${currentDeck.name}):\n${currentDeck.text.slice(0, 6000)}`
    : "";

  const commitmentContext = commitmentStatus && !commitmentStatus.error
    ? `\n\nFund IV Raise Status (live): ${commitmentStatus.formattedTotal} committed across ${commitmentStatus.lpCount} LPs`
    : "";

  const contextData = [
    params.researchFindings && `Market Research:\n${params.researchFindings}`,
    params.attachmentContent && `Internal Data (fund performance / portfolio / underwriting):\n${params.attachmentContent}`,
    currentDeckSection,
    commitmentContext,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const modeInstruction =
    mode === "edit-existing"
      ? `Update the deck per the request below. Output the COMPLETE deck — every slide, in order. For slides not mentioned in the request, reproduce their content exactly as shown in the current deck. Only modify the specific slides that were asked to change or add. Never drop slides.`
      : "Create a complete LP deck with all slides fully written out.";

  const promptText = `${modeInstruction}

Request: ${params.ask}
Project: ${params.projectContext}

${contextData || "No internal data attached — build from ERP context and flag where internal data should be inserted with [INSERT: description]."}

---
${mode === "edit-existing" && currentDeck?.text
  ? "Reproduce the full deck below, applying the requested changes:"
  : `Standard LP update structure:
1. Cover / Title
2. Executive Summary
3. Portfolio Overview
4. Market Conditions (Permian + relevant secondary)
5. Performance Highlights
6. Portfolio Deep Dive (1-2 slides on key assets)
7. Investment Strategy & Pipeline
8. Outlook / Forward Guidance
9. Appendix markers (Fund terms, team, disclosures)`}

IMPORTANT — use EXACTLY this format for every slide (the parser requires it):

**[Slide 1] — Title Here**
Headline: One punchy thesis sentence.
• Bullet one with data
• Bullet two with data
• Bullet three with data
[Visual: suggested chart or exhibit]

**[Slide 2] — Next Title**
Headline: ...
...`;

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

  // Generate the actual .pptx binary
  let pptxBuffer: Buffer | undefined;
  try {
    pptxBuffer = await generatePptx(slideContent, params.projectContext);
  } catch (err) {
    console.error("[deck-builder] pptxgenjs error:", err);
    // Non-fatal — fall back to text output
  }

  const summary = `LP deck ${mode === "edit-existing" ? "edits" : "draft"} complete for ${params.projectContext}. ${slideCount} slides built${pptxBuffer ? " as .pptx" : " as text outline"}.`;

  return { summary, slideContent, pptxBuffer, outputType: "deck" };
}
