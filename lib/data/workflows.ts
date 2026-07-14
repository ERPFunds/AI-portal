export interface WfStep {
  type: "manual" | "automated";
  label: string;
  description: string;
}

export interface Workflow {
  name: string;
  trigger: "email" | "schedule" | "webhook" | "manual";
  triggerSenders?: string[];
  frequency?: string;
  status: "active" | "paused" | "draft";
  steps: WfStep[];
  meta?: { trigger?: string; output?: string; escalate?: string };
}

export interface AgentWorkflowData {
  runs?: number;
  sent?: number;
  queue?: number;
  wf: Workflow[];
}

export interface AgentWorkflows {
  workflows: Workflow[];
  runCount: number;
  queueStatus: string;
}

export const WORKFLOWS: Record<string, AgentWorkflowData> = {
  ir: {
    wf: [
      // ── IR inbox sweep (the automatic triage + drafting pipeline) ────────
      {
        name: "IR Inbox Sweep",
        trigger: "schedule",
        frequency: "business hours (8am–8pm CT)",
        status: "active",
        steps: [
          { type: "automated", label: "Read & Clean", description: "Pulls the full message · strips Mimecast tracking noise · unwraps forwarded threads so it classifies the original investor, not the forwarder" },
          { type: "automated", label: "DocuSign Check", description: "DocuSign notifications are marked handled and left in the inbox — never deleted, never drafted to" },
          { type: "automated", label: "Classify & Route", description: "Decides investor-vs-not, then answerable-from-approved-sources (draft) vs genuinely needs a human (escalate)" },
          { type: "automated", label: "Write Grounded Draft", description: "Reply grounded on IR Q&A Reference + Approved Learned Q&A + IR Agent Corrections · Arial 10pt · sender signature" },
          { type: "automated", label: "File Draft", description: "Threaded Outlook draft in Meghan's Drafts (tagged IR:) · filed to Escalate / Forwarded Drafts · copy to the team@ hub for the portal" },
          { type: "automated", label: "Log to Salesforce", description: "On send, logs the actual subject + body as a completed activity on the investor's Contact (created if new) · surfaces as their last interaction in the LP Directory" }
        ],
        meta: {
          trigger: "Scheduled sweep of the monitored mailbox — Meghan-only",
          output: "Threaded Outlook draft — reviewed and sent by a human, never auto-sent",
          escalate: "Meghan"
        }
      },
      // ── Due-diligence answers grounded by RAG over the fund-document KB ───
      {
        name: "Due-Diligence Responder",
        trigger: "email",
        status: "active",
        steps: [
          { type: "automated", label: "Retrieve", description: "Embeds the questions and pulls the top-k relevant chunks from the fund-document knowledge base (pgvector + Voyage)" },
          { type: "automated", label: "Answer with Citations", description: "Answers each question grounded in the retrieved passages, citing the source file name · never invents figures" },
          { type: "automated", label: "Draft Reply", description: "Assembles the grounded answers into a reply draft (Arial 10pt · signature) for review" }
        ],
        meta: { output: "Grounded, cited DD reply draft", escalate: "Meghan" }
      },
      // ── Learning loops (Workflow 5 + corrections) ────────────────────────
      {
        name: "Learned Q&A Miner",
        trigger: "schedule",
        frequency: "every 2h",
        status: "active",
        steps: [
          { type: "automated", label: "Mine Sent Replies", description: "/api/cron/ir-qa-update reads recently sent replies and generalizes them into reusable Q&A" },
          { type: "manual", label: "Review & Approve", description: "Entries queue on the Learned Q&A review tab with a pending-count badge · the team approves or edits" },
          { type: "automated", label: "Feed & Regenerate", description: "Approved entries feed the drafter and rebuild the auto-generated SOP doc" }
        ]
      },
      {
        name: "Corrections Miner",
        trigger: "schedule",
        status: "active",
        steps: [
          { type: "automated", label: "Diff Draft vs Sent", description: "Compares each draft to what the team actually sent, so drafts drift toward the team's real voice" },
          { type: "automated", label: "Apply Corrections", description: "Writes an auto-applied \"IR Agent Corrections\" doc the drafter reads on every reply" }
        ]
      },
      // ── LP Directory (outreach console + cached recompute) ───────────────
      {
        name: "LP Directory Outreach",
        trigger: "manual",
        status: "active",
        steps: [
          { type: "manual", label: "Compose", description: "Per-row Email button opens a compose popup pre-filled with the LP's best-known address · pick sender · edit or click AI draft (same grounding + signature + Arial 10)" },
          { type: "automated", label: "Send or Save", description: "Sends as the chosen sender with a copy to team@ Sent, or saves to the IR Inbox as a draft for later" },
          { type: "automated", label: "Log to Salesforce", description: "Finds or creates the Contact by email · logs the sent email as a completed activity · records it as that LP's most-recent interaction" }
        ]
      },
      {
        name: "LP Directory Recompute",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Assemble Sources", description: "SharePoint commitment schedule + Salesforce + an 18-month mailbox interaction scan + prior-fund contacts" },
          { type: "automated", label: "Cache Snapshot", description: "Writes a single cached row (lp_directory_cache) so the directory loads instantly on every visit" }
        ],
        meta: { trigger: "Weekly cron or the 'Sync with Salesforce' button", output: "Cached LP Directory snapshot" }
      },
      // ── Knowledge base Q&A + sync (Workflows 6 & 7) ──────────────────────
      {
        name: "Fund Q&A Agent",
        trigger: "manual",
        status: "active",
        steps: [
          { type: "manual", label: "Ask", description: "A question is entered on the Fund Q&A page (/api/fund-qa)" },
          { type: "automated", label: "Answer, Grounded & Cited", description: "Grounded Q&A over the Investor Relations + Capital KB documents (context-stuffed), with citations" }
        ]
      },
      {
        name: "Knowledge Base Sync",
        trigger: "schedule",
        status: "active",
        steps: [
          { type: "automated", label: "Pull from SharePoint", description: "Pulls four folders — Investor Relations, ERP Funds IV, and the two SOP folders — adding new files, re-uploading changed/expiring ones, leaving unchanged files alone" },
          { type: "automated", label: "Extract & Embed", description: "Each file → Anthropic Files API → extracted to the document_markdown layer (WF7) → chunked and embedded to pgvector for retrieval" }
        ],
        meta: { trigger: "'Sync from SharePoint' button or a scheduled cron", output: "Refreshed fund-document KB + SOP guides" }
      },
    ]
  },
  "lp-intel": {
    runs: 6,
    sent: 6,
    queue: 0,
    wf: [
      // ── Permian Basin — weekly briefs ────────────────────────────────────
      {
        name: "Permian — Monday Brief",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Fetch Macro", description: "FRED, EIA, BLS, Census — WTI spot & strip, Permian rig count, DUC inventory, Midland/Odessa MSA jobs, Dallas Fed sentiment" },
          { type: "automated", label: "Research + News", description: "Web research + live RSS/Google News — Permian Basin industrial transactions, vacancy, rent, IOS deals, general CRE headlines" },
          { type: "automated", label: "Write Brief", description: "Claude writes macro table, 4-8 article cards, LP narrative, and weekly CRE news digest" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 7:40 AM CT" }
        ]
      },
      {
        name: "Permian — Submarket Watch",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Pull Activity", description: "Sale comps, tenant moves, vacancy/absorption — Midland, Odessa, Andrews, Ector, Ward, Reeves counties" },
          { type: "automated", label: "IOS & Service Yard Scan", description: "Yard deals, outdoor storage comps, Form D fundraising, IOS fund activity from public records and trade press" },
          { type: "automated", label: "Write Brief", description: "Claude writes §1 market snapshot through §6 LP takeaways — every stat carries data vintage label (source + date)" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 8:10 AM CT" }
        ]
      },
      {
        name: "Permian — Competitive Landscape",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Scan Fund Activity", description: "Competitor fund raises, Form D filings, LP appetite signals — Permian Basin industrial CRE comparables" },
          { type: "automated", label: "Write Brief", description: "Claude writes competitive positioning, IOS fund benchmarks, cap rate comparables, and LP meeting prep context" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 8:20 AM CT" }
        ]
      },
      // ── Brevard / Space Coast — weekly briefs ─────────────────────────
      {
        name: "Brevard — Monday Brief",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Fetch Macro", description: "FL industrial vacancy, Orlando MSA logistics jobs, FL asking NNN rent/SF, SpaceX/Blue Origin launch cadence, Brevard County employment" },
          { type: "automated", label: "Research + News", description: "Web research + live RSS/Google News — Space Coast industrial transactions, aerospace tenant demand, flex/R&D activity" },
          { type: "automated", label: "Write Brief", description: "Claude writes macro table, 4-8 article cards, and LP narrative for Space Coast industrial CRE" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 7:30 AM CT" }
        ]
      },
      {
        name: "Brevard — Submarket Brief",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Deep Dive Research", description: "Sale comps, vacancy/absorption, tenant activity — Melbourne, Titusville, Palm Bay, Cocoa, Cape Canaveral" },
          { type: "automated", label: "Live News Pull", description: "RSS (GlobeSt, Bisnow South FL, CRE Daily, The Real Deal) + Apify Google News — Space Coast industrial keywords" },
          { type: "automated", label: "Write Brief", description: "Claude stitches submarket deep dive + AI news narrative in one merged email — all stats carry data vintage" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 7:50 AM CT" }
        ]
      },
      {
        name: "Brevard — Competitive & Fund Brief",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Competitor Intelligence", description: "Rockefeller Group, Exeter, Cabot/Centerbridge, GreenPointe — Space Coast acquisitions, I-4 cap rate spread, local permit activity" },
          { type: "automated", label: "Fund Landscape News", description: "RSS + Apify — Florida industrial fund raises, LP appetite signals, IRR benchmarks, aerospace REIT comparables" },
          { type: "automated", label: "Write Brief", description: "Claude writes competitor tracker + LP-focused fund narrative in one merged email — framed for Meghan's LP meetings" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William, Brennan — every Monday 8:00 AM CT" }
        ]
      },
      // ── Email-triggered RESEARCH: workflow ───────────────────────────────
      {
        name: "Research",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Trigger", description: "Email with RESEARCH: subject prefix sent to agent inbox" },
          { type: "automated", label: "Research", description: "Claude runs multi-source web research — market data, comps, submarket intel, LP-facing context" },
          { type: "automated", label: "Save & Reply", description: "Output filed to SharePoint /Research/ · reply email sent with findings" }
        ]
      },
      // ── Email-triggered WRITE: workflow ──────────────────────────────────
      {
        name: "Write",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Trigger", description: "Email with WRITE: subject prefix sent to agent inbox" },
          { type: "automated", label: "Draft", description: "Claude writes the requested section — investment thesis, exec summary, demand drivers, OM prose, or LP narrative" },
          { type: "automated", label: "Save & Reply", description: "Draft filed to SharePoint /Write/ · reply email sent with content" }
        ]
      },
      // ── Email-triggered BUILD: workflow ──────────────────────────────────
      {
        name: "Build",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Trigger", description: "Email with BUILD: subject prefix sent to agent inbox" },
          { type: "automated", label: "Research", description: "Claude runs targeted web research for market data, comps, tenant demand, or fund landscape context" },
          { type: "automated", label: "Route Workflow", description: "Router picks the right sub-workflow: OM · Deck · Pipeline Comps · Buyer List · Commitment Schedule · Competitive Intel" },
          { type: "automated", label: "Build Output", description: "Claude generates the deliverable — OM section, deck slides, Excel row updates, or buyer contact rows" },
          { type: "automated", label: "Save & Reply", description: "Output filed to SharePoint or written to Excel · reply email sent with summary and file link" }
        ],
        meta: {
          trigger: "BUILD: [project name] — [what to build]",
          output: "OM draft · Deck · Pipeline Comps XLS · Buyer List XLS · Commitment Schedule XLS · Competitive Intel XLS",
          escalate: "Meghan"
        }
      }
    ]
  },
  "ai-ops": {
    wf: [
      {
        name: "Agent Health Monitor",
        trigger: "schedule",
        frequency: "hourly",
        status: "active",
        steps: [
          { type: "automated", label: "Check Status", description: "Monitor agent health" },
          { type: "automated", label: "Log Metrics", description: "Record performance metrics" },
          { type: "automated", label: "Alert on Issues", description: "Generate alerts for problems" }
        ]
      },
      {
        name: "Error Log Analysis",
        trigger: "schedule",
        frequency: "daily",
        status: "active",
        steps: [
          { type: "automated", label: "Aggregate Errors", description: "Collect error logs" },
          { type: "automated", label: "Analyze Patterns", description: "Identify error patterns" },
          { type: "manual", label: "Create Incident Report", description: "Document findings" }
        ]
      },
      {
        name: "Performance Optimization",
        trigger: "webhook",
        status: "active",
        steps: [
          { type: "automated", label: "Analyze Perf", description: "Review performance data" },
          { type: "automated", label: "Identify Bottlenecks", description: "Find performance issues" },
          { type: "manual", label: "Implement Fix", description: "Deploy optimization" }
        ]
      },
      {
        name: "Security Audit Run",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Scan Systems", description: "Run security scans" },
          { type: "automated", label: "Flag Vulnerabilities", description: "Identify security issues" },
          { type: "manual", label: "Review & Remediate", description: "Assess and fix issues" }
        ]
      },
      {
        name: "Backup Verification",
        trigger: "schedule",
        frequency: "daily",
        status: "active",
        steps: [
          { type: "automated", label: "Run Backup", description: "Execute backup process" },
          { type: "automated", label: "Verify Integrity", description: "Check backup integrity" },
          { type: "automated", label: "Log Results", description: "Record backup results" }
        ]
      },
      {
        name: "Agent Update Deployment",
        trigger: "webhook",
        status: "active",
        steps: [
          { type: "automated", label: "Stage Update", description: "Prepare agent update" },
          { type: "automated", label: "Run Tests", description: "Execute test suite" },
          { type: "manual", label: "Deploy Update", description: "Push to production" }
        ]
      },
      {
        name: "Database Optimization",
        trigger: "schedule",
        frequency: "weekly",
        status: "draft",
        steps: [
          { type: "automated", label: "Analyze DB", description: "Review database performance" },
          { type: "automated", label: "Optimize Queries", description: "Tune database queries" },
          { type: "manual", label: "Monitor Results", description: "Verify optimization impact" }
        ]
      },
      {
        name: "API Gateway Monitor",
        trigger: "schedule",
        frequency: "hourly",
        status: "active",
        steps: [
          { type: "automated", label: "Check Gateway", description: "Monitor API gateway status" },
          { type: "automated", label: "Track Usage", description: "Log API usage metrics" },
          { type: "automated", label: "Alert on Spike", description: "Flag unusual traffic" }
        ]
      },
      {
        name: "Log Aggregation Service",
        trigger: "schedule",
        frequency: "daily",
        status: "active",
        steps: [
          { type: "automated", label: "Collect Logs", description: "Aggregate system logs" },
          { type: "automated", label: "Process Logs", description: "Parse and index logs" },
          { type: "automated", label: "Archive Logs", description: "Store processed logs" }
        ]
      },
      {
        name: "Compliance Audit",
        trigger: "schedule",
        frequency: "monthly",
        status: "draft",
        steps: [
          { type: "automated", label: "Gather Data", description: "Collect compliance data" },
          { type: "automated", label: "Run Checks", description: "Execute compliance checks" },
          { type: "manual", label: "Review Report", description: "Review compliance findings" }
        ]
      },
      {
        name: "Version Control Cleanup",
        trigger: "webhook",
        status: "draft",
        steps: [
          { type: "automated", label: "Identify Old Branches", description: "Find stale branches" },
          { type: "automated", label: "Generate Report", description: "Create cleanup report" },
          { type: "manual", label: "Review & Approve", description: "Approve branch deletion" }
        ]
      }
    ]
  },
  leasing: { wf: [] },
  "prop-ops": { wf: [] },
  "acct-ops": { wf: [] },
  "fin-controls": { wf: [] },
  "acq-assistant": {
    wf: [
      {
        name: "Acquisition Checklist Automator",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "Trigger Checklist", description: "Converts the XLS acquisition checklist into a tracked workflow when a deal goes under contract — phases auto-assign the right team member with deadlines and reminders" },
          { type: "automated", label: "New-Entity Setup Track", description: "Insurance binder + E&O/Crime/EPL endorsements (Lockton), operating bank + treasury setup (Prosperity Bank), and property-tax engagement (Weaver)" },
          { type: "automated", label: "Diligence Track", description: "Phase I ESA, soil, and survey/re-plat (Tetra Tech, Maverick) — each with its deadline and cost-bearer (buyer or seller)" },
          { type: "automated", label: "Link Invoices", description: "Links incoming deal invoices (legal, appraisal, environmental, survey) to their checklist items" }
        ],
        meta: { trigger: "LOI accepted / under contract", output: "Tracked acquisition checklist with owners + deadlines" }
      },
      {
        name: "IC Memo Drafter",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "Ingest Model Outputs", description: "Reads finalized underwriting outputs — purchase price, going-in & exit cap, levered/unlevered IRR, equity multiple, cash-on-cash, hold, sources & uses, key assumptions" },
          { type: "automated", label: "Draft Narrative", description: "Drafts the IC memo — investment thesis, market context, risks & mitigants, and return summary" },
          { type: "automated", label: "Pull Comparables", description: "Draws appraised value vs. purchase price from appraisals (Colliers) and reuses per-deal transaction-overview inputs (all-in cost, in-place rent, going-in yield)" }
        ],
        meta: { trigger: "Underwriting model finalized", output: "IC memo narrative draft" }
      },
      {
        name: "Email Triage & Prioritization",
        trigger: "email",
        status: "draft",
        steps: [
          { type: "automated", label: "Categorize & Prioritize", description: "Prioritizes inbound email for the principal — weights active-deal threads (broker, seller, lender, counsel), flags urgent items, routes routine ones to the right team member" },
          { type: "automated", label: "Draft Standard Replies", description: "Drafts responses for standard requests so the principal only touches what needs them" },
          { type: "automated", label: "Auto-File Deal Email", description: "Files deal email into matching Outlook subfolders by deal and document type — title & escrow, legal/PSA, invoices, signatures, due diligence" }
        ],
        meta: { trigger: "Inbound email received" }
      },
      {
        name: "Deal Priority & Next-Action List",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "Rank Next Actions", description: "For each active deal, surfaces outstanding items and ranked next actions driven by critical dates (title/closing, diligence/environmental deadlines, wire/funding windows) and open asks" },
          { type: "automated", label: "Surface in Pipeline", description: "Shows as the next-action panel within the Deal Pipeline" }
        ],
        meta: { trigger: "On demand / on deal-stage change" }
      },
      {
        name: "Closing Document Auditor",
        trigger: "schedule",
        frequency: "5–7 days before closing",
        status: "draft",
        steps: [
          { type: "automated", label: "Scan Deal File", description: "Scans the deal file before closing for missing documents, title issues, authority gaps, or outstanding conditions" },
          { type: "automated", label: "Track Title & Wires", description: "Tracks the title order number (WT Abstract, Permian Abstract), flags draft settlement statements, watches for signed attorney-instruction letters and deposit forms, and confirms wire arrival against the correct entity" },
          { type: "automated", label: "Output R/Y/G Checklist", description: "Outputs a red/yellow/green pre-closing checklist within the Acquisition Checklist's closing phase" }
        ],
        meta: { trigger: "Closing scheduled (5–7 days prior)", output: "Pre-closing red/yellow/green checklist" }
      },
      {
        name: "Deal Pipeline Status Board",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "Live Pipeline Cards", description: "Every active deal as a card with stage, next action, owner, and key dates — updating as deals move LOI → due diligence → IC → closing" },
          { type: "automated", label: "Track Amendments & Dates", description: "Tracks PSA amendment status and critical dates across multiple concurrent deals" }
        ],
        meta: { trigger: "On deal-stage change / continuous in the portal", output: "Live Deal Pipeline board" }
      },
      {
        name: "Deal File Organizer & Data Extractor",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "File & Flag", description: "Files incoming diligence documents into the correct KB deal folder with consistent naming and flags what's still outstanding" },
          { type: "automated", label: "Extract Data", description: "Extracts price, cap rate, square footage, critical dates, and counterparties — writing structured data back to the pipeline dashboard and charts" },
          { type: "automated", label: "Version & Attribute", description: "Tracks PSA/conveyance redline cycles (Hall Estill, Akin Gump) and attributes each document and legal invoice to the correct acquisition entity" }
        ],
        meta: { trigger: "Document received / added to deal file" }
      },
      {
        name: "Deal Economics / Underwriting Summary Capture",
        trigger: "manual",
        status: "draft",
        steps: [
          { type: "automated", label: "Extract Headline Figures", description: "Extracts key figures from the uploaded Excel model — price, going-in & exit cap, levered/unlevered IRR, equity multiple, cash-on-cash, hold, sources & uses, assumptions + sensitivities" },
          { type: "manual", label: "Analyst Confirms", description: "Analyst confirms/completes the captured figures — the workflow captures outputs, it does not rebuild the model" },
          { type: "automated", label: "Feed Downstream", description: "Becomes the single source of deal economics feeding the IC Memo Drafter, the Deal Pipeline Status Board, and the deal charts" }
        ],
        meta: { trigger: "Underwriting model finalized / uploaded", output: "Structured per-deal economics record" }
      }
    ]
  },
  marketing: { wf: [] },
  legal: { wf: [] },
  operations: { wf: [] }
};

export const AGENT_ACTIVITY = [
  { color: "green",  action: "Automated LP KYC verification completed",          time: "10:30 AM" },
  { color: "blue",   action: "Monthly reporting package queued for distribution", time: "9:15 AM"  },
  { color: "yellow", action: "Email escalation requiring manual review",           time: "8:45 AM"  },
  { color: "green",  action: "Market trend analysis completed and published",      time: "8:00 AM"  },
  { color: "blue",   action: "Investor deck draft generated for review",           time: "7:30 AM"  },
  { color: "yellow", action: "Competitive landscape changes flagged for analysis", time: "7:00 AM"  },
  { color: "green",  action: "Agent health check passed all systems",             time: "6:30 AM"  },
  { color: "blue",   action: "Security audit completed with no critical issues",   time: "6:00 AM"  },
  { color: "yellow", action: "Database optimization in progress",                  time: "5:30 AM"  },
  { color: "green",  action: "Backup verification successful",                     time: "5:00 AM"  },
];