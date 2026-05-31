/**
 * Weekly Brevard County industrial vacancy newsletter
 *
 * Cron: Fridays 12:30 UTC (8:30 am EDT)
 * Scrapes LoopNet for current industrial-for-lease listings in Brevard County, FL,
 * compiles a Claude-written narrative, and emails the newsletter.
 *
 * Recipients: mparad, mberry, wmeyer, bbery
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { fetchLoopNetListings } from "@/lib/loopnet-scraper";
import { logAgentRun } from "@/lib/db";
import { saveNewsletterToSharePoint } from "@/lib/agents/file-handler";

export const maxDuration = 300;

const anthropic = new Anthropic();

const RECIPIENTS = [
  "mparad@erpfunds.com",
  "mberry@erpfunds.com",
  "wmeyer@erpfunds.com",
  "bbery@erpfunds.com",
];
const SENDER_MAILBOX = "team@erpfunds.com";

// â”€â”€ Graph email sender â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function sendEmailViaGraph(params: {
  subject: string;
  htmlBody: string;
}): Promise<{ success: boolean; message: string }> {
  let token: string | null;
  try {
    token = await getGraphToken();
  } catch (err) {
    return { success: false, message: `Auth failed: ${String(err)}` };
  }
  if (!token) return { success: false, message: "AZURE credentials not configured" };

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER_MAILBOX)}/sendMail`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          subject: params.subject,
          body: { contentType: "HTML", content: params.htmlBody },
          toRecipients: RECIPIENTS.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    return { success: false, message: `Graph API ${res.status}: ${err}` };
  }
  return { success: true, message: `Sent to ${RECIPIENTS.join(", ")}` };
}

// â”€â”€ Route handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();
  const weekOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const subject = `Brevard Industrial Vacancies â€” Week of ${weekOf}`;

  try {
    // â”€â”€ 1. Fetch listings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const listings = await fetchLoopNetListings({ market: "brevard", maxListings: 40 });

    if (listings.length === 0) {
      await logAgentRun({
        agentId: "lp-intel",
        workflowId: "brevard-vacancy",
        status: "error",
        summary: "No listings returned from LoopNet",
        market: "brevard",
        durationMs: Date.now() - startMs,
        errorMessage: "fetchLoopNetListings returned empty array",
      }).catch(() => {});
      return NextResponse.json({ success: false, message: "No listings found" });
    }

    // â”€â”€ 2. Claude narrative â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const listingText = listings
      .map(
        (l, i) =>
          `${i + 1}. ${l.address}${l.size ? ` | ${l.size}` : ""}${l.availableSpace ? ` | Avail: ${l.availableSpace}` : ""}${l.price ? ` | ${l.price}` : ""}${l.description ? ` â€” ${l.description}` : ""}`
      )
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `You are an industrial CRE analyst for ERP Funds. Write a concise 3-paragraph vacancy summary for the Brevard County, FL industrial market based on the listings below.

Focus on:
1. Overall picture â€” how much space is available, what size tranches are showing up, any clustering by submarket (Cocoa, Melbourne, Titusville, etc.)
2. Pricing â€” what are asking rents? Any notable outliers?
3. Opportunity flags â€” any properties or pockets worth tracking for ERP's Space Coast strategy?

Listings this week (${listings.length} total):
${listingText}

Be specific, data-dense, and brief. Flag intelligence gaps honestly.`,
        },
      ],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";

    // â”€â”€ 3. Build HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const narrativeHtml = narrative
      .split("\n\n")
      .filter(Boolean)
      .map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`)
      .join("");

    const listingsHtml = listings
      .map(
        (l) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
          <div style="font-weight:600;color:#0f172a;">${l.address}</div>
          ${l.propertyName ? `<div style="font-size:12px;color:#6b7280;">${l.propertyName}</div>` : ""}
          <div style="font-size:12px;color:#374151;margin-top:4px;">
            ${[l.size && `${l.size} total`, l.availableSpace && `${l.availableSpace} available`, l.price].filter(Boolean).join(" &middot; ")}
          </div>
          ${l.url ? `<a href="${l.url}" style="font-size:11px;color:#1d4ed8;">View on LoopNet â†’</a>` : ""}
        </td>
      </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">ERP Funds Â· Vacancy Watch Â· Brevard County</div>
        <div style="font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">${listings.length} industrial listings Â· Space Coast, FL</div>
      </td></tr>
      <tr><td style="padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Market Summary</div>
        ${narrativeHtml}
      </td></tr>
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Current Listings (${listings.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0">${listingsHtml}</table>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">ERP Funds AI Portal Â· Brevard Vacancy Watch Â· Weekly Â· Source: LoopNet</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    // â”€â”€ 4. Send & save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const emailResult = await sendEmailViaGraph({ subject, htmlBody: html });
    saveNewsletterToSharePoint({
      market: "Brevard",
      briefType: "Vacancy Watch",
      htmlBody: html,
    }).catch(() => {});

    await logAgentRun({
      agentId: "lp-intel",
      workflowId: "brevard-vacancy",
      status: emailResult.success ? "success" : "error",
      summary: `${listings.length} listings. ${narrative.slice(0, 200)}`,
      market: "brevard",
      durationMs: Date.now() - startMs,
      errorMessage: emailResult.success ? undefined : emailResult.message,
    }).catch(() => {});

    return NextResponse.json({
      success: emailResult.success,
      listings: listings.length,
      subject,
      emailMessage: emailResult.message,
    });
  } catch (error) {
    console.error("[brevard-vacancy] failed:", error);
    await logAgentRun({
      agentId: "lp-intel",
      workflowId: "brevard-vacancy",
      status: "error",
      market: "brevard",
      durationMs: Date.now() - startMs,
      errorMessage: String(error),
    }).catch(() => {});
    return NextResponse.json({ error: "Brevard vacancy newsletter failed", detail: String(error) }, { status: 500 });
  }
}
