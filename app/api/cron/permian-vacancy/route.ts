/**
 * Weekly Permian Basin industrial vacancy newsletter
 *
 * Cron: Fridays 13:00 UTC (9:00 am EDT)
 * Scrapes LoopNet for industrial-for-lease listings in Midland + Odessa TX,
 * then filters to properties on ERP's target road corridors before sending.
 *
 * Target roads:
 *   Highway 191 Â· Interstate 20 Â· Business 20 Â· FM 1788
 *   Highway 158 Â· Murphy Street Â· Industrial Avenue
 *
 * Recipients: mparad, mberry, wmeyer, bbery
 */

import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getGraphToken } from "@/lib/agents/graph-token";
import { fetchLoopNetListings, isOnPermianCorridor } from "@/lib/loopnet-scraper";
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
const SENDER_MAILBOX = "mparad@erpfunds.com";

const TARGET_ROADS = [
  "Highway 191",
  "Interstate 20",
  "Business 20",
  "FM 1788",
  "Highway 158",
  "Murphy Street",
  "Industrial Avenue",
];

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
  const subject = `Permian Industrial Vacancies â€” Week of ${weekOf}`;

  try {
    // â”€â”€ 1. Fetch listings and apply road filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const allListings = await fetchLoopNetListings({ market: "permian", maxListings: 60 });
    const listings = allListings.filter(isOnPermianCorridor);

    // â”€â”€ 2. Build HTML â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Always include a section for "off-corridor" listings so the team can
    // see what was filtered out (shown below a divider, greyed out).
    const offCorridor = allListings.filter((l) => !isOnPermianCorridor(l));

    // Narrative â€” only if we have corridor listings
    let narrative = "";
    if (listings.length > 0) {
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
            content: `You are an industrial CRE analyst for ERP Funds, focused on the Permian Basin. Write a concise 3-paragraph vacancy summary for this week's industrial listings on ERP's target road corridors in Midland/Odessa TX.

Target corridors: ${TARGET_ROADS.join(", ")}

Focus on:
1. What's available this week â€” size, location on which corridor, clustering patterns
2. Pricing signals â€” asking rents, any notable spread across corridors
3. IOS / service yard flags â€” any listings that look like outdoor storage, yard space, or truck-friendly industrial relevant to ERP's strategy?

On-corridor listings (${listings.length}):
${listingText}

Be specific and data-dense. Write with confidence from the available listings — do not apologize for limited data. If you see properties relevant to ERP's IOS/industrial outdoor storage thesis, call them out. This is an automated newsletter — do NOT ask follow-up questions, offer options, or end with bullet-point suggestions. Write the brief and stop.`,
          },
        ],
      });

      narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
    }

    const narrativeHtml =
      listings.length === 0
        ? `<p style="color:#6b7280;font-style:italic;">No listings found on target corridors this week. All ${allListings.length} Midland/Odessa listings are shown in the off-corridor section below.</p>`
        : narrative
            .split("\n\n")
            .filter(Boolean)
            .map((p) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`)
            .join("");

    const buildListingRow = (l: (typeof listings)[0], dim = false) => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;${dim ? "opacity:0.5;" : ""}">
        <div style="font-weight:600;color:#0f172a;">${l.address}</div>
        ${l.propertyName ? `<div style="font-size:12px;color:#6b7280;">${l.propertyName}</div>` : ""}
        <div style="font-size:12px;color:#374151;margin-top:4px;">
          ${[l.size && `${l.size} total`, l.availableSpace && `${l.availableSpace} available`, l.price].filter(Boolean).join(" &middot; ")}
        </div>
        ${l.url ? `<a href="${l.url}" style="font-size:11px;color:#1d4ed8;">View on LoopNet â†’</a>` : ""}
      </td>
    </tr>`;

    const onCorridorRows = listings.map((l) => buildListingRow(l, false)).join("");
    const offCorridorRows = offCorridor.map((l) => buildListingRow(l, true)).join("");

    const corridorPillsHtml = TARGET_ROADS.map(
      (r) =>
        `<span style="display:inline-block;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;border-radius:4px;font-size:11px;padding:2px 8px;margin:2px 4px 2px 0;">${r}</span>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#fff;border-radius:8px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#0f172a;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">ERP Funds Â· Vacancy Watch Â· Permian Basin</div>
        <div style="font-size:22px;font-weight:700;color:#fff;line-height:1.3;">${subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">${listings.length} on-corridor Â· ${offCorridor.length} off-corridor Â· Midland &amp; Odessa TX</div>
      </td></tr>

      <!-- Corridor chips -->
      <tr><td style="padding:16px 32px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:8px;">Target Corridors</div>
        ${corridorPillsHtml}
      </td></tr>

      <!-- Narrative -->
      <tr><td style="padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">This Week's Summary</div>
        ${narrativeHtml}
      </td></tr>

      <!-- On-corridor listings -->
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#15803d;margin-bottom:14px;">On-Corridor Listings (${listings.length})</div>
        ${
          listings.length > 0
            ? `<table width="100%" cellpadding="0" cellspacing="0">${onCorridorRows}</table>`
            : `<p style="color:#9ca3af;font-size:13px;font-style:italic;">No listings matched target corridors this week.</p>`
        }
      </td></tr>

      <!-- Off-corridor listings (dimmed) -->
      ${
        offCorridor.length > 0
          ? `<tr><td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #f3f4f6;margin:0;"></td></tr>
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#9ca3af;margin-bottom:14px;">Off-Corridor Listings (${offCorridor.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0">${offCorridorRows}</table>
      </td></tr>`
          : ""
      }

      <!-- Footer -->
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">ERP Funds AI Portal Â· Permian Vacancy Watch Â· Weekly Â· Source: LoopNet</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    // â”€â”€ 3. Send & save â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const emailResult = await sendEmailViaGraph({ subject, htmlBody: html });
    saveNewsletterToSharePoint({
      market: "Permian",
      briefType: "Vacancy Watch",
      htmlBody: html,
    }).catch(() => {});

    const summary = `${listings.length} on-corridor, ${offCorridor.length} off-corridor. ${narrative.slice(0, 200)}`;
    await logAgentRun({
      agentId: "lp-intel",
      workflowId: "permian-vacancy",
      status: emailResult.success ? "success" : "error",
      summary,
      market: "permian",
      durationMs: Date.now() - startMs,
      errorMessage: emailResult.success ? undefined : emailResult.message,
    }).catch(() => {});

    return NextResponse.json({
      success: emailResult.success,
      onCorridor: listings.length,
      offCorridor: offCorridor.length,
      subject,
      emailMessage: emailResult.message,
    });
  } catch (error) {
    console.error("[permian-vacancy] failed:", error);
    await logAgentRun({
      agentId: "lp-intel",
      workflowId: "permian-vacancy",
      status: "error",
      market: "permian",
      durationMs: Date.now() - startMs,
      errorMessage: String(error),
    }).catch(() => {});
    return NextResponse.json({ error: "Permian vacancy newsletter failed", detail: String(error) }, { status: 500 });
  }
}
