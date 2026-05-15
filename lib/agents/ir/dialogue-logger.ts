import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export interface DialogueLogEntry {
  lpName: string;
  meetingDate: string | null;
  medium: "email" | "call" | "in-person" | "voice-memo" | "unknown";
  interestLevel: "hot" | "warm" | "cool" | "neutral" | "unknown";
  stickingPoints: string[];
  followUpCommitments: string[];
  relationshipContext: string;
  nextTouchSuggestion: string;
  rawSource: string;
}

export interface DialogueLogOutput {
  entry: DialogueLogEntry;
  summary: string;
  outputType: "dialogue-log";
}

export async function runDialogueLogger(params: {
  from: string;
  subject: string;
  body: string;
  attachmentContent?: string;
}): Promise<DialogueLogOutput> {
  const content = params.attachmentContent
    ? `${params.body}\n\nAttachment:\n${params.attachmentContent}`
    : params.body;

  const msg = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1200,
    system: `You parse LP meeting notes and voice memo transcriptions for ERP Industrials, a private equity real estate firm.
Extract the relationship intelligence that converts a 'maybe' into a 'yes'. Focus on qualitative signals — not just facts.

Return JSON only:
{
  "lpName": string,
  "meetingDate": ISO date string or null,
  "medium": "email" | "call" | "in-person" | "voice-memo" | "unknown",
  "interestLevel": "hot" | "warm" | "cool" | "neutral" | "unknown",
  "stickingPoints": string[],
  "followUpCommitments": string[],
  "relationshipContext": string (family context, personal details, history, what matters to them),
  "nextTouchSuggestion": string (specific action and timing)
}`,
    messages: [
      {
        role: "user",
        content: `Parse meeting note / voice memo from ${params.from}:

Subject: ${params.subject}

${content}`,
      },
    ],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in dialogue logger response");

  const entry = JSON.parse(jsonMatch[0]) as DialogueLogEntry;
  entry.rawSource = content.slice(0, 2000);

  const summary = `Logged dialogue with ${entry.lpName} — ${entry.interestLevel} interest. Next: ${entry.nextTouchSuggestion}`;

  return { entry, summary, outputType: "dialogue-log" };
}
