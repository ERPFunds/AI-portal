'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ROLES, type RoleKey, type Role } from '@/lib/data/roles'
import { SIDEBARS, type SidebarItem } from '@/lib/data/sidebars'
import { AGENTS, ACTIVITY_MAP } from '@/lib/data/agents'
import { INBOX_DATA, INBOX_AGENTS } from '@/lib/data/inbox'
import { WORKFLOWS, AGENT_ACTIVITY } from '@/lib/data/workflows'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  roleKey: RoleKey
  userEmail: string
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardClient({ roleKey, userEmail }: Props) {
  const role = ROLES[roleKey]
  const sidebarItems: SidebarItem[] = SIDEBARS[role.sidebar] ?? SIDEBARS.all
  const defaultView = (sidebarItems.find((i) => 'view' in i) as { view: string } | undefined)?.view ?? 'dashboard'

  const [currentView, setCurrentView] = useState(defaultView)
  const [drawerAgentId, setDrawerAgentId] = useState<string | null>(null)
  const [drawerTab, setDrawerTab] = useState('workflows')
  const [inboxAgentFilter, setInboxAgentFilter] = useState('All')
  const [inboxStatusFilter, setInboxStatusFilter] = useState('all')
  const [selectedInboxIdx, setSelectedInboxIdx] = useState(0)
  const [settingsTab, setSettingsTab] = useState('s-profile')
  const [openWorkflows, setOpenWorkflows] = useState<Record<string, boolean>>({})

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const inboxItems = INBOX_DATA[roleKey] ?? []
  const inboxAgents = INBOX_AGENTS[roleKey] ?? []

  const filteredInbox = inboxItems.filter((item) => {
    const agentMatch = inboxAgentFilter === 'All' || item.agent === inboxAgentFilter
    if (!agentMatch) return false
    if (inboxStatusFilter === 'all') return true
    if (inboxStatusFilter === 'pending') return item.status === 'pending'
    if (inboxStatusFilter === 'handled') return item.status === 'handled'
    if (inboxStatusFilter === 'review') return item.status === 'needs-review'
    return true
  })

  const drawerAgent = drawerAgentId ? AGENTS.find((a) => a.id === drawerAgentId) : null
  const drawerWf = drawerAgentId ? WORKFLOWS[drawerAgentId] : null

  function toggleWorkflow(key: string) {
    setOpenWorkflows((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ─── Sidebar ────────────────────────────────────────────────────────────────

  const sidebar = (
    <div className="sidebar">
      {sidebarItems.map((item, i) => {
        if ('section' in item) {
          return <div key={i} className="sidebar-section">{item.section}</div>
        }
        return (
          <div
            key={i}
            className={`nav-item ${currentView === item.view ? 'active' : ''}`}
            onClick={() => setCurrentView(item.view)}
          >
            <span className="nav-dot" />
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        )
      })}
    </div>
  )

  // ─── Topbar ─────────────────────────────────────────────────────────────────

  const topbar = (
    <div className="topbar">
      <div className="topbar-brand">ERP <span>Industrials</span> — AI Agent Portal</div>
      <div
        className="topbar-role"
        onClick={handleLogout}
        title="Sign out"
      >
        <div
          className="topbar-role-avatar"
          style={{ background: role.bg, color: role.color }}
        >
          {role.avatar}
        </div>
        <span>{role.name}</span>
        <span style={{ color: '#555', fontSize: 10 }}>▼</span>
      </div>
      <div className="topbar-notif">🔔<div className="notif-dot" /></div>
      <div className="topbar-logout" onClick={handleLogout}>Sign Out</div>
    </div>
  )

  // ─── Views ───────────────────────────────────────────────────────────────────

  const views: Record<string, React.ReactNode> = {
    dashboard: <DashboardView />,
    inbox: (
      <InboxView
        inboxItems={inboxItems}
        filteredInbox={filteredInbox}
        inboxAgents={inboxAgents}
        inboxAgentFilter={inboxAgentFilter}
        setInboxAgentFilter={setInboxAgentFilter}
        inboxStatusFilter={inboxStatusFilter}
        setInboxStatusFilter={setInboxStatusFilter}
        selectedInboxIdx={selectedInboxIdx}
        setSelectedInboxIdx={setSelectedInboxIdx}
        roleKey={roleKey}
      />
    ),
    agents: (
      <AgentsView
        onOpenAgent={(id) => {
          setDrawerAgentId(id)
          setDrawerTab('workflows')
          setOpenWorkflows({})
        }}
      />
    ),
    financial: <FinancialView />,
    rentroll: <RentRollView />,
    workorders: <WorkOrdersView />,
    leasing: <LeasingView />,
    fincontrols: <FinControlsView />,
    accounting: <AccountingView />,
    kb: <KnowledgeBaseView />,
    sops: <SOPsView />,
    settings: (
      <SettingsView
        role={role}
        userEmail={userEmail}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
      />
    ),
    lp: <StubView title="LP Directory" icon="👥" desc="Limited partner profiles, commitment tracking, and Salesforce sync" />,
    capitalcalls: <StubView title="Capital Calls" icon="💰" desc="Fund IV capital call management and LP funding status" />,
    acquisition: <AcquisitionView />,
    'mktg-lp': <StubView title="LP Marketing" icon="📣" desc="Investor newsletter drafts, fund deck management, and content library" />,
    'mktg-brokerage': <StubView title="Brokerage Marketing" icon="📣" desc="Property marketing materials, broker packages, and availability flyers" />,
    fundperf: <StubView title="Fund Performance" icon="📈" desc="Detailed fund-level IRR, cash-on-cash, and waterfall analysis" />,
    peopleops: <StubView title="People Ops" icon="👥" desc="Team directory, onboarding checklists, and HR policy Q&A" />,
    vendors: <StubView title="Vendor Contracts" icon="🔑" desc="Vendor master list, contract status, and COI tracking" />,
    docvault: <StubView title="Document Vault" icon="📁" desc="Centralized file store feeding all agent knowledge bases" />,
  }

  const activeView = views[currentView]

  // ─── Agent Drawer ────────────────────────────────────────────────────────────

  const agentDrawer = drawerAgent && (
    <>
      <div className="drawer-overlay open" onClick={() => setDrawerAgentId(null)} />
      <div className="agent-drawer open">
        <div className="drawer-header">
          <div className="drawer-header-icon">{drawerAgent.icon}</div>
          <div className="drawer-header-info">
            <h2>{drawerAgent.name}</h2>
            <p>{drawerAgent.desc}</p>
          </div>
          <span className={`badge ${drawerAgent.badge}`}>{drawerAgent.cat}</span>
          <div className="drawer-close" onClick={() => setDrawerAgentId(null)}>✕</div>
        </div>
        <div className="drawer-stats">
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerWf?.runs ?? drawerAgent.runs}</div><div className="drawer-stat-label">Runs (7d)</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerWf?.sent ?? '—'}</div><div className="drawer-stat-label">Auto-Sent (7d)</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerWf?.queue ?? '—'}</div><div className="drawer-stat-label">In Queue</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val" style={{ color: drawerAgent.status === 'active' ? '#3DAE7A' : '#888' }}>{drawerAgent.status === 'active' ? 'Active' : 'Idle'}</div><div className="drawer-stat-label">Status</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerAgent.auto}</div><div className="drawer-stat-label">Autonomy</div></div>
        </div>
        <div className="drawer-tabs">
          {(['workflows', 'activity', 'config'] as const).map((tab) => (
            <div
              key={tab}
              className={`drawer-tab ${drawerTab === tab ? 'active' : ''}`}
              onClick={() => setDrawerTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>
        <div className="drawer-body">
          {drawerTab === 'workflows' && (
            <div>
              {drawerWf ? drawerWf.wf.map((wf, wi) => {
                const key = `${drawerAgentId}-${wi}`
                const isOpen = openWorkflows[key]
                const triggerColors: Record<string, string> = {
                  email: '#0D1F35', schedule: '#1E1235', data: '#0A1F22', manual: '#251808', webhook: '#0D2218',
                }
                const triggerTextColors: Record<string, string> = {
                  email: '#5B9BD5', schedule: '#9B72E0', data: '#3EB5C4', manual: '#E08A3C', webhook: '#3DAE7A',
                }
                return (
                  <div key={wi} className="wf-card">
                    <div className="wf-header" onClick={() => toggleWorkflow(key)}>
                      <span
                        className="wf-trigger-chip"
                        style={{ background: triggerColors[wf.triggerType] ?? '#1A1E24', color: triggerTextColors[wf.triggerType] ?? '#888' }}
                      >
                        {wf.triggerType}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E6E1' }}>{wf.name}</div>
                        <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{wf.trigger} · {wf.freq}</div>
                      </div>
                      <span className={`badge ${wf.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9 }}>{wf.status}</span>
                      <span className="wf-expand-icon" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}>▼</span>
                    </div>
                    {isOpen && (
                      <div className="wf-body open">
                        <div className="wf-steps">
                          {wf.steps.map((step, si) => (
                            <div key={si} className="wf-step">
                              <div className={`wf-step-dot ${step.type}`} />
                              <div className="wf-step-content">
                                <div className={`wf-step-label ${step.type}`}>{step.label}</div>
                                <div className="wf-step-desc">{step.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="wf-meta">
                          <span>Trigger: {wf.meta.trigger}</span>
                          <span>Output: {wf.meta.output}</span>
                          <span>Escalates to: {wf.meta.escalate}</span>
                          <span>Last run: {wf.lastRun}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              }) : (
                <div style={{ color: '#666', fontSize: 13, padding: 16 }}>No workflow data for this agent.</div>
              )}
            </div>
          )}
          {drawerTab === 'activity' && (
            <div>
              {AGENT_ACTIVITY.map((item, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-dot" style={{ background: item.color }} />
                  <div className="activity-content">
                    <div className="activity-action">{item.action}</div>
                    <div className="activity-time">{item.time}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {drawerTab === 'config' && (
            <div>
              <div className="config-grid">
                <div className="config-item"><label>Escalation Contact</label><div className="config-val">{drawerAgent.escal}</div></div>
                <div className="config-item"><label>Autonomy Level</label><div className="config-val">{drawerAgent.auto}</div></div>
                <div className="config-item"><label>Knowledge Base</label><div className="config-val">{drawerAgent.kb}</div></div>
                <div className="config-item"><label>Total Runs (7d)</label><div className="config-val">{drawerAgent.runs}</div></div>
                <div className="config-item"><label>Last Active</label><div className="config-val">{drawerAgent.last}</div></div>
                <div className="config-item"><label>Category</label><div className="config-val">{drawerAgent.cat}</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )

  return (
    <div id="app" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {topbar}
      <div className="app-body">
        {sidebar}
        <div className={`main ${currentView === 'dashboard' ? '' : ''}`} style={currentView === 'dashboard' ? { padding: 0, overflow: 'hidden' } : {}}>
          {activeView ?? <StubView title={currentView} icon="📋" desc="This view is not yet available." />}
        </div>
      </div>
      {agentDrawer}
    </div>
  )
}

// ─── Dashboard / AI Command Center ────────────────────────────────────────────

function DashboardView() {
  return (
    <div className="ai-center">
      {/* Left Rail */}
      <div className="ai-agents-rail">
        <div className="ai-rail-header">
          <h4>Agents</h4>
          <span style={{ fontSize: 10, color: '#4b5563' }}>{AGENTS.length} agents</span>
        </div>
        <div className="ai-agents-list">
          {AGENTS.map((agent) => (
            <div key={agent.id} className={`ai-agent-row ${agent.status === 'active' ? 'running' : ''}`}>
              <div className={`ai-pulse ${agent.status === 'active' ? 'on' : 'idle'}`} />
              <div className="ai-agent-info">
                <div className="ai-agent-name">{agent.icon} {agent.name}</div>
                <div className="ai-agent-act">{'Not yet deployed'}</div>
              </div>
              <div className="ai-agent-runs">{agent.runs}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Center Feed */}
      <div className="ai-main">
        <div className="ai-feed-header">
          <h3>Live Activity</h3>
          <div className="ai-live-dot">Live</div>
        </div>
        <div className="ai-feed">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#4b5563' }}>
            <div style={{ fontSize: 32 }}>⚡</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No agent activity yet</div>
            <div style={{ fontSize: 12, color: '#4b5563', textAlign: 'center', maxWidth: 280 }}>Activity will appear here once agents are deployed and connected to your data sources</div>
          </div>
        </div>
        <div className="ai-cmd">
          <input className="ai-cmd-input" type="text" placeholder="Ask your agents anything — e.g. 'What did IR do today?' or 'Draft a summary for Meghan'" />
          <button className="ai-cmd-btn">↑</button>
        </div>
      </div>

      {/* Right Rail — Review Queue */}
      <div className="ai-queue">
        <div className="ai-queue-header">
          <h4>Review Queue</h4>
          <span className="ai-queue-count">0</span>
        </div>
        <div className="ai-queue-list">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 20, color: '#4b5563' }}>
            <div style={{ fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>Review queue is empty</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AiBubble({
  icon, agent, time, children, actions, isSystem,
}: {
  icon: string
  agent: string
  time: string
  children: React.ReactNode
  actions?: string[]
  isSystem?: boolean
}) {
  return (
    <div className={`ai-bubble ${isSystem ? 'system' : ''}`}>
      <div className="ai-bubble-icon" style={isSystem ? { background: '#0A0D14', fontSize: 11, color: '#555' } : {}}>{icon}</div>
      <div className="ai-bubble-body">
        <div className="ai-bubble-meta">
          <span className="ai-bubble-agent" style={isSystem ? { color: '#555' } : {}}>{agent}</span>
          <span className="ai-bubble-time">{time}</span>
        </div>
        <div className="ai-bubble-text" style={isSystem ? { color: '#666' } : {}}>{children}</div>
        {actions && actions.length > 0 && (
          <div className="ai-bubble-action">
            {actions.map((a, i) => (
              <button key={a} className={`btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 11, padding: '4px 12px' }}>{a}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QueueItem({
  priority, title, meta, actions,
}: {
  priority: 'urgent' | 'normal' | 'info'
  title: string
  meta: string
  actions: string[]
}) {
  return (
    <div className={`ai-queue-item ${priority}`}>
      <div className="ai-queue-title">{title}</div>
      <div className="ai-queue-meta">{meta}</div>
      <div className="ai-queue-btns">
        {actions.map((a, i) => (
          <button key={a} className={`btn ${i === 0 && priority !== 'info' ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 10, padding: '3px 10px' }}>{a}</button>
        ))}
      </div>
    </div>
  )
}

// ─── Inbox ────────────────────────────────────────────────────────────────────

function InboxView({
  inboxItems, filteredInbox, inboxAgents,
  inboxAgentFilter, setInboxAgentFilter,
  inboxStatusFilter, setInboxStatusFilter,
  selectedInboxIdx, setSelectedInboxIdx,
  roleKey,
}: {
  inboxItems: typeof INBOX_DATA[RoleKey]
  filteredInbox: typeof INBOX_DATA[RoleKey]
  inboxAgents: string[]
  inboxAgentFilter: string
  setInboxAgentFilter: (v: string) => void
  inboxStatusFilter: string
  setInboxStatusFilter: (v: string) => void
  selectedInboxIdx: number
  setSelectedInboxIdx: (v: number) => void
  roleKey: RoleKey
}) {
  if (inboxItems.length === 0) {
    return (
      <div>
        <div className="page-header"><h2>Inbox</h2><p>All agent communications</p></div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 200px)', color: '#666', fontSize: 14 }}>
          No inbox items for this role.
        </div>
      </div>
    )
  }

  const selected = filteredInbox[selectedInboxIdx]

  return (
    <div>
      <div className="page-header">
        <h2>Inbox</h2>
        <p>{inboxItems.length} agent communications</p>
      </div>
      <div className="inbox-wrap">
        <div className="inbox-left">
          <div className="inbox-filters">
            {inboxAgents.length > 0 && (
              <div>
                <div className="filter-label" style={{ marginBottom: 5 }}>Agent</div>
                <div className="pill-row">
                  {inboxAgents.map((a) => (
                    <div key={a} className={`pill ${inboxAgentFilter === a ? 'active' : ''}`} onClick={() => { setInboxAgentFilter(a); setSelectedInboxIdx(0) }}>{a}</div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="filter-label" style={{ marginBottom: 5 }}>Status</div>
              <div className="pill-row">
                {[['all', 'All'], ['pending', 'Pending'], ['handled', 'Handled'], ['review', 'Needs Review']].map(([val, label]) => (
                  <div key={val} className={`pill ${inboxStatusFilter === val ? 'active' : ''}`} onClick={() => { setInboxStatusFilter(val); setSelectedInboxIdx(0) }}>{label}</div>
                ))}
              </div>
            </div>
          </div>
          <div className="inbox-list">
            {filteredInbox.map((item, i) => (
              <div
                key={i}
                className={`inbox-item ${item.status} ${i === selectedInboxIdx ? 'active' : ''}`}
                onClick={() => setSelectedInboxIdx(i)}
              >
                <div className="inbox-item-header">
                  <div className="inbox-from">{item.from}</div>
                  <div className="inbox-time">{item.time}</div>
                </div>
                <div className="inbox-subject">{item.subject}</div>
                <div className={`inbox-agent-tag badge ${item.agentBadge}`}>{item.agent}</div>
              </div>
            ))}
            {filteredInbox.length === 0 && (
              <div style={{ padding: 20, color: '#555', fontSize: 12, textAlign: 'center' }}>No matching items</div>
            )}
          </div>
        </div>
        <div className="inbox-right">
          {selected ? (
            <>
              <div className="inbox-thread-header">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{selected.subject}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>{selected.from} · {selected.time}</div>
                </div>
                <span className={`badge ${selected.agentBadge}`}>{selected.agent}</span>
              </div>
              <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                <div style={{ background: '#0E1117', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #1E2433' }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>From: {selected.from}</div>
                  <div style={{ fontSize: 13, color: '#C8C6C1', lineHeight: 1.6 }}>
                    {getInboxThreadContent(selected.subject)}
                  </div>
                </div>
              </div>
              {selected.status !== 'handled' && (
                <div className="draft-panel">
                  <div className="draft-label">
                    <span className={`badge ${selected.agentBadge}`} style={{ fontSize: 10 }}>{selected.agent}</span>
                    AI Draft Ready — review before sending
                  </div>
                  <div className="draft-box">
                    {getInboxDraftContent(selected.subject, selected.from)}
                  </div>
                  <div className="draft-actions">
                    <button className="btn btn-primary">✓ Approve & Send</button>
                    <button className="btn btn-ghost">✎ Edit</button>
                    <button className="btn btn-ghost">↩ Reassign</button>
                    <button className="btn btn-ghost" style={{ color: '#E55A4E' }}>✕ Decline</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#555', fontSize: 13 }}>
              Select a message to view
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getInboxThreadContent(subject: string): string {
  if (subject.includes('Q1 Update') || subject.includes('Halverson')) {
    return "Hi team,\n\nWe're approaching end of Q1 and our investment committee is asking for an update on Fund IV performance. Could you send over the latest figures including IRR, cash-on-cash, and current occupancy?\n\nBest,\nJames"
  }
  if (subject.includes('past-due') || subject.includes('payment plan')) {
    return "Hello,\n\nWe've been having some cash flow challenges this quarter due to a delayed client payment. We'd like to discuss a structured payment plan for the outstanding balance of $16,400.\n\nThank you for your understanding."
  }
  if (subject.includes('Renewal') || subject.includes('renewal')) {
    return "Dear ERP Industrials Team,\n\nOur lease is coming up for renewal and we'd like to discuss terms for extending our occupancy. We've been happy with the space and hope we can work something out.\n\nBest regards"
  }
  if (subject.includes('HVAC') || subject.includes('maintenance')) {
    return "Hi,\n\nWe're experiencing issues with the HVAC system in Bay 3. The temperature has been inconsistent for the past two days and it's affecting our operations. Please advise on next steps.\n\nThanks"
  }
  return "Message content for this thread is available in the full system integration."
}

function getInboxDraftContent(subject: string, from: string): string {
  if (subject.includes('Q1 Update') || subject.includes('Halverson')) {
    return `Dear James,\n\nThank you for reaching out. I'm pleased to share Fund IV's Q1 2026 performance summary:\n\n• IRR (Projected): 14.2% — tracking ahead of our 13% target\n• Cash-on-Cash Return: 8.1% — distributed Q4 2025\n• Portfolio Occupancy: 93.4% across 6 properties\n• Capital Deployed: $48M of $65M target (74%)\n\nOn the acquisition front, we're advancing due diligence on a 185,000 SF distribution hub in Albuquerque, NM.\n\nBest,\nERP Industrials Investor Relations`
  }
  if (subject.includes('past-due') || subject.includes('payment plan')) {
    return `Dear ${from},\n\nThank you for reaching out. We understand business challenges can arise and want to work with you constructively.\n\nWe can offer a structured payment plan for your outstanding balance: 50% ($8,200) due within 7 days, with the remaining balance in equal installments over the following 30 days.\n\nPlease confirm you agree to these terms.\n\nBest regards,\nERP Industrials`
  }
  return `Dear ${from},\n\nThank you for your message. I've reviewed your inquiry and will follow up with a detailed response within one business day.\n\nBest regards,\nERP Industrials Team`
}

// ─── Agent Hub ────────────────────────────────────────────────────────────────

function AgentsView({ onOpenAgent }: { onOpenAgent: (id: string) => void }) {
  return (
    <div>
      <div className="page-header">
        <h2>Agent Hub</h2>
        <p>{AGENTS.length} agents — monitoring, drafting, and acting autonomously</p>
      </div>
      <div className="agent-grid">
        {AGENTS.map((agent) => (
          <div key={agent.id} className="agent-card" onClick={() => onOpenAgent(agent.id)}>
            <div className="agent-card-top">
              <div className={`agent-icon badge ${agent.badge}`}>{agent.icon}</div>
              <div className={`agent-status-dot ${agent.status}`} />
            </div>
            <div className="agent-name">{agent.name}</div>
            <div className="agent-desc">{agent.desc}</div>
            <div className="agent-meta">
              <span className={`badge ${agent.badge}`} style={{ fontSize: 9 }}>{agent.cat}</span>
              <div>
                <div className="agent-last">{agent.last}</div>
                <div className="agent-runs">{agent.runs !== '—' ? `${agent.runs} runs` : '—'}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Financial Dashboard ──────────────────────────────────────────────────────

function FinancialView() {
  return (
    <div>
      <div className="page-header">
        <h2>Investment Dashboard</h2>
        <p>Portfolio performance · Fund metrics · Acquisition pipeline</p>
      </div>
      <EmptyDataView source="Yardi · Salesforce" message="Investment dashboard data will appear here once connected to your data sources" />
    </div>
  )
}

// ─── Rent Roll ────────────────────────────────────────────────────────────────

function RentRollView() {
  return (
    <div>
      <div className="page-header"><h2>Rent Roll</h2><p>Agent-flagged exceptions from Yardi — past-due balances, expiring leases, and occupancy gaps</p></div>
      <SourceBar source="Yardi Voyager" agents="Leasing · Accounting Operations · Financial Controls" synced="Today 9:00 AM (every 30 min)" link="Open in Yardi ↗" />
      <EmptyDataView source="Yardi Voyager" message="Rent roll data will sync from Yardi once connected" />
    </div>
  )
}

// ─── Work Orders ──────────────────────────────────────────────────────────────

function WorkOrdersView() {
  return (
    <div>
      <div className="page-header"><h2>Work Orders</h2><p>Agent-monitored work order queue — SLA breaches, vendor dispatches, and cost tracking from Yardi</p></div>
      <SourceBar source="Yardi Maintenance" agents="Property Operations · Maintenance &amp; Vendor" synced="Today 9:31 AM (real-time)" link="Open in Yardi ↗" />
      <EmptyDataView source="Yardi Maintenance" message="Work orders will appear here once Yardi is connected" />
    </div>
  )
}

// ─── Leasing Pipeline ─────────────────────────────────────────────────────────

function LeasingView() {
  return (
    <div>
      <div className="page-header"><h2>Leasing Pipeline</h2><p>Agent-managed prospect tracking — outreach, proposals, and renewal status pulled from Salesforce and Yardi</p></div>
      <SourceBar source="Salesforce (prospects) · Yardi (lease data)" agents="Leasing · Property Operations · Brokerage" synced="Today 8:45 AM" link="Open in Salesforce ↗" />
      <EmptyDataView source="Salesforce · Yardi" message="Leasing pipeline data will sync from Salesforce and Yardi once connected" />
    </div>
  )
}

// ─── Financial Controls ────────────────────────────────────────────────────────

function FinControlsView() {
  return (
    <div>
      <div className="page-header"><h2>Financial Controls</h2><p>Agent-flagged items requiring Meghan's review — invoices above threshold, GL anomalies, and budget variances from Yardi</p></div>
      <SourceBar source="Yardi General Ledger" agents="Financial Controls (Meghan only)" synced="Today 7:00 AM (nightly + real-time flags)" link="Open in Yardi ↗" />
      <EmptyDataView source="Yardi General Ledger" message="Financial control flags will appear here — no pending items" />
    </div>
  )
}

// ─── Accounting ───────────────────────────────────────────────────────────────

function AccountingView() {
  return (
    <div>
      <div className="page-header"><h2>Accounting Operations</h2><p>Agent-surfaced AP queue, reconciliation status, and close checklist — all data lives in Yardi</p></div>
      <SourceBar source="Yardi Voyager (AP · AR · GL · Bank Rec)" agents="Accounting Operations · Financial Controls" synced="Today 8:00 AM (nightly batch)" link="Open in Yardi ↗" />
      <EmptyDataView source="Yardi Voyager" message="AP queue and close checklist will appear here once Yardi is connected" />
    </div>
  )
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

function KnowledgeBaseView() {
  return (
    <div>
      <div className="page-header"><h2>Knowledge Bases</h2><p>Processed and indexed versions of your documents — this is what agents actually read when they work</p></div>
      <SourceBar source="Document Vault · Yardi reports · Salesforce exports · OneDrive" agents="All 16 agents — each agent assigned to 1–2 KBs" synced="Platform: Supabase pgvector · Claude (Anthropic)" link="Browse Source Files" />
      <EmptyDataView source="Document Vault · OneDrive" message="Knowledge bases will appear here once documents are indexed" />
    </div>
  )
}

// ─── Acquisition Pipeline ─────────────────────────────────────────────────────

function AcquisitionView() {
  return (
    <div>
      <div className="page-header"><h2>Acquisition Pipeline</h2><p>Agent-curated deal flow — screened opportunities, underwriting status, and market comps from CoStar and broker feeds</p></div>
      <SourceBar source="CoStar · Broker feeds · Agent research" agents="Acquisition Research · Investment Analytics · CIO & Chief of Staff" synced="Today 6:00 AM (daily scan)" link="Open in Salesforce ↗" />
      <EmptyDataView source="CoStar · Salesforce" message="Acquisition pipeline data will appear here once connected" />
    </div>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsView({
  role, userEmail, settingsTab, setSettingsTab,
}: {
  role: Role
  userEmail: string
  settingsTab: string
  setSettingsTab: (tab: string) => void
}) {
  return (
    <div>
      <div className="page-header"><h2>Settings</h2><p>Manage your profile, team access, agent configuration, and integrations</p></div>
      <div className="settings-wrap">
        <div className="settings-nav">
          {[['s-profile', '👤 Profile'], ['s-team', '👥 Team & Roles'], ['s-agents', '🤖 Agents'], ['s-connections', '🔗 Connections'], ['s-notifications', '🔔 Notifications']].map(([key, label]) => (
            <div key={key} className={`settings-nav-item ${settingsTab === key ? 'active' : ''}`} onClick={() => setSettingsTab(key)}>{label}</div>
          ))}
        </div>
        <div className="settings-content">
          {settingsTab === 's-profile' && (
            <div>
              <div className="overview-panel">
                <h4>Profile Overview</h4>
                <div className="overview-stats">
                  <div className="ov-stat">
                    <div className="ov-stat-val" style={{ fontSize: 16, marginTop: 2 }}>{role.name}</div>
                    <div className="ov-stat-label">{role.title}</div>
                    <div style={{ marginTop: 6 }}><span className="badge badge-gold">{role.access}</span></div>
                  </div>
                  <div className="ov-divider" />
                  <div className="ov-stat"><div className="ov-stat-val">Today</div><div className="ov-stat-label">Last Login</div><div className="ov-stat-sub" style={{ color: '#3DAE7A' }}>Active session</div></div>
                  <div className="ov-divider" />
                  <div className="ov-stat"><div className="ov-stat-val">{AGENTS.length}</div><div className="ov-stat-label">Agents Accessible</div><div className="ov-stat-sub" style={{ color: '#888' }}>{role.sidebar === 'all' ? 'All portals' : 'Role-filtered'}</div></div>
                </div>
              </div>
              <div className="settings-section">
                <h3>My Profile</h3>
                <p>Update your name, contact info, and authentication preferences</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: role.bg, color: role.color, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{role.avatar}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{role.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{role.title}</div>
                    <div style={{ marginTop: 6 }}><span className={`badge`} style={{ background: role.bg, color: role.color, border: `1px solid ${role.color}44` }}>{role.access}</span></div>
                  </div>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Change Photo</button>
                </div>
                <div className="field-group">
                  <div className="field"><label>Display Name</label><input defaultValue={role.name} /></div>
                  <div className="field"><label>Job Title</label><input defaultValue={role.title} /></div>
                  <div className="field"><label>Email</label><input defaultValue={userEmail} readOnly /></div>
                  <div className="field"><label>Timezone</label><select><option>America/Chicago (CST)</option><option>America/Denver (MST)</option><option>America/New_York (EST)</option></select></div>
                </div>
                <button className="btn btn-primary">Save Changes</button>
              </div>
              <div className="divider" />
              <div className="settings-section">
                <h3>Preferences</h3>
                {[
                  { label: 'Weekly Agent Digest', sub: 'Receive a Sunday evening summary of all agent activity', on: true },
                  { label: 'Show Agent Draft Confidence', sub: 'Display AI confidence score alongside each draft', on: false },
                  { label: 'Auto-collapse Handled Emails', sub: 'Automatically minimize emails marked as handled in inbox', on: true },
                ].map((pref) => (
                  <div key={pref.label} className="toggle-row">
                    <div className="toggle-label"><h4>{pref.label}</h4><p>{pref.sub}</p></div>
                    <div className={`toggle ${pref.on ? 'on' : ''}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {settingsTab === 's-agents' && (
            <div>
              <div className="settings-section">
                <h3>Agent Configuration</h3>
                <p>Manage autonomy levels and escalation rules for each agent</p>
              </div>
              {AGENTS.map((agent) => (
                <div key={agent.id} className="agent-config-row">
                  <div className="agent-config-header">
                    <span className={`badge ${agent.badge}`}>{agent.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#E8E6E1', flex: 1 }}>{agent.name}</span>
                    <span className={`badge ${agent.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9 }}>{agent.status}</span>
                    <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>Autonomy: {agent.auto}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {settingsTab === 's-connections' && (
            <div>
              <div className="settings-section">
                <h3>Connected Systems</h3>
                <p>Integration status for all data sources used by agents</p>
              </div>
              <div className="conn-grid">
                {[
                  { icon: '🏢', name: 'Yardi Voyager', status: 'connected', meta: 'Rent roll, GL, work orders, AP/AR — primary property management system', sync: 'Synced every 30 min' },
                  { icon: '📊', name: 'Salesforce', status: 'connected', meta: 'LP profiles, fund pipeline, leasing prospects, and email logs', sync: 'Synced every 15 min' },
                  { icon: '📁', name: 'OneDrive', status: 'connected', meta: 'Document vault source — fund docs, leases, vendor contracts, and reports', sync: 'Real-time via webhook' },
                  { icon: '✍️', name: 'DocuSign', status: 'connected', meta: 'Lease execution, capital call notices, and K-1 delivery workflows', sync: 'Webhook connected' },
                  { icon: '🎤', name: 'Fathom', status: 'connected', meta: 'Meeting transcripts for executive assistant and CIO follow-up workflows', sync: 'Webhook connected' },
                  { icon: '📅', name: 'Microsoft 365', status: 'connected', meta: 'Calendar triggers for meeting prep and email send/receive for all agents', sync: 'Real-time via Graph API' },
                ].map((conn) => (
                  <div key={conn.name} className="conn-card">
                    <div className="conn-header">
                      <div className="conn-icon">{conn.icon}</div>
                      <div>
                        <div className="conn-name">{conn.name}</div>
                        <div className={`conn-status ${conn.status}`}>{conn.status === 'connected' ? '● Connected' : '○ Disconnected'}</div>
                      </div>
                    </div>
                    <div className="conn-meta">{conn.meta}</div>
                    <div className="conn-footer">
                      <span className="sync-badge">{conn.sync}</span>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>Configure</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {settingsTab === 's-team' && (
            <div>
              <div className="settings-section">
                <h3>Team & Roles</h3>
                <p>Manage portal access and role assignments for your team</p>
              </div>
              <div className="team-table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Access Level</th><th>Sidebar</th></tr></thead>
                  <tbody>
                    {Object.entries(ROLES).map(([key, r]) => (
                      <tr key={key}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 28, height: 28, borderRadius: '50%', background: r.bg, color: r.color, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.avatar}</div><span style={{ fontWeight: 600, color: '#E8E6E1' }}>{r.name}</span></div></td>
                        <td style={{ color: '#888' }}>{r.title}</td>
                        <td style={{ color: '#666' }}>{r.email}</td>
                        <td><span className="badge" style={{ background: r.bg, color: r.color, border: `1px solid ${r.color}44` }}>{r.access}</span></td>
                        <td style={{ color: '#666', textTransform: 'capitalize' }}>{r.sidebar}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {settingsTab === 's-notifications' && (
            <div>
              <div className="settings-section">
                <h3>Notification Preferences</h3>
                <p>Configure when and how agents notify you of activity</p>
              </div>
              {[
                { event: 'Invoice approval required', sub: 'Financial Controls flags an invoice above threshold', email: true, sms: true, push: true },
                { event: 'Draft ready for review', sub: 'Any agent queues a communication for your approval', email: true, sms: false, push: true },
                { event: 'SLA breach detected', sub: 'A work order exceeds its SLA deadline', email: true, sms: true, push: true },
                { event: 'New LP inquiry', sub: 'Investor Relations receives a new investor email', email: true, sms: false, push: false },
                { event: 'Capital call funded', sub: 'LP wires received for an active capital call', email: true, sms: false, push: true },
                { event: 'Weekly agent digest', sub: 'Sunday summary of all agent activity', email: true, sms: false, push: false },
              ].map((row) => (
                <div key={row.event} className="toggle-row">
                  <div className="toggle-label"><h4>{row.event}</h4><p>{row.sub}</p></div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {[['Email', row.email], ['SMS', row.sms], ['Push', row.push]].map(([label, on]) => (
                      <div key={String(label)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 10, color: '#555' }}>{label}</div>
                        <div className={`toggle ${on ? 'on' : ''}`} style={{ width: 32, height: 18 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SOPs ─────────────────────────────────────────────────────────────────────

const SOP_CATEGORIES = [
  { icon: '💰', label: 'Finance & Accounting', desc: 'AP/AR workflows, month-end close, invoice approval thresholds, GL coding standards' },
  { icon: '🏢', label: 'Property Operations', desc: 'Work order dispatch, vendor onboarding, COI requirements, emergency escalation protocols' },
  { icon: '🔑', label: 'Leasing', desc: 'Prospect intake, showing process, proposal guidelines, renewal playbook, lease execution checklist' },
  { icon: '👥', label: 'Investor Relations', desc: 'LP communication standards, quarterly report cadence, capital call procedures, fund update templates' },
  { icon: '🏭', label: 'Acquisitions', desc: 'Deal screening criteria, underwriting process, due diligence checklist, IC memo format' },
  { icon: '👤', label: 'People & HR', desc: 'Onboarding checklist, benefits enrollment, expense reimbursement, PTO policy' },
  { icon: '🤖', label: 'AI Agent Protocols', desc: 'Agent escalation rules, approval thresholds, autonomy guidelines, output review standards' },
  { icon: '🔐', label: 'Compliance & Controls', desc: 'Financial controls policy, data access rules, audit trail requirements, document retention' },
]

function SOPsView() {
  return (
    <div>
      <div className="page-header">
        <h2>Standard Operating Procedures</h2>
        <p>Company-wide SOPs — accessible by agents and team members</p>
      </div>
      <div style={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>📌</span>
        <span style={{ fontSize: 12, color: '#9ca3af' }}>SOPs stored here are indexed into agent knowledge bases. Keeping them current ensures agents follow the latest procedures.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {SOP_CATEGORIES.map((cat) => (
          <div
            key={cat.label}
            className="card"
            style={{ margin: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                {cat.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb' }}>{cat.label}</div>
              </div>
              <span style={{ fontSize: 11, color: '#4b5563', background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: '2px 8px' }}>
                0 docs
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{cat.desc}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>+ Add SOP</button>
              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px', color: '#4b5563' }}>Browse</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EmptyDataView({ source, message }: { source: string; message: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 280px)', gap: 14 }}>
      <div style={{ fontSize: 36 }}>📭</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>No data yet</div>
      <div style={{ fontSize: 12, color: '#4b5563', textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>{message}</div>
      <div style={{ fontSize: 11, color: '#374151', background: '#1f2937', border: '1px solid #374151', borderRadius: 8, padding: '6px 16px', marginTop: 4 }}>
        Source: {source}
      </div>
    </div>
  )
}

function SourceBar({ source, agents, synced, link }: { source: string; agents: string; synced: string; link: string }) {
  return (
    <div className="source-bar">
      <div className="source-bar-left">
        <div className="source-chip"><div className="source-chip-dot" style={{ background: '#E8A020' }} /><span className="source-chip-label">Source of record:</span><span className="source-chip-val">{source}</span></div>
        <div className="source-chip"><div className="source-chip-dot" style={{ background: '#3DAE7A' }} /><span className="source-chip-label">Agents reading this:</span><span className="source-chip-val">{agents}</span></div>
        <div className="source-chip"><span className="source-chip-label">Last synced:</span><span className="source-chip-val">{synced}</span></div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="source-readonly">Read-only here</span>
        <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 11, color: '#5B9BD5', textDecoration: 'none', border: '1px solid #1A3050', borderRadius: 6, padding: '3px 10px' }}>{link}</a>
      </div>
    </div>
  )
}

function StubView({ title, icon, desc }: { title: string; icon: string; desc: string }) {
  return (
    <div>
      <div className="page-header"><h2>{icon} {title}</h2><p>{desc}</p></div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 220px)', gap: 16 }}>
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#666', maxWidth: 400, textAlign: 'center' }}>{desc}</div>
        <div style={{ fontSize: 11, color: '#555', background: '#131820', border: '1px solid #1E2433', borderRadius: 8, padding: '8px 16px', marginTop: 8 }}>
          Phase 2 — data integration coming soon
        </div>
      </div>
    </div>
  )
}
