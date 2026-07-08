import { NextResponse } from "next/server";
import { getGraphToken } from "@/lib/agents/graph-token";
import { extractQaPairs } from "@/lib/agents/ir/qa-extractor";
import { insertPendingQa } from "@/lib/agents/ir/qa-store";
import { stripMimecastNoise } from "@/lib/agents/ir/sanitize-email";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAILBOX = "wmeyer@erpfunds.com";

interface Msg { id: string; subject: string; sentDateTime: string; to: string[]; body: string; folder: string }

async function fetchFolder(token: string, folder: string): Promise<Msg[]> {
  const dateField = folder === "sentitems" ? "sentDateTime" : "lastModifiedDateTime";
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/mailFolders/${folder}/messages` +
    `?$select=id,subject,sentDateTime,toRecipients,body&$orderby=${dateField} desc&$top=50`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.value || []).map((m: { id: string; subject?: string; sentDateTime?: string; toRecipients?: { emailAddress?: { address?: string } }[]; body?: { content?: string } }): Msg => ({
    id: m.id,
    subject: m.subject || "",
    sentDateTime: m.sentDateTime || "",
    to: (m.toRecipients || []).map((r) => (r.emailAddress?.address || "").toLowerCase()).filter(Boolean),
    body: m.body?.content || "",
    folder,
  }));
}

export async function GET() {
  const token = await getGraphToken();
  if (!token) return NextResponse.json({ error: "Graph auth failed" }, { status: 503 });

  const all = [...(await fetchFolder(token, "sentitems")), ...(await fetchFolder(token, "drafts"))];
  const matches = all.filter(
    (m) => /wealthforge/i.test(m.subject) || m.to.some((a) => a.includes("wealthforge.com"))
  );

  const out: { folder: string; subject: string; sentAt: string; bodyChars: number; extracted: number; sampleQuestions: string[] }[] = [];
  let inserted = 0;
  for (const m of matches) {
    const body = stripMimecastNoise(m.body).slice(0, 12000);
    let pairs: { question: string; answer: string; category: string }[] = [];
    try { pairs = await extractQaPairs({ subject: m.subject, body }); } catch { /* skip */ }
    if (pairs.length) {
      inserted += await insertPendingQa(
        pairs.map((p) => ({ question: p.question, answer: p.answer, category: p.category, sourceSubject: m.subject, sourceMailbox: MAILBOX, sourceSentAt: m.sentDateTime || new Date().toISOString() }))
      );
    }
    out.push({ folder: m.folder, subject: m.subject, sentAt: m.sentDateTime, bodyChars: body.length, extracted: pairs.length, sampleQuestions: pairs.slice(0, 6).map((p) => p.question) });
  }

  return NextResponse.json({ matched: matches.length, insertedToLearnedQa: inserted, messages: out });
}
