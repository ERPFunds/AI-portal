export interface WfStep {
  type: 'trigger' | 'action' | 'condition' | 'output'
  label: string
  desc: string
}

export interface Workflow {
  name: string
  trigger: string
  triggerType: 'email' | 'schedule' | 'data' | 'manual' | 'webhook'
  freq: string
  lastRun: string
  status: 'active' | 'idle'
  steps: WfStep[]
  meta: { trigger: string; output: string; escalate: string }
}

export interface AgentWorkflows {
  runs: string
  sent: string
  queue: string
  wf: Workflow[]
}

export const WORKFLOWS: Record<string, AgentWorkflows> = {
  ir: { runs: '—', sent: '—', queue: '—', wf: [
    { name: 'LP Onboarding', trigger: 'DocuSign subscription agreement executed', triggerType: 'webhook', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'DocuSign Webhook', desc: 'Fires when a new LP subscription agreement is fully executed in DocuSign' },
      { type: 'action', label: 'Build Onboarding Sequence', desc: 'Multi-step welcome sequence: Day 1 (portal access + key contacts), Day 7 (what to expect), Day 30 (next reporting date check-in)' },
      { type: 'action', label: 'Draft Welcome Emails', desc: 'Personalized emails for each touchpoint referencing LP name, investment amount, fund, and next milestone' },
      { type: 'condition', label: 'Review Gate', desc: 'Day 1 welcome always routes to Meghan for approval — first impression is relationship-critical' },
      { type: 'output', label: 'Onboarding Queue', desc: 'Welcome sequence queued with send schedule. LP record updated in Salesforce. Portal access provisioned.' },
    ], meta: { trigger: 'DocuSign webhook', output: 'Onboarding email sequence', escalate: 'Meghan Berry' } },
    { name: 'Email Escalation Filter & Auto-Responder', trigger: 'Inbound investor email received', triggerType: 'email', freq: 'Real-time', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Email Trigger', desc: 'Inbound email received in primary investor inbox or DST sub-inbox (investors@erpfunds.com) routed from Vistra' },
      { type: 'action', label: 'Classify & Triage', desc: 'Identifies if existing LP or new inquiry. Categorizes: repeat question, escalation needed, or new investor signal' },
      { type: 'condition', label: 'Escalation Gate', desc: 'True escalations (legal, compliance, relationship issues) route to Meghan only. Repeat questions handled automatically.' },
      { type: 'action', label: 'Draft Auto-Response', desc: "For repeat questions (portal access, K-1 location, distribution status): auto-drafts response with correct portal link and redirects to Tracy Doyle / support email, cc'ing appropriate team member" },
      { type: 'output', label: 'Route or Send', desc: 'Escalations go to Meghan queue. Routine responses auto-sent with appropriate cc. CRM updated with interaction log.' },
    ], meta: { trigger: 'Email', output: 'Auto-response or escalation', escalate: 'Meghan Berry' } },
    { name: 'Email Response Templates Database', trigger: 'Manual / on demand', triggerType: 'manual', freq: 'On demand', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Meghan or team member adds, edits, or retires a response template on demand' },
      { type: 'action', label: 'Maintain Template Library', desc: 'Searchable database of common investor and advisor response templates, organized by question type' },
      { type: 'output', label: 'Template Available', desc: 'Updated template immediately available to Email Escalation Filter for auto-response drafting' },
    ], meta: { trigger: 'Manual', output: 'Updated template library', escalate: 'Meghan Berry' } },
    { name: 'Salesforce Investor Contact Auto-Update', trigger: 'Email interaction completed', triggerType: 'email', freq: 'Real-time', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Email Trigger', desc: 'Fires after each completed investor email interaction (sent or received)' },
      { type: 'action', label: 'Extract Key Points', desc: 'Parses email thread for: LP questions raised, items committed to, follow-up dates mentioned, sentiment signals' },
      { type: 'action', label: 'Push to Salesforce', desc: "Pushes new interaction notes, open items, and follow-up tasks back into the LP's Salesforce contact record" },
      { type: 'output', label: 'CRM Updated', desc: 'Salesforce contact record updated with latest interaction log, open items, and next follow-up date' },
    ], meta: { trigger: 'Email', output: 'Salesforce contact update', escalate: 'Meghan Berry' } },
    { name: 'Portfolio Performance Snapshot', trigger: 'Monthly (1st of month)', triggerType: 'schedule', freq: 'Monthly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires on the 1st of each month once accounting close data is available' },
      { type: 'action', label: 'Roll Up Portfolio Data', desc: 'Aggregates NOI, occupancy, lease expiration schedule, and actual vs. underwritten returns across all portfolio assets' },
      { type: 'action', label: 'Build Snapshot', desc: 'Formats into single-page portfolio performance summary for LP reporting and quarterly investor updates' },
      { type: 'output', label: 'Snapshot Delivered', desc: 'Performance snapshot delivered to IR KB and feeds Monthly DST Formatter and Quarterly Report Formatter workflows' },
    ], meta: { trigger: 'Schedule', output: 'Portfolio performance snapshot', escalate: 'Meghan Berry' } },
    { name: 'Monthly DST Formatter', trigger: 'Monthly accounting close complete', triggerType: 'data', freq: 'Monthly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Fires when monthly accounting close outputs are available from Yardi / accounting team' },
      { type: 'action', label: 'Ingest Raw Outputs', desc: 'Takes raw accounting outputs and transaction overviews as inputs' },
      { type: 'action', label: 'Format DST Package', desc: 'Formats inputs into the standard monthly DST reporting package per established template' },
      { type: 'condition', label: 'Review Gate', desc: 'Monthly DST package requires Meghan review before distribution to DST investors' },
      { type: 'output', label: 'DST Report Ready', desc: 'Formatted monthly DST reporting package queued for Meghan review and LP distribution' },
    ], meta: { trigger: 'Data / accounting close', output: 'Monthly DST report package', escalate: 'Meghan Berry' } },
    { name: 'Quarterly Investor Report Formatter', trigger: 'Quarterly accounting close complete', triggerType: 'schedule', freq: 'Quarterly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule / Data Trigger', desc: 'Fires when quarterly accounting close outputs are available' },
      { type: 'action', label: 'Ingest Quarterly Inputs', desc: 'Takes raw accounting outputs, transaction overview, and fund-level summary as inputs' },
      { type: 'action', label: 'Format Quarterly Package', desc: 'Formats inputs into the standard quarterly LP reporting package per established template' },
      { type: 'condition', label: 'Review Gate', desc: 'Quarterly LP package requires Meghan review and approval before distribution' },
      { type: 'output', label: 'Quarterly Report Ready', desc: 'Formatted quarterly LP reporting package queued for Meghan review; feeds Investor Reporting Email Drafter' },
    ], meta: { trigger: 'Quarterly close', output: 'Quarterly LP report package', escalate: 'Meghan Berry' } },
    { name: 'Investor Reporting Email Drafter', trigger: 'Report package completed', triggerType: 'data', freq: 'Monthly / Quarterly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Fires when a formatted report package (monthly DST or quarterly) is marked complete' },
      { type: 'action', label: 'Draft LP Update Email', desc: 'Auto-drafts the LP update email with sources referencing the formatted report package and LP distribution list' },
      { type: 'condition', label: 'Human Review Required', desc: 'Meghan adds commentary, reviews, and sends — never auto-sent. Human adds context before distribution.' },
      { type: 'output', label: 'Draft Queued', desc: "LP update email draft queued in Meghan's inbox with report package attached and distribution list pre-populated" },
    ], meta: { trigger: 'Report complete', output: 'LP update email draft', escalate: 'Meghan Berry' } },
  ]},
  leasing: { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'prop-ops': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'acct-ops': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'fin-controls': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'lp-intel': { runs: '—', sent: '—', queue: '—', wf: [
    { name: 'Macro Signals Digest', trigger: 'Weekly (Monday) or new raise initiated', triggerType: 'schedule', freq: 'Weekly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires every Monday morning, or on-demand when a new fund raise is initiated' },
      { type: 'action', label: 'Pull Market Data', desc: 'Pulls freight volumes, manufacturing PMI, port traffic, and trade data from configured sources' },
      { type: 'action', label: 'Synthesize Thesis', desc: 'Formats data into a concise 1-page macro summary aligned to ERP\'s industrial investment thesis' },
      { type: 'output', label: 'Digest Delivered', desc: 'Summary added to LP Market Intelligence KB and delivered as briefing to support LP decks and fund narratives' },
    ], meta: { trigger: 'Schedule', output: 'Macro signals digest', escalate: 'Meghan Berry' } },
    { name: 'Competitive Landscape Profile', trigger: 'New fund raise or LP meeting scheduled', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered when a new fund raise begins or an LP meeting is added to the calendar' },
      { type: 'action', label: 'Profile Competitors', desc: 'Profiles key competing industrial owners/operators by market — portfolio size, recent acquisitions, strategy, positioning' },
      { type: 'action', label: 'Identify Differentiation', desc: 'Compares competitor profiles against ERP\'s strategy to surface differentiation angles for LP narrative' },
      { type: 'output', label: 'Competitive Brief', desc: 'Competitive landscape profile delivered to LP deck prep workflow and added to LP Market Intelligence KB' },
    ], meta: { trigger: 'Manual', output: 'Competitive landscape profile', escalate: 'Meghan Berry' } },
    { name: 'Market News Monitor', trigger: 'Weekly (Monday morning)', triggerType: 'schedule', freq: 'Weekly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires every Monday morning using ERP\'s target market list as scope' },
      { type: 'action', label: 'Scan News Sources', desc: 'Weekly digest of industrial CRE news, cap rate movements, and competitor activity in ERP\'s target markets' },
      { type: 'action', label: 'Curate & Summarize', desc: 'Filters noise, highlights material market developments, organizes by market and topic' },
      { type: 'output', label: 'Briefing Email', desc: 'Market briefing delivered to Meghan\'s inbox to keep LP narrative current. Stored in LP Intelligence KB.' },
    ], meta: { trigger: 'Schedule', output: 'Market news briefing', escalate: 'Meghan Berry' } },
    { name: 'Fund Strategy Narrative Writer', trigger: 'New fund raise or deck update initiated', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered when a new fund raise is initiated or an existing deck needs refreshing' },
      { type: 'action', label: 'Gather Inputs', desc: 'Pulls fund strategy summary, macro data from digest, and target market list from KB' },
      { type: 'action', label: 'Draft Narrative', desc: 'Drafts the "why now, why us, why industrial" thesis section for LP decks and PPMs in investor-facing prose' },
      { type: 'condition', label: 'Review Gate', desc: 'All narrative drafts require Meghan review before inclusion in LP materials' },
      { type: 'output', label: 'Narrative Draft', desc: 'Polished fund strategy narrative delivered for use in LP decks, PPMs, and investor presentations' },
    ], meta: { trigger: 'Manual', output: 'Fund strategy narrative', escalate: 'Meghan Berry' } },
    { name: 'Comparable Fund Benchmarking', trigger: 'New fund raise or LP meeting scheduled', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered when a new fund raise begins or ahead of LP meetings requiring competitive positioning' },
      { type: 'action', label: 'Pull Comp Fund Data', desc: 'Pulls comparable industrial fund structures, fees, target returns, and track records from research sources' },
      { type: 'action', label: 'Position ERP Terms', desc: 'Compares ERP\'s fund terms against comps to sharpen competitive positioning in LP conversations and PPMs' },
      { type: 'output', label: 'Benchmarking Report', desc: 'Comparable fund benchmarking report delivered to Meghan for LP negotiation and deck preparation' },
    ], meta: { trigger: 'Manual', output: 'Fund benchmarking report', escalate: 'Meghan Berry' } },
    { name: 'Market Research → Investor Slides', trigger: 'New deal or fund raise initiated', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered when a new deal or fund raise is initiated with broker reports, CoStar exports, or deal summary as inputs' },
      { type: 'action', label: 'Process Source Materials', desc: 'Ingests raw research PDFs and data sources; structures content into market overview, strategy, and financials sections' },
      { type: 'action', label: 'Build Slide Draft', desc: 'Outputs structured PowerPoint deck covering market overview, strategy, and financial highlights' },
      { type: 'condition', label: 'Review Gate', desc: 'Draft deck requires Meghan review and iteration before LP distribution' },
      { type: 'output', label: 'Slide Deck Draft', desc: 'Structured investor slide deck delivered as starting point for Investor Deck Builder workflow' },
    ], meta: { trigger: 'Manual', output: 'Investor slide deck draft', escalate: 'Meghan Berry' } },
    { name: 'Investor Deck Builder', trigger: 'New deal or fund raise initiated', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered after Market Research → Investor Slides draft is available; inputs: underwriting model, market research summary, deal overview' },
      { type: 'action', label: 'Apply Design Iterations', desc: 'Takes market research draft through design iterations to produce a polished, LP-ready deck' },
      { type: 'condition', label: 'Review Gate', desc: 'Deck requires Meghan approval and final polish before distribution to LPs' },
      { type: 'output', label: 'Polished LP Deck', desc: 'Finalized investor deck ready for LP distribution, stored in Investor Relations KB' },
    ], meta: { trigger: 'Manual', output: 'Polished LP investor deck', escalate: 'Meghan Berry' } },
    { name: 'Offering Memorandum Editor', trigger: 'New deal or PPM update needed', triggerType: 'manual', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Triggered when a new deal requires a PPM or an existing offering document needs updating' },
      { type: 'action', label: 'Process Deal Inputs', desc: 'Takes deal data inputs and existing PPM template; structures sections for offering summary, financials, risk factors, and terms' },
      { type: 'action', label: 'Draft OM Sections', desc: 'Edits PPM-style offering document sections with current deal data, market narrative, and fund terms' },
      { type: 'condition', label: 'Legal Review Gate', desc: 'All PPM edits require Meghan review and legal sign-off before LP distribution' },
      { type: 'output', label: 'OM Draft', desc: 'Offering memorandum draft delivered for review and legal finalization' },
    ], meta: { trigger: 'Manual', output: 'Offering memorandum draft', escalate: 'Meghan Berry' } },
  ]},
  'cap-raising': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  marketing: { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'cio-cos': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'acq-research': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'inv-analytics': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'fund-admin': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  coo: { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'people-ops': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  'exec-asst': { runs: '—', sent: '—', queue: '—', wf: [
  
  ]},
  brokerage: { runs: '—', sent: '—', queue: '—', wf: [

  ]},
  'ai-ops': { runs: '—', sent: '—', queue: '—', wf: [
    { name: 'Agent Health Monitor', trigger: 'Daily scan + real-time error event', triggerType: 'schedule', freq: 'Daily', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule + Error Trigger', desc: 'Runs daily health scan across all active agents; also fires in real-time when any agent throws an error or stops responding' },
      { type: 'action', label: 'Ping All Agents', desc: 'Tests each agent endpoint for responsiveness, checks last-run timestamps, validates tool connections and KB access' },
      { type: 'action', label: 'Classify Status', desc: 'Classifies each agent as Healthy, Degraded, or Down based on response time, error rate, and last successful run' },
      { type: 'condition', label: 'Escalation Gate', desc: 'Any agent marked Down or Degraded for >30 min escalates to Michele. Healthy status logged silently.' },
      { type: 'output', label: 'Health Report', desc: 'Daily health summary posted to AI Operations KB. Degraded/Down agents trigger immediate alert to Michele with diagnostic detail.' },
    ], meta: { trigger: 'Daily schedule + error event', output: 'Health status report + escalation', escalate: 'Michele' } },
    { name: 'Self-Serve Fix Guide', trigger: 'Error detected in any agent', triggerType: 'data', freq: 'Real-time', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Error Event Trigger', desc: 'Fires when Agent Health Monitor or Error Triage workflow detects a known error pattern in any agent' },
      { type: 'action', label: 'Match Error to Known Fix', desc: 'Searches AI Operations KB for matching error pattern; retrieves step-by-step remediation guide if available' },
      { type: 'condition', label: 'Known vs. Unknown Error', desc: 'Known errors surface self-serve fix guide to Michele with one-click resolution steps. Unknown errors escalate for investigation.' },
      { type: 'output', label: 'Fix Guide Delivered', desc: 'Step-by-step fix guide sent to Michele with error context. Resolution logged to AI Operations KB to improve future matching.' },
    ], meta: { trigger: 'Error detected', output: 'Self-serve fix guide', escalate: 'Michele' } },
    { name: 'OAuth & Connection Renewal Tracker', trigger: 'Weekly check + 14-day advance alert', triggerType: 'schedule', freq: 'Weekly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Runs weekly scan of all OAuth tokens, API keys, and third-party connections across the agent stack' },
      { type: 'action', label: 'Check Expiry Dates', desc: 'Pulls expiry metadata for all connections: Microsoft Graph, Salesforce, DocuSign, Yardi, and custom integrations' },
      { type: 'condition', label: 'Expiry Threshold Check', desc: 'Connections expiring within 14 days trigger advance renewal alert. Expired connections trigger immediate escalation.' },
      { type: 'output', label: 'Renewal Alert', desc: 'Renewal reminder sent to Michele with connection name, expiry date, and renewal steps. Tracked in AI Operations KB.' },
    ], meta: { trigger: 'Weekly + 14-day advance', output: 'OAuth renewal alert', escalate: 'Michele' } },
    { name: 'Agent Change Log', trigger: 'Any agent modified or redeployed', triggerType: 'webhook', freq: 'Event-based', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Deploy / Edit Webhook', desc: 'Fires whenever an agent workflow, prompt, KB, or tool connection is modified or a new version is deployed' },
      { type: 'action', label: 'Capture Change Diff', desc: 'Records what changed: agent name, modified component (prompt, KB, tool), changed by, timestamp, and version tag' },
      { type: 'action', label: 'Update Change Log', desc: 'Appends change record to the running Agent Change Log in AI Operations KB with full diff and rollback reference' },
      { type: 'output', label: 'Change Logged', desc: 'Change record stored in AI Operations KB. Summary notification sent to Michele. Enables rollback if regression detected.' },
    ], meta: { trigger: 'Agent modified / redeployed', output: 'Versioned change log entry', escalate: 'Michele' } },
    { name: 'Weekly Regression Test', trigger: 'Monday morning', triggerType: 'schedule', freq: 'Weekly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires every Monday morning to validate that all agents are producing expected outputs after any weekend changes' },
      { type: 'action', label: 'Run Test Suite', desc: 'Executes a standard set of test prompts against each active agent; compares outputs against expected response benchmarks' },
      { type: 'condition', label: 'Pass / Fail Gate', desc: 'Agents that fail regression tests are flagged Degraded and routed to Error Triage. Passing agents logged as verified.' },
      { type: 'output', label: 'Regression Report', desc: 'Weekly regression test report delivered to Michele with pass/fail by agent. Failed agents trigger Self-Serve Fix Guide.' },
    ], meta: { trigger: 'Monday morning schedule', output: 'Regression test report', escalate: 'Michele' } },
    { name: 'Monthly Agent Performance Report', trigger: '1st of each month', triggerType: 'schedule', freq: 'Monthly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires on the 1st of each month to compile the prior month\'s agent performance data' },
      { type: 'action', label: 'Aggregate Run Data', desc: 'Pulls run counts, error rates, escalation rates, auto-send rates, and KB usage across all agents for the prior month' },
      { type: 'action', label: 'Build Performance Summary', desc: 'Formats data into a monthly agent performance report with trend analysis, top performers, and improvement candidates' },
      { type: 'output', label: 'Report Delivered', desc: 'Monthly performance report delivered to Michele and stored in AI Operations KB. Feeds quarterly roadmap planning.' },
    ], meta: { trigger: '1st of month schedule', output: 'Monthly performance report', escalate: 'Michele' } },
    { name: 'Error Triage & Retry', trigger: 'Real-time error event', triggerType: 'data', freq: 'Real-time', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Error Event Trigger', desc: 'Fires immediately when any agent returns an error, times out, or produces an anomalous output' },
      { type: 'action', label: 'Classify Error', desc: 'Categorizes error as: transient (retry eligible), config issue (fix required), or data/KB issue (investigation needed)' },
      { type: 'condition', label: 'Retry Gate', desc: 'Transient errors trigger automatic retry up to 3x with exponential backoff. Persistent errors escalate to Michele with full error trace.' },
      { type: 'action', label: 'Log & Escalate', desc: 'Error trace, classification, and retry outcome logged to AI Operations KB. Persistent failures push alert to Michele.' },
      { type: 'output', label: 'Resolution or Escalation', desc: 'Transient errors self-resolved via retry. Persistent errors escalated to Michele with diagnostic context and suggested fix.' },
    ], meta: { trigger: 'Real-time error', output: 'Auto-retry or escalation with diagnostic', escalate: 'Michele' } },
    { name: 'Portal Request Router', trigger: 'Portal webhook — new request submitted', triggerType: 'webhook', freq: 'Real-time', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Portal Webhook', desc: 'Fires when a team member submits a new agent request, feedback, or issue report through the ERP Agent Portal' },
      { type: 'action', label: 'Classify Request', desc: 'Categorizes incoming request as: new workflow, bug report, KB update, access request, or general feedback' },
      { type: 'condition', label: 'Routing Gate', desc: 'Bug reports route to Error Triage. KB updates route to relevant agent KB owner. New workflow requests route to Michele for scoping.' },
      { type: 'output', label: 'Request Routed', desc: 'Request routed to appropriate handler with confirmation sent to submitter. Tracked in AI Operations KB for resolution.' },
    ], meta: { trigger: 'Portal webhook', output: 'Routed request + confirmation', escalate: 'Michele' } },
    { name: 'Weekly Agent Performance Digest', trigger: 'Sunday 6 PM', triggerType: 'schedule', freq: 'Weekly', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires every Sunday at 6 PM to compile the prior week\'s agent activity into a leadership digest' },
      { type: 'action', label: 'Pull Weekly Stats', desc: 'Aggregates weekly run counts, auto-send rates, escalation rates, error counts, and top actions across all agents' },
      { type: 'action', label: 'Build Digest', desc: 'Formats into a concise weekly digest: what ran, what escalated, what needs attention, and standout automations' },
      { type: 'output', label: 'Digest Delivered', desc: 'Weekly agent performance digest delivered to Michele\'s inbox before Monday standup. Stored in AI Operations KB.' },
    ], meta: { trigger: 'Sunday 6 PM schedule', output: 'Weekly performance digest', escalate: 'Michele' } },
    { name: 'Portal Security Audit', trigger: 'Daily + real-time on anomaly', triggerType: 'schedule', freq: 'Daily', lastRun: '—', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule + Anomaly Trigger', desc: 'Runs daily security scan of the portal; also fires in real-time when anomalous access patterns are detected' },
      { type: 'action', label: 'Audit Access Logs', desc: 'Reviews portal access logs for unusual login times, failed auth attempts, role escalation attempts, and off-hours activity' },
      { type: 'action', label: 'Scan Agent Permissions', desc: 'Validates that each agent\'s tool and KB permissions match its configured access scope — flags any drift' },
      { type: 'condition', label: 'Anomaly Gate', desc: 'Anomalies above threshold (failed logins, permission drift, off-hours access) escalate to Michele immediately. Clean audits logged silently.' },
      { type: 'output', label: 'Audit Report', desc: 'Daily security audit summary logged to AI Operations KB. Anomalies trigger immediate alert to Michele with access log excerpts.' },
    ], meta: { trigger: 'Daily + real-time anomaly', output: 'Security audit report + anomaly alerts', escalate: 'Michele' } },
  ]},
}

export const AGENT_ACTIVITY = [
  { color: '#3DAE7A', action: 'Auto-sent response to LP inquiry — Halverson Wealth Mgmt', time: 'Today 9:14 AM' },
  { color: '#C9A84C', action: 'Draft queued for approval — Capital Raising sequence: Summit Capital', time: 'Today 8:30 AM' },
  { color: '#3DAE7A', action: 'Auto-sent — Yardi rent roll reconciliation complete, no anomalies', time: 'Today 8:00 AM' },
  { color: '#E55A4E', action: 'Escalated to Meghan — Invoice $18,400 over approval threshold', time: 'Today 7:15 AM' },
  { color: '#3DAE7A', action: 'Auto-dispatched vendor — HVAC maintenance, Denver South Flex', time: 'Today 7:00 AM' },
  { color: '#C9A84C', action: 'Draft queued — Lease renewal proposal, Laredo Ind. Pk. Suite 4B', time: 'Yesterday 4:30 PM' },
  { color: '#3DAE7A', action: 'Auto-sent 3 LinkedIn post drafts to Meghan review queue', time: 'Yesterday 9:00 AM' },
  { color: '#5B9BD5', action: 'Deal scored 78/100 — Albuquerque distribution hub, passed to analytics', time: 'Apr 28 6:00 AM' },
]
