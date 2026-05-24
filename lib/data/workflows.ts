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
      // ── DocuSign-triggered ───────────────────────────────────────────────
      {
        name: "LP Onboarding",
        trigger: "webhook",
        status: "active",
        steps: [
          { type: "automated", label: "DocuSign Trigger", description: "Power Automate detects executed subscription agreement · POSTs to /api/ir-onboarding" },
          { type: "automated", label: "Generate Sequence", description: "Claude drafts Day 1, Day 7, Day 30 welcome emails · portal access · key contacts" },
          { type: "automated", label: "Save to Drafts", description: "3 email drafts saved to Meghan's Outlook · archived to OneDrive /IR/Onboarding/" },
          { type: "manual", label: "Review & Send", description: "Meghan personalizes and sends each email at the right interval" }
        ]
      },
      // ── Inbound investor email workflows ────────────────────────────────
      {
        name: "Email Escalation Filter",
        trigger: "email",
        triggerSenders: ["investors@erpfunds.com", "mberry@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Receive Email", description: "Power Automate watches investors@erpfunds.com DST inbox · POSTs to /api/ir-webhook" },
          { type: "automated", label: "Classify", description: "Claude identifies: portal access · K-1 · distribution · escalation · new inquiry" },
          { type: "automated", label: "Draft Response", description: "For repeat questions: AI drafts reply saved to Meghan's Outlook Drafts — never auto-sent" },
          { type: "manual", label: "Review & Send", description: "Meghan reviews draft · sends or edits · escalations flagged for immediate attention" }
        ]
      },
      {
        name: "Attachment Auto-Filer",
        trigger: "email",
        triggerSenders: ["investors@erpfunds.com", "mberry@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Receive Email", description: "Power Automate detects investor email with attachment · POSTs to /api/ir-webhook" },
          { type: "automated", label: "Classify Doc", description: "Claude classifies: subscription · K-1 · wire · signed agreement · KYC · correspondence" },
          { type: "automated", label: "File to OneDrive", description: "Saves to /IR/[DocType]/[LP-Name]/ · versioned" },
          { type: "automated", label: "Log Entry", description: "Logged to ir_email_log · portal activity feed updated" }
        ]
      },
      {
        name: "Investor Dialogue Log",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Receive Note", description: "Meghan or William emails typed meeting notes or voice memo to agent inbox · POSTs to /api/ir-webhook" },
          { type: "automated", label: "Parse & Extract", description: "Claude extracts: LP name · interest level · sticking points · follow-up commitments · relationship context" },
          { type: "automated", label: "Save Log Entry", description: "Structured entry saved to ir_dialogue_log DB · archived to OneDrive /IR/Dialogue-Log/" },
          { type: "automated", label: "Surface Next Touch", description: "Next touch suggestion returned in response · stale relationships flagged weekly" }
        ]
      },
      // ── Accounting-triggered report workflows ────────────────────────────
      {
        name: "Monthly DST Formatter",
        trigger: "webhook",
        status: "active",
        steps: [
          { type: "automated", label: "Receive Raw Data", description: "Accounting POSTs raw outputs to /api/ir-report after monthly close" },
          { type: "automated", label: "Format Report", description: "Claude formats into DST reporting package: operating summary · distributions · capital accounts" },
          { type: "automated", label: "Save to OneDrive", description: "Formatted report filed to /IR/DST-Reports/[period]/" },
          { type: "manual", label: "Review & Distribute", description: "Meghan reviews · sends to DST investors" }
        ]
      },
      {
        name: "Quarterly LP Report Formatter",
        trigger: "webhook",
        status: "active",
        steps: [
          { type: "automated", label: "Receive Raw Data", description: "Accounting POSTs raw outputs to /api/ir-report after quarterly close" },
          { type: "automated", label: "Format Report", description: "Claude formats into LP package: exec summary · portfolio performance · financials · market update" },
          { type: "automated", label: "Draft Update Email", description: "Optional: AI drafts LP update email saved to Meghan's Outlook Drafts" },
          { type: "manual", label: "Review & Send", description: "Meghan adds commentary · sends to LP distribution list" }
        ]
      },
      // ── Salesforce sync ──────────────────────────────────────────────────
      {
        name: "Salesforce Contact Auto-Update",
        trigger: "webhook",
        status: "draft",
        steps: [
          { type: "automated", label: "Email Interaction Ends", description: "After email-escalation or dialogue-logger workflow completes" },
          { type: "automated", label: "Push to Salesforce", description: "Power Automate pushes notes and open items to LP Salesforce contact record" },
          { type: "automated", label: "Log Update", description: "Sync timestamp and field updates logged to portal" }
        ]
      }
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
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — every Monday 9 AM CT" }
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
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — every Monday 9 AM CT" }
        ]
      },
      {
        name: "Permian — Competitive Landscape",
        trigger: "schedule",
        frequency: "monthly",
        status: "active",
        steps: [
          { type: "automated", label: "Scan Fund Activity", description: "Competitor fund raises, Form D filings, LP appetite signals — Permian Basin industrial CRE comparables" },
          { type: "automated", label: "Write Brief", description: "Claude writes competitive positioning, IOS fund benchmarks, cap rate comparables, and LP meeting prep context" },
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — monthly" }
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
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — every Monday 9 AM ET" }
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
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — every Monday 9 AM ET" }
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
          { type: "automated", label: "Send", description: "Email to Michele, Meghan, William — every Monday 9 AM ET" }
        ]
      },
      // ── CoStar data pull (coming soon) ───────────────────────────────────
      {
        name: "CoStar Market Data Pull",
        trigger: "schedule",
        frequency: "weekly",
        status: "draft",
        steps: [
          { type: "automated", label: "Pull CoStar Data", description: "Vacancy, asking rent, net absorption, sale comps, and pipeline data for Permian Basin and Brevard County submarkets — wiring in progress" }
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
  "cap-raising": { wf: [] },
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