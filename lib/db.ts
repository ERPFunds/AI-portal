import { sql } from "@vercel/postgres";
import type { FeedItem } from "./rss";

export async function getPreviouslyPublishedUrls(agentName: string): Promise<Set<string>> {
  const { rows } = await sql`
    SELECT DISTINCT ba.article_url
    FROM brief_articles ba
    JOIN briefs b ON b.id = ba.brief_id
    WHERE b.agent_name = ${agentName}
  `;
  return new Set(rows.map((r: any) => r.article_url));
}

export async function archiveBrief(params: {
  agentName: string;
  subject: string;
  html: string;
  narrative: string;
  macro: any;
  news: FeedItem[];
}) {
  const { rows } = await sql`
    INSERT INTO briefs (agent_name, subject, html, narrative, macro_data)
    VALUES (${params.agentName}, ${params.subject}, ${params.html},
            ${params.narrative}, ${JSON.stringify(params.macro)})
    RETURNING id
  `;
  const briefId = rows[0].id;

  for (const item of params.news) {
    await sql`
      INSERT INTO brief_articles (brief_id, article_url, source, title, pub_date)
      VALUES (${briefId}, ${item.link}, ${item.source}, ${item.title},
              ${item.pubDate.toISOString()})
    `;
  }
  return briefId;
}

export async function getLatestBrief(agentName: string) {
  const { rows } = await sql`
    SELECT * FROM briefs WHERE agent_name = ${agentName}
    ORDER BY sent_at DESC LIMIT 1
  `;
  return rows[0];
}
