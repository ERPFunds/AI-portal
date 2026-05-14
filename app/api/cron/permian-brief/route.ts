import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { fetchNewsItems } from "@/lib/fetch-news";
import { archiveBrief } from "@/lib/db";

const anthropic = new Anthropic();

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

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 680px; margin: 0 auto; color: #1f2937;">
  <div style="background: #0f172a; color: #fff; padding: 24px 32px; margin-bottom: 24px;">
    <div style="font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px;">ERP Funds · LP Market Intelligence</div>
    <h1 style="margin: 0; font-size: 22px;">${subject}</h1>
  </div>
  <div style="padding: 0 32px;">
    <h2 style="color: #0f172a; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Market Narrative</h2>
    ${narrative.split("\n\n").map((p: string) => `<p style="line-height: 1.7; color: #374151;">${p}</p>`).join("")}
    <h2 style="color: #0f172a; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Articles This Week (${news.length})</h2>
    <ul style="line-height: 1.9; color: #374151;">
      ${news.slice(0, 20).map((a) => `<li><a href="${a.link}" style="color: #1d4ed8;">${a.title}</a> <span style="color: #6b7280; font-size: 13px;">[${a.source}] &middot; ${a.pubDate.toLocaleDateString()}</span></li>`).join("")}
    </ul>
  </div>
  <div style="padding: 18px 32px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; margin-top: 32px;">
    ERP Funds AI Agent Portal &middot; Permian Industrial Brief
  </div>
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

    return NextResponse.json({ success: true, articles: news.length, subject });
  } catch (error) {
    console.error("Permian brief error:", error);
    return NextResponse.json({ error: "Brief generation failed" }, { status: 500 });
  }
}
