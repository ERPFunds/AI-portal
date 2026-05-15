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
      {
        name: "LP Onboarding & KYC",
        trigger: "email",
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Extract LP info from email" },
          { type: "manual", label: "KYC Review", description: "Review and verify LP documents" },
          { type: "automated", label: "Create Portal Account", description: "Provision LP portal access" }
        ]
      },
      {
        name: "Monthly LP Reporting",
        trigger: "schedule",
        frequency: "monthly",
        status: "active",
        steps: [
          { type: "automated", label: "Compile Data", description: "Gather performance metrics" },
          { type: "automated", label: "Generate Reports", description: "Create LP-specific reports" },
          { type: "manual", label: "Review & Send", description: "QA and send to LPs" }
        ]
      },
      {
        name: "Email Escalation Handler",
        trigger: "email",
        status: "active",
        steps: [
          { type: "automated", label: "Classify Email", description: "Determine urgency and type" },
          { type: "automated", label: "Route to Queue", description: "Send to appropriate handler" },
          { type: "manual", label: "Manual Review", description: "Human oversight if needed" }
        ]
      },
      {
        name: "Portfolio Update Digest",
        trigger: "schedule",
        frequency: "weekly",
        status: "active",
        steps: [
          { type: "automated", label: "Fetch Updates", description: "Collect portfolio changes" },
          { type: "automated", label: "Format Digest", description: "Create formatted summary" },
          { type: "manual", label: "Send Digest", description: "Distribute to stakeholders" }
        ]
      },
      {
        name: "LP Query Response",
        trigger: "email",
        status: "active",
        steps: [
          { type: "automated", label: "Parse Query", description: "Understand LP question" },
          { type: "automated", label: "Draft Response", description: "Generate response text" },
          { type: "manual", label: "Review & Send", description: "Human review and sending" }
        ]
      },
      {
        name: "Fund Performance Analysis",
        trigger: "schedule",
        frequency: "quarterly",
        status: "active",
        steps: [
          { type: "automated", label: "Analyze Returns", description: "Calculate fund metrics" },
          { type: "automated", label: "Generate Analysis", description: "Create detailed analysis" },
          { type: "manual", label: "Executive Review", description: "C-suite review and approval" }
        ]
      },
      {
        name: "Investment Committee Prep",
        trigger: "webhook",
        status: "draft",
        steps: [
          { type: "automated", label: "Gather Data", description: "Collect deal info" },
          { type: "manual", label: "Create Memo", description: "Prepare investment memo" },
          { type: "manual", label: "Schedule Meeting", description: "Coordinate IC meeting" }
        ]
      },
      {
        name: "Investor Deck Generation",
        trigger: "webhook",
        status: "draft",
        steps: [
          { type: "automated", label: "Pull Data", description: "Extract performance data" },
          { type: "automated", label: "Generate Deck", description: "Create presentation slides" },
          { type: "manual", label: "Review & Distribute", description: "QA and send to investors" }
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