# Newsletter Agent Walkthrough

The AI portal runs six automated newsletters that gather real estate news, write a market narrative using Claude, and email it to the team every week or month. Each newsletter is an independent serverless function triggered on a schedule -- no manual steps required.

---

## System Map

| Newsletter | Schedule | Market | Recipients |
|---|---|---|---|
| Brevard Monday Brief | Every Monday 12:30 PM UTC (7:30 AM EST) | Brevard / Space Coast | mparad, mberry, wmeyer, bberry |
| Brevard Submarket Watch | Every Monday 1:30 PM UTC (8:30 AM EST) | Brevard / Florida Industrial | mparad, mberry, wmeyer, bberry |
| Brevard Fund Landscape | Every Monday 2:00 PM UTC (9:00 AM EST) | Brevard / Industrial CRE Funds | mparad, mberry, wmeyer, bberry |
| Permian Monday Brief | Every Monday 1:00 PM UTC (8:00 AM EST) | Permian Basin | mparad, mberry, wmeyer, bberry |
| Permian Submarket Watch | 1st of each month 1:30 PM UTC | Permian Basin | mparad, mberry, wmeyer, bberry |
| Permian Fund Landscape | 1st of each month 2:00 PM UTC | Permian Basin | mparad, mberry, wmeyer, bberry |

---

## How It Works -- Step by Step

Using the **Brevard Monday Brief** as the example. This is the first newsletter to run each Monday morning.

---

**Step 1: Schedule Trigger**

Vercel's cron scheduler fires an HTTP GET request to the newsletter's API route at the configured time. The schedule lives in `vercel.json` -- no external cron service needed.

`vercel.json` -> `"path": "/api/cron/brevard-brief", "schedule": "30 12 * * 1"`

---

**Step 2: Auth Check**

The very first thing the route does is verify the request comes from Vercel's own scheduler and not an outside caller. It checks the `Authorization` header against a secret token stored in environment variables. Any request without the right token gets a 401 rejected immediately.

`app/api/cron/brevard-brief/route.ts` -> checks `authHeader !== Bearer ${process.env.CRON_SECRET}`

---

**Step 3: Load Already-Seen Article URLs**

Before fetching any news, the system queries the database for every article URL used in any newsletter in the past 7 days. This dedup set is shared across all three Brevard newsletters in a single run, so an article used in the Weekly Brief won't appear again in the Submarket Watch 30 minutes later.

`lib/db.ts` -> `getSeenNewsletterArticleUrls()`

---

**Step 4: RSS Feed Pull**

The workflow function fetches articles from a list of industry RSS feeds: GlobeSt, Commercial Observer, CRE Daily, The Real Deal, Bisnow, and Connect CRE. Each feed is fetched in parallel. Failed feeds are silently skipped -- one bad feed doesn't stop the whole run.

`lib/agents/workflows/brevard-merged-briefs.ts` -> RSS parser loops over `FEEDS` array

---

**Step 5: Apify News Scrape**

In addition to RSS, the system runs targeted Google News searches via Apify (a web scraping service). It submits queries like `"Brevard County industrial warehouse lease sale"` and `"Space Coast Florida industrial outdoor storage"` to surface articles that don't appear in standard RSS feeds.

`app/api/cron/brevard-submarket-watch/route.ts` -> `apify.actor("apify/google-news-scraper").call({ queries: APIFY_QUERIES })`

---

**Step 6: Article Filtering and Dedup**

All articles from RSS and Apify are combined, then filtered three ways: (1) must be within the last 30 days, (2) must match at least one keyword relevant to the market (e.g. "brevard", "space coast", "sale comp", "cap rate"), and (3) must not be in the already-seen URL set from Step 3. If zero new articles remain after filtering, the newsletter exits cleanly with no email sent.

`app/api/cron/brevard-submarket-watch/route.ts` -> `isRelevant()` function + `seenUrls` filter

---

**Step 7: Claude Writes the Narrative**

The filtered article list (up to 20 articles) is passed to Claude via the Anthropic API. Claude is given a role ("You are an industrial CRE analyst for ERP Funds...") and a specific writing brief (e.g., write 3-4 paragraphs covering market trends, notable deals, and investment implications). The response is plain text that will be wrapped in HTML.

`lib/agents/workflows/brevard-merged-briefs.ts` -> `anthropic.messages.create({ model: "claude-opus-4-7", ... })`

---

**Step 8: Email Send**

The narrative and article list are assembled into a styled HTML email. The Brevard brief sends via the **Microsoft Graph API** (using Azure credentials to send from mparad@erpfunds.com's mailbox directly). The older Permian routes use **SMTP via Office 365** (nodemailer). Both methods send to the same four recipients.

`app/api/cron/brevard-brief/route.ts` -> `sendEmailViaGraph()` (Graph API)
`lib/mailer.ts` -> `sendBriefEmail()` (SMTP / nodemailer)

---

**Step 9: Save to SharePoint**

After the email sends, the HTML is uploaded to SharePoint in a structured folder path:
`Newsletters/{Market}/{Month Year}/{Market} {BriefType} - {YYYY-MM-DD}.html`

This call is **fire-and-forget** -- a SharePoint failure logs silently and does not block or retry the email. The email always goes out regardless of whether the file save succeeds.

`lib/agents/file-handler.ts` -> `saveNewsletterToSharePoint()` called with `.catch(() => {})`

---

**Step 10: Database Log**

Two database writes happen after a successful run: (1) the brief itself (subject line, full HTML, narrative text) is saved to the `briefs` table, and (2) each article URL is saved to `brief_articles` linked to that brief. These records are what Step 3 queries next week to prevent repeats.

`lib/db.ts` -> `archiveBrief()` (Permian routes) or `recordNewsletterRun()` (Brevard routes)

---

**Step 11: Dashboard Activity Feed**

A final database write goes to the `agent_runs` table with the agent name, workflow ID, run status (success/error), a short summary snippet, and how long the run took. This is what populates the Command Center activity feed in the portal dashboard.

`lib/db.ts` -> `logAgentRun({ agentId: "lp-intel", workflowId: "weekly-market-update", status: "success", ... })`

---

## What Makes Each Newsletter Different

### Monday Brief (Brevard and Permian)

The Monday Brief is a broad weekly market update. It pulls from general CRE industry RSS feeds (GlobeSt, CRE Daily, Commercial Observer, The Real Deal) and runs Apify searches with market-specific queries. The Brevard version uses the **Graph API** to send email and actually runs three briefs in a single function call -- Weekly Market Update, Submarket Intelligence, and Competitive Intel -- sequentially within the same Monday 12:30 UTC execution window. The Permian version is a standalone function using SMTP. Both ask Claude to write a 3-4 paragraph narrative focused on market trends and investment implications.

### Submarket Watch (Brevard and Permian)

Submarket Watch is a deeper data cut focused specifically on **sale comparable transactions, tenant activity, and submarket metrics** (vacancy, absorption, cap rates). It filters for more granular keywords -- for Brevard that means "cocoa", "melbourne fl", "titusville", "sale comp", "absorption"; for Permian it's "midland", "odessa", "ios", "service yard". The prompt explicitly asks Claude to flag market shifts that could affect OM pricing narratives, making this the most deal-relevant brief. Brevard runs weekly; Permian runs monthly on the 1st.

### Fund Landscape Brief (Brevard and Permian)

The Fund Landscape Brief is aimed at Meghan's fundraising work. Instead of market feeds, it watches **private equity and fund-specific sources** -- PERE/IPE Real Assets, PR Newswire, Business Wire -- and searches for news about competitor fund raises, IRR benchmarks, and LP appetite signals. Keywords include "fund raise", "irr", "carried interest", specific fund managers (Blackstone, Prologis, EQT, Nuveen, Ares). The prompt instructs Claude to frame analysis for LP meeting preparation and to compare competitor activity against ERP's Fund IV strategy. The Permian version looks back 90 days (vs. 30 days for Brevard) to capture slower-moving fund news cycles.
