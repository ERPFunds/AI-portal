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
    runs: 3,
    sent: 3,
    queue: 0,
    wf: [
      // ── Always-running background (Step 1) ──────────────────────────────
      {
        name: "Monday Brief",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Fetch News", description: "RSS + Google News · Permian macro & CRE" },
          { type: "automated", label: "Write Narrative", description: "Claude drafts 3-4 paragraph market brief" },
          { type: "automated", label: "Send & Archive", description: "Email to Michele, Meghan, William · archived in portal" }
        ]
      },
      {
        name: "Submarket Watch",
        trigger: "schedule",
        frequency: "monthly",
        status: "active",
        steps: [
          { type: "automated", label: "Pull Activity", description: "Sale comps & tenant activity · Permian Basin & Tampa" },
          { type: "automated", label: "Write Brief", description: "Claude writes submarket conditions brief" },
          { type: "automated", label: "Send & Archive", description: "Email + portal archive · feeds OM research" }
        ]
      },
      {
        name: "Fund Landscape Brief",
        trigger: "schedule",
        frequency: "quarterly",
        status: "active",
        steps: [
          { type: "automated", label: "Scan Competitors", description: "Competitor fund activity · benchmarks · LP appetite signals" },
          { type: "automated", label: "Write Brief", description: "Claude writes competitive positioning brief" },
          { type: "automated", label: "Send & Archive", description: "Email + portal archive · feeds LP meeting prep" }
        ]
      },
      // ── Email-triggered RESEARCH: workflows (Step 2) ─────────────────────
      {
        name: "Market Update Digest",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "RESEARCH: prefix detected · market-update-digest workflow" },
          { type: "automated", label: "Pull Market Intel", description: "Web search + broker sources for submarket data" },
          { type: "automated", label: "Write Brief", description: "Market section formatted for OM or deck" },
          { type: "automated", label: "Save & Reply", description: "File to OneDrive · reply with output" }
        ]
      },
      {
        name: "LP-Ready Summary",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "RESEARCH: prefix detected · lp-ready-summary workflow" },
          { type: "automated", label: "Research Angle", description: "Pull data supporting team's stated strategic angle" },
          { type: "automated", label: "Write Context", description: "LP-ready framing with slide copy suggestions" },
          { type: "automated", label: "Save & Reply", description: "File to OneDrive · reply with output" }
        ]
      },
      {
        name: "Sub-Sector Deep Dive",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "RESEARCH: deep dive detected · sub-sector-deep-dive workflow" },
          { type: "automated", label: "Deep Research", description: "Multi-source sub-sector analysis" },
          { type: "automated", label: "Write Deep Dive", description: "Full structured sub-sector brief for deck or OM" },
          { type: "automated", label: "Save & Reply", description: "File to OneDrive · reply with output" }
        ]
      },
      {
        name: "Sale Comps Pull",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "RESEARCH: sale comps detected · sale-comps-pull workflow" },
          { type: "automated", label: "Pull Comps", description: "Search public records · broker reports · trade press" },
          { type: "automated", label: "Format Table", description: "Comps table + implied pricing analysis" },
          { type: "automated", label: "Save & Reply", description: "File to /OMs/ OneDrive · reply with output" }
        ]
      },
      {
        name: "Save to KB",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "RESEARCH: file-only detected · save-file-only workflow" },
          { type: "automated", label: "File to KB", description: "Save attachment or content to project OneDrive folder" },
          { type: "automated", label: "Confirm", description: "Reply confirming what was filed and where" }
        ]
      },
      // ── Email-triggered BUILD: workflows (Step 3) ─────────────────────────
      {
        name: "Deck Builder",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "BUILD: deck detected · deck-builder workflow" },
          { type: "automated", label: "Assemble Deck", description: "Build slide outline from research context + internal data" },
          { type: "automated", label: "Save to OneDrive", description: "File to /Decks/[project]/ · versioned" },
          { type: "manual", label: "Refine in PowerPoint", description: "Meghan or William refines in PowerPoint · compliance review" }
        ]
      },
      {
        name: "OM Editor",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "BUILD: OM detected · om-editor workflow" },
          { type: "automated", label: "Build OM", description: "Assemble OM sections from research + deal data" },
          { type: "automated", label: "Save to OneDrive", description: "File to /OMs/[project]/ · versioned" },
          { type: "manual", label: "Review & Refine", description: "Meghan or William reviews · compliance signs off" }
        ]
      },
      // ── Email-triggered WRITE: workflows (Step 4) ─────────────────────────
      {
        name: "OM Writer",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Route", description: "WRITE: prefix detected · om-writer workflow" },
          { type: "automated", label: "Research", description: "Pull supporting research for the section" },
          { type: "automated", label: "Write Prose", description: "Draft Investment Thesis / Executive Summary / Demand Drivers" },
          { type: "automated", label: "Save & Reply", description: "File section draft to /OMs/ OneDrive · reply" }
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