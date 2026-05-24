# Newsletter Maintenance & Handoff Reference

---

## 1. Environment Variables

All environment variables are set in the **Vercel dashboard** under:
**Project -> Settings -> Environment Variables**

| Variable | What It Does | What Breaks If Missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | Authenticates calls to Claude to write newsletter narratives | All newsletters fail -- no narrative can be generated |
| `APIFY_API_TOKEN` | Authenticates Google News scrape requests via Apify | Newsletters fall back to RSS-only; fewer articles, especially for niche market queries |
| `CRON_SECRET` | Bearer token Vercel sends in the `Authorization` header when triggering a cron route | All cron routes return 401 Unauthorized and do nothing |
| `SMTP_HOST` | Hostname for the Office 365 SMTP server (default: `smtp.office365.com`) | Permian Brief and standalone submarket/fund routes fail to send email |
| `SMTP_PORT` | SMTP port (default: `587`) | Same as above |
| `SMTP_USER` | Office 365 account used as the SMTP sender (e.g. `mparad@erpfunds.com`) | SMTP auth fails; no email sent from Permian routes |
| `SMTP_PASS` | Password or app password for the SMTP account | SMTP auth fails; no email sent from Permian routes |
| `POSTGRES_URL` | Connection string for the Vercel Postgres (Supabase-compatible) database | Database writes fail; newsletters may still send but article dedup and logging are skipped |
| `AZURE_TENANT_ID` | Azure Active Directory tenant ID for the Microsoft Graph API app registration | Graph API token cannot be obtained; Brevard brief cannot send email (Graph method) |
| `AZURE_CLIENT_ID` | Azure app registration client ID | Same as above |
| `AZURE_CLIENT_SECRET` | Azure app registration client secret | Same as above |
| `SHAREPOINT_SITE_ID` | The compound site identifier for the SharePoint site where newsletters are saved (format: `hostname,site-collection-id,web-id`) | Newsletters save to the sender's personal OneDrive instead of the shared SharePoint site (or fail silently if no fallback is configured) |
| `OVERRIDE_EMAIL_RECIPIENT` | Optional -- if set, adds this address to the Brevard brief recipient list without removing the base recipients | No effect if not set; used for testing |

---

## 2. Rotating API Keys

### Anthropic API Key

1. Go to [console.anthropic.com](https://console.anthropic.com) -> API Keys
2. Click **Create Key**, copy the new key immediately (it's only shown once)
3. In the Vercel dashboard: **Project -> Settings -> Environment Variables -> `ANTHROPIC_API_KEY`** -> Edit -> paste new value -> Save
4. **Redeploy required?** Yes -- click **Deployments -> Redeploy** (or push any commit) to pick up the new value in production
5. Watch for: if the old key is deleted before redeployment, newsletters will fail with an authentication error until the redeploy completes

### Apify API Token

1. Go to [console.apify.com](https://console.apify.com) -> Settings -> Integrations -> API tokens
2. Create a new token, copy it
3. Update `APIFY_API_TOKEN` in Vercel Environment Variables -> Save
4. **Redeploy required?** Yes
5. Watch for: if the token is invalid, Apify calls fail silently (newsletters still send, just with fewer articles from RSS only)

### SMTP / Office 365 App Password

Office 365 SMTP typically uses an **app password** (if MFA is enabled on the account) or the account password directly.

1. Log into the Microsoft 365 admin center or the user's account settings
2. Navigate to **Security info -> App passwords** -> Add a new app password -> copy it
3. Update `SMTP_PASS` in Vercel Environment Variables -> Save
4. **Redeploy required?** Yes
5. Watch for: SMTP auth errors in Vercel function logs, which look like `Error: Invalid login: 535 5.7.3 Authentication unsuccessful`

### Azure App Registration Secret (Graph API)

The Azure secret is used by the Brevard brief to send email via Microsoft Graph.

1. Go to [portal.azure.com](https://portal.azure.com) -> Azure Active Directory -> App registrations -> find the ERP Funds portal app
2. Click **Certificates & secrets -> New client secret**
3. Set an expiry (recommend 24 months), click Add, copy the **Value** immediately
4. Update `AZURE_CLIENT_SECRET` in Vercel Environment Variables -> Save
5. **Redeploy required?** Yes
6. Watch for: Brevard brief sends will fail with a 401 from Graph API. The error shows up in Vercel function logs as `Auth failed: ...` or `AZURE credentials not configured`

---

## 3. Adding or Removing Email Recipients

Recipients are **hardcoded** in the source files. There is no database table or config file for recipients -- you edit the code directly.

### Files that define recipients

| File | Variable | Used by |
|---|---|---|
| `app/api/cron/brevard-brief/route.ts` | `BASE_RECIPIENTS` (line 9) | Brevard Monday Brief (all 3 sub-briefs) |
| `app/api/cron/permian-brief/route.ts` | `RECIPIENTS` (line 10) | Permian Monday Brief |
| `app/api/cron/brevard-submarket-watch/route.ts` | hardcoded in `sendBriefEmail` call via `lib/mailer.ts` | Brevard Submarket Watch (standalone route) |
| `app/api/cron/brevard-fund-landscape/route.ts` | hardcoded in `sendBriefEmail` call via `lib/mailer.ts` | Brevard Fund Landscape (standalone route) |
| `app/api/cron/permian-submarket-watch/route.ts` | hardcoded in `sendBriefEmail` call via `lib/mailer.ts` | Permian Submarket Watch |
| `app/api/cron/permian-fund-landscape/route.ts` | hardcoded in `sendBriefEmail` call via `lib/mailer.ts` | Permian Fund Landscape |
| `lib/mailer.ts` | `to:` array (lines 21-25) | All routes that call `sendBriefEmail` |

### The pattern

In files that define their own recipient list:
```ts
const BASE_RECIPIENTS = ["mparad@erpfunds.com", "mberry@erpfunds.com", "wmeyer@erpfunds.com", "bberry@erpfunds.com"];
```
Add or remove email addresses from that array.

In `lib/mailer.ts`, which is used by the submarket and fund landscape routes:
```ts
to: [
  "mparad@erpfunds.com",
  "mberry@erpfunds.com",
  "wmeyer@erpfunds.com",
  "bberry@erpfunds.com",
].join(", "),
```
Add or remove addresses from this array. Because `mailer.ts` is shared, editing it changes recipients for all routes that call `sendBriefEmail`.

After editing, commit the change and push -- Vercel will redeploy automatically.

---

## 4. Changing Newsletter Schedules

Schedules are defined in `vercel.json` at the project root using **standard 5-field cron syntax**.

### Current schedules

| Newsletter | Cron Expression | UTC Time | EST / CST |
|---|---|---|---|
| Brevard Monday Brief | `30 12 * * 1` | Mon 12:30 UTC | Mon 7:30 AM EST / 6:30 AM CST |
| Permian Monday Brief | `0 13 * * 1` | Mon 13:00 UTC | Mon 8:00 AM EST / 7:00 AM CST |
| Brevard Submarket Watch | `30 13 * * 1` | Mon 13:30 UTC | Mon 8:30 AM EST / 7:30 AM CST |
| Brevard Fund Landscape | `0 14 * * 1` | Mon 14:00 UTC | Mon 9:00 AM EST / 8:00 AM CST |
| Permian Submarket Watch | `30 13 1 * *` | 1st of month 13:30 UTC | 1st of month 8:30 AM EST / 7:30 AM CST |
| Permian Fund Landscape | `0 14 1 * *` | 1st of month 14:00 UTC | 1st of month 9:00 AM EST / 8:00 AM CST |

### Cron syntax reference

```
30 12 * * 1
│  │  │ │ └─ day of week (0=Sun, 1=Mon, ..., 6=Sat)
│  │  │ └─── month (1-12, or *)
│  │  └───── day of month (1-31, or *)
│  └──────── hour (0-23, UTC)
└─────────── minute (0-59)
```

**All times are UTC.** To convert:
- **EST (winter)** = UTC - 5 hours
- **CST (winter)** = UTC - 6 hours
- **EDT (summer)** = UTC - 4 hours
- **CDT (summer)** = UTC - 5 hours

### Example: move the Brevard Brief to 9 AM EST (14:00 UTC)

Change `"schedule": "30 12 * * 1"` to `"schedule": "0 14 * * 1"` in `vercel.json`.

### Example: run Permian Submarket Watch every other Monday instead of monthly

Change `"schedule": "30 13 1 * *"` to `"schedule": "30 13 * * 1"`.

After editing `vercel.json`, commit and push. Vercel picks up the new schedule on the next deployment.

---

## 5. Adding a New Market / Newsletter

Use this checklist when adding a new market (e.g., a third city or asset class).

- [ ] **Copy an existing cron route** that most closely matches the new newsletter type:
  - For a Monday Brief: copy `app/api/cron/brevard-brief/route.ts` to `app/api/cron/{market}-brief/route.ts`
  - For a Submarket Watch: copy `app/api/cron/brevard-submarket-watch/route.ts`
  - For a Fund Landscape: copy `app/api/cron/brevard-fund-landscape/route.ts`

- [ ] **Update the feeds, keywords, and Apify queries** in the new file to match the target market. Change all three: `FEEDS` (RSS sources), `APIFY_QUERIES` (Google News search terms), and `KEYWORDS` (relevance filter terms).

- [ ] **Update the Claude prompt** in the `anthropic.messages.create` call to reference the correct market name and investment context.

- [ ] **Update `RECIPIENTS` and `SENDER_MAILBOX`** if they differ from the defaults.

- [ ] **Add the new route to `vercel.json`** under the `"crons"` array:
  ```json
  {
    "path": "/api/cron/{market}-brief",
    "schedule": "0 15 * * 1"
  }
  ```

- [ ] **Add the new `agentName` value to `NEWSLETTER_AGENTS` in `lib/db.ts`** (the array starting at line 50) so the dedup query includes the new newsletter when checking for already-seen articles.
  ```ts
  const NEWSLETTER_AGENTS = [
    "brevard-weekly", "brevard-submarket", "brevard-fund",
    "permian-brief",  "submarket-watch",  "fund-landscape-brief",
    "{market}-brief",   // add new entry here
  ];
  ```

- [ ] **Add a `WF_LABEL` entry in `DashboardClient.tsx`** so the new newsletter's runs appear with a readable label in the Command Center activity feed. Search for `WF_LABEL` in the file to find the existing map.

- [ ] Deploy and verify by checking Vercel Cron Jobs tab and the `briefs` table in the database after the first scheduled run.

---

## 6. Monitoring & Debugging

### Checking if a newsletter ran

**Three places to check, in order:**

1. **Vercel dashboard -> your project -> Cron Jobs tab**
   Shows each scheduled cron, the last run time, and whether it succeeded or failed. Green checkmark = ran successfully; red X = function returned an error or timed out.

2. **Supabase / Vercel Postgres -> `briefs` table**
   Each successful newsletter run inserts a row with `agent_name`, `subject`, and `sent_at`. Query to confirm:
   ```sql
   SELECT agent_name, subject, sent_at FROM briefs ORDER BY sent_at DESC LIMIT 20;
   ```

3. **Portal Command Center activity feed**
   The dashboard at `/command-center` shows recent `agent_runs` entries. Newsletter runs appear as `lp-intel` agent with `workflow_id` like `weekly-market-update` or `brevard-submarket-watch`.

### What to do if a newsletter didn't send

1. **Open Vercel -> Cron Jobs -> click the failed run -> View Logs**
   The full function output is here. Look for the last log line before the error.

2. **Common errors and fixes:**

   | Error message | Likely cause | Fix |
   |---|---|---|
   | `401 Unauthorized` on the cron route itself | `CRON_SECRET` env var missing or wrong | Verify env var in Vercel settings; redeploy |
   | `Error: Invalid login: 535 5.7.3` | SMTP credentials wrong or expired | Rotate SMTP password (see Section 2) |
   | `Auth failed: ...` or `AZURE credentials not configured` | Azure env vars missing or secret expired | Check/rotate Azure client secret (see Section 2) |
   | `Anthropic API error` or `401` from Anthropic | API key expired or invalid | Rotate Anthropic key (see Section 2) |
   | `No new articles to publish` | All articles already seen this week | Normal behavior -- not an error; no email is sent |
   | Function timed out (> 300 seconds) | Apify took too long or hung | Check Apify dashboard for actor run status; if it's a one-off, re-trigger manually |

3. **Manually triggering a cron route for testing**
   You can hit a cron route directly from a browser or curl. You must include the `CRON_SECRET` as a Bearer token:
   ```
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
        https://your-portal-domain.vercel.app/api/cron/brevard-brief
   ```
   Replace `YOUR_CRON_SECRET` with the value from Vercel environment variables. The response JSON shows which sub-briefs succeeded or failed.

---

## 7. SharePoint File Saves

### How it works

After each newsletter email is sent, the HTML is uploaded to SharePoint at this folder path:
```
Newsletters/{Market}/{Month Year}/{Market} {BriefType} - {YYYY-MM-DD}.html
```

Example: `Newsletters/Brevard/May 2026/Brevard Weekly Market Update - 2026-05-19.html`

### Failures are non-fatal

The SharePoint save is called with `.catch(() => {})` -- meaning if the upload fails for any reason (expired secret, network error, permissions), the failure is silently swallowed and the email has already been delivered. The newsletter never blocks on SharePoint.

### Testing write permissions

A dedicated test endpoint exists to verify SharePoint connectivity without triggering a full newsletter run:
```
GET /api/sharepoint-write-test
```
Call it with the same `Authorization: Bearer {CRON_SECRET}` header. It will attempt a test file write and return success/failure details including any Graph API error messages.

### Required Azure permissions

The Azure app registration must have the following Microsoft Graph **application permission** (not delegated):

- `Files.ReadWrite.All`

This permission requires **admin consent** in the Azure portal. Without it, all Graph API file upload calls return 403 Forbidden.

To verify: Azure portal -> App registrations -> your app -> API permissions. The `Files.ReadWrite.All` entry should show **Type: Application** and **Status: Granted for [your tenant]**.

---

## 8. Database / Supabase

### Tables the newsletters write to

| Table | Written by | What it stores |
|---|---|---|
| `briefs` | `archiveBrief()` and `recordNewsletterRun()` in `lib/db.ts` | One row per newsletter run: agent name, email subject, full HTML, narrative text, timestamp |
| `brief_articles` | Same as above, after the `briefs` insert | One row per article used in a brief, linked by `brief_id`. Used for dedup next week. |
| `agent_runs` | `logAgentRun()` in `lib/db.ts` | One row per newsletter run: agent ID, workflow ID, success/error status, short summary, duration in ms. Powers the dashboard activity feed. |

### What `research_log` is NOT for

The `research_log` table is for the **email-triggered Research/Write workflows** (Agent 1 -- when someone emails the portal with a RESEARCH or WRITE prefix). It has nothing to do with the newsletter cron jobs. Do not expect newsletter runs to appear there.

### Querying recent newsletter runs

**Did newsletters run this week?**
```sql
SELECT agent_name, subject, sent_at
FROM briefs
WHERE sent_at > NOW() - INTERVAL '7 days'
ORDER BY sent_at DESC;
```

**How many articles were in last week's Brevard brief?**
```sql
SELECT COUNT(*) FROM brief_articles ba
JOIN briefs b ON b.id = ba.brief_id
WHERE b.agent_name = 'brevard-weekly'
  AND b.sent_at > NOW() - INTERVAL '7 days';
```

**Recent activity feed (same query the dashboard uses):**
```sql
SELECT agent_id, workflow_id, status, summary, market, created_at
FROM agent_runs
WHERE agent_id = 'lp-intel'
ORDER BY created_at DESC
LIMIT 20;
```

**Check which URLs were seen this week (used for dedup):**
```sql
SELECT DISTINCT ba.article_url
FROM brief_articles ba
JOIN briefs b ON b.id = ba.brief_id
WHERE b.agent_name IN (
  'brevard-weekly', 'brevard-submarket', 'brevard-fund',
  'permian-brief', 'submarket-watch', 'fund-landscape-brief'
)
  AND b.sent_at > NOW() - INTERVAL '7 days';
```
