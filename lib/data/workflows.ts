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
    wf: [
      {
        name: "Market Trend Analysis",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Fetch Data", description: "Collect market data" },
          { type: "automated", label: "Analyze Trends", description: "Process trend analysis" },
          { type: "manual", label: "Review Insights", description: "Human review of findings" }
        ]
      },
      {
        name: "Competitive Landscape Monitor",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Scan Competitors", description: "Monitor competitor activity" },
          { type: "automated", label: "Flag Changes", description: "Highlight significant changes" },
          { type: "manual", label: "Analyze Impact", description: "Assess competitive implications" }
        ]
      },
      {
        name: "Investor Deck Prep",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Gather Assets", description: "Collect presentation materials" },
          { type: "automated", label: "Organize Slides", description: "Structure deck framework" },
          { type: "manual", label: "Final Review", description: "Review and refine presentation" }
        ]
      },
      {
        name: "Deal Source Tracking",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Log Deal", description: "Record new deal lead" },
          { type: "automated", label: "Extract Terms", description: "Parse deal terms" },
          { type: "manual", label: "Evaluate", description: "Human assessment of opportunity" }
        ]
      },
      {
        name: "Quarterly Industry Report",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Compile Data", description: "Gather industry statistics" },
          { type: "automated", label: "Create Report", description: "Generate quarterly report" },
          { type: "manual", label: "Review & Publish", description: "Final review and distribution" }
        ]
      },
      {
        name: "LP Communication Draft",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "draft",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Analyze Request", description: "Understand communication need" },
          { type: "automated", label: "Draft Message", description: "Generate message content" },
          { type: "manual", label: "Approve & Send", description: "Human approval before sending" }
        ]
      },
      {
        name: "Market News Digest",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Fetch News", description: "Collect relevant news" },
          { type: "automated", label: "Filter & Sort", description: "Prioritize relevant articles" },
          { type: "manual", label: "Review & Distribute", description: "QA and send digest" }
        ]
      },
      {
        name: "SEC Filing Monitor",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "active",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Check Filings", description: "Monitor SEC filings" },
          { type: "automated", label: "Extract Key Data", description: "Parse filing contents" },
          { type: "manual", label: "Flag Issues", description: "Identify relevant changes" }
        ]
      },
      {
        name: "Investment Thesis Review",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "draft",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Analyze Documents", description: "Review investment docs" },
          { type: "automated", label: "Extract Data", description: "Pull key thesis points" },
          { type: "manual", label: "Validate Thesis", description: "Human validation of approach" }
        ]
      },
      {
        name: "Partner Network Updates",
        trigger: "email",
        triggerSenders: ["mberry@erpfunds.com", "mparad@erpfunds.com", "wmeyer@erpfunds.com"],
        status: "draft",
        steps: [
          { type: "automated", label: "Parse Email", description: "Read request from Meghan, Michele, or William" },
          { type: "automated", label: "Gather Updates", description: "Collect partner updates" },
          { type: "automated", label: "Compile Summary", description: "Create update summary" },
          { type: "manual", label: "Review & Share", description: "QA and distribute to team" }
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