import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an operations documentation writer for ERP Industrials, a private equity industrial real estate fund manager. You turn a description of a recurring workflow (or rough process notes) into a clean, written SOP (Standard Operating Procedure) that a team member could follow independently, with no prior context.

Write the SOP in Markdown with this structure:
- A single H1 title (# ...) — a concise, action-oriented name for the procedure.
- **Purpose** — one or two sentences on what this SOP accomplishes and why it matters.
- **When to use / Trigger** — the event or cadence that kicks off the procedure.
- **Owner / Roles** — who is responsible; note any hand-offs between team members.
- **Prerequisites** — access, tools, systems, or inputs needed before starting.
- **Procedure** — numbered, sequential steps. Each step is a concrete, testable action. Break complex steps into lettered sub-steps. Name the specific systems/tools used (e.g. Salesforce, DocuSign, the portal) where implied.
- **Outputs / Definition of done** — what exists when the procedure is complete.
- **Notes & edge cases** — exceptions, escalation paths, and common mistakes to avoid.

Be specific and unambiguous — no vague filler. Where the input is silent on a detail, make a reasonable, clearly-reasonable assumption rather than leaving a blank, but do not invent facts about ERP's systems that weren't provided. Write and stop — do not ask follow-up questions or add commentary outside the SOP.`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const description: string = (body.description ?? "").trim();
  const title: string = (body.title ?? "").trim();

  if (!description) return NextResponse.json({ error: "description required" }, { status: 400 });

  const userPrompt = title
    ? `Write an SOP titled "${title}" from the following workflow description / process notes:\n\n${description}`
    : `Write an SOP from the following workflow description / process notes:\n\n${description}`;

  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const markdown = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return NextResponse.json({ markdown });
  } catch (err) {
    console.error("SOP generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
