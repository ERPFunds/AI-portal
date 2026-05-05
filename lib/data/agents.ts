export interface Agent {
  id: string
  name: string
  icon: string
  cat: string
  badge: string
  desc: string
  status: 'active' | 'idle'
  runs: string
  last: string
  auto: 'High' | 'Medium' | 'Low'
  escal: string
  kb: string
}

export const AGENTS: Agent[] = [
  { id: 'lp-intel',      name: 'LP Market Intelligence', icon: '🔭', cat: 'Investor',    badge: 'badge-gold',    desc: 'Monitors LP engagement, tracks Salesforce activity, surfaces re-engagement signals',                                                          status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Meghan',  kb: 'Investor Relations KB' },
  { id: 'ir',            name: 'Investor Relations',      icon: '📨', cat: 'Investor',    badge: 'badge-blue',    desc: 'Drafts LP updates, Q reports, and ad-hoc investor communications',                                                                        status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Meghan',  kb: 'IR & Capital KB' },
  { id: 'cap-raising',   name: 'Capital Raising',         icon: '💰', cat: 'Investor',    badge: 'badge-purple',  desc: 'Manages Fund IV pipeline, sequences LP outreach, tracks commitment stages',                                                                status: 'idle', runs: '—', last: '—', auto: 'Low',    escal: 'Meghan',  kb: 'IR & Capital KB' },
  { id: 'fin-controls',  name: 'Financial Controls',      icon: '🔐', cat: 'Finance',     badge: 'badge-red',     desc: 'Flags large invoices, monitors GL anomalies, enforces approval thresholds',                                                               status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Meghan',  kb: 'Finance & Controls KB' },
  { id: 'exec-asst',     name: 'Executive Assistant',     icon: '📋', cat: 'Ops',         badge: 'badge-gray',    desc: "Manages calendar, meeting prep, and follow-up drafts from Microsoft Teams transcripts via Graph API",                                        status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Meghan',  kb: 'Executive KB' },
  { id: 'acq-research',  name: 'Acquisition Research',    icon: '🏭', cat: 'Invest.',     badge: 'badge-teal',    desc: 'Scans market data, analyzes new deals, routes opportunities to Investment Analytics',                                                      status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Meghan',  kb: 'Acquisition KB' },
  { id: 'inv-analytics', name: 'Investment Analytics',    icon: '📊', cat: 'Finance',     badge: 'badge-blue',    desc: 'Runs underwriting models, benchmarks cap rates, generates deal memos',                                                                    status: 'idle', runs: '—', last: '—', auto: 'Low',    escal: 'Meghan',  kb: 'Analytics KB' },
  { id: 'cio-cos',       name: 'CIO & Chief of Staff',    icon: '🎯', cat: 'Strategy',    badge: 'badge-gold',    desc: 'Strategic synthesis, board prep, and fund performance narratives',                                                                        status: 'idle', runs: '—', last: '—', auto: 'Low',    escal: 'Meghan',  kb: 'Strategy KB' },
  { id: 'marketing',     name: 'Marketing',               icon: '📣', cat: 'Marketing',   badge: 'badge-orange',  desc: 'Drafts LP newsletters, LinkedIn content, conference materials, deal announcements',                                                       status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Meghan',  kb: 'Marketing KB' },
  { id: 'brokerage',     name: 'Brokerage',               icon: '🤝', cat: 'Deals',       badge: 'badge-teal',    desc: 'Manages broker relationships, tracks deal flow, drafts LOIs and NDA follow-ups',                                                         status: 'idle', runs: '—', last: '—', auto: 'Low',    escal: 'Meghan',  kb: 'Acquisition KB' },
  { id: 'fund-admin',    name: 'Fund Administration',     icon: '📁', cat: 'Compliance',  badge: 'badge-purple',  desc: 'Tracks subscription docs, capital account statements, K-1 delivery status',                                                              status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Meghan',  kb: 'Fund Admin KB' },
  { id: 'leasing',       name: 'Leasing',                 icon: '🔑', cat: 'Property',    badge: 'badge-teal',    desc: 'Handles prospect inquiries, drafts lease proposals, tracks renewal pipeline',                                                             status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Brennan', kb: 'Leasing KB' },
  { id: 'prop-ops',      name: 'Property Operations',     icon: '🏗️', cat: 'Property',    badge: 'badge-green',   desc: 'Routes work orders, drafts vendor communications, monitors SLA compliance',                                                              status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Liz',     kb: 'Operations KB' },
  { id: 'people-ops',    name: 'People Ops',              icon: '👥', cat: 'HR',          badge: 'badge-orange',  desc: 'Onboarding coordination, benefits inquiries, HR policy Q&A for team members',                                                           status: 'idle', runs: '—', last: '—', auto: 'Medium', escal: 'Brennan', kb: 'People Ops KB' },
  { id: 'acct-ops',      name: 'Accounting Operations',   icon: '🧾', cat: 'Finance',     badge: 'badge-blue',    desc: 'Processes AP/AR, reconciles Yardi entries, drafts payment reminders to tenants',                                                        status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Michele', kb: 'Accounting KB' },
  { id: 'coo',           name: 'COO Operations',          icon: '🏗️', cat: 'Property',    badge: 'badge-teal',    desc: 'Daily ops briefing — vendor dispatch, work order SLAs, leasing activity, and people ops flags',                                         status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Brennan', kb: 'Operations KB' },
  { id: 'ai-ops',        name: 'AI Operations',           icon: '🤖', cat: 'System',      badge: 'badge-teal',    desc: 'Agent health monitoring, error triage, OAuth renewal tracking, regression testing, and portal security audits across the full agent stack', status: 'idle', runs: '—', last: '—', auto: 'High',   escal: 'Michele', kb: 'AI Operations KB' },
]

export const ACTIVITY_MAP: Record<string, string> = {}
