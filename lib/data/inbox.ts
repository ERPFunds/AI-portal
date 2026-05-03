import type { RoleKey } from './roles'

export interface InboxItem {
  from: string
  agent: string
  agentBadge: string
  subject: string
  time: string
  status: 'active-thread' | 'pending' | 'handled' | 'needs-review'
}

export const INBOX_DATA: Record<RoleKey, InboxItem[]> = {
  meghan: [
    { from: 'James Halverson',       agent: 'IR Agent',    agentBadge: 'badge-blue',   subject: 'Fund IV Q1 Update Request — draft ready for review',  time: '9:14 AM',   status: 'active-thread' },
    { from: 'Meridian Family Office', agent: 'IR Agent',   agentBadge: 'badge-blue',   subject: 'Re-engagement outreach — draft ready',                 time: '8:30 AM',   status: 'pending' },
    { from: 'LP Summit Capital',      agent: 'Cap. Raising',agentBadge: 'badge-purple', subject: 'Follow-up sequence — draft ready to send',             time: 'Yesterday', status: 'pending' },
    { from: 'Westridge Pension Fund', agent: 'IR Agent',   agentBadge: 'badge-blue',   subject: 'Fund IV subscription docs — follow-up draft',          time: 'Yesterday', status: 'handled' },
    { from: 'Blue Mesa Endowment',    agent: 'Cap. Raising',agentBadge: 'badge-purple', subject: 'Soft circle check-in — draft queued',                  time: 'Apr 28',    status: 'pending' },
    { from: 'Carol & David Steinberg',agent: 'IR Agent',   agentBadge: 'badge-blue',   subject: 'Annual statement inquiry — auto-replied',              time: 'Apr 27',    status: 'handled' },
    { from: 'Desert Freight Inc.',    agent: 'Tenant',     agentBadge: 'badge-orange', subject: 'Past-due balance — payment plan request',              time: 'Yesterday', status: 'needs-review' },
    { from: 'SunBelt Dist. Co.',      agent: 'Leasing',    agentBadge: 'badge-teal',   subject: 'Renewal negotiation — counter-proposal ready',         time: 'Yesterday', status: 'active-thread' },
    { from: 'TechAssembly SW',        agent: 'Tenant',     agentBadge: 'badge-orange', subject: 'Lease question — early termination inquiry',           time: 'Apr 28',    status: 'pending' },
    { from: 'Apex Cold Storage',      agent: 'Leasing',    agentBadge: 'badge-teal',   subject: '22k SF inquiry — proposal draft ready',                time: 'Apr 28',    status: 'pending' },
  ],
  william: [
    { from: 'Summit Capital Partners',agent: 'IR Agent',   agentBadge: 'badge-blue',   subject: 'Fund IV commitment confirmation — reply draft', time: 'Today',     status: 'pending' },
    { from: 'Westridge Pension Fund', agent: 'Cap. Raising',agentBadge: 'badge-purple', subject: 'Re-engagement outreach — draft queued',         time: 'Yesterday', status: 'handled' },
  ],
  brennan: [
    { from: 'Apex Cold Storage',  agent: 'Leasing', agentBadge: 'badge-teal',   subject: '22k SF inquiry — proposal draft ready',         time: '9:30 AM',   status: 'pending' },
    { from: 'SunBelt Dist. Co.',  agent: 'Leasing', agentBadge: 'badge-teal',   subject: 'Renewal negotiation — counter-proposal ready',  time: 'Yesterday', status: 'active-thread' },
    { from: 'Desert Freight Inc.',agent: 'Tenant',  agentBadge: 'badge-orange', subject: 'Past-due balance — payment plan request',       time: 'Yesterday', status: 'needs-review' },
    { from: 'TechAssembly SW',    agent: 'Tenant',  agentBadge: 'badge-orange', subject: 'Lease question — early termination inquiry',   time: 'Apr 28',    status: 'pending' },
    { from: 'Borderlands Freight',agent: 'Leasing', agentBadge: 'badge-teal',   subject: 'Tour follow-up sent — awaiting response',       time: 'Apr 27',    status: 'handled' },
  ],
  michele: [],
  liz: [
    { from: 'Desert Freight Inc.',agent: 'Tenant', agentBadge: 'badge-orange', subject: 'Maintenance request — loading dock Bay 2',   time: '8:45 AM',   status: 'pending' },
    { from: 'TechAssembly SW',   agent: 'Tenant',  agentBadge: 'badge-orange', subject: 'HVAC complaint — Bay 3 temperature',          time: 'Yesterday', status: 'needs-review' },
    { from: 'Rio Grande Mfg.',   agent: 'Tenant',  agentBadge: 'badge-orange', subject: 'Access hours change request — Building A',   time: 'Apr 28',    status: 'handled' },
  ],
  hannah: [
    { from: 'Apex Cold Storage',  agent: 'Leasing', agentBadge: 'badge-teal',   subject: 'New inquiry — 22k SF Denver South Flex',         time: '9:30 AM',   status: 'pending' },
    { from: 'NM Pharma Logistics',agent: 'Leasing', agentBadge: 'badge-teal',   subject: 'Availability inquiry — 45k SF Albuquerque',      time: 'Yesterday', status: 'active-thread' },
    { from: 'TX Industrial Supply',agent: 'Leasing',agentBadge: 'badge-teal',   subject: 'Proposal follow-up — San Antonio Gateway',       time: 'Apr 28',    status: 'pending' },
    { from: 'SunBelt Dist. Co.',  agent: 'Leasing', agentBadge: 'badge-teal',   subject: 'Renewal — counter sent, awaiting response',      time: 'Apr 27',    status: 'handled' },
    { from: 'Southwest Freight',  agent: 'Tenant',  agentBadge: 'badge-orange', subject: 'Lease renewal question — escalation clause',     time: 'Apr 27',    status: 'handled' },
  ],
  sylvia: [],
}

export const INBOX_AGENTS: Record<RoleKey, string[]> = {
  meghan:  ['All', 'IR Agent', 'Cap. Raising', 'Leasing', 'Tenant'],
  william: ['All', 'IR Agent', 'Cap. Raising'],
  brennan: ['All', 'Leasing', 'Tenant'],
  michele: [],
  liz:     ['All', 'Tenant'],
  hannah:  ['All', 'Leasing', 'Tenant'],
  sylvia:  [],
}
