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
          <span style={{ fontSize: 10, color: '#3DAE7A' }}>16 active</span>
        </div>
        <div className="ai-agents-list">
          {AGENTS.map((agent) => (
            <div key={agent.id} className={`ai-agent-row ${agent.status === 'active' ? 'running' : ''}`}>
              <div className={`ai-pulse ${agent.status === 'active' ? 'on' : 'idle'}`} />
              <div className="ai-agent-info">
                <div className="ai-agent-name">{agent.icon} {agent.name}</div>
                <div className="ai-agent-act">{ACTIVITY_MAP[agent.id] ?? 'Idle'}</div>
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
          <AiBubble icon="🔭" agent="LP Market Intelligence" time="9:31 AM">
            Monitored 14 LP portals overnight. Flagged 3 investor updates from Blackstone, TIAA, and NexPoint. Summaries added to LP Directory — no action needed.
          </AiBubble>
          <AiBubble icon="📧" agent="Investor Relations" time="9:14 AM" actions={['Review Draft', 'View Thread']}>
            Received Q1 update request from James Halverson (Halverson Family Office). Drafted response using Fund IV Q1 data. Queued for Meghan review before send.
          </AiBubble>
          <AiBubble icon="🔐" agent="Financial Controls" time="7:15 AM" actions={['Approve', 'Reject', 'View Invoice']}>
            Flagged vendor invoice for approval: Gulf States HVAC $18,400 — exceeds $15k auto-approve threshold. GL code verified, COI on file. Awaiting your sign-off.
          </AiBubble>
          <AiBubble icon="🏗️" agent="COO Operations" time="7:15 AM">
            Morning ops briefing sent to Brennan. 2 work orders dispatched: roof drain at Laredo (P2) and dock leveler at El Paso East (P1). COI renewal request sent to Tucson roofing co. — expires in 18 days.
          </AiBubble>
          <AiBubble icon="🔑" agent="Leasing" time="8:45 AM" actions={['View Proposal']}>
            Renewal proposal drafted for Laredo Industrial Park — Tenant: Southwest Freight (28,000 SF). 3-year term at market +2.1%. Ready for Hannah to review.
          </AiBubble>
          <AiBubble icon="⚙️" agent="System" time="6:00 AM" isSystem>
            Morning sweep complete. All 16 agents ran scheduled tasks. LP Market Intelligence processed 168 data points. No critical escalations overnight.
          </AiBubble>
          <AiBubble icon="💰" agent="Capital Raising" time="Yesterday 4:22 PM" actions={['Review Draft']}>
            Follow-up draft ready for LP Summit Capital — last contact was 47 days ago. Re-engagement email personalized with Fund IV Q1 highlights. Queued for review.
          </AiBubble>
          <AiBubble icon="🔎" agent="Acquisition Research" time="Yesterday 2:00 PM" actions={['Open Memo']}>
            Deal memo complete — Albuquerque distribution hub (185,000 SF). Estimated cap rate 6.4%, asking $31M. Comparable sales analysis and market absorption included. Added to Acquisition Pipeline.
          </AiBubble>
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
          <span className="ai-queue-count">7</span>
        </div>
        <div className="ai-queue-list">
          <QueueItem priority="urgent" title="Invoice Approval — HVAC $18,400" meta="Financial Controls · 7:15 AM" actions={['Approve', 'Reject']} />
          <QueueItem priority="urgent" title="Capital Call — Fund III LP 23" meta="Capital Raising · 2h ago · $485k notice" actions={['Review']} />
          <QueueItem priority="normal" title="IR Draft — Halverson Q1 Reply" meta="IR Agent · 9:14 AM" actions={['Send', 'Edit']} />
          <QueueItem priority="normal" title="LP Re-engage — LP Summit Capital" meta="Capital Raising · Yesterday 4:22 PM" actions={['Review']} />
          <QueueItem priority="normal" title="Lease Renewal — Southwest Freight" meta="Leasing · 8:45 AM · 28,000 SF" actions={['Review']} />
          <QueueItem priority="info" title="Deal Memo — Albuquerque Hub" meta="Acq. Research · Yesterday · 185k SF" actions={['Open']} />
          <QueueItem priority="info" title="Re-engagement — Meridian Family Office" meta="IR Agent · Yesterday" actions={['Review']} />
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
                <div className="agent-runs">{agent.runs} runs</div>
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
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">AUM</div><div className="kpi-val">$284M</div><div className="kpi-sub up">↑ 12% YoY</div></div>
        <div className="kpi"><div className="kpi-label">LPs</div><div className="kpi-val">147</div><div className="kpi-sub up">+8 this quarter</div></div>
        <div className="kpi"><div className="kpi-label">T12 NOI</div><div className="kpi-val">$21.6M</div><div className="kpi-sub up">↑ 8.4%</div></div>
        <div className="kpi"><div className="kpi-label">Fund IV Raised</div><div className="kpi-val">$48M</div><div className="kpi-sub" style={{ color: '#C9A84C' }}>of $120M target</div></div>
        <div className="kpi"><div className="kpi-label">Occupancy</div><div className="kpi-val">93.4%</div><div className="kpi-sub up">↑ 1.2pp QoQ</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">Net Operating Income — Quarterly <span>$M</span></div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', marginBottom: 10 }}>
            <div className="fin-chart-bars">
              <div className="fin-bar-group">
                {[48, 52, 50, 55].map((h, i) => <div key={i} className="fin-bar" style={{ height: h, background: '#2A3050' }} />)}
              </div>
              <div style={{ width: 8 }} />
              <div className="fin-bar-group">
                {[54, 58, 56, 62].map((h, i) => <div key={i} className="fin-bar" style={{ height: h, background: '#3A4570' }} />)}
              </div>
              <div style={{ width: 8 }} />
              <div className="fin-bar-group">
                <div className="fin-bar" style={{ height: 65, background: '#C9A84C' }} />
                <div className="fin-bar" style={{ height: 70, background: '#C9A84C88' }} />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>Q1 2026 NOI</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 2 }}>$6.5M</div>
              <div style={{ fontSize: 11, color: '#3DAE7A' }}>↑ 20.4% vs Q1 2025</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[['2024 Full Year', '$20.5M'], ['2025 Full Year', '$23.0M']].map(([l, v]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#888' }}>{l}</span><span style={{ color: '#C8C6C1' }}>{v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: '#C9A84C' }}>2026 YTD</span><span style={{ color: '#C9A84C' }}>$6.5M</span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 10, color: '#555', marginTop: 4 }}>
            {[['#2A3050', '2024'], ['#3A4570', '2025'], ['#C9A84C', '2026 YTD']].map(([c, l]) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, background: c, borderRadius: 2 }} />{l}
              </span>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Fund IV — Capital Raise Progress <span>Target $120M</span></div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: '#888' }}>Committed Capital</span>
              <span style={{ color: '#C9A84C', fontWeight: 600 }}>$48M / $120M</span>
            </div>
            <div style={{ height: 10, background: '#1E2433', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: '40%', height: '100%', background: 'linear-gradient(90deg,#C9A84C,#D4B85C)', borderRadius: 5 }} />
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 5 }}>40% of target · 7 months remaining</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'LP Commitments', sub: '23 investors · Avg $2.1M', val: '$48M', badge: 'badge-gold' },
              { label: 'Soft Circles', sub: '8 investors in diligence', val: '$22M', badge: 'badge-purple' },
              { label: 'Pipeline (Engaged)', sub: '14 prospects active', val: '$35M est.', badge: 'badge-gray' },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#0E1117', borderRadius: 7 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#E8E6E1' }}>{row.label}</div>
                  <div style={{ fontSize: 10, color: '#666' }}>{row.sub}</div>
                </div>
                <span className={`badge ${row.badge}`}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title">Fund Performance Summary</div>
          <table>
            <thead><tr><th>Fund</th><th>Vintage</th><th>Size</th><th>Net IRR</th><th>CoC</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td><strong>Fund I</strong></td><td style={{ color: '#666' }}>2016</td><td>$42M</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>18.4%</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>2.1x</td><td><span className="badge badge-gray">Realized</span></td></tr>
              <tr><td><strong>Fund II</strong></td><td style={{ color: '#666' }}>2018</td><td>$68M</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>16.2%</td><td style={{ color: '#C9A84C', fontWeight: 600 }}>1.8x</td><td><span className="badge badge-blue">Harvesting</span></td></tr>
              <tr><td><strong>Fund III</strong></td><td style={{ color: '#666' }}>2021</td><td>$96M</td><td style={{ color: '#C9A84C', fontWeight: 600 }}>14.1%</td><td style={{ color: '#C9A84C', fontWeight: 600 }}>1.4x</td><td><span className="badge badge-green">Active</span></td></tr>
              <tr><td><strong>Fund IV</strong></td><td style={{ color: '#666' }}>2025</td><td>$120M*</td><td style={{ color: '#555', fontWeight: 600 }}>—</td><td style={{ color: '#555', fontWeight: 600 }}>—</td><td><span className="badge badge-gold">Raising</span></td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#555', marginTop: 10 }}>* Target size · IRR and CoC as of Q1 2026 · Unaudited</div>
        </div>
        <div className="card">
          <div className="card-title">Acquisition Pipeline <span>5 active deals · $163M</span></div>
          <div style={{ marginBottom: 14 }}>
            {[
              { stage: 'Screening', pct: '100%', color: '#2A3050', val: '$74M' },
              { stage: 'LOI / Diligence', pct: '58%', color: '#3A4570', val: '$43M' },
              { stage: 'Under Contract', pct: '31%', color: '#C9A84C', val: '$31M' },
              { stage: 'Closing', pct: '20%', color: '#3DAE7A', val: '$15M' },
            ].map((row) => (
              <div key={row.stage} className="pipeline-stage">
                <div style={{ fontSize: 11, color: '#C8C6C1', width: 90 }}>{row.stage}</div>
                <div className="stage-bar-wrap"><div className="stage-bar" style={{ width: row.pct, background: row.color }} /></div>
                <div style={{ fontSize: 11, color: '#888', width: 40, textAlign: 'right' }}>{row.val}</div>
              </div>
            ))}
          </div>
          {[
            { name: 'Albuquerque Dist. Hub — 185k SF', badge: 'badge-purple', label: 'LOI' },
            { name: 'El Paso Logistics — 120k SF', badge: 'badge-gold', label: 'Diligence' },
            { name: 'San Antonio Cold Storage — 80k SF', badge: 'badge-blue', label: 'Contract' },
            { name: 'Midland Industrial Park — 95k SF', badge: 'badge-gray', label: 'Screening' },
            { name: 'Laredo Freeport B — 140k SF', badge: 'badge-green', label: 'Closing' },
          ].map((deal) => (
            <div key={deal.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, padding: '6px 8px', background: '#0E1117', borderRadius: 6, marginBottom: 4 }}>
              <span style={{ color: '#C8C6C1' }}>{deal.name}</span>
              <span className={`badge ${deal.badge}`} style={{ fontSize: 9 }}>{deal.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Rent Roll ────────────────────────────────────────────────────────────────

function RentRollView() {
  return (
    <div>
      <div className="page-header"><h2>Rent Roll</h2><p>Agent-flagged exceptions from Yardi — past-due balances, expiring leases, and occupancy gaps</p></div>
      <SourceBar source="Yardi Voyager" agents="Leasing · Accounting Operations · Financial Controls" synced="Today 9:00 AM (every 30 min)" link="Open in Yardi ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Monthly Rent Roll</div><div className="kpi-val">$1.82M</div><div className="kpi-sub up">↑ 3.1% YoY</div></div>
        <div className="kpi"><div className="kpi-label">SF Leased</div><div className="kpi-val">1.38M</div><div className="kpi-sub" style={{ color: '#888' }}>of 1.48M total</div></div>
        <div className="kpi"><div className="kpi-label">Occupancy</div><div className="kpi-val">93.4%</div><div className="kpi-sub up">↑ 1.2pp YoY</div></div>
        <div className="kpi"><div className="kpi-label">Expiring &lt;90d</div><div className="kpi-val">3</div><div className="kpi-sub down">Renewal drafts ready</div></div>
        <div className="kpi"><div className="kpi-label">Past Due Balance</div><div className="kpi-val">$24.8K</div><div className="kpi-sub down">2 tenants</div></div>
      </div>
      <div className="card">
        <div className="card-title">Active Leases</div>
        <table>
          <thead><tr><th>Tenant</th><th>Property / Suite</th><th>SF</th><th>Lease Start</th><th>Lease End</th><th>Mo. Rent</th><th>$/SF</th><th>Balance</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>Lone Star Logistics</td><td>Laredo Ind. Pk. / Suite A</td><td>85,000</td><td>Jan 2023</td><td>Dec 2027</td><td>$68,000</td><td>$0.80</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-green">Current</span></td></tr>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>SunBelt Dist. Co.</td><td>Laredo Ind. Pk. / Suite B</td><td>62,000</td><td>Mar 2022</td><td>Feb 2025</td><td>$46,500</td><td>$0.75</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-orange" style={{ fontSize: 9 }}>Exp. Soon</span></td></tr>
            <tr style={{ background: '#1A0D0D' }}><td style={{ fontWeight: 600, color: '#fff' }}>TechAssembly SW</td><td>Denver South Flex / Bay 3</td><td>28,000</td><td>Jun 2021</td><td>May 2026</td><td>$26,600</td><td>$0.95</td><td style={{ color: '#E55A4E' }}>$8,400</td><td><span className="badge badge-red">Past Due</span></td></tr>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>Rocky Mtn. Cold Chain</td><td>Denver South Flex / Bay 1-2</td><td>55,000</td><td>Sep 2023</td><td>Aug 2028</td><td>$57,750</td><td>$1.05</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-green">Current</span></td></tr>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>Southwest Medical Dist.</td><td>Tucson Commerce Ctr / Unit 1</td><td>42,000</td><td>Apr 2024</td><td>Mar 2029</td><td>$44,100</td><td>$1.05</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-green">Current</span></td></tr>
            <tr style={{ background: '#1A0D0D' }}><td style={{ fontWeight: 600, color: '#fff' }}>Desert Freight Inc.</td><td>Tucson Commerce Ctr / Unit 2</td><td>38,000</td><td>Jan 2020</td><td>Dec 2024</td><td>$30,400</td><td>$0.80</td><td style={{ color: '#E55A4E' }}>$16,400</td><td><span className="badge badge-red">Past Due</span></td></tr>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>Rio Grande Mfg.</td><td>San Antonio Gateway / Bldg A</td><td>110,000</td><td>Jul 2022</td><td>Jun 2027</td><td>$99,000</td><td>$0.90</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-green">Current</span></td></tr>
            <tr><td style={{ fontWeight: 600, color: '#fff' }}>Mesa Verde Logistics</td><td>Albuquerque Dist. Hub / Main</td><td>95,000</td><td>Oct 2023</td><td>Sep 2028</td><td>$85,500</td><td>$0.90</td><td style={{ color: '#3DAE7A' }}>$0</td><td><span className="badge badge-green">Current</span></td></tr>
            <tr style={{ borderTop: '2px solid #2A3450' }}><td style={{ fontWeight: 700, color: '#fff' }} colSpan={2}>TOTALS</td><td style={{ fontWeight: 700, color: '#fff' }}>515,000 SF</td><td /><td /><td style={{ fontWeight: 700, color: '#fff' }}>$457,850</td><td style={{ fontWeight: 700, color: '#fff' }}>$0.89</td><td style={{ fontWeight: 700, color: '#E55A4E' }}>$24,800</td><td /></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Work Orders ──────────────────────────────────────────────────────────────

function WorkOrdersView() {
  return (
    <div>
      <div className="page-header"><h2>Work Orders</h2><p>Agent-monitored work order queue — SLA breaches, vendor dispatches, and cost tracking from Yardi</p></div>
      <SourceBar source="Yardi Maintenance" agents="Property Operations · Maintenance &amp; Vendor" synced="Today 9:31 AM (real-time)" link="Open in Yardi ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Open</div><div className="kpi-val">7</div><div className="kpi-sub down">2 P1 critical</div></div>
        <div className="kpi"><div className="kpi-label">In Progress</div><div className="kpi-val">4</div><div className="kpi-sub" style={{ color: '#888' }}>Vendor on-site</div></div>
        <div className="kpi"><div className="kpi-label">Resolved (MTD)</div><div className="kpi-val">23</div><div className="kpi-sub up">Avg 3.2h close</div></div>
        <div className="kpi"><div className="kpi-label">SLA Breaches</div><div className="kpi-val">1</div><div className="kpi-sub down">Denver HVAC P1</div></div>
        <div className="kpi"><div className="kpi-label">Cost MTD</div><div className="kpi-val">$14.8K</div><div className="kpi-sub" style={{ color: '#888' }}>of $22K budget</div></div>
      </div>
      <div className="card">
        <div className="card-title">Active Work Orders</div>
        <table>
          <thead><tr><th>WO #</th><th>Property</th><th>Issue</th><th>Priority</th><th>Vendor</th><th>Created</th><th>SLA</th><th>Status</th></tr></thead>
          <tbody>
            <tr style={{ background: '#1A0D0D' }}><td style={{ fontWeight: 600 }}>WO-0048</td><td>Denver South Flex</td><td>HVAC compressor failure — Bay 1</td><td><span className="badge badge-red">P1</span></td><td>CoolAir HVAC</td><td>Today 6:00 AM</td><td><span style={{ color: '#E55A4E', fontWeight: 600 }}>SLA BREACH</span></td><td><span className="badge badge-orange">In Progress</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0047</td><td>Laredo Ind. Pk.</td><td>Loading dock door — Suite B</td><td><span className="badge badge-red">P1</span></td><td>Southwest Door</td><td>Today 7:30 AM</td><td><span style={{ color: '#C9A84C' }}>2h left</span></td><td><span className="badge badge-orange">In Progress</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0046</td><td>Tucson Commerce Ctr</td><td>Roof leak — Unit 2 NE corner</td><td><span className="badge badge-orange">P2</span></td><td>Desert Roofing</td><td>Yesterday</td><td><span style={{ color: '#3DAE7A' }}>18h left</span></td><td><span className="badge badge-blue">Dispatched</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0045</td><td>San Antonio Gateway</td><td>Exterior lighting — Parking lot C</td><td><span className="badge badge-orange">P2</span></td><td>Texas Electrical</td><td>Apr 27</td><td><span style={{ color: '#3DAE7A' }}>8h left</span></td><td><span className="badge badge-orange">In Progress</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0044</td><td>Albuquerque Dist. Hub</td><td>Plumbing — restroom leak Bay 3</td><td><span className="badge badge-gray">P3</span></td><td>ABQ Plumbing</td><td>Apr 26</td><td><span style={{ color: '#3DAE7A' }}>40h left</span></td><td><span className="badge badge-blue">Dispatched</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0043</td><td>Denver South Flex</td><td>Parking lot pothole repair</td><td><span className="badge badge-gray">P3</span></td><td>Mile High Paving</td><td>Apr 25</td><td><span style={{ color: '#3DAE7A' }}>28h left</span></td><td><span className="badge badge-gray">Open</span></td></tr>
            <tr><td style={{ fontWeight: 600 }}>WO-0041</td><td>Laredo Ind. Pk.</td><td>Fire suppression system — quarterly test</td><td><span className="badge badge-gray">P3</span></td><td>FireGuard TX</td><td>Apr 24</td><td><span style={{ color: '#3DAE7A' }}>52h left</span></td><td><span className="badge badge-gray">Scheduled</span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Leasing Pipeline ─────────────────────────────────────────────────────────

function LeasingView() {
  return (
    <div>
      <div className="page-header"><h2>Leasing Pipeline</h2><p>Agent-managed prospect tracking — outreach, proposals, and renewal status pulled from Salesforce and Yardi</p></div>
      <SourceBar source="Salesforce (prospects) · Yardi (lease data)" agents="Leasing · Property Operations · Brokerage" synced="Today 8:45 AM" link="Open in Salesforce ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Active Prospects</div><div className="kpi-val">6</div><div className="kpi-sub up">2 in final stage</div></div>
        <div className="kpi"><div className="kpi-label">Total SF in Play</div><div className="kpi-val">248K</div><div className="kpi-sub" style={{ color: '#888' }}>Across 4 properties</div></div>
        <div className="kpi"><div className="kpi-label">Proposals Out</div><div className="kpi-val">3</div><div className="kpi-sub" style={{ color: '#888' }}>Awaiting response</div></div>
        <div className="kpi"><div className="kpi-label">Renewals In Progress</div><div className="kpi-val">2</div><div className="kpi-sub down">Exp. within 90d</div></div>
        <div className="kpi"><div className="kpi-label">Projected New Revenue</div><div className="kpi-val">$28K/mo</div><div className="kpi-sub up">If all close</div></div>
      </div>
      <div className="card">
        <div className="card-title">Active Deals</div>
        <table>
          <thead><tr><th>Prospect / Tenant</th><th>Property</th><th>SF</th><th>Type</th><th>Stage</th><th>Agent Last Action</th><th>Next Step</th></tr></thead>
          <tbody>
            <tr style={{ background: '#0D2218' }}><td><div style={{ fontWeight: 600, color: '#fff' }}>Apex Cold Storage</div><div style={{ fontSize: 11, color: '#888' }}>New prospect</div></td><td>Denver South Flex</td><td>22,000</td><td>New Lease</td><td><span className="badge badge-green">Proposal Sent</span></td><td>Tour completed Apr 27</td><td>Follow-up May 1</td></tr>
            <tr style={{ background: '#0D2218' }}><td><div style={{ fontWeight: 600, color: '#fff' }}>SunBelt Dist. Co.</div><div style={{ fontSize: 11, color: '#888' }}>Renewal</div></td><td>Laredo Ind. Pk.</td><td>62,000</td><td>Renewal</td><td><span className="badge badge-green">Negotiating</span></td><td>Renewal proposal sent Apr 25</td><td>Counter expected May 3</td></tr>
            <tr><td><div style={{ fontWeight: 600, color: '#fff' }}>NM Pharma Logistics</div><div style={{ fontSize: 11, color: '#888' }}>New prospect</div></td><td>Albuquerque Dist. Hub</td><td>45,000</td><td>New Lease</td><td><span className="badge badge-blue">Proposal Sent</span></td><td>Availability sent Apr 22</td><td>Tour scheduled May 2</td></tr>
            <tr><td><div style={{ fontWeight: 600, color: '#fff' }}>Borderlands Freight</div><div style={{ fontSize: 11, color: '#888' }}>New prospect</div></td><td>Laredo Ind. Pk.</td><td>30,000</td><td>New Lease</td><td><span className="badge badge-blue">Touring</span></td><td>Inquiry received Apr 20</td><td>Follow-up Apr 30</td></tr>
            <tr><td><div style={{ fontWeight: 600, color: '#fff' }}>Desert Freight Inc.</div><div style={{ fontSize: 11, color: '#888' }}>Renewal — past due</div></td><td>Tucson Commerce Ctr</td><td>38,000</td><td>Renewal</td><td><span className="badge badge-red">At Risk</span></td><td>Renewal notice sent Mar 1</td><td>Meghan call this week</td></tr>
            <tr><td><div style={{ fontWeight: 600, color: '#fff' }}>TX Industrial Supply</div><div style={{ fontSize: 11, color: '#888' }}>New prospect</div></td><td>San Antonio Gateway</td><td>55,000</td><td>New Lease</td><td><span className="badge badge-gray">Early Stage</span></td><td>Inquiry Apr 18</td><td>Proposal by May 3</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Financial Controls ────────────────────────────────────────────────────────

function FinControlsView() {
  return (
    <div>
      <div className="page-header"><h2>Financial Controls</h2><p>Agent-flagged items requiring Meghan's review — invoices above threshold, GL anomalies, and budget variances from Yardi</p></div>
      <SourceBar source="Yardi General Ledger" agents="Financial Controls (Meghan only)" synced="Today 7:00 AM (nightly + real-time flags)" link="Open in Yardi ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Pending Approvals</div><div className="kpi-val">4</div><div className="kpi-sub down">Oldest: 2 days</div></div>
        <div className="kpi"><div className="kpi-label">Flagged Anomalies</div><div className="kpi-val">2</div><div className="kpi-sub down">GL review needed</div></div>
        <div className="kpi"><div className="kpi-label">Invoices Processed (MTD)</div><div className="kpi-val">47</div><div className="kpi-sub up">$214K total</div></div>
        <div className="kpi"><div className="kpi-label">Auto-Approved</div><div className="kpi-val">39</div><div className="kpi-sub up">83% auto rate</div></div>
        <div className="kpi"><div className="kpi-label">Budget Variance</div><div className="kpi-val">+2.4%</div><div className="kpi-sub down">Denver over budget</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title">Pending Invoice Approvals</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { vendor: 'CoolAir HVAC Services', amount: '$18,400', sub: 'Denver South Flex · HVAC compressor replacement · Invoice #2024-881', border: '#E55A4E' },
              { vendor: 'FireGuard TX', amount: '$12,200', sub: 'Laredo Ind. Pk. · Annual fire suppression inspection + repairs · Invoice #FG-4421', border: '#C9A84C' },
              { vendor: 'Desert Roofing Co.', amount: '$10,800', sub: 'Tucson Commerce Ctr · Emergency roof repair · Invoice #DR-2026-112', border: '#1E2433' },
            ].map((inv) => (
              <div key={inv.vendor} style={{ background: '#0E1117', border: '1px solid #1E2433', borderRadius: 8, padding: 12, borderLeft: `3px solid ${inv.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#fff' }}>{inv.vendor}</span>
                  <span style={{ fontWeight: 700, color: '#E08A3C', fontSize: 15 }}>{inv.amount}</span>
                </div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>{inv.sub}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}>Approve</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>Request Info</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px', color: '#E55A4E' }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-title">GL Anomalies Flagged</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#0E1117', border: '1px solid #2A1010', borderRadius: 8, padding: 12, borderLeft: '3px solid #E55A4E' }}>
              <div style={{ fontWeight: 600, color: '#fff', marginBottom: 3 }}>Duplicate entry suspected — GL #5210</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Two entries of $4,200 on Apr 27 — same vendor, same cost center (Denver maintenance)</div>
              <div style={{ fontSize: 10, color: '#E55A4E' }}>Posted by: Yardi sync · Flag confidence: 94%</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}>Void Duplicate</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>It&apos;s Correct</button>
              </div>
            </div>
            <div style={{ background: '#0E1117', border: '1px solid #1E2433', borderRadius: 8, padding: 12, borderLeft: '3px solid #C9A84C' }}>
              <div style={{ fontWeight: 600, color: '#fff', marginBottom: 3 }}>Unusual amount — GL #7310 (Repairs)</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>$18,400 entry is 4.2x the 12-month average for this cost center.</div>
              <div style={{ fontSize: 10, color: '#C9A84C' }}>Flag confidence: 72% · Likely valid if HVAC invoice approved</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '3px 10px' }}>Confirm Valid</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>Investigate</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Accounting ───────────────────────────────────────────────────────────────

function AccountingView() {
  return (
    <div>
      <div className="page-header"><h2>Accounting Operations</h2><p>Agent-surfaced AP queue, reconciliation status, and close checklist — all data lives in Yardi</p></div>
      <SourceBar source="Yardi Voyager (AP · AR · GL · Bank Rec)" agents="Accounting Operations · Financial Controls" synced="Today 8:00 AM (nightly batch)" link="Open in Yardi ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">AP Due This Week</div><div className="kpi-val">$94.2K</div><div className="kpi-sub down">8 invoices</div></div>
        <div className="kpi"><div className="kpi-label">AR Past Due</div><div className="kpi-val">$24.8K</div><div className="kpi-sub down">2 tenants</div></div>
        <div className="kpi"><div className="kpi-label">Bank Rec. Status</div><div className="kpi-val">Apr ✓</div><div className="kpi-sub up">Reconciled Apr 2</div></div>
        <div className="kpi"><div className="kpi-label">Yardi Errors (MTD)</div><div className="kpi-val">3</div><div className="kpi-sub" style={{ color: '#888' }}>All resolved</div></div>
        <div className="kpi"><div className="kpi-label">Close Progress</div><div className="kpi-val">April</div><div className="kpi-sub" style={{ color: '#888' }}>Opens May 1</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="card-title">Accounts Payable Queue</div>
          <table>
            <thead><tr><th>Vendor</th><th>Amount</th><th>Due</th><th>Property</th><th>Status</th></tr></thead>
            <tbody>
              <tr><td>CoolAir HVAC</td><td>$18,400</td><td>May 5</td><td>Denver</td><td><span className="badge badge-red">Pending Approval</span></td></tr>
              <tr><td>FireGuard TX</td><td>$12,200</td><td>May 5</td><td>Laredo</td><td><span className="badge badge-red">Pending Approval</span></td></tr>
              <tr><td>Mile High Paving</td><td>$6,800</td><td>May 3</td><td>Denver</td><td><span className="badge badge-orange">Approved — Scheduled</span></td></tr>
              <tr><td>Texas Electrical</td><td>$3,400</td><td>May 1</td><td>San Antonio</td><td><span className="badge badge-green">Paid</span></td></tr>
              <tr><td>Southwest Door</td><td>$2,100</td><td>Apr 30</td><td>Laredo</td><td><span className="badge badge-green">Paid</span></td></tr>
              <tr><td>ABQ Plumbing</td><td>$1,820</td><td>Apr 29</td><td>Albuquerque</td><td><span className="badge badge-orange">Processing</span></td></tr>
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title">Monthly Close Checklist — April 2026</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { done: true, text: 'Rent roll verified — all payments posted' },
              { done: true, text: 'Bank reconciliation complete' },
              { done: true, text: 'AP processed — 42 invoices' },
              { done: null, text: '2 invoices pending Meghan approval', color: '#E08A3C' },
              { done: null, text: 'GL anomaly review pending Michele', color: '#E08A3C' },
              { done: false, text: 'Property NOI reports — scheduled May 3' },
              { done: false, text: 'Fund-level financials to Meghan — May 5' },
              { done: false, text: 'K-1 prep — May 15 deadline' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: item.done === true ? '#0D2218' : item.done === null ? '#251808' : '#1A1E24', borderRadius: 7, border: item.done === null ? '1px solid #3A2510' : 'none' }}>
                <span style={{ fontSize: 14, color: item.done === true ? '#3DAE7A' : item.done === null ? '#E08A3C' : '#555' }}>
                  {item.done === true ? '✓' : item.done === null ? '⏳' : '○'}
                </span>
                <span style={{ fontSize: 12, color: item.done === true ? '#3DAE7A' : item.done === null ? '#E08A3C' : '#666' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

function KnowledgeBaseView() {
  return (
    <div>
      <div className="page-header"><h2>Knowledge Bases</h2><p>Processed and indexed versions of your documents — this is what agents actually read when they work</p></div>
      <SourceBar source="Document Vault · Yardi reports · Salesforce exports · OneDrive" agents="All 16 agents — each agent assigned to 1–2 KBs" synced="Platform: Supabase pgvector · Claude (Anthropic)" link="Browse Source Files" />
      <div className="kpi-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div className="kpi"><div className="kpi-label">Total KBs</div><div className="kpi-val">8</div><div className="kpi-sub" style={{ color: '#888' }}>All agents covered</div></div>
        <div className="kpi"><div className="kpi-label">Documents Indexed</div><div className="kpi-val">261</div><div className="kpi-sub up">of 284 in vault</div></div>
        <div className="kpi"><div className="kpi-label">Avg Retrieval Score</div><div className="kpi-val">94%</div><div className="kpi-sub up">Agent accuracy</div></div>
        <div className="kpi"><div className="kpi-label">Pending Ingestion</div><div className="kpi-val">23</div><div className="kpi-sub" style={{ color: '#888' }}>Queued for indexing</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { title: '📚 IR & Capital KB', agents: ['badge-gold', 'IR Agent', 'badge-purple', 'Capital Raising', 'badge-gold', 'LP Intel'], docs: 42, desc: 'Used by agents to draft LP communications, understand fund terms, match LP profiles, and generate performance narratives', items: ['Fund I–IV PPMs & Term Sheets', 'Quarterly LP Reports (2023–2026)', 'Fund IV Investor Deck — Q1 2026', 'LP FAQ Scripts & Objection Handlers', 'Approved Email Tone & Brand Guidelines'] },
          { title: '🏭 Acquisition & Analytics KB', agents: ['badge-teal', 'Acq. Research', 'badge-blue', 'Inv. Analytics'], docs: 38, desc: 'Deal criteria, underwriting models, market comps, and investment thesis documents', items: ['ERP Investment Criteria & Deal Checklist', 'Underwriting Model Templates (XLSX)', 'Target Market Analysis — TX / CO / AZ / NM', 'Deal Memos — Active Pipeline (5 deals)', 'Comparable Cap Rate Database (CoStar export)'] },
          { title: '🔑 Leasing KB', agents: ['badge-teal', 'Leasing Agent'], docs: 54, desc: 'All lease documents, market comps, showing scripts, and renewal playbooks for the Leasing Agent', items: ['All Executed Leases & Amendments (8 active)', 'Property Floor Plans & Available Space Specs', 'Market Rent Comps — TX / CO / AZ / NM Q1 2026', 'Prospect Inquiry & Showing Scripts', 'Renewal Playbook & Negotiation Guidelines'] },
          { title: '🔧 Operations KB', agents: ['badge-green', 'Prop. Ops', 'badge-teal', 'COO Ops'], docs: 47, desc: 'Vendor contracts, COIs, SLA rules, escalation protocols, and property-specific maintenance guides', items: ['Vendor Master List & Approved Contractors', 'Vendor COIs & Insurance Certificates', 'SLA Rules by Priority Level (P1/P2/P3)', 'Property Emergency Contacts & Access Codes', 'Maintenance Vendor MSAs (12 contracts)'] },
        ].map((kb) => (
          <div key={kb.title} className="card" style={{ margin: 0 }}>
            <div className="card-title">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {kb.title}
                {kb.agents.reduce((acc: React.ReactNode[], a, i) => {
                  if (i % 2 === 0) {
                    acc.push(<span key={i} className={`badge ${a}`} style={{ fontSize: 9 }}>{kb.agents[i + 1]}</span>)
                  }
                  return acc
                }, [])}
              </span>
              <span style={{ fontSize: 11, color: '#666' }}>{kb.docs} docs</span>
            </div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 10 }}>{kb.desc}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {kb.items.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < kb.items.length - 1 ? '1px solid #141A24' : 'none' }}>
                  <span style={{ fontSize: 13 }}>📄</span>
                  <span style={{ fontSize: 11, color: '#C8C6C1', flex: 1 }}>{item}</span>
                  <span className="badge badge-green" style={{ fontSize: 9 }}>Indexed</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Acquisition Pipeline ─────────────────────────────────────────────────────

function AcquisitionView() {
  return (
    <div>
      <div className="page-header"><h2>Acquisition Pipeline</h2><p>Agent-curated deal flow — screened opportunities, underwriting status, and market comps from CoStar and broker feeds</p></div>
      <SourceBar source="CoStar · Broker feeds · Agent research" agents="Acquisition Research · Investment Analytics · CIO & Chief of Staff" synced="Today 6:00 AM (daily scan)" link="Open in Salesforce ↗" />
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Active Deals</div><div className="kpi-val">5</div><div className="kpi-sub" style={{ color: '#888' }}>Across 4 markets</div></div>
        <div className="kpi"><div className="kpi-label">Total Pipeline Value</div><div className="kpi-val">$163M</div><div className="kpi-sub up">5 deals · 620K SF</div></div>
        <div className="kpi"><div className="kpi-label">Under Contract</div><div className="kpi-val">$46M</div><div className="kpi-sub up">2 deals advancing</div></div>
        <div className="kpi"><div className="kpi-label">Avg Target Cap Rate</div><div className="kpi-val">6.3%</div><div className="kpi-sub up">vs 6.0% hurdle</div></div>
        <div className="kpi"><div className="kpi-label">Deals Screened (MTD)</div><div className="kpi-val">28</div><div className="kpi-sub" style={{ color: '#888' }}>5 passed criteria</div></div>
      </div>
      <div className="card">
        <div className="card-title">Active Deal Log</div>
        <table>
          <thead><tr><th>Property</th><th>Market</th><th>SF</th><th>Ask Price</th><th>Cap Rate</th><th>Score</th><th>Stage</th><th>Assigned</th></tr></thead>
          <tbody>
            <tr style={{ background: '#0D2218' }}><td><strong style={{ color: '#fff' }}>Albuquerque Dist. Hub</strong></td><td>Albuquerque, NM</td><td>185,000</td><td>$31M</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>6.4%</td><td><span style={{ color: '#3DAE7A', fontWeight: 700 }}>78</span></td><td><span className="badge badge-purple">LOI</span></td><td><span className="badge badge-blue">Inv. Analytics</span></td></tr>
            <tr><td><strong style={{ color: '#fff' }}>El Paso Logistics Park</strong></td><td>El Paso, TX</td><td>120,000</td><td>$19M</td><td style={{ color: '#C9A84C', fontWeight: 600 }}>6.1%</td><td><span style={{ color: '#C9A84C', fontWeight: 700 }}>71</span></td><td><span className="badge badge-gold">Diligence</span></td><td><span className="badge badge-blue">Inv. Analytics</span></td></tr>
            <tr><td><strong style={{ color: '#fff' }}>San Antonio Cold Storage</strong></td><td>San Antonio, TX</td><td>80,000</td><td>$15M</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>6.8%</td><td><span style={{ color: '#3DAE7A', fontWeight: 700 }}>82</span></td><td><span className="badge badge-blue">Contract</span></td><td><span className="badge badge-gold">CIO / CoS</span></td></tr>
            <tr><td><strong style={{ color: '#fff' }}>Midland Industrial Park</strong></td><td>Midland, TX</td><td>95,000</td><td>$11M</td><td style={{ color: '#888', fontWeight: 600 }}>5.9%</td><td><span style={{ color: '#C8C6C1', fontWeight: 700 }}>58</span></td><td><span className="badge badge-gray">Screening</span></td><td><span className="badge badge-teal">Acq. Research</span></td></tr>
            <tr><td><strong style={{ color: '#fff' }}>Laredo Freeport B</strong></td><td>Laredo, TX</td><td>140,000</td><td>$32M</td><td style={{ color: '#3DAE7A', fontWeight: 600 }}>6.6%</td><td><span style={{ color: '#3DAE7A', fontWeight: 700 }}>74</span></td><td><span className="badge badge-green">Closing</span></td><td><span className="badge badge-gold">CIO / CoS</span></td></tr>
          </tbody>
        </table>
      </div>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
