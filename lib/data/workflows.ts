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
  ir: { runs: '42', sent: '38', queue: '4', wf: [
    { name: 'LP Email Triage & Response', trigger: 'New email in IR mailbox', triggerType: 'email', freq: 'Real-time', lastRun: '9:14 AM today', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'New email arrives in agents@erpindustrials.com — IR mailbox' },
      { type: 'action', label: 'Classify', desc: 'Identify email type: quarterly inquiry · capital call · complaint · general update · new investor' },
      { type: 'action', label: 'Pull LP Context', desc: 'Fetch LP profile from Salesforce: fund position, commitment size, tier, last contact, relationship notes' },
      { type: 'condition', label: 'Approval Gate', desc: 'If LP is Tier 1 (>$5M) or email contains legal/compliance language → always route to Meghan for approval' },
      { type: 'action', label: 'Draft Response', desc: 'Generate response using IR Knowledge Base, current fund performance data, and LP communication history' },
      { type: 'output', label: 'Queue or Send', desc: 'Tier 1 LPs → Meghan review queue with draft. Tier 2/3 routine inquiries → auto-send with Meghan BCC' },
    ], meta: { trigger: 'Email', output: 'Drafted reply', escalate: 'Meghan Berry' } },
    { name: 'Quarterly Investor Update', trigger: '1st of each quarter (scheduled)', triggerType: 'schedule', freq: 'Quarterly', lastRun: 'Apr 1, 2026', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires on the 1st day of each calendar quarter' },
      { type: 'action', label: 'Pull Fund Data', desc: 'Fetch Q NOI, occupancy, IRR, and cash-on-cash from Yardi + analytics KB for each active fund' },
      { type: 'action', label: 'Segment LP List', desc: 'Pull all active LPs from Salesforce, segment by fund (Fund I–IV), filter out recently contacted' },
      { type: 'action', label: 'Draft Updates', desc: 'Generate personalized fund update for each LP segment using fund-specific performance narratives' },
      { type: 'condition', label: 'Review Gate', desc: 'All quarterly updates require Meghan approval before sending — high-stakes batch send' },
      { type: 'output', label: 'Approval Queue', desc: 'Batch of LP updates grouped by fund routed to Meghan inbox with edit & approve-all capability' },
    ], meta: { trigger: 'Schedule', output: 'LP email batch', escalate: 'Meghan Berry' } },
    { name: 'LP Re-engagement', trigger: 'Salesforce: LP inactive 60+ days', triggerType: 'data', freq: 'Daily check', lastRun: 'Yesterday', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Salesforce webhook fires when LP record shows no activity in 60 days' },
      { type: 'action', label: 'Score Re-engagement', desc: 'Assess LP value tier, last known interest level, current fund offering alignment' },
      { type: 'action', label: 'Draft Outreach', desc: "Craft personalized re-engagement email referencing LP's fund positions and upcoming Fund IV opportunity" },
      { type: 'condition', label: 'Approval Gate', desc: 'Always requires Meghan approval — re-engagement is relationship-sensitive' },
      { type: 'output', label: 'Queue for Review', desc: "Draft added to Meghan's IR review queue with LP profile card and suggested send time" },
    ], meta: { trigger: 'CRM data', output: 'Re-engagement email', escalate: 'Meghan Berry' } },
    { name: 'New Investor Inquiry Response', trigger: 'Email tagged as "new investor"', triggerType: 'email', freq: 'Real-time', lastRun: 'Apr 26', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'Incoming email classified as new (not in Salesforce) with keywords: invest, fund, LP, capital, offering' },
      { type: 'action', label: 'Create Salesforce Record', desc: 'Draft new Contact + Lead record in Salesforce with extracted name, company, email, inquiry type' },
      { type: 'action', label: 'Prepare Overview Package', desc: 'Select appropriate fund overview deck based on inquiry signals' },
      { type: 'condition', label: 'Approval Gate', desc: 'New investor introduction always routes to Meghan — never auto-send first contact' },
      { type: 'output', label: 'Queue + CRM Update', desc: 'Response draft queued for Meghan with suggested Salesforce stage assignment and follow-up schedule' },
    ], meta: { trigger: 'Email', output: 'Intro email + CRM record', escalate: 'Meghan Berry' } },
  ]},
  leasing: { runs: '31', sent: '28', queue: '3', wf: [
    { name: 'New Prospect Inquiry Response', trigger: 'Leasing email or web form submission', triggerType: 'email', freq: 'Real-time', lastRun: '9:30 AM today', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'Email received in leasing@erpindustrials.com or form submission with space inquiry' },
      { type: 'action', label: 'Extract Requirements', desc: 'Parse inquiry for SF needed, timeline, use type, location preference, budget signals' },
      { type: 'action', label: 'Match Available Space', desc: 'Query Yardi rent roll for available units matching SF range and property preference' },
      { type: 'action', label: 'Draft Availability Reply', desc: 'Generate response with matching spaces, $/SF, lease terms, and request for tour scheduling' },
      { type: 'condition', label: 'Approval Gate', desc: 'Large prospects (>50k SF or national tenant) route to Brennan or Meghan. Standard inquiries auto-send.' },
      { type: 'output', label: 'Send + Log', desc: 'Reply sent to prospect, lead logged in leasing pipeline tracker, follow-up scheduled at 3 days if no reply' },
    ], meta: { trigger: 'Email / form', output: 'Availability response', escalate: 'Brennan Berry' } },
    { name: 'Lease Expiration Alert & Renewal', trigger: '90 days before lease end date', triggerType: 'data', freq: 'Daily check', lastRun: 'Today 7:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Yardi sync surfaces leases with end_date within 90 days that have no renewal in progress' },
      { type: 'action', label: 'Assess Tenant', desc: 'Pull payment history, any open disputes, communication log, current market $/SF comp' },
      { type: 'action', label: 'Draft Renewal Proposal', desc: 'Generate renewal letter with proposed new term, rate escalation options, and early renewal incentive' },
      { type: 'condition', label: 'Approval Gate', desc: 'Anchor tenants (>30k SF) or rent increase >10% → Brennan approval required. Others auto-send.' },
      { type: 'output', label: 'Send Proposal + DocuSign', desc: 'Renewal proposal emailed with DocuSign signature envelope. Status tracked in leasing pipeline.' },
    ], meta: { trigger: 'Yardi data', output: 'Renewal proposal', escalate: 'Brennan Berry' } },
    { name: 'Prospect Follow-up Sequence', trigger: 'After tour or initial showing', triggerType: 'manual', freq: 'Event-based', lastRun: 'Apr 27', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'Tour logged in leasing pipeline — agent initiates 3-touch follow-up sequence' },
      { type: 'action', label: 'Day 3 Follow-up', desc: 'Draft thank-you + next steps email, reference specific spaces shown, attach floor plans if applicable' },
      { type: 'action', label: 'Day 7 Follow-up', desc: 'If no reply: draft check-in with any new availability or updated pricing.' },
      { type: 'condition', label: 'Escalation Check', desc: 'If no reply after 14 days → flag for Hannah or Brennan to make personal outreach call' },
      { type: 'output', label: 'Sequence Emails + CRM Update', desc: 'Emails auto-sent per sequence. Pipeline stage updated. Hannah notified if manual follow-up needed.' },
    ], meta: { trigger: 'Pipeline event', output: '3-email sequence', escalate: 'Hannah / Brennan' } },
    { name: 'DocuSign Lease Execution', trigger: 'Both parties have signed lease', triggerType: 'webhook', freq: 'Event-based', lastRun: 'Apr 22', status: 'active', steps: [
      { type: 'trigger', label: 'DocuSign Webhook', desc: "DocuSign envelope status changes to 'Completed' — all signatures received" },
      { type: 'action', label: 'Generate Welcome Email', desc: 'Draft tenant onboarding email: key contacts, move-in instructions, utility setup, portal access' },
      { type: 'action', label: 'Update Yardi', desc: 'Flag unit as leased in Yardi, set lease start/end dates, configure rent schedule and escalations' },
      { type: 'action', label: 'File Documents', desc: 'Move executed lease to Document Vault under correct property folder with naming convention' },
      { type: 'output', label: 'Welcome Sent + Systems Updated', desc: 'Welcome auto-sent to new tenant. Yardi updated. Brennan notified.' },
    ], meta: { trigger: 'DocuSign webhook', output: 'Welcome email + Yardi update', escalate: 'Brennan Berry' } },
  ]},
  'prop-ops': { runs: '57', sent: '52', queue: '5', wf: [
    { name: 'Work Order Triage & Dispatch', trigger: 'New work order created in Yardi', triggerType: 'data', freq: 'Real-time', lastRun: '9:00 AM today', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'Work order created in Yardi via tenant portal, email, or Liz direct entry' },
      { type: 'action', label: 'Classify Priority', desc: 'Assess P1 (safety/emergency), P2 (operational impact), P3 (routine). Apply SLA clock: P1=4h, P2=24h, P3=72h' },
      { type: 'action', label: 'Select Vendor', desc: 'Match work order type to approved vendor list. Check vendor availability and active COI in Document Vault.' },
      { type: 'action', label: 'Draft Dispatch', desc: 'Generate vendor dispatch email: property address, unit, issue description, access instructions, PO number' },
      { type: 'condition', label: 'Approval Gate', desc: 'P1 emergency work orders over $5,000 → Liz confirmation required. P2/P3 routine → auto-dispatch.' },
      { type: 'output', label: 'Dispatch + Track', desc: 'Dispatch email sent to vendor. Work order status updated to In Progress. SLA timer active in dashboard.' },
    ], meta: { trigger: 'Yardi event', output: 'Vendor dispatch', escalate: 'Liz Cordova' } },
    { name: 'SLA Breach Escalation', trigger: 'Work order SLA exceeded', triggerType: 'data', freq: 'Hourly check', lastRun: 'Today 8:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Hourly check: any work order where current_time > created_at + SLA_hours and status ≠ Resolved' },
      { type: 'action', label: 'Assess Breach', desc: 'Determine breach severity — minor (10–25% over) vs critical (>50% over). Pull vendor last update.' },
      { type: 'action', label: 'Draft Vendor Follow-up', desc: 'Escalation message to vendor requesting immediate status update and revised ETA' },
      { type: 'condition', label: 'Notify Liz', desc: 'All SLA breaches trigger in-app notification to Liz. P1 breaches also trigger SMS.' },
      { type: 'output', label: 'Escalation Sent + Dashboard Flag', desc: 'Follow-up sent to vendor. Work order row highlighted red in dashboard. Liz notification delivered.' },
    ], meta: { trigger: 'SLA timer', output: 'Escalation email + alert', escalate: 'Liz Cordova' } },
    { name: 'Vendor COI Expiration Alert', trigger: 'COI expiry within 30 days', triggerType: 'data', freq: 'Daily check', lastRun: 'Today 7:30 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Daily scan of Document Vault — insurance COIs expiring within 30 days flagged' },
      { type: 'action', label: 'Draft Renewal Request', desc: 'Email to vendor requesting updated COI with ERP Industrials listed as additional insured.' },
      { type: 'action', label: '14-Day Follow-up', desc: 'If no updated COI received in 14 days → second notice. Vendor flagged as "COI pending".' },
      { type: 'condition', label: 'Suspend at Expiry', desc: 'If COI expires with no renewal → vendor automatically suspended from dispatch. Liz and Meghan notified.' },
      { type: 'output', label: 'Renewal Email + Status Update', desc: 'COI request sent. Vendor status tracked. Document Vault updated when new COI received via email.' },
    ], meta: { trigger: 'Document expiry', output: 'COI renewal request', escalate: 'Liz Cordova' } },
  ]},
  'acct-ops': { runs: '89', sent: '86', queue: '3', wf: [
    { name: 'Monthly Rent Reminder Sequence', trigger: '5 days before rent due date', triggerType: 'schedule', freq: 'Monthly', lastRun: 'Apr 25', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: "Fires on the 25th of each month for the following month's rent cycle" },
      { type: 'action', label: 'Pull Rent Roll', desc: 'Fetch all active leases from Yardi: tenant name, unit, monthly rent amount, due date, current balance' },
      { type: 'action', label: 'Filter by Status', desc: 'Exclude tenants with $0 balance. Prioritize tenants with existing past-due balance for escalated reminder.' },
      { type: 'action', label: 'Draft Reminders', desc: 'Generate personalized rent reminder emails. Past-due tenants receive escalated version noting outstanding balance.' },
      { type: 'output', label: 'Auto-Send + Yardi Log', desc: 'All reminders auto-sent. Communication logged in Yardi tenant record. Past-due cases flagged to Michele.' },
    ], meta: { trigger: 'Schedule', output: 'Tenant reminder emails', escalate: 'Michele Simpkins' } },
    { name: 'Invoice Processing & Approval Routing', trigger: 'Invoice received via email', triggerType: 'email', freq: 'Real-time', lastRun: 'Today 8:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Trigger', desc: 'Email with attachment in AP mailbox — keywords: invoice, bill, payment request, statement' },
      { type: 'action', label: 'Extract Invoice Data', desc: 'Parse PDF: vendor name, invoice number, amount, due date, line items, property/cost center' },
      { type: 'action', label: 'Match to PO or WO', desc: 'Cross-reference invoice against open purchase orders and Yardi work orders. Flag discrepancies.' },
      { type: 'condition', label: 'Approval Routing', desc: '<$1,000: auto-approve and process. $1,000–$10,000: Sylvia approval. >$10,000: Michele + Financial Controls agent.' },
      { type: 'output', label: 'Process or Queue', desc: 'Approved invoices scheduled for payment in Yardi. Large invoices queued in Financial Controls dashboard.' },
    ], meta: { trigger: 'Email', output: 'Invoice routed or processed', escalate: 'Michele Simpkins' } },
    { name: 'Yardi Reconciliation', trigger: '1st of each month (scheduled)', triggerType: 'schedule', freq: 'Monthly', lastRun: 'Apr 1', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires on the 1st of each month to reconcile prior month close' },
      { type: 'action', label: 'Pull GL Data', desc: 'Export prior month GL transactions from Yardi by property and cost center' },
      { type: 'action', label: 'Identify Anomalies', desc: 'Flag: duplicate entries, missing cost center codes, amounts >2x average for that GL code, unmatched intercompany' },
      { type: 'condition', label: 'Flag for Review', desc: 'Any anomaly over $500 or unmatched entry → queued for Sylvia or Michele review with explanation' },
      { type: 'output', label: 'Reconciliation Report', desc: 'Summary report emailed to Michele. Clean entries auto-posted. Flagged items in accounting review queue.' },
    ], meta: { trigger: 'Schedule', output: 'Reconciliation report', escalate: 'Michele Simpkins' } },
  ]},
  'fin-controls': { runs: '24', sent: '20', queue: '4', wf: [
    { name: 'Invoice Threshold Enforcement', trigger: 'Invoice exceeds approval threshold', triggerType: 'data', freq: 'Real-time', lastRun: 'Today 7:15 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Accounting Ops agent flags any invoice >$10,000 before processing' },
      { type: 'action', label: 'Validate Vendor', desc: 'Check vendor COI status, prior invoice history, any outstanding disputes or compliance flags' },
      { type: 'action', label: 'Verify Budget', desc: 'Compare invoice amount against approved budget for that property/cost center. Flag if over budget.' },
      { type: 'action', label: 'Draft Approval Request', desc: 'Prepare approval request for Meghan with: vendor details, invoice copy, budget comparison, recommendation' },
      { type: 'output', label: 'Meghan Approval Queue', desc: "Approval request added to Meghan's Financial Controls queue. Invoice held in Yardi until approved." },
    ], meta: { trigger: 'Data threshold', output: 'Approval request', escalate: 'Meghan Berry' } },
    { name: 'GL Anomaly Detection', trigger: 'Yardi sync with unusual entries', triggerType: 'data', freq: 'Every 30 min', lastRun: 'Today 6:30 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Each Yardi sync: agent scans new GL entries against 12-month historical averages per account' },
      { type: 'action', label: 'Score Anomalies', desc: 'Entries >3x average for GL code, duplicate amounts same day, reversed entries, missing required fields' },
      { type: 'condition', label: 'Severity Assessment', desc: 'High: duplicate or missing posting → immediate alert. Medium: unusual amount → next-day review queue.' },
      { type: 'output', label: 'Alert or Queue', desc: 'High severity → immediate notification to Michele + Meghan. Medium → morning reconciliation report.' },
    ], meta: { trigger: 'Yardi data', output: 'Anomaly alerts', escalate: 'Meghan / Michele' } },
    { name: 'Budget vs Actual Monitoring', trigger: 'Weekly (Monday 7AM)', triggerType: 'schedule', freq: 'Weekly', lastRun: 'Apr 28', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Every Monday morning, agent compares YTD actuals against approved annual budget' },
      { type: 'action', label: 'Pull Actuals', desc: 'Fetch YTD expenses from Yardi by property, cost category, and fund' },
      { type: 'action', label: 'Calculate Variance', desc: 'Compute budget vs actual variance. Flag any category >10% over budget or tracking to miss target by >5%' },
      { type: 'output', label: 'Weekly Budget Report', desc: 'Variance report emailed to Meghan and Michele. Properties over budget highlighted for discussion.' },
    ], meta: { trigger: 'Schedule', output: 'Budget variance report', escalate: 'Meghan Berry' } },
  ]},
  'lp-intel': { runs: '168', sent: '168', queue: '0', wf: [
    { name: 'LP Engagement Monitoring', trigger: 'Continuous Salesforce polling', triggerType: 'data', freq: 'Every hour', lastRun: 'Today 9:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Continuous Trigger', desc: 'Polls Salesforce every hour for LP activity signals: email opens, clicks, form fills, call logs, CRM updates' },
      { type: 'action', label: 'Score Engagement', desc: 'Update LP engagement score (0–100) based on recency, frequency, and depth of interactions in last 30 days' },
      { type: 'action', label: 'Detect Signal Changes', desc: 'Flag LPs whose score dropped >15 points (cooling) or rose >20 points (warming) since last check' },
      { type: 'output', label: 'Intelligence Brief', desc: "Daily digest pushed to Meghan's dashboard: top movers, cooling LPs needing attention, warming LPs to accelerate" },
    ], meta: { trigger: 'CRM data', output: 'Engagement intelligence', escalate: 'Meghan Berry' } },
    { name: 'Capital Call Readiness Scoring', trigger: 'Fund IV capital call cycle', triggerType: 'data', freq: 'Weekly', lastRun: 'Apr 28', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Each Monday: assess all Fund IV LPs for capital call readiness ahead of upcoming call' },
      { type: 'action', label: 'Analyze LP History', desc: 'Review prior call responsiveness, funded/unfunded ratio, communication patterns, current commitments' },
      { type: 'action', label: 'Score Readiness', desc: 'Predict likelihood of on-time funding based on historical data. Flag at-risk LPs for proactive IR outreach.' },
      { type: 'output', label: 'Readiness Report', desc: 'Capital Raising Agent receives ranked LP list. IR Agent notified of at-risk LPs. Meghan gets summary.' },
    ], meta: { trigger: 'Schedule + data', output: 'Readiness scores', escalate: 'Meghan Berry' } },
  ]},
  'cap-raising': { runs: '19', sent: '15', queue: '4', wf: [
    { name: 'Fund IV Prospect Sequence', trigger: "LP moves to 'Warm' stage in Salesforce", triggerType: 'data', freq: 'Event-based', lastRun: 'Today 8:30 AM', status: 'active', steps: [
      { type: 'trigger', label: 'CRM Trigger', desc: 'LP stage changes from Cold/Contacted to Warm in Salesforce Fund IV opportunity' },
      { type: 'action', label: 'Build LP Profile', desc: 'Compile LP background: allocation size, fund preferences, communication style, any prior objections noted' },
      { type: 'action', label: 'Draft Outreach Sequence', desc: '3-email nurture sequence: intro deck → performance update → soft close. Personalized to LP context.' },
      { type: 'condition', label: 'Approval Gate', desc: 'All capital raising sequences require Meghan review — never auto-send capital raise communications' },
      { type: 'output', label: 'Sequence Queued', desc: "3 draft emails queued in Meghan's Capital Raising inbox with send schedule and LP context card" },
    ], meta: { trigger: 'CRM stage change', output: '3-email sequence', escalate: 'Meghan Berry' } },
    { name: 'Commitment Tracking & Follow-up', trigger: 'Verbal commitment with no signed docs', triggerType: 'data', freq: 'Daily check', lastRun: 'Yesterday', status: 'active', steps: [
      { type: 'trigger', label: 'Data Trigger', desc: 'Salesforce shows LP at "Committed" stage but no subscription docs signed after 7 days' },
      { type: 'action', label: 'Draft Gentle Follow-up', desc: 'Friendly follow-up referencing verbal commitment, attach subscription docs, offer to answer questions' },
      { type: 'condition', label: '14-Day Escalation', desc: 'If no docs at 14 days → Meghan notified for personal outreach. Flag at 21 days as commitment at risk.' },
      { type: 'output', label: 'Follow-up + CRM Update', desc: 'Email draft queued for approval. Salesforce stage updated. Days-since-commitment counter tracked.' },
    ], meta: { trigger: 'CRM data', output: 'Follow-up email', escalate: 'Meghan Berry' } },
  ]},
  marketing: { runs: '12', sent: '10', queue: '2', wf: [
    { name: 'LP Newsletter (Quarterly)', trigger: 'Quarterly schedule trigger', triggerType: 'schedule', freq: 'Quarterly', lastRun: 'Apr 1', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires first week of each quarter to draft the LP investor newsletter' },
      { type: 'action', label: 'Gather Content', desc: 'Pull Q highlights: fund performance, notable acquisitions, market commentary, team news, portfolio updates' },
      { type: 'action', label: 'Draft Newsletter', desc: 'Write formatted newsletter with ERP brand voice — professional, data-backed, concise.' },
      { type: 'condition', label: 'Meghan Review', desc: 'Newsletter always requires Meghan approval before distribution to full LP list' },
      { type: 'output', label: 'Draft Ready for Review', desc: "Newsletter draft queued in Meghan's marketing inbox. LP distribution list pre-loaded in Outlook draft." },
    ], meta: { trigger: 'Schedule', output: 'LP newsletter draft', escalate: 'Meghan Berry' } },
    { name: 'LinkedIn Content Calendar', trigger: 'Weekly (Monday)', triggerType: 'schedule', freq: 'Weekly', lastRun: 'Apr 28', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Each Monday: generate 3 LinkedIn post drafts for the week' },
      { type: 'action', label: 'Source Content', desc: 'Pull from: recent acquisitions, market data, Yardi NOI trends, industry news, ERP milestones' },
      { type: 'action', label: 'Draft Posts', desc: "Write 3 posts in ERP brand voice. Mix of data-driven insights and leadership positioning for Meghan's profile." },
      { type: 'output', label: 'Content Queue', desc: '3 posts queued for Meghan review. Suggested publish times included. One-click approve to schedule.' },
    ], meta: { trigger: 'Schedule', output: '3 LinkedIn post drafts', escalate: 'Meghan Berry' } },
  ]},
  'cio-cos': { runs: '6', sent: '5', queue: '1', wf: [
    { name: 'Board Deck Preparation', trigger: '10 days before board meeting', triggerType: 'schedule', freq: 'Quarterly', lastRun: 'Apr 19', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: "Fires 10 days before each quarterly board meeting date (set in Meghan's calendar)" },
      { type: 'action', label: 'Compile Performance Data', desc: 'Pull fund IRR, NOI, occupancy, capital deployed, pipeline — from Yardi, Salesforce, and analytics KB' },
      { type: 'action', label: 'Draft Narrative', desc: 'Write board update narrative: quarter highlights, portfolio health, fund raise progress, strategic decisions needed' },
      { type: 'action', label: 'Structure Deck Outline', desc: 'Organize into board deck sections: Executive Summary → Portfolio → Fund Performance → Pipeline → Decisions Required' },
      { type: 'output', label: 'Draft to Meghan', desc: 'Board deck outline + narrative draft queued. Meghan reviews, edits, and sends to design for formatting.' },
    ], meta: { trigger: 'Calendar trigger', output: 'Board deck draft', escalate: 'Meghan Berry' } },
    { name: 'Fathom Call Debrief & Follow-up', trigger: 'Meeting transcript available in Fathom', triggerType: 'webhook', freq: 'Event-based', lastRun: 'Apr 26', status: 'idle', steps: [
      { type: 'trigger', label: 'Fathom Webhook', desc: 'New meeting transcript posted to Fathom → CIO agent ingests and processes' },
      { type: 'action', label: 'Extract Action Items', desc: 'Identify all commitments, decisions, and follow-up items from transcript. Tag by person responsible.' },
      { type: 'action', label: 'Draft Follow-up Emails', desc: 'Generate follow-up email per external participant: summary of discussion, agreed next steps, any requested materials' },
      { type: 'condition', label: 'Approval Gate', desc: 'All follow-ups require Meghan review before sending — strategic communications' },
      { type: 'output', label: 'Action Items + Drafts', desc: "Action item list added to Meghan's task view. Follow-up drafts queued in inbox by meeting participant." },
    ], meta: { trigger: 'Fathom webhook', output: 'Follow-up emails + action items', escalate: 'Meghan Berry' } },
  ]},
  'acq-research': { runs: '8', sent: '6', queue: '2', wf: [
    { name: 'Market Opportunity Scan', trigger: 'Daily (6AM)', triggerType: 'schedule', freq: 'Daily', lastRun: 'Today 6:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Each morning: scan industrial real estate listings, broker emails, and market data feeds in TX, CO, AZ, NM' },
      { type: 'action', label: 'Filter Opportunities', desc: 'Apply ERP criteria: industrial/flex/warehouse, 50k–500k SF, target cap rate ≥6%, target markets only' },
      { type: 'action', label: 'Score Each Deal', desc: 'Preliminary scoring on: price/SF vs market, occupancy, NOI stability, location, fund fit' },
      { type: 'condition', label: 'Threshold Check', desc: 'Score ≥70 → pass to Investment Analytics for underwriting. Score 50–69 → watch list. <50 → archive.' },
      { type: 'output', label: 'Deal Pipeline Update', desc: 'High-score deals pushed to Acquisition Pipeline view. Meghan receives morning brief of new opportunities.' },
    ], meta: { trigger: 'Schedule + data feeds', output: 'Deal pipeline entries', escalate: 'Meghan Berry' } },
  ]},
  'inv-analytics': { runs: '12', sent: '10', queue: '2', wf: [
    { name: 'Deal Underwriting Model', trigger: 'New deal from Acquisition Research', triggerType: 'data', freq: 'Event-based', lastRun: 'Today 10:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Agent Handoff', desc: 'Acquisition Research agent passes deal with score ≥70 to Investment Analytics for full underwriting' },
      { type: 'action', label: 'Build Cash Flow Model', desc: 'Project 5-year cash flows: rent growth assumptions, vacancy, capex, debt service, exit cap rate scenarios' },
      { type: 'action', label: 'Benchmark Comparables', desc: 'Pull comp sales and leases from market data. Compare projected returns vs ERP portfolio average.' },
      { type: 'action', label: 'Draft Deal Memo', desc: 'One-page deal memo: summary, returns analysis, risks, recommendation (pursue / pass / negotiate)' },
      { type: 'output', label: 'Deal Memo to Meghan', desc: "Memo queued in CIO agent and Meghan's inbox. If recommended, auto-creates Salesforce opportunity record." },
    ], meta: { trigger: 'Agent handoff', output: 'Deal memo', escalate: 'Meghan Berry' } },
  ]},
  'fund-admin': { runs: '18', sent: '16', queue: '2', wf: [
    { name: 'Capital Call Notice Distribution', trigger: 'Capital call approved by Meghan', triggerType: 'manual', freq: 'Event-based', lastRun: 'Apr 15', status: 'active', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Meghan approves capital call in Financial Controls — triggers distribution workflow' },
      { type: 'action', label: 'Generate LP Notices', desc: 'Create personalized capital call notice for each LP: call amount, wire instructions, funding deadline (10 business days)' },
      { type: 'action', label: 'Send via DocuSign', desc: 'Each notice sent as DocuSign envelope for LP acknowledgment signature' },
      { type: 'action', label: 'Track Funding', desc: 'Monitor wire receipt confirmation from banking. Update Salesforce LP record as each LP funds.' },
      { type: 'output', label: 'LP Intel Agent Notified', desc: 'Funded LPs marked in Salesforce. Unfunded at day 5 → LP Intel agent triggers reminder via IR Agent.' },
    ], meta: { trigger: 'Manual trigger', output: 'Capital call notices', escalate: 'Meghan Berry' } },
    { name: 'K-1 & Tax Doc Distribution', trigger: 'Tax documents available (annually)', triggerType: 'schedule', freq: 'Annual', lastRun: 'Feb 2026', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires in February each year when K-1 documents are ready from fund administrator' },
      { type: 'action', label: 'Match K-1 to LP', desc: 'Map each K-1 to LP Salesforce record and fund position. Verify amounts against capital account statements.' },
      { type: 'action', label: 'Draft Distribution Email', desc: 'Personalized email per LP with K-1 attached, cover note explaining amounts, contact for questions' },
      { type: 'output', label: 'Batch Send + Archive', desc: 'Emails sent after Meghan approval. All K-1s filed in Document Vault by fund and LP. Delivery tracked.' },
    ], meta: { trigger: 'Schedule', output: 'K-1 distribution', escalate: 'Meghan Berry' } },
  ]},
  coo: { runs: '38', sent: '35', queue: '3', wf: [
    { name: 'Daily Operations Briefing', trigger: 'Weekdays at 7:00 AM', triggerType: 'schedule', freq: 'Daily', lastRun: 'Today 7:00 AM', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Fires every weekday morning at 7:00 AM before Brennan starts his day' },
      { type: 'action', label: 'Aggregate Ops Data', desc: 'Pull from Property Ops, Leasing, People Ops, and Maintenance agents: open work orders, SLA breaches, lease activity from prior 24h, any HR flags' },
      { type: 'action', label: 'Score & Prioritize', desc: 'Rank items by urgency: P1 work order breaches first, then leasing deadlines, then vendor COI expirations, then HR items' },
      { type: 'output', label: 'Briefing to Brennan', desc: "Daily ops digest emailed to Brennan by 7:15 AM. Summary card added to Brennan's dashboard inbox." },
    ], meta: { trigger: 'Schedule', output: 'Ops briefing email', escalate: 'Brennan Berry' } },
    { name: 'Weekly Ops Summary for Brennan', trigger: 'Fridays at 4:00 PM', triggerType: 'schedule', freq: 'Weekly', lastRun: 'Apr 25', status: 'active', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Every Friday at 4:00 PM — end-of-week operations wrap-up' },
      { type: 'action', label: 'Compile Week in Review', desc: 'Work orders opened/closed, vendor spend vs budget, leasing pipeline movements, people ops activity, any SLA breaches' },
      { type: 'action', label: 'Flag Next Week', desc: 'Identify anything due next week: vendor PO renewals, lease expiry follow-ups, scheduled inspections, payroll deadlines' },
      { type: 'output', label: 'Weekly Report', desc: "Report emailed to Brennan. Flagged items added to next week's priority queue in the portal." },
    ], meta: { trigger: 'Schedule', output: 'Weekly ops report', escalate: 'Brennan Berry' } },
  ]},
  'people-ops': { runs: '3', sent: '2', queue: '1', wf: [
    { name: 'New Hire Onboarding', trigger: 'New employee added to HR system', triggerType: 'manual', freq: 'Event-based', lastRun: 'Apr 25', status: 'idle', steps: [
      { type: 'trigger', label: 'Manual Trigger', desc: 'Brennan or Vicki triggers onboarding workflow for a new team member' },
      { type: 'action', label: 'Generate Checklist', desc: 'Create personalized onboarding checklist: IT setup, systems access (Yardi, Salesforce, portal), key contacts, policies' },
      { type: 'action', label: 'Draft Welcome Email', desc: "Welcome email from Meghan's voice with first-day instructions, team intro, and schedule for week 1" },
      { type: 'action', label: 'Schedule Check-ins', desc: "Calendar invites for 30/60/90-day check-ins added to Meghan and Brennan's calendars" },
      { type: 'output', label: 'Onboarding Package Sent', desc: 'Welcome email + checklist sent to new hire. HR folder created in Document Vault. Vicki notified.' },
    ], meta: { trigger: 'Manual', output: 'Onboarding package', escalate: 'Brennan Berry' } },
  ]},
  'exec-asst': { runs: '31', sent: '28', queue: '3', wf: [
    { name: 'Meeting Prep Brief', trigger: '24 hours before calendar event', triggerType: 'schedule', freq: 'Event-based', lastRun: 'Yesterday', status: 'active', steps: [
      { type: 'trigger', label: 'Calendar Trigger', desc: 'Google Calendar / Outlook event with external attendee detected 24 hours in advance' },
      { type: 'action', label: 'Research Attendees', desc: 'Pull attendee info from Salesforce, LinkedIn signals, prior meeting notes from Fathom, and any open items' },
      { type: 'action', label: 'Compile Brief', desc: 'One-page meeting brief: attendee background, relationship history, open items, suggested talking points, goals for meeting' },
      { type: 'output', label: 'Brief to Meghan', desc: 'Meeting brief emailed to Meghan at 7AM day-of. Also added to calendar event description.' },
    ], meta: { trigger: 'Calendar', output: 'Meeting brief', escalate: 'Meghan Berry' } },
  ]},
  brokerage: { runs: '4', sent: '3', queue: '1', wf: [
    { name: 'Broker Relationship Follow-up', trigger: 'Weekly (Friday)', triggerType: 'schedule', freq: 'Weekly', lastRun: 'Apr 25', status: 'idle', steps: [
      { type: 'trigger', label: 'Schedule Trigger', desc: 'Each Friday: review broker communications and deal flow received in the week' },
      { type: 'action', label: 'Log Deal Flow', desc: 'Catalog any new deal introductions from brokers. Add to Acquisition Pipeline with source broker noted.' },
      { type: 'action', label: 'Draft Thank-you / Follow-up', desc: 'If broker sent a deal → draft acknowledgment with feedback. If no contact in 30 days → draft check-in.' },
      { type: 'output', label: 'Relationship Log + Drafts', desc: 'Drafts queued for Meghan review. Broker contact log updated in Salesforce.' },
    ], meta: { trigger: 'Schedule', output: 'Broker follow-ups', escalate: 'Meghan Berry' } },
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
