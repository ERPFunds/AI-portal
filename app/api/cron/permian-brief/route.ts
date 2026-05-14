import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsItems } from "@/lib/fetch-news";
import { archiveBrief } from "@/lib/db";
import { sendBriefEmail } from "@/lib/mailer";

const anthropic = new Anthropic();

const RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const news = await fetchNewsItems();

    if (news.length === 0) {
      return NextResponse.json({ message: "No new articles to publish." });
    }

    const articleList = news
      .slice(0, 20)
      .map((a, i) => `${i + 1}. [${a.source}] ${a.title} (${a.pubDate.toLocaleDateString()})`)
      .join("\n");

    const msg = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `You are an industrial CRE analyst for ERP Funds, a commercial real estate investment firm focused on the Permian Basin. Write a concise Monday Brief narrative (3-4 paragraphs) summarizing the following news. Focus on market trends, notable deals, and investment implications for industrial CRE.\n\nArticles:\n${articleList}`,
        },
      ],
    });

    const narrative = msg.content[0].type === "text" ? msg.content[0].text : "";
    const macro = {};

    const subject = `Permian Industrial — Monday Brief · ${new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })}`;

    const narrativeHtml = narrative
      .split("\n\n")
      .map((p: string) => `<p style="line-height:1.7;color:#374151;margin:0 0 16px;">${p}</p>`)
      .join("");

    const articlesHtml = news
      .slice(0, 20)
      .map(
        (a) =>
          `<tr>
            <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
              <a href="${a.link}" style="color:#1d4ed8;font-weight:500;text-decoration:none;">${a.title}</a>
              <div style="font-size:12px;color:#6b7280;margin-top:3px;">${a.source} &middot; ${a.pubDate.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
            </td>
          </tr>`
      )
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" style="max-width:640px;background:#ffffff;border-radius:8px;overflow:hidden;">

      <!-- Header -->
      <tr><td style="background:#0f172a;padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;margin-bottom:6px;">ERP Funds · LP Market Intelligence</div>
        <div style="font-size:22px;font-weight:700;color:#ffffff;line-height:1.3;">${subject}</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:6px;">${news.length} new articles · Permian Basin Industrial</div>
      </td></tr>

      <!-- Narrative -->
      <tr><td style="padding:28px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Market Narrative</div>
        ${narrativeHtml}
      </td></tr>

      <!-- Divider -->
      <tr><td style="padding:0 32px;"><hr style="border:none;border-top:2px solid #e5e7eb;margin:0;"></td></tr>

      <!-- Articles -->
      <tr><td style="padding:24px 32px;">
        <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;margin-bottom:14px;">Articles This Week (${news.length})</div>
        <table width="100%" cellpadding="0" cellspacing="0">
          ${articlesHtml}
        </table>
      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <div style="font-size:12px;color:#9ca3af;">ERP Funds AI Agent Portal &middot; Permian Industrial Brief &middot; Sent to Michele, Meghan &amp; William</div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    await archiveBrief({
      agentName: "permian-brief",
      subject,
      html,
      narrative,
      macro,
      news,
    });

    await sendBriefEmail({ subject, html });

    return NextResponse.json({ success: true, articles: news.length, subject, recipients: RECIPIENTS });
  } catch (error) {
    console.error("Permian brief error:", error);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}
