/**
 * POST /api/loopnet-ingest
 *
 * Called by a Power Automate flow whenever a LoopNet daily alert email
 * arrives in the mparad@erpfunds.com inbox.
 *
 * PA sends:
 *   Header:  x-agent-secret: <AGENT_WEBHOOK_SECRET>
 *   Body:    { "market": "brevard"|"permian", "subject": "...", "body": "<html>..." }
 *
 * Claude strips the structured listing data from the email HTML,
 * which is then stored in the loopnet_listings table for the
 * weekly cron newsletters to consume.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { storeLoopNetListings } from "@/lib/loopnet-scraper";
import type { LoopNetListing } from "@/lib/loopnet-scraper";

const anthropic = new Anthropic();

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get("x-agent-secret");
  return !!process.env.AGENT_WEBHOOK_SECRET && secret === process.env.AGENT_WEBHOOK_SECRET;
}

/** Strip HTML tags, collapse whitespace — keeps text readable for Claude. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&middot;/g, "·")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { market?: string; subject?: string; body?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { market, subject = "", body = "" } = payload;

  // Validate market
  if (market !== "brevard" && market !== "permian") {
    return NextResponse.json(
      { error: "market must be 'brevard' or 'permian'" },
      { status: 400 }
    );
  }

  const emailText = htmlToText(body).slice(0, 16000);

  // Ask Claude to extract all listings from the LoopNet alert email
  let listings: LoopNetListing[] = [];
  try {
    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: `Extract all property listings from this LoopNet alert email. Return a JSON array.

Each object must include:
- address (string, required — full street address including city/state)
- propertyName (string or null)
- size (string or null — total building size, e.g. "24,500 SF")
- availableSpace (string or null — available/leasable SF, e.g. "12,000 SF")
- price (string or null — asking rent or sale price, e.g. "$8.50/SF/YR" or "$2.1M")
- propertyType (string or null — e.g. "Industrial", "Flex", "Warehouse")
- url (string or null — full LoopNet listing URL if present)
- description (string or null — one-sentence summary or key detail)

Only include entries with a recognisable street address. Skip header/footer text, ads, and navigation links.
Return ONLY the raw JSON array — no markdown, no code fences.

Email text:
${emailText}`,
        },
      ],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "[]";
    listings = JSON.parse(raw) as LoopNetListing[];
  } catch (err) {
    console.error("[loopnet-ingest] Claude parse failed:", err);
    return NextResponse.json(
      { error: "Failed to parse listings from email", detail: String(err) },
      { status: 500 }
    );
  }

  if (!Array.isArray(listings) || listings.length === 0) {
    return NextResponse.json({ success: true, inserted: 0, message: "No listings found in email" });
  }

  const inserted = await storeLoopNetListings({
    market: market as "brevard" | "permian",
    listings,
    sourceSubject: subject,
  });

  return NextResponse.json({ success: true, parsed: listings.length, inserted });
}
