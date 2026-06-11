import { NextRequest, NextResponse } from "next/server";
import { classifyInquiry } from "@/lib/agents/ir/inquiry-classifier";

export const maxDuration = 60;

interface ClassifyPayload {
  from?: string;
  subject?: string;
  body?: string;
}

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: ClassifyPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const from = (payload.from || "").trim();
  const subject = (payload.subject || "").trim();
  const body = (payload.body || "").trim();

  if (!from && !subject && !body) {
    return NextResponse.json({ error: "Provide at least one of: from, subject, body" }, { status: 400 });
  }

  try {
    const result = await classifyInquiry({ from, subject, body });
    return NextResponse.json({
      success: true,
      isInvestorInquiry: result.isInvestorInquiry,
      reason: result.reason,
      senderType: result.senderType,
      confidence: result.confidence,
      contact: result.contact,
    });
  } catch (err) {
    return NextResponse.json({ error: "classify-failed", message: String(err) }, { status: 500 });
  }
}
