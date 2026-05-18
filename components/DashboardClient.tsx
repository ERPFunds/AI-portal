'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { ROLES, type RoleKey, type Role } from '@/lib/data/roles'
import { SIDEBARS, type SidebarItem } from '@/lib/data/sidebars'
import { AGENTS, ACTIVITY_MAP } from '@/lib/data/agents'
import { INBOX_DATA, INBOX_AGENTS } from '@/lib/data/inbox'
import { WORKFLOWS, AGENT_ACTIVITY } from '@/lib/data/workflows'
import { NEWSLETTER_PROMPTS, MARKET_DATA_SOURCES, type NewsletterPrompt, type MarketDataSource } from '@/lib/data/prompts'
import MarketResearchView from './MarketResearchView'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  roleKey: RoleKey
  userEmail: string
  userName: string
}

// ─── Workflow Edit Form ───────────────────────────────────────────────────────

function WfEditForm({ wf, onSave, onCancel }: { wf: any; onSave: (v: any) => void; onCancel: () => void }) {
  const [name, setName] = useState(wf.name)
  const [trigger, setTrigger] = useState(wf.trigger)
  const [freq, setFreq] = useState(wf.frequency ?? wf.freq ?? '')
  const [status, setStatus] = useState(wf.status)
  const [steps, setSteps] = useState<any[]>(wf.steps.map((s: any) => ({ ...s })))
  const [metaTrigger, setMetaTrigger] = useState(wf.meta?.trigger ?? '')
  const [metaOutput, setMetaOutput] = useState(wf.meta?.output ?? '')
  const [metaEscalate, setMetaEscalate] = useState(wf.meta?.escalate ?? '')

  const inputStyle = { width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#111827', outline: 'none', fontFamily: 'inherit' }
  const labelStyle = { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '.5px', display: 'block', marginBottom: 3 }
  const sectionStyle = { marginBottom: 14 }

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
      <div style={sectionStyle}>
        <label style={labelStyle}>Workflow name</label>
        <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Trigger type</label>
          <select style={inputStyle} value={trigger} onChange={e => setTrigger(e.target.value)}>
            {['email', 'schedule', 'data', 'manual', 'webhook'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={status} onChange={e => setStatus(e.target.value)}>
            <option value="idle">idle</option>
            <option value="active">active</option>
          </select>
        </div>
      </div>
      <div style={sectionStyle}>
        <label style={labelStyle}>Frequency</label>
        <input style={inputStyle} value={freq} onChange={e => setFreq(e.target.value)} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>Steps</label>
          <button
            onClick={() => setSteps([...steps, { type: 'automated', label: 'New Step', description: '' }])}
            style={{ fontSize: 10, color: '#0e7490', background: 'none', border: '1px solid #A6C3C9', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
          >+ Add step</button>
        </div>
        {steps.map((step, si) => (
          <div key={si} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '10px 12px', marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 6 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select style={inputStyle} value={step.type} onChange={e => { const s = [...steps]; s[si] = { ...s[si], type: e.target.value }; setSteps(s) }}>
                  {['trigger', 'action', 'condition', 'output'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Label</label>
                <input style={inputStyle} value={step.label} onChange={e => { const s = [...steps]; s[si] = { ...s[si], label: e.target.value }; setSteps(s) }} />
              </div>
              <button
                onClick={() => setSteps(steps.filter((_, i) => i !== si))}
                style={{ alignSelf: 'flex-end', background: 'none', border: 'none', color: '#E55A4E', cursor: 'pointer', fontSize: 14, padding: '4px 6px' }}
              >✕</button>
            </div>
            <div>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: 52, lineHeight: 1.5 }}
                value={step.description ?? step.desc ?? ''}
                onChange={e => { const s = [...steps]; s[si] = { ...s[si], description: e.target.value }; setSteps(s) }}
              />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Meta — trigger</label>
        <input style={{ ...inputStyle, marginBottom: 6 }} value={metaTrigger} onChange={e => setMetaTrigger(e.target.value)} />
        <label style={labelStyle}>Meta — output</label>
        <input style={{ ...inputStyle, marginBottom: 6 }} value={metaOutput} onChange={e => setMetaOutput(e.target.value)} />
        <label style={labelStyle}>Escalates to</label>
        <input style={inputStyle} value={metaEscalate} onChange={e => setMetaEscalate(e.target.value)} />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => onSave({ name, trigger, frequency: freq, status, steps, meta: { trigger: metaTrigger, output: metaOutput, escalate: metaEscalate } })}>
          Save workflow
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DashboardClient({ roleKey, userEmail, userName }: Props) {
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
  const [editingWf, setEditingWf] = useState<string | null>(null)
  const [wfOverrides, setWfOverrides] = useState<Record<string, any>>(() => {
    try { return JSON.parse(localStorage.getItem('wf-overrides') || '{}') } catch { return {} }
  })

  // Shared agent config — used by both drawer and Settings > Agents tab
  const [agentConfig, setAgentConfig] = useState<Record<string, {
    auto: string; escal: string; active: boolean; kb: string; notes: string
  }>>(() =>
    Object.fromEntries(AGENTS.map((a) => [a.id, {
      auto: a.auto, escal: a.escal, active: a.status === 'active', kb: a.kb, notes: '',
    }]))
  )

  // ── Live agent run stats ─────────────────────────────────────────────────────
  const [agentStats, setAgentStats] = useState<Record<string, { runs: number; last: string | null }>>({})
  const [recentRuns, setRecentRuns] = useState<any[]>([])

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/dashboard/stats')
        if (!res.ok) return
        const data = await res.json()
        setAgentStats(data.agentStats ?? {})
        setRecentRuns(data.recentRuns ?? [])
      } catch { /* ignore */ }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 60_000)
    return () => clearInterval(interval)
  }, [])

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
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            <span className="nav-dot" />
          </div>
        )
      })}
    </div>
  )

  // ─── Topbar ─────────────────────────────────────────────────────────────────

  const topbar = (
    <div className="topbar">
      <div className="topbar-brand">ERP <span>AI Agent Portal</span></div>
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
        <span>{userName}</span>
        <span style={{ color: '#9ca3af', fontSize: 10 }}>▼</span>
      </div>
      <div
        className="topbar-notif"
        title="Notifications"
        onClick={() => { setCurrentView('settings'); setSettingsTab('s-notifications') }}
        style={{ cursor: 'pointer' }}
      >🔔<div className="notif-dot" /></div>
      <div className="topbar-logout" onClick={handleLogout}>Sign Out</div>
    </div>
  )

  // ─── Views ───────────────────────────────────────────────────────────────────

  const views: Record<string, React.ReactNode> = {
    dashboard: <DashboardView roleKey={roleKey} userName={userName} recentRuns={recentRuns} />,
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
        statsMap={agentStats}
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
    'market-research': <MarketResearchView />,
    settings: (
      <SettingsView
        role={role}
        userEmail={userEmail}
        settingsTab={settingsTab}
        setSettingsTab={setSettingsTab}
        agentConfig={agentConfig}
        setAgentConfig={setAgentConfig}
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
    requests: <RequestsView roleKey={roleKey} roleName={role.name} roleTitle={role.title} />,
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
          <div className="drawer-stat"><div className="drawer-stat-val">{agentStats[drawerAgent.id]?.runs ?? drawerWf?.runs ?? '—'}</div><div className="drawer-stat-label">Runs (7d)</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerWf?.sent ?? '—'}</div><div className="drawer-stat-label">Auto-Sent (7d)</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val">{drawerWf?.queue ?? '—'}</div><div className="drawer-stat-label">In Queue</div></div>
          <div className="drawer-stat"><div className="drawer-stat-val" style={{ color: drawerAgent.status === 'active' ? '#3DAE7A' : '#9ca3af' }}>{drawerAgent.status === 'active' ? 'Active' : 'Idle'}</div><div className="drawer-stat-label">Status</div></div>
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
              {drawerWf ? drawerWf.wf.map((baseWf, wi) => {
                const key = `${drawerAgentId}-${wi}`
                const wf = { ...baseWf, ...(wfOverrides[key] || {}), steps: (wfOverrides[key]?.steps || baseWf.steps) }
                const isOpen = openWorkflows[key]
                const isEditing = editingWf === key
                const triggerColors: Record<string, string> = {
                  email: '#eff6ff', schedule: '#faf5ff', data: '#f0f9fa', manual: '#fff7ed', webhook: '#f0fdf4',
                }
                const triggerTextColors: Record<string, string> = {
                  email: '#1d4ed8', schedule: '#7c3aed', data: '#0e7490', manual: '#c2410c', webhook: '#15803d',
                }
                const triggerBorderColors: Record<string, string> = {
                  email: '#bfdbfe', schedule: '#ddd6fe', data: '#a5f3fc', manual: '#fed7aa', webhook: '#bbf7d0',
                }

                function saveWfEdit(updated: any) {
                  const next = { ...wfOverrides, [key]: updated }
                  setWfOverrides(next)
                  try { localStorage.setItem('wf-overrides', JSON.stringify(next)) } catch {}
                  setEditingWf(null)
                }

                return (
                  <div key={wi} className="wf-card">
                    <div className="wf-header" onClick={() => { if (!isEditing) toggleWorkflow(key) }}>
                      <span
                        className="wf-trigger-chip"
                        style={{ background: triggerColors[wf.trigger] ?? '#f3f4f6', color: triggerTextColors[wf.trigger] ?? '#6b7280', border: `1px solid ${triggerBorderColors[wf.trigger] ?? '#e5e7eb'}` }}
                      >
                        {wf.trigger}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{wf.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{wf.trigger}{wf.frequency ? ` · ${wf.frequency}` : ''}</div>
                      </div>
                      <span className={`badge ${wf.status === 'active' ? 'badge-green' : 'badge-gray'}`} style={{ fontSize: 9 }}>{wf.status}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditingWf(isEditing ? null : key); if (!isOpen) toggleWorkflow(key) }}
                        style={{ background: isEditing ? '#f0f9fa' : 'transparent', border: `1px solid ${isEditing ? '#A6C3C9' : '#e5e7eb'}`, borderRadius: 5, padding: '2px 8px', fontSize: 10, color: isEditing ? '#0e7490' : '#9ca3af', cursor: 'pointer', marginLeft: 6 }}
                      >
                        {isEditing ? 'cancel' : 'edit'}
                      </button>
                      <span className="wf-expand-icon" style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}>▼</span>
                    </div>
                    {isOpen && !isEditing && (
                      <div className="wf-body open">
                        <div className="wf-steps">
                          {wf.steps.map((step: any, si: number) => (
                            <div key={si} className="wf-step">
                              <div className={`wf-step-dot ${step.type}`} />
                              <div className="wf-step-content">
                                <div className={`wf-step-label ${step.type}`}>{step.label}</div>
                                <div className="wf-step-desc">{step.description ?? step.desc}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(wf.meta || wf.triggerSenders || wf.lastRun) && (
                          <div className="wf-meta">
                            {wf.triggerSenders && <span>Senders: {wf.triggerSenders.join(', ')}</span>}
                            {wf.meta?.trigger && <span>Trigger: {wf.meta.trigger}</span>}
                            {wf.meta?.output && <span>Output: {wf.meta.output}</span>}
                            {wf.meta?.escalate && <span>Escalates to: {wf.meta.escalate}</span>}
                            {wf.lastRun && <span>Last run: {wf.lastRun}</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {isOpen && isEditing && (
                      <WfEditForm wf={wf} onSave={saveWfEdit} onCancel={() => setEditingWf(null)} />
                    )}
                  </div>
                )
              }) : (
                <div style={{ color: '#9ca3af', fontSize: 13, padding: 16 }}>No workflow data for this agent.</div>
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
          {drawerTab === 'config' && drawerAgentId && (
            <AgentConfigTab
              agentId={drawerAgentId}
              drawerAgent={drawerAgent}
              agentConfig={agentConfig}
              setAgentConfig={setAgentConfig}
            />
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

// ─── Agent Config Tab (sub-component to comply with Rules of Hooks) ──────────

function AgentConfigTab({
  agentId,
  drawerAgent,
  agentConfig,
  setAgentConfig,
}: {
  agentId: string
  drawerAgent: (typeof import('@/lib/data/agents').AGENTS)[number]
  agentConfig: Record<string, { auto: string; escal: string; active: boolean; kb: string; notes: string }>
  setAgentConfig: React.Dispatch<React.SetStateAction<Record<string, { auto: string; escal: string; active: boolean; kb: string; notes: string }>>>
}) {
  const [localSaved, setLocalSaved] = useState(false)
  const cfg = agentConfig[agentId]

  function save() { setLocalSaved(true); setTimeout(() => setLocalSaved(false), 2000) }
  function update(field: string, val: string | boolean) {
    setAgentConfig((prev) => ({ ...prev, [agentId]: { ...prev[agentId], [field]: val } }))
  }

  if (!cfg) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Active toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>Agent Status</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Enable or disable this agent</div>
        </div>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
          onClick={() => update('active', !cfg.active)}
        >
          <span style={{ fontSize: 11, fontWeight: 600, color: cfg.active ? '#15803d' : '#9ca3af' }}>
            {cfg.active ? 'Active' : 'Inactive'}
          </span>
          <div className={`toggle ${cfg.active ? 'on' : ''}`} style={{ width: 36, height: 20 }} />
        </div>
      </div>

      {/* Autonomy */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Autonomy Level</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['High', 'Medium', 'Low'] as const).map((level) => (
            <button
              key={level}
              onClick={() => update('auto', level)}
              style={{
                flex: 1, padding: '6px 0', fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: 'pointer',
                border: cfg.auto === level ? '2px solid #A6C3C9' : '1px solid #e5e7eb',
                background: cfg.auto === level ? '#f0f9fa' : '#ffffff',
                color: cfg.auto === level ? '#0e7490' : '#6b7280',
              }}
            >{level}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6, lineHeight: 1.4 }}>
          {cfg.auto === 'High' ? 'Agent acts and sends autonomously within defined rules' :
           cfg.auto === 'Medium' ? 'Agent drafts and queues; some actions require approval' :
           'Agent drafts everything; all outputs require human review before sending'}
        </div>
      </div>

      {/* Escalation contact */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Escalation Contact</label>
        <select
          value={cfg.escal}
          onChange={(e) => update('escal', e.target.value)}
          style={{ width: '100%', fontSize: 12, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#111827' }}
        >
          {['Meghan', 'William', 'Brennan', 'Michele', 'Liz', 'Hannah', 'Sylvia', 'Pippi', 'Kasandra'].map((n) => <option key={n}>{n}</option>)}
        </select>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>Receives escalations when agent hits an approval gate or encounters an error</div>
      </div>

      {/* Knowledge Base */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Knowledge Base</label>
        <select
          value={cfg.kb}
          onChange={(e) => update('kb', e.target.value)}
          style={{ width: '100%', fontSize: 12, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#111827' }}
        >
          {['Capital KB', 'Investor Relations KB', 'Finance & Controls KB', 'Acquisition KB', 'Analytics KB', 'Strategy KB', 'Executive KB', 'Marketing KB', 'Fund Admin KB', 'Leasing KB', 'Operations KB', 'People Ops KB', 'Accounting KB'].map((kb) => <option key={kb}>{kb}</option>)}
        </select>
      </div>

      {/* Notes / custom instructions */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Custom Instructions</label>
        <textarea
          value={cfg.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="Add any custom instructions, constraints, or context for this agent…"
          rows={4}
          style={{ width: '100%', fontSize: 12, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#111827', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
        />
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>These instructions are included in this agent's system prompt</div>
      </div>

      {/* Read-only metadata */}
      <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div className="config-item"><label>Category</label><div className="config-val">{drawerAgent.cat}</div></div>
          <div className="config-item"><label>Total Runs (7d)</label><div className="config-val">{drawerAgent.runs}</div></div>
          <div className="config-item"><label>Last Active</label><div className="config-val">{drawerAgent.last}</div></div>
          <div className="config-item"><label>Agent ID</label><div className="config-val" style={{ fontSize: 10 }}>{drawerAgent.id}</div></div>
        </div>
      </div>

      {/* Save */}
      <div style={{ paddingTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '7px 20px' }} onClick={save}>Save Changes</button>
        {localSaved && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  )
}

// ─── Dashboard / AI Command Center ────────────────────────────────────────────

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  toolsUsed?: string[]   // tool labels shown under message
}

const TOOL_ICON: Record<string, string> = {
  get_rent_roll:        '🏢',
  get_lp_directory:     '👥',
  get_capital_calls:    '💰',
  get_leasing_pipeline: '🔑',
  get_work_orders:      '🔧',
  get_fund_performance: '📊',
  get_flagged_items:    '🔐',
}
const TOOL_SHORT: Record<string, string> = {
  get_rent_roll:        'Rent roll',
  get_lp_directory:     'LP directory',
  get_capital_calls:    'Capital calls',
  get_leasing_pipeline: 'Leasing pipeline',
  get_work_orders:      'Work orders',
  get_fund_performance: 'Fund performance',
  get_flagged_items:    'Flagged items',
}

const AGENT_LABEL: Record<string, { icon: string; name: string }> = Object.fromEntries(
  AGENTS.map((a) => [a.id, { icon: a.icon, name: a.name }])
)

const WF_LABEL: Record<string, string> = {
  'weekly-market-update': 'Monday Brief',
  'submarket-intelligence': 'Submarket Watch',
  'competitor-intelligence': 'Fund Landscape',
  'market-update-digest': 'Market Update Digest',
  'lp-ready-summary': 'LP-Ready Summary',
  'sub-sector-deep-dive': 'Sub-Sector Deep Dive',
  'sale-comps-pull': 'Sale Comps Pull',
  'email-escalation': 'Email Escalation',
  'attachment-filer': 'Attachment Filer',
  'dialogue-logger': 'Dialogue Log',
  'lp-onboarding': 'LP Onboarding',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function RightRail({ recentRuns }: { recentRuns: any[] }) {
  const [tab, setTab] = useState<'activity' | 'queue'>('activity')

  const tabBtn = (t: 'activity' | 'queue', label: string) => (
    <button
      onClick={() => setTab(t)}
      style={{ flex: 1, padding: '7px 0', fontSize: 11, fontWeight: tab === t ? 700 : 400, color: tab === t ? '#0e7490' : '#6b7280', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #0e7490' : '2px solid transparent', cursor: 'pointer' }}
    >{label}</button>
  )

  return (
    <div className="ai-queue">
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        {tabBtn('activity', 'Activity')}
        {tabBtn('queue', 'Queue')}
      </div>

      <div className="ai-queue-list">
        {tab === 'activity' ? (
          recentRuns.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 8, padding: 20, color: '#9ca3af' }}>
              <div style={{ fontSize: 22 }}>📭</div>
              <div style={{ fontSize: 11, textAlign: 'center' }}>No runs yet — activity will appear here once agents start executing</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {recentRuns.map((run, i) => {
                const agent = AGENT_LABEL[run.agent_id] ?? { icon: '🤖', name: run.agent_id }
                const wfLabel = WF_LABEL[run.workflow_id] ?? run.workflow_id
                const isErr = run.status === 'error'
                return (
                  <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: isErr ? '#fef2f2' : '#f0f9fa', border: `1px solid ${isErr ? '#fecaca' : '#a5f3fc'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                      {agent.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 5 }}>
                        {wfLabel}
                        {isErr && <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 3, padding: '1px 4px' }}>error</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1 }}>{agent.name}</div>
                      {run.summary && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.summary}</div>}
                    </div>
                    <div style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0, marginTop: 2 }}>{timeAgo(run.created_at)}</div>
                  </div>
                )
              })}
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 10, padding: 20, color: '#9ca3af' }}>
            <div style={{ fontSize: 24 }}>✓</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>Review queue is empty</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DashboardView({ roleKey, userName, recentRuns }: { roleKey: RoleKey; userName: string; recentRuns: any[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [toolActivity, setToolActivity] = useState<string | null>(null)
  const feedRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [messages, toolActivity])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    setInput('')
    setToolActivity(null)

    const userMsg: ChatMessage = { role: 'user', content: text }
    const history = [...messages, userMsg]
    setMessages([...history, { role: 'assistant', content: '', streaming: true, toolsUsed: [] }])
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error('Request failed')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let full = ''
      const completedTools: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse complete SSE events (delimited by \n\n)
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'tool_start') {
              setToolActivity(event.label ?? event.name)
            } else if (event.type === 'tool_done') {
              completedTools.push(event.name)
              setToolActivity(null)
            } else if (event.type === 'text') {
              full += event.text
              setMessages([...history, { role: 'assistant', content: full, streaming: true, toolsUsed: [...completedTools] }])
            } else if (event.type === 'done') {
              setMessages([...history, { role: 'assistant', content: full, streaming: false, toolsUsed: [...completedTools] }])
            } else if (event.type === 'error') {
              setMessages([...history, { role: 'assistant', content: 'Something went wrong — please try again.', streaming: false, toolsUsed: [] }])
            }
          } catch { /* skip malformed */ }
        }
      }

      // Ensure final state
      setMessages((prev) =>
        prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m))
      )
    } catch {
      setMessages([...history, { role: 'assistant', content: 'Something went wrong — please try again.', streaming: false, toolsUsed: [] }])
    } finally {
      setLoading(false)
      setToolActivity(null)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const firstName = userName.split(' ')[0]

  return (
    <div className="ai-center">
      {/* Center Feed */}
      <div className="ai-main">
        <div className="ai-feed-header">
          <h3>AI Command Center</h3>
          <div className="ai-live-dot">Live</div>
        </div>
        <div className="ai-feed" ref={feedRef}>
          {messages.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, color: '#9ca3af' }}>
              <div style={{ fontSize: 32 }}>⚡</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>Good morning, {firstName}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                Ask me anything about your portfolio, agents, or team — or ask me to draft something for you.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  gap: 10,
                  alignItems: 'flex-start',
                }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#f0f9fa', border: '1px solid #A6C3C9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⚡</div>
                  )}
                  <div style={{
                    maxWidth: '78%',
                    background: msg.role === 'user' ? '#111827' : '#ffffff',
                    color: msg.role === 'user' ? '#ffffff' : '#111827',
                    border: msg.role === 'user' ? 'none' : '1px solid #e5e7eb',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    padding: '10px 14px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {/* Tool pills — shown above text when tools were used */}
                    {msg.role === 'assistant' && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                        {msg.toolsUsed.map((t) => (
                          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f0f9fa', border: '1px solid #A6C3C9', borderRadius: 10, padding: '2px 8px', fontSize: 10, color: '#4a7c87', fontWeight: 500 }}>
                            {TOOL_ICON[t] ?? '🔗'} {TOOL_SHORT[t] ?? t}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Live tool activity indicator */}
                    {msg.role === 'assistant' && msg.streaming && toolActivity && !msg.content && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
                        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#A6C3C9', animation: 'pulse 1s infinite' }} />
                        {toolActivity}
                      </div>
                    )}
                    {msg.content}
                    {msg.streaming && msg.content && <span style={{ opacity: 0.5 }}>▋</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="ai-cmd">
          <textarea
            className="ai-cmd-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Ask anything — e.g. "Draft a Q1 update for James Halverson" or "What should I prioritize today?"`}
            rows={1}
            style={{ resize: 'none', overflowY: 'hidden', lineHeight: '1.5' }}
          />
          <button className="ai-cmd-btn" onClick={sendMessage} disabled={loading || !input.trim()}>
            {loading ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* Right Rail — Activity / Queue */}
      <RightRail recentRuns={recentRuns} />
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
      <div className="ai-bubble-icon" style={isSystem ? { background: '#f3f4f6', fontSize: 11, color: '#9ca3af' } : {}}>{icon}</div>
      <div className="ai-bubble-body">
        <div className="ai-bubble-meta">
          <span className="ai-bubble-agent" style={isSystem ? { color: '#9ca3af' } : {}}>{agent}</span>
          <span className="ai-bubble-time">{time}</span>
        </div>
        <div className="ai-bubble-text" style={isSystem ? { color: '#9ca3af' } : {}}>{children}</div>
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
  const selected = filteredInbox[selectedInboxIdx]

  return (
    <div>
      <div className="page-header">
        <h2>Agent Inbox</h2>
        <p>{inboxItems.length > 0 ? `${inboxItems.length} agent communication${inboxItems.length !== 1 ? 's' : ''}` : 'Agent-drafted communications will appear here for your review'}</p>
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
            {filteredInbox.length === 0 && inboxItems.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '48px 24px', gap: 10, color: '#9ca3af' }}>
                <div style={{ fontSize: 28 }}>📭</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>All clear</div>
                <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5, maxWidth: 200 }}>Agent drafts and communications will show up here once agents are active</div>
              </div>
            )}
            {filteredInbox.length === 0 && inboxItems.length > 0 && (
              <div style={{ padding: 20, color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>No matching items</div>
            )}
          </div>
        </div>
        <div className="inbox-right">
          {selected ? (
            <>
              <div className="inbox-thread-header">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{selected.subject}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{selected.from} · {selected.time}</div>
                </div>
                <span className={`badge ${selected.agentBadge}`}>{selected.agent}</span>
              </div>
              <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>From: {selected.from}</div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 40, color: '#9ca3af' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✉️</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{inboxItems.length > 0 ? 'Select a message to view' : 'No messages yet'}</div>
              <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
                {inboxItems.length > 0
                  ? 'Click a message on the left to read the thread and review any agent drafts.'
                  : 'When an agent drafts a communication for your review — an LP update, lease proposal, or payment reminder — it will appear here for your approval before anything is sent.'}
              </div>
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

function AgentsView({ onOpenAgent, statsMap }: { onOpenAgent: (id: string) => void; statsMap: Record<string, { runs: number; last: string | null }> }) {
  function fmtLast(iso: string | null | undefined): string {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div>
      <div className="page-header">
        <h2>Agent Hub</h2>
        <p>{AGENTS.length} agents — monitoring, drafting, and acting autonomously</p>
      </div>
      <div className="agent-grid">
        {AGENTS.map((agent) => {
          const stat = statsMap[agent.id]
          const runs = stat?.runs ?? null
          const last = fmtLast(stat?.last)
          return (
            <div key={agent.id} className="agent-card" onClick={() => onOpenAgent(agent.id)}>
              <div className="agent-card-top">
                <div className={`agent-icon badge ${agent.badge}`}>{agent.icon}</div>
                <div className={`agent-status-dot ${runs ? 'active' : agent.status}`} />
              </div>
              <div className="agent-name">{agent.name}</div>
              <div className="agent-desc">{agent.desc}</div>
              <div className="agent-meta">
                <span className={`badge ${agent.badge}`} style={{ fontSize: 9 }}>{agent.cat}</span>
                <div>
                  <div className="agent-last">{last}</div>
                  <div className="agent-runs">{runs !== null ? `${runs} runs` : '—'}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Financial Dashboard ──────────────────────────────────────────────────────

// ── Fund snapshot (Investment Dashboard) ─────────────────────────────────────
const FUND = {
  netIrr: 18.2, grossIrr: 22.4, moic: 1.8, tvpi: 1.8, rvpi: 1.4,
  targetNetIrr: 16, targetGrossIrr: 20,
  committed: 85, deployed: 61.2, dryPowder: 23.8, deployedPct: 72,
  assets: 8, totalSf: 847, wtdCapRate: 5.6, avgHold: 2.4,
  permianPortfolioOcc: 94, permianSubmarketOcc: 96.3,
  brevardPortfolioOcc: 91,  brevardSubmarketOcc: 94.4,
}
function FsDonut({ pct, color }: { pct: number; color: string }) {
  const r = 48, cx = 60, cy = 60, circ = 2 * Math.PI * r
  const filled = circ * (pct / 100), offset = circ * 0.25
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={120} height={120} viewBox="0 0 120 120">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f3f4f6" strokeWidth={14} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={14}
          strokeDasharray={`${filled} ${circ - filled}`} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }} />
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontWeight={700} fill="#111827">{pct}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#9ca3af">deployed</text>
      </svg>
      <div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: color, marginRight: 6 }} />
          Deployed <strong style={{ color: '#111827' }}>${FUND.deployed}M</strong>
        </div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#f3f4f6', border: '1px solid #e5e7eb', marginRight: 6 }} />
          Dry Powder <strong style={{ color: '#111827' }}>${FUND.dryPowder}M</strong>
        </div>
      </div>
    </div>
  )
}
function FsIrr() {
  const rows = [
    { label: 'Gross IRR', actual: FUND.grossIrr, target: FUND.targetGrossIrr, color: '#A6C3C9' },
    { label: 'Net IRR',   actual: FUND.netIrr,   target: FUND.targetNetIrr,   color: '#6366f1' },
  ]
  const max = 30
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '4px 0' }}>
      {rows.map(row => (
        <div key={row.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{row.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{row.actual}% <span style={{ fontWeight: 400, color: '#9ca3af' }}>vs {row.target}% target</span></span>
          </div>
          <div style={{ position: 'relative', height: 10, background: '#f3f4f6', borderRadius: 5 }}>
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(row.target / max) * 100}%`, background: '#e5e7eb', borderRadius: 5 }} />
            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(row.actual / max) * 100}%`, background: row.color, borderRadius: 5 }} />
          </div>
        </div>
      ))}
    </div>
  )
}
function FsOccupancy() {
  const markets = [
    { label: 'Permian Basin',  portfolio: FUND.permianPortfolioOcc, submarket: FUND.permianSubmarketOcc, color: '#A6C3C9' },
    { label: 'Brevard County', portfolio: FUND.brevardPortfolioOcc,  submarket: FUND.brevardSubmarketOcc,  color: '#6366f1' },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '4px 0' }}>
      {markets.map(m => (
        <div key={m.label}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{m.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Our Portfolio</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#111827' }}>{m.portfolio}%</span>
              </div>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${m.portfolio}%`, background: m.color, borderRadius: 4 }} />
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>Submarket Avg</span>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.submarket}%</span>
              </div>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${m.submarket}%`, background: '#e5e7eb', borderRadius: 4 }} />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
function FundSnapshot() {
  const returns = [
    { label: 'Net IRR',   value: `${FUND.netIrr}%`,   sub: `vs ${FUND.targetNetIrr}% target` },
    { label: 'Gross IRR', value: `${FUND.grossIrr}%`,  sub: `vs ${FUND.targetGrossIrr}% target` },
    { label: 'MOIC',      value: `${FUND.moic}x`,      sub: 'Multiple on invested capital' },
    { label: 'TVPI',      value: `${FUND.tvpi}x`,      sub: 'Total value to paid-in' },
    { label: 'RVPI',      value: `${FUND.rvpi}x`,      sub: 'Residual value to paid-in' },
  ]
  const stats = [
    { label: 'Committed Capital', value: `$${FUND.committed}M`,  sub: 'Total fund size' },
    { label: 'Deployed',          value: `$${FUND.deployed}M`,   sub: `${FUND.deployedPct}% of committed` },
    { label: 'Portfolio Assets',  value: `${FUND.assets}`,       sub: 'Properties' },
    { label: 'Total SF',          value: `${FUND.totalSf}k sf`,  sub: 'Gross leasable area' },
    { label: 'Wtd. Cap Rate',     value: `${FUND.wtdCapRate}%`,  sub: 'Portfolio weighted avg' },
    { label: 'Avg Hold Period',   value: `${FUND.avgHold} yrs`,  sub: 'Since acquisition' },
  ]
  const kpiCard = (k: { label: string; value: string; sub: string }) => (
    <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{k.label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: 3 }}>{k.value}</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{k.sub}</div>
    </div>
  )
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Returns</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>{returns.map(kpiCard)}</div>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Fund Stats</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>{stats.map(kpiCard)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>Deployed Capital</div>
          <FsDonut pct={FUND.deployedPct} color="#A6C3C9" />
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>IRR vs Target</div>
          <FsIrr />
        </div>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>Portfolio vs Submarket Occ.</div>
          <FsOccupancy />
        </div>
      </div>
    </div>
  )
}

function FinancialView() {
  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 4 }}>Investment Dashboard</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Fund performance · LP-facing metrics · Portfolio snapshot</p>
      </div>
      <FundSnapshot />
    </div>
  )
}

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

const KB_CATEGORIES = [
  { icon: '💰', label: 'Capital KB',              desc: 'Fund IV pipeline, capital call history, commitment tracking, roadshow materials',   agents: ['LP Market Intelligence', 'Capital Raising'] },
  { icon: '📊', label: 'Investor Relations KB',   desc: 'LP profiles, fund terms, investor communications, subscription docs',              agents: ['Investor Relations', 'Capital Raising'] },
  { icon: '🔐', label: 'Finance & Controls KB',   desc: 'Approval thresholds, GL coding rules, invoice policies, audit documentation',       agents: ['Financial Controls', 'Accounting Operations'] },
  { icon: '🏭', label: 'Acquisition KB',          desc: 'Deal memos, LOIs, underwriting models, CoStar comps, broker correspondence',        agents: ['Acquisition Research', 'Brokerage'] },
  { icon: '📈', label: 'Analytics KB',            desc: 'Cap rate benchmarks, valuation models, fund performance data, market reports',      agents: ['Investment Analytics', 'CIO & Chief of Staff'] },
  { icon: '🎯', label: 'Strategy KB',             desc: 'Board presentations, fund narratives, IC materials, strategic planning docs',       agents: ['CIO & Chief of Staff'] },
  { icon: '📋', label: 'Executive KB',            desc: 'Meeting transcripts, calendar context, follow-up templates, board prep materials',  agents: ['Executive Assistant'] },
  { icon: '📣', label: 'Marketing KB',            desc: 'Brand assets, LP newsletter templates, LinkedIn drafts, conference materials',      agents: ['Marketing'] },
  { icon: '📁', label: 'Fund Admin KB',           desc: 'Subscription docs, K-1s, capital account statements, compliance filings',          agents: ['Fund Administration'] },
  { icon: '🔑', label: 'Leasing KB',              desc: 'Lease templates, market comps, prospect intake forms, renewal playbooks',          agents: ['Leasing'] },
  { icon: '🏗️', label: 'Operations KB',           desc: 'Vendor contracts, work order SOPs, COI requirements, inspection reports',          agents: ['Property Operations', 'COO Operations'] },
  { icon: '👥', label: 'People Ops KB',           desc: 'Employee handbook, benefits guides, onboarding checklists, HR policies',           agents: ['People Ops'] },
  { icon: '🧾', label: 'Accounting KB',           desc: 'Chart of accounts, Yardi procedures, month-end close checklist, AR/AP templates',  agents: ['Accounting Operations'] },
]

function KnowledgeBaseView() {
  const [docs, setDocs] = useState<Record<string, string[]>>({
    'Capital KB': [
      'ERP_Funds_IV_-_Investor_Presentation_(9.24.25_DRAFT).ppt',
      'ERP_Funds_II__III_Update_-_Investor_Presentation_(March_23_2023).pdf',
      'ERP_Funds_III_-_Quarterly_Reporting_Package_(3.31.26)_(v4.14.26_DRAFT).xlsx',
      'ERP_Space_Coast_Opportunity_Overview_(2.17.20).ppt',
    ],
    'Investor Relations KB': [
      'ERP_1031_Industrial_Portfolio_IV_DST_-_PPM_(Compiled).pdf',
      'ERP_1031_Industrial_Portfolio_IV_DST_-_Executive_Summary_(March_2026).pdf',
      'ERP_Funds_III_LLC_(Private_Placement_Memorandum).pdf',
      'ERP_Industrials_VII_-_Transaction_Overview_(3.02.26).pdf',
      'ERP_Industrials_-_ERP_Controls__Responsibilities_(3.25.26).xlsx',
      'ERP_Industrials_1788_-_ERP_Controls__Responsibilities_(3.25.26).xlsx',
      'ERP_Industrials_-_Team_Member_Duties_(12.02.25).xlsx',
      'ERP_Pipeline__Market_Analysis_(v.10.28.25).xlsx',
      'ERP_Industrials_-_Job_Descriptions_(3.18.25).docx',
      'Industrial_-_Improvements__Deferred_Maintenance_(3.25.26).xlsx',
      'Industrial_-_Weekly_Agenda_(4.13.26).docx',
      'ERP_MT_-_PCA_Tracker_(9.17.25).xlsx',
      'ERP_Industrials_VII_-_DD_Tracking_(3.02.26).xls',
    ],
  })
  const [dragging, setDragging] = useState<string | null>(null)

  function handleFiles(kbLabel: string, files: FileList | null) {
    if (!files) return
    const names = Array.from(files).map((f) => f.name)
    setDocs((prev) => ({ ...prev, [kbLabel]: [...(prev[kbLabel] ?? []), ...names] }))
  }

  function removeDoc(kbLabel: string, name: string) {
    setDocs((prev) => ({ ...prev, [kbLabel]: (prev[kbLabel] ?? []).filter((n) => n !== name) }))
  }

  return (
    <div>
      <div className="page-header">
        <h2>Knowledge Bases</h2>
        <p>Upload documents to each knowledge base — agents read these when they work</p>
      </div>
      <div style={{ background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>💡</span>
        <span style={{ fontSize: 12, color: '#0e7490' }}>Documents uploaded here are indexed and made available to the agents listed. PDFs, Word docs, and Excel files are all supported.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {KB_CATEGORIES.map((kb) => {
          const kbDocs = docs[kb.label] ?? []
          return (
            <div key={kb.label} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f0f9fa', border: '1px solid #a5f3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{kb.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{kb.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{kb.desc}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                    {kb.agents.map((a) => <span key={a} className="badge badge-blue" style={{ fontSize: 9 }}>{a}</span>)}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{kbDocs.length} doc{kbDocs.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Upload zone */}
              <label
                className={`upload-zone${dragging === kb.label ? ' drag-over' : ''}`}
                style={{ padding: '16px 12px' }}
                onDragOver={(e) => { e.preventDefault(); setDragging(kb.label) }}
                onDragLeave={() => setDragging(null)}
                onDrop={(e) => { e.preventDefault(); setDragging(null); handleFiles(kb.label, e.dataTransfer.files) }}
              >
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => handleFiles(kb.label, e.target.files)} />
                <span style={{ fontSize: 18 }}>📄</span>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Drop files here or <span style={{ color: '#0e7490', textDecoration: 'underline' }}>browse</span></div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>PDF, Word, Excel, CSV</div>
              </label>

              {/* Doc list */}
              {kbDocs.length > 0 && (
                <div className="doc-list">
                  {kbDocs.map((name) => (
                    <div key={name} className="doc-item">
                      <span style={{ fontSize: 14 }}>📄</span>
                      <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <button className="doc-item-remove" onClick={() => removeDoc(kb.label, name)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Acquisition Research ─────────────────────────────────────────────────────

function AcquisitionView() {
  return (
    <div>
      <div className="page-header"><h2>Acquisition Research</h2><p>Agent-curated deal flow — screened opportunities, underwriting status, and market comps from CoStar and broker feeds</p></div>
      <SourceBar source="CoStar · Broker feeds · Agent research" agents="Acquisition Research · Investment Analytics · CIO & Chief of Staff" synced="Today 6:00 AM (daily scan)" link="Open in Salesforce ↗" />
      <EmptyDataView source="CoStar · Salesforce" message="Acquisition pipeline data will appear here once connected" />
    </div>
  )
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function SettingsView({
  role, userEmail, settingsTab, setSettingsTab, agentConfig, setAgentConfig,
}: {
  role: Role
  userEmail: string
  settingsTab: string
  setSettingsTab: (tab: string) => void
  agentConfig: Record<string, { auto: string; escal: string; active: boolean; kb: string; notes: string }>
  setAgentConfig: React.Dispatch<React.SetStateAction<Record<string, { auto: string; escal: string; active: boolean; kb: string; notes: string }>>>
}) {
  const [prefs, setPrefs] = useState({ digest: true, confidence: false, autoCollapse: true })
  const [notifs, setNotifs] = useState({
    invoice:     { email: true,  sms: true,  push: true  },
    draft:       { email: true,  sms: false, push: true  },
    sla:         { email: true,  sms: true,  push: true  },
    lpInquiry:   { email: true,  sms: false, push: false },
    capitalCall: { email: true,  sms: false, push: true  },
    weeklyDigest:{ email: true,  sms: false, push: false },
  })
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)

  function togglePref(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }
  function toggleNotif(key: keyof typeof notifs, ch: 'email' | 'sms' | 'push') {
    setNotifs((n) => ({ ...n, [key]: { ...n[key], [ch]: !n[key][ch] } }))
  }
  function toggleAgent(id: string) {
    setExpandedAgents((p) => ({ ...p, [id]: !p[id] }))
  }
  function saveChanges() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const notifRows: { key: keyof typeof notifs; event: string; sub: string }[] = [
    { key: 'invoice',      event: 'Invoice approval required',   sub: 'Financial Controls flags an invoice above threshold' },
    { key: 'draft',        event: 'Draft ready for review',       sub: 'Any agent queues a communication for your approval' },
    { key: 'sla',          event: 'SLA breach detected',          sub: 'A work order exceeds its SLA deadline' },
    { key: 'lpInquiry',    event: 'New LP inquiry',               sub: 'Investor Relations receives a new investor email' },
    { key: 'capitalCall',  event: 'Capital call funded',          sub: 'LP wires received for an active capital call' },
    { key: 'weeklyDigest', event: 'Weekly agent digest',          sub: 'Sunday summary of all agent activity' },
  ]

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
                    <div style={{ marginTop: 6 }}><span className="badge badge-teal">{role.access}</span></div>
                  </div>
                  <div className="ov-divider" />
                  <div className="ov-stat"><div className="ov-stat-val">Today</div><div className="ov-stat-label">Last Login</div><div className="ov-stat-sub" style={{ color: '#3DAE7A' }}>Active session</div></div>
                  <div className="ov-divider" />
                  <div className="ov-stat"><div className="ov-stat-val">{AGENTS.length}</div><div className="ov-stat-label">Agents Accessible</div><div className="ov-stat-sub" style={{ color: '#9ca3af' }}>{role.sidebar === 'all' ? 'All portals' : 'Role-filtered'}</div></div>
                </div>
              </div>
              <div className="settings-section">
                <h3>My Profile</h3>
                <p>Update your name, contact info, and authentication preferences</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: role.bg, color: role.color, fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{role.avatar}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{role.name}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{role.title}</div>
                    <div style={{ marginTop: 6 }}><span className="badge badge-teal">{role.access}</span></div>
                  </div>
                  <button className="btn btn-ghost" style={{ marginLeft: 'auto' }}>Change Photo</button>
                </div>
                <div className="field-group">
                  <div className="field"><label>Display Name</label><input defaultValue={role.name} /></div>
                  <div className="field"><label>Job Title</label><input defaultValue={role.title} /></div>
                  <div className="field"><label>Email</label><input defaultValue={userEmail} readOnly /></div>
                  <div className="field">
                    <label>Timezone</label>
                    <select defaultValue="America/Chicago (CST)">
                      <option>America/Chicago (CST)</option>
                      <option>America/Denver (MST)</option>
                      <option>America/New_York (EST)</option>
                      <option>America/Los_Angeles (PST)</option>
                    </select>
                  </div>
                  <div className="field field-full"><label>Phone (for SMS alerts)</label><input placeholder="+1 (555) 000-0000" /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button className="btn btn-primary" onClick={saveChanges}>Save Changes</button>
                  {saved && <span style={{ fontSize: 12, color: '#3DAE7A', fontWeight: 500 }}>✓ Saved</span>}
                </div>
              </div>
              <div className="divider" />
              <div className="settings-section">
                <h3>Preferences</h3>
                <p>Customize how the portal behaves for you</p>
                {([
                  { key: 'digest'      as const, label: 'Weekly Agent Digest',          sub: 'Receive a Sunday evening summary of all agent activity' },
                  { key: 'confidence'  as const, label: 'Show Agent Draft Confidence',  sub: 'Display AI confidence score alongside each draft' },
                  { key: 'autoCollapse'as const, label: 'Auto-collapse Handled Emails', sub: 'Automatically minimize emails marked as handled in inbox' },
                ]).map((pref) => (
                  <div key={pref.label} className="toggle-row" onClick={() => togglePref(pref.key)}>
                    <div className="toggle-label"><h4>{pref.label}</h4><p>{pref.sub}</p></div>
                    <div className={`toggle ${prefs[pref.key] ? 'on' : ''}`} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {settingsTab === 's-agents' && (
            <div>
              <div className="settings-section">
                <h3>Agent Configuration</h3>
                <p>Manage autonomy levels and escalation contacts for each agent</p>
              </div>
              {AGENTS.map((agent) => {
                const cfg = agentConfig[agent.id]
                const isActive = cfg?.active ?? (agent.status === 'active')
                return (
                  <div key={agent.id} className="agent-config-row" style={{ opacity: isActive ? 1 : 0.55 }}>
                    <div className="agent-config-header" onClick={() => toggleAgent(agent.id)}>
                      <span className={`badge ${agent.badge}`}>{agent.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{agent.name}</span>
                      {/* Active / Inactive toggle — stop propagation so it doesn't expand the row */}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setAgentConfig((prev) => ({ ...prev, [agent.id]: { ...prev[agent.id], active: !isActive } }))
                        }}
                      >
                        <div className={`toggle ${isActive ? 'on' : ''}`} style={{ width: 32, height: 18 }} />
                        <span style={{ fontSize: 10, color: isActive ? '#15803d' : '#9ca3af', fontWeight: 600, minWidth: 40 }}>{isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>Autonomy: {cfg?.auto ?? agent.auto}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{expandedAgents[agent.id] ? '▲' : '▼'}</span>
                    </div>
                    {expandedAgents[agent.id] && (
                      <div className="agent-config-body open">
                        <div className="config-grid">
                          <div className="config-item">
                            <label>Autonomy Level</label>
                            <select
                              value={cfg?.auto ?? agent.auto}
                              onChange={(e) => setAgentConfig((prev) => ({ ...prev, [agent.id]: { ...prev[agent.id], auto: e.target.value } }))}
                            >
                              <option>High</option>
                              <option>Medium</option>
                              <option>Low</option>
                            </select>
                          </div>
                          <div className="config-item">
                            <label>Escalation Contact</label>
                            <select
                              value={cfg?.escal ?? agent.escal}
                              onChange={(e) => setAgentConfig((prev) => ({ ...prev, [agent.id]: { ...prev[agent.id], escal: e.target.value } }))}
                            >
                              <option>Meghan</option>
                              <option>William</option>
                              <option>Brennan</option>
                              <option>Michele</option>
                              <option>Liz</option>
                              <option>Hannah</option>
                              <option>Sylvia</option>
                              <option>Pippi</option>
                              <option>Kasandra</option>
                            </select>
                          </div>
                          <div className="config-item">
                            <label>Knowledge Base</label>
                            <div className="config-val">{agent.kb}</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-primary" onClick={saveChanges}>Save Agent Config</button>
                {saved && <span style={{ fontSize: 12, color: '#3DAE7A', fontWeight: 500 }}>✓ Saved</span>}
              </div>
            </div>
          )}
          {settingsTab === 's-connections' && (
            <ConnectionsTab saved={saved} saveChanges={saveChanges} />
          )}
          {settingsTab === 's-team' && (
            <TeamTab saved={saved} saveChanges={saveChanges} />
          )}
          {settingsTab === 's-notifications' && (
            <div>
              <div className="settings-section">
                <h3>Notification Preferences</h3>
                <p>Configure when and how agents notify you of activity</p>
              </div>
              {notifRows.map((row) => (
                <div key={row.event} className="toggle-row">
                  <div className="toggle-label"><h4>{row.event}</h4><p>{row.sub}</p></div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {(['email', 'sms', 'push'] as const).map((ch) => (
                      <div key={ch} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} onClick={() => toggleNotif(row.key, ch)}>
                        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'capitalize' }}>{ch}</div>
                        <div className={`toggle ${notifs[row.key][ch] ? 'on' : ''}`} style={{ width: 32, height: 18 }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-primary" onClick={saveChanges}>Save Notifications</button>
                {saved && <span style={{ fontSize: 12, color: '#3DAE7A', fontWeight: 500 }}>✓ Saved</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

const ACCESS_OPTIONS = ['Admin', 'Manager', 'Standard', 'Read Only']
const SIDEBAR_OPTIONS = ['all', 'executive', 'property', 'finance', 'ops', 'leasing', 'accounting']

interface TeamMember {
  id: string
  name: string
  title: string
  email: string
  access: string
  sidebar: string
  avatar: string
  bg: string
  color: string
}

const AVATAR_COLORS = [
  { bg: '#eff6ff', color: '#1d4ed8' },
  { bg: '#f0fdf4', color: '#15803d' },
  { bg: '#faf5ff', color: '#7c3aed' },
  { bg: '#fff7ed', color: '#c2410c' },
  { bg: '#f0f9fa', color: '#0e7490' },
  { bg: '#fef2f2', color: '#b91c1c' },
  { bg: '#fefce8', color: '#a16207' },
]

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
}

function TeamTab({ saved, saveChanges }: { saved: boolean; saveChanges: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>(() =>
    Object.entries(ROLES).map(([key, r], i) => ({
      id: key,
      name: r.name,
      title: r.title,
      email: r.email,
      access: r.access,
      sidebar: r.sidebar,
      avatar: r.avatar,
      bg: AVATAR_COLORS[i % AVATAR_COLORS.length].bg,
      color: AVATAR_COLORS[i % AVATAR_COLORS.length].color,
    }))
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<TeamMember>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [newMember, setNewMember] = useState({ name: '', title: '', email: '', access: 'Standard', sidebar: 'all' })
  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null)

  function startEdit(m: TeamMember) {
    setEditingId(m.id)
    setEditDraft({ name: m.name, title: m.title, email: m.email, access: m.access, sidebar: m.sidebar })
    setShowAdd(false)
  }

  function commitEdit(id: string) {
    setMembers((prev) => prev.map((m) => m.id === id ? { ...m, ...editDraft } : m))
    setEditingId(null)
    saveChanges()
  }

  function cancelEdit() { setEditingId(null); setEditDraft({}) }

  function addMember() {
    if (!newMember.name.trim() || !newMember.email.trim()) return
    const colorIdx = members.length % AVATAR_COLORS.length
    const id = `member-${Date.now()}`
    setMembers((prev) => [...prev, {
      id,
      name: newMember.name.trim(),
      title: newMember.title.trim(),
      email: newMember.email.trim(),
      access: newMember.access,
      sidebar: newMember.sidebar,
      avatar: initials(newMember.name),
      bg: AVATAR_COLORS[colorIdx].bg,
      color: AVATAR_COLORS[colorIdx].color,
    }])
    setNewMember({ name: '', title: '', email: '', access: 'Standard', sidebar: 'all' })
    setShowAdd(false)
    saveChanges()
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    setRemoveConfirm(null)
  }

  const accessBadge: Record<string, string> = {
    Admin: 'badge-gold', Manager: 'badge-teal', Standard: 'badge-blue', 'Read Only': 'badge-gray',
  }

  return (
    <div>
      <div className="settings-section" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3>Team & Roles</h3>
          <p>Manage portal access and role assignments for your team</p>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 4, flexShrink: 0 }} onClick={() => { setShowAdd((p) => !p); setEditingId(null) }}>
          {showAdd ? 'Cancel' : '+ Add Member'}
        </button>
      </div>

      {/* Add member form */}
      {showAdd && (
        <div style={{ background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0e7490', marginBottom: 12 }}>New Team Member</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div className="field">
              <label>Full Name</label>
              <input placeholder="Jane Smith" value={newMember.name} onChange={(e) => setNewMember((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Job Title</label>
              <input placeholder="Controller" value={newMember.title} onChange={(e) => setNewMember((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Email</label>
              <input type="email" placeholder="name@erpfunds.com" value={newMember.email} onChange={(e) => setNewMember((p) => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="field">
              <label>Access Level</label>
              <select value={newMember.access} onChange={(e) => setNewMember((p) => ({ ...p, access: e.target.value }))}>
                {ACCESS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Portal View</label>
              <select value={newMember.sidebar} onChange={(e) => setNewMember((p) => ({ ...p, sidebar: e.target.value }))}>
                {SIDEBAR_OPTIONS.map((o) => <option key={o} value={o}>{o === 'all' ? 'All (Admin)' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={addMember}>Add Member</button>
            <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Team member cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        {members.map((m, idx) => (
          <div key={m.id} style={{ borderBottom: idx < members.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            {/* Member row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: editingId === m.id ? '#f8fafc' : '#ffffff' }}>
              {/* Avatar */}
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: m.bg, color: m.color, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {m.avatar || initials(m.name)}
              </div>
              {/* Identity */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>{m.title}</span>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', wordBreak: 'break-all' }}>{m.email}</div>
              </div>
              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className={`badge ${accessBadge[m.access] ?? 'badge-gray'}`}>{m.access}</span>
                <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', padding: '2px 8px', borderRadius: 10, textTransform: 'capitalize' }}>
                  {m.sidebar === 'all' ? 'All views' : m.sidebar}
                </span>
              </div>
              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {removeConfirm === m.id ? (
                  <>
                    <span style={{ fontSize: 11, color: '#b91c1c', alignSelf: 'center' }}>Remove?</span>
                    <button className="btn" style={{ fontSize: 11, padding: '3px 8px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6 }} onClick={() => removeMember(m.id)}>Yes</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => setRemoveConfirm(null)}>No</button>
                  </>
                ) : editingId === m.id ? (
                  <>
                    <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => commitEdit(m.id)}>Save</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={cancelEdit}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }} onClick={() => startEdit(m)}>Edit</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: '#d1d5db' }} onClick={() => setRemoveConfirm(m.id)}>✕</button>
                  </>
                )}
              </div>
            </div>

            {/* Edit form — expands below the row */}
            {editingId === m.id && (
              <div style={{ padding: '0 16px 16px 16px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 14 }}>
                  <div className="field">
                    <label>Full Name</label>
                    <input value={editDraft.name ?? ''} onChange={(e) => setEditDraft((p) => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Job Title</label>
                    <input value={editDraft.title ?? ''} onChange={(e) => setEditDraft((p) => ({ ...p, title: e.target.value }))} />
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Email</label>
                    <input type="email" value={editDraft.email ?? ''} onChange={(e) => setEditDraft((p) => ({ ...p, email: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>Access Level</label>
                    <select value={editDraft.access ?? ''} onChange={(e) => setEditDraft((p) => ({ ...p, access: e.target.value }))}>
                      {ACCESS_OPTIONS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>Portal View</label>
                    <select value={editDraft.sidebar ?? ''} onChange={(e) => setEditDraft((p) => ({ ...p, sidebar: e.target.value }))}>
                      {SIDEBAR_OPTIONS.map((o) => <option key={o} value={o}>{o === 'all' ? 'All (Admin)' : o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 18px' }} onClick={() => commitEdit(m.id)}>Save Changes</button>
                  <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
        {members.length} team member{members.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ─── Connections Tab ──────────────────────────────────────────────────────────

const CONNECTIONS_DATA = [
  {
    id: 'yardi',
    icon: '🏢',
    name: 'Yardi Voyager',
    status: 'connected' as const,
    meta: 'Rent roll, GL, work orders, AP/AR — primary property management system',
    sync: 'Synced every 30 min',
    fields: [
      { label: 'Server URL',    key: 'url',      placeholder: 'https://yourfirm.yardipcmng.com' },
      { label: 'Username',      key: 'user',     placeholder: 'api-user@erpfunds' },
      { label: 'Entity ID',     key: 'entity',   placeholder: 'ERP001' },
      { label: 'Sync Interval', key: 'interval', placeholder: '30 min' },
    ],
  },
  {
    id: 'salesforce',
    icon: '📊',
    name: 'Salesforce',
    status: 'connected' as const,
    meta: 'LP profiles, fund pipeline, leasing prospects, and email logs',
    sync: 'Synced every 15 min',
    fields: [
      { label: 'Instance URL', key: 'url',    placeholder: 'https://erpfunds.my.salesforce.com' },
      { label: 'Client ID',    key: 'client', placeholder: 'Connected App Client ID' },
      { label: 'Sandbox Mode', key: 'sandbox',placeholder: 'false' },
    ],
  },
  {
    id: 'onedrive',
    icon: '📁',
    name: 'OneDrive',
    status: 'connected' as const,
    meta: 'Agent outputs saved to OneDrive via Microsoft Graph API · uses Azure app credentials set in Vercel env',
    sync: 'On-demand via Graph API',
    fields: [
      { label: 'Tenant ID',     key: 'tenant', placeholder: 'AZURE_TENANT_ID (set in Vercel env)' },
      { label: 'Client ID',     key: 'client', placeholder: 'AZURE_CLIENT_ID (set in Vercel env)' },
      { label: 'Client Secret', key: 'secret', placeholder: 'AZURE_CLIENT_SECRET (set in Vercel env)' },
    ],
  },
  {
    id: 'docusign',
    icon: '✍️',
    name: 'DocuSign',
    status: 'connected' as const,
    meta: 'Lease execution, capital call notices, and K-1 delivery workflows',
    sync: 'Webhook connected',
    fields: [
      { label: 'Account ID',  key: 'account', placeholder: 'DocuSign Account ID' },
      { label: 'Base URI',    key: 'uri',     placeholder: 'https://na4.docusign.net' },
      { label: 'Webhook URL', key: 'webhook', placeholder: 'https://yourapp.com/webhooks/docusign' },
    ],
  },
  {
    id: 'teams',
    icon: '💬',
    name: 'Microsoft Teams',
    status: 'disconnected' as const,
    meta: 'Meeting transcripts and recordings via Microsoft Graph API — powers Executive Assistant and CIO follow-up workflows',
    sync: 'Not connected',
    fields: [
      { label: 'Tenant ID',      key: 'tenant',   placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { label: 'Client ID',      key: 'client',   placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { label: 'Webhook URL',    key: 'webhook',  placeholder: 'https://yourapp.com/webhooks/teams' },
      { label: 'Transcript Path',key: 'path',     placeholder: '/drives/{driveId}/items/{folderId}' },
    ],
  },
  {
    id: 'dropbox',
    icon: '📦',
    name: 'Dropbox',
    status: 'disconnected' as const,
    meta: 'Document storage for investor decks, offering memoranda, and fund materials shared with LPs',
    sync: 'Not connected',
    fields: [
      { label: 'App Key',        key: 'appKey',   placeholder: 'Dropbox App Key' },
      { label: 'App Secret',     key: 'secret',   placeholder: 'Dropbox App Secret' },
      { label: 'Folder Path',    key: 'folder',   placeholder: '/ERP Industrials/Investor Documents' },
    ],
  },
  {
    id: 'powerpoint',
    icon: '📊',
    name: 'Microsoft PowerPoint',
    status: 'disconnected' as const,
    meta: 'Reads and generates investor decks, offering memoranda, and LP presentation materials via Microsoft Graph API',
    sync: 'Not connected',
    fields: [
      { label: 'Tenant ID',      key: 'tenant',   placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      { label: 'Client ID',      key: 'client',   placeholder: 'App Registration Client ID' },
      { label: 'Template Folder',key: 'folder',   placeholder: '/sites/{site}/drives/{drive}/root:/Templates' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: '📓',
    status: 'disconnected' as const,
    meta: 'Routes team requests to the Agent Pipeline Requests database and syncs knowledge base documents. Requires an internal Notion integration token.',
    sync: 'Not connected',
    fields: [
      { label: 'Integration Token', key: 'token',  placeholder: 'secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { label: 'Requests DB ID',    key: 'dbId',   placeholder: '32-character Notion database ID' },
      { label: 'Workspace ID',      key: 'ws',     placeholder: 'Optional — leave blank to use token default' },
    ],
  },
  {
    id: 'anthropic',
    icon: '🤖',
    name: 'Anthropic API',
    status: 'disconnected' as const,
    meta: 'Powers Claude-based AI workflows across all agents — LP narrative drafting, document analysis, and synthesis tasks',
    sync: 'Not connected',
    fields: [
      { label: 'API Key', key: 'apiKey', placeholder: 'sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { label: 'Model',   key: 'model',  placeholder: 'claude-opus-4-7' },
    ],
  },
  {
    id: 'fred',
    icon: '📈',
    name: 'FRED API (Federal Reserve)',
    status: 'disconnected' as const,
    meta: 'Macro economic data — interest rates, inflation, GDP, and industrial production indicators for the Macro Signals Digest',
    sync: 'Not connected',
    fields: [
      { label: 'API Key', key: 'apiKey', placeholder: 'abcdefghijklmnopqrstuvwxyz123456' },
    ],
  },
  {
    id: 'eia',
    icon: '⚡',
    name: 'EIA API (Energy Information Admin.)',
    status: 'disconnected' as const,
    meta: 'U.S. energy data — oil prices, Permian rig counts, and production volumes used in Portfolio vs. Macro Benchmarks Analyzer',
    sync: 'Not connected',
    fields: [
      { label: 'API Key', key: 'apiKey', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
  },
  {
    id: 'bls',
    icon: '📊',
    name: 'BLS API (Bureau of Labor Statistics)',
    status: 'disconnected' as const,
    meta: 'Manufacturing PMI, employment, and freight volume data — feeds Macro Signals Digest and industrial demand signals',
    sync: 'Not connected',
    fields: [
      { label: 'API Key',       key: 'apiKey',  placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      { label: 'Series IDs',    key: 'series',  placeholder: 'CEU3000000001,PCU331--331-- (comma-separated)' },
    ],
  },
  {
    id: 'apify',
    icon: '🕷️',
    name: 'Apify',
    status: 'disconnected' as const,
    meta: 'Web scraping and Google News extraction — powers the Permian Brief news pull and LP Market Intelligence research workflows',
    sync: 'Not connected',
    fields: [
      { label: 'API Token', key: 'apiToken', placeholder: 'apify_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
  },
  {
    id: 'regrid',
    icon: '🗺️',
    name: 'Regrid',
    status: 'disconnected' as const,
    meta: 'Parcel-level land data — ownership, zoning, and acreage for Permian Basin counties. Powers land assembly and site selection workflows.',
    sync: 'Not connected',
    fields: [
      { label: 'API Key',      key: 'apiKey', placeholder: 'your-regrid-api-key' },
      { label: 'Default Path', key: 'path',   placeholder: 'us/tx/midland' },
    ],
  },
]

// M365 accounts live separately — supports multiple named accounts
type M365Account = {
  id: string
  label: string       // e.g. "Meghan Berry"
  email: string
  tenantId: string
  clientId: string
  status: 'connected' | 'disconnected'
}

const DEFAULT_M365_ACCOUNTS: M365Account[] = [
  { id: 'm365-meghan',  label: 'Meghan Berry',  email: 'mberry@erpfunds.com',    tenantId: '', clientId: '', status: 'disconnected' },
  { id: 'm365-william', label: 'William Meyer', email: 'wmeyer@erpfunds.com',    tenantId: '', clientId: '', status: 'disconnected' },
  { id: 'm365-michele', label: 'Michele Parad', email: 'mparad@erpfunds.com', tenantId: '', clientId: '', status: 'disconnected' },
]

const RSS_FEEDS_DISPLAY: { icon: string; name: string; url: string; desc: string; agent: string }[] = [
  // ── Agent 1 — Permian Industrial Brief ────────────────────────────────
  { icon: '⛽', agent: 'Agent 1 · Permian Brief', name: 'Oil & Gas 360',       url: 'https://www.oilandgas360.com/feed/',                         desc: 'Upstream and midstream news — drilling activity, production, pipeline updates' },
  { icon: '🔧', agent: 'Agent 1 · Permian Brief', name: 'World Oil',            url: 'https://www.worldoil.com/rss/news',                         desc: 'Operator activity, frac sand, midstream, in-basin facilities' },
  { icon: '📡', agent: 'Agent 1 · Permian Brief', name: 'Rigzone',              url: 'https://www.rigzone.com/rss/news.aspx',                     desc: 'Rig counts, offshore/onshore drilling, and energy workforce news' },
  { icon: '⚡', agent: 'Agent 1 · Permian Brief', name: 'EIA Today in Energy',  url: 'https://www.eia.gov/rss/todayinenergy.xml',                 desc: 'Permian production updates, regulatory changes, basin economics — from EIA' },
  { icon: '🛢️', agent: 'Agent 1 · Permian Brief', name: 'OilPrice.com',         url: 'https://oilprice.com/rss/main',                             desc: 'Energy press, WTI commentary, occasional Permian operator coverage' },
  { icon: '🏙️', agent: 'Agent 1 · Permian Brief', name: 'Bisnow Texas',         url: 'https://bisnow.com/rss/houston',                            desc: 'Texas CRE coverage — filter to Permian/Midland/Odessa activity' },
  { icon: '🔗', agent: 'Agent 1 · Permian Brief', name: 'Connect CRE',          url: 'https://connectcre.com/feed/',                              desc: 'Texas and national CRE — Permian-adjacent industrial transactions' },
  { icon: '📋', agent: 'Agent 1 · Permian Brief', name: 'CRE Daily',            url: 'https://credaily.com/feed/',                                desc: 'National CRE — picks up institutional Permian industrial deals' },
  { icon: '📰', agent: 'Agent 1 · Permian Brief', name: 'Commercial Observer',  url: 'https://commercialobserver.com/feed/',                      desc: 'CRE finance, acquisitions, and industrial market news' },
  { icon: '🌐', agent: 'Agent 1 · Permian Brief', name: 'GlobeSt',              url: 'https://www.globest.com/feed/',                             desc: 'Industrial, net lease, and multifamily market intelligence' },
  // ── Agent 3 — Competitive Landscape Profile ───────────────────────────
  { icon: '📣', agent: 'Agent 3 · Competitive Landscape', name: 'PR Newswire',      url: 'https://www.prnewswire.com/rss/news-releases-list.rss', desc: 'Fund closes, acquisitions, JV announcements from industrial PE players' },
  { icon: '📢', agent: 'Agent 3 · Competitive Landscape', name: 'Business Wire',    url: 'https://www.businesswire.com/rss/home',                  desc: 'Institutional CRE deals and capital markets — alternative wire to PR Newswire' },
  { icon: '🏗️', agent: 'Agent 3 · Competitive Landscape', name: 'The Real Deal',   url: 'https://therealdeal.com/feed/',                          desc: 'Large industrial transactions and fund activity' },
  { icon: '🏢', agent: 'Agent 3 · Competitive Landscape', name: 'CoStar News',      url: 'https://www.costar.com/rss',                             desc: 'CRE deal announcements and market news — headlines available without subscription' },
  // ── Agent 5 — Comparable Fund Benchmarking ────────────────────────────
  { icon: '📁', agent: 'Agent 5 · Fund Benchmarking', name: 'SEC EDGAR Form D',   url: 'https://efts.sec.gov/LATEST/search-index?forms=D',        desc: 'Every Reg D filing nationwide — tracks private fund raises by structure and amount' },
  { icon: '💼', agent: 'Agent 5 · Fund Benchmarking', name: 'PERE / IPE Real Assets', url: 'https://pere.privateequityinternational.com/feed/',   desc: 'Institutional industrial fund fundraising news and strategy announcements' },
]
function ConnectionsTab({ saved, saveChanges }: { saved: boolean; saveChanges: () => void }) {
  const [conns, setConns] = useState<Record<string, { status: 'connected' | 'disconnected'; values: Record<string, string> }>>(() =>
    Object.fromEntries(
      CONNECTIONS_DATA.map((c) => [c.id, { status: c.status as 'connected' | 'disconnected', values: Object.fromEntries(c.fields.map((f) => [f.key, ''])) }])
    )
  )
  const [expandedConn, setExpandedConn] = useState<string | null>(null)

  // Microsoft 365 multi-account state
  const [m365Accounts, setM365Accounts] = useState<M365Account[]>(DEFAULT_M365_ACCOUNTS)
  const [expandedM365, setExpandedM365] = useState<string | null>(null)
  const [showAddM365, setShowAddM365] = useState(false)
  const [newM365, setNewM365] = useState({ label: '', email: '', tenantId: '', clientId: '' })

  // Load persisted connector + M365 state after hydration (avoids SSR mismatch)
  useEffect(() => {
    try {
      const savedConns = localStorage.getItem('conn-state')
      if (savedConns) {
        const parsed = JSON.parse(savedConns)
        setConns((prev) => ({ ...prev, ...parsed }))
      }
    } catch {}
    try {
      const savedM365 = localStorage.getItem('m365-state')
      if (savedM365) setM365Accounts(JSON.parse(savedM365))
    } catch {}
  }, [])

  // Auto-save connector values to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem('conn-state', JSON.stringify(conns)) } catch {}
  }, [conns])

  function toggleConn(id: string) {
    setExpandedConn((prev) => (prev === id ? null : id))
  }
  function toggleConnStatus(id: string) {
    setConns((prev) => {
      const next = { ...prev, [id]: { ...prev[id], status: prev[id].status === 'connected' ? 'disconnected' as const : 'connected' as const } }
      try { localStorage.setItem('conn-state', JSON.stringify(next)) } catch {}
      return next
    })
  }
  function setField(connId: string, key: string, val: string) {
    setConns((prev) => ({ ...prev, [connId]: { ...prev[connId], values: { ...prev[connId].values, [key]: val } } }))
  }

  function saveConn(id: string) {
    const conn = CONNECTIONS_DATA.find((c) => c.id === id)
    const values = conns[id]?.values ?? {}
    const allFilled = !conn || conn.fields.every((f) => (values[f.key] ?? '').trim().length > 0)
    const newStatus: 'connected' | 'disconnected' = allFilled ? 'connected' : 'disconnected'
    const next = { ...conns, [id]: { ...conns[id], status: newStatus, values } }
    setConns(next)
    try { localStorage.setItem('conn-state', JSON.stringify(next)) } catch {}
    saveChanges()
    setExpandedConn(null)
  }

  function saveM365(next: M365Account[]) {
    setM365Accounts(next)
    try { localStorage.setItem('m365-state', JSON.stringify(next)) } catch {}
  }
  function updateM365Account(id: string, field: keyof M365Account, val: string) {
    saveM365(m365Accounts.map((a) => a.id === id ? { ...a, [field]: val } : a))
  }
  function toggleM365Status(id: string) {
    saveM365(m365Accounts.map((a) => a.id === id ? { ...a, status: a.status === 'connected' ? 'disconnected' : 'connected' } : a))
  }
  function removeM365Account(id: string) {
    saveM365(m365Accounts.filter((a) => a.id !== id))
    if (expandedM365 === id) setExpandedM365(null)
  }
  function addM365Account() {
    if (!newM365.label.trim() || !newM365.email.trim()) return
    saveM365([...m365Accounts, {
      id: `m365-${Date.now()}`,
      label: newM365.label.trim(),
      email: newM365.email.trim(),
      tenantId: newM365.tenantId.trim(),
      clientId: newM365.clientId.trim(),
      status: 'disconnected',
    }])
    setNewM365({ label: '', email: '', tenantId: '', clientId: '' })
    setShowAddM365(false)
  }

  const connectedM365 = m365Accounts.filter((a) => a.status === 'connected').length

  return (
    <div>
      <div className="settings-section">
        <h3>Connected Systems</h3>
        <p>Integration status for all data sources used by agents</p>
      </div>
      <div className="conn-grid">

        {/* ── Microsoft 365 multi-account card ── */}
        <div className="conn-card" style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / -1' }}>
          <div className="conn-header">
            <div className="conn-icon">📅</div>
            <div style={{ flex: 1 }}>
              <div className="conn-name">Microsoft 365</div>
              <div className={`conn-status ${connectedM365 > 0 ? 'connected' : 'disconnected'}`}>
                {connectedM365 > 0 ? `● ${connectedM365} account${connectedM365 > 1 ? 's' : ''} connected` : '○ No accounts connected'}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }} onClick={() => setShowAddM365((p) => !p)}>
              {showAddM365 ? 'Cancel' : '+ Add Account'}
            </button>
          </div>
          <div className="conn-meta">Calendar, email send/receive, and Teams transcript access via Microsoft Graph API — supports multiple mailboxes</div>

          {/* Add account form */}
          {showAddM365 && (
            <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0e7490', marginBottom: 2 }}>New M365 Account</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Display Name</label>
                  <input placeholder="Meghan Berry" value={newM365.label} onChange={(e) => setNewM365((p) => ({ ...p, label: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Email / UPN</label>
                  <input type="email" placeholder="name@erpfunds.com" value={newM365.email} onChange={(e) => setNewM365((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Tenant ID</label>
                  <input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={newM365.tenantId} onChange={(e) => setNewM365((p) => ({ ...p, tenantId: e.target.value }))} />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Client ID</label>
                  <input placeholder="App Registration Client ID" value={newM365.clientId} onChange={(e) => setNewM365((p) => ({ ...p, clientId: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 14px' }} onClick={addM365Account}>Add Account</button>
                <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setShowAddM365(false)}>Cancel</button>
              </div>
            </div>
          )}

          {/* Account list */}
          {m365Accounts.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 0, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              {m365Accounts.map((acct, idx) => (
                <div key={acct.id} style={{ borderBottom: idx < m365Accounts.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  {/* Account row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: expandedM365 === acct.id ? '#f8fafc' : '#ffffff' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 6, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>🪟</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{acct.label}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', wordBreak: 'break-all' }}>{acct.email}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: acct.status === 'connected' ? '#15803d' : '#9ca3af' }}>
                        {acct.status === 'connected' ? '● Connected' : '○ Disconnected'}
                      </span>
                      <div className={`toggle ${acct.status === 'connected' ? 'on' : ''}`} style={{ width: 28, height: 16, cursor: 'pointer' }} onClick={() => toggleM365Status(acct.id)} />
                      <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 8px' }} onClick={() => setExpandedM365((p) => p === acct.id ? null : acct.id)}>
                        {expandedM365 === acct.id ? 'Close' : 'Configure'}
                      </button>
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 13, padding: '2px 4px' }} onClick={() => removeM365Account(acct.id)} title="Remove">✕</button>
                    </div>
                  </div>

                  {/* Expanded config for this account */}
                  {expandedM365 === acct.id && (
                    <div style={{ padding: '0 14px 14px 14px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 12 }}>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Display Name</label>
                          <input value={acct.label} onChange={(e) => updateM365Account(acct.id, 'label', e.target.value)} />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Email / UPN</label>
                          <input type="email" value={acct.email} onChange={(e) => updateM365Account(acct.id, 'email', e.target.value)} />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Tenant ID</label>
                          <input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={acct.tenantId} onChange={(e) => updateM365Account(acct.id, 'tenantId', e.target.value)} />
                        </div>
                        <div className="field" style={{ margin: 0 }}>
                          <label>Client ID</label>
                          <input placeholder="App Registration Client ID" value={acct.clientId} onChange={(e) => updateM365Account(acct.id, 'clientId', e.target.value)} />
                        </div>
                      </div>
                      <div style={{ marginTop: 10, fontSize: 10, color: '#9ca3af', lineHeight: 1.5 }}>
                        Requires an Azure App Registration with <strong>Mail.Send</strong>, <strong>Calendars.ReadWrite</strong>, and <strong>OnlineMeetings.Read</strong> permissions granted for this user.
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 14px' }} onClick={saveChanges}>Save</button>
                        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setExpandedM365(null)}>Close</button>
                        {saved && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 500 }}>✓ Saved</span>}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── All other single-account connections ── */}
        {CONNECTIONS_DATA.map((conn) => {
          const state = conns[conn.id]
          const isConnected = state.status === 'connected'
          const isExpanded = expandedConn === conn.id
          return (
            <div key={conn.id} className="conn-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="conn-header">
                <div className="conn-icon">{conn.icon}</div>
                <div style={{ flex: 1 }}>
                  <div className="conn-name">{conn.name}</div>
                  <div className={`conn-status ${isConnected ? 'connected' : 'disconnected'}`}>
                    {isConnected ? '● Connected' : '○ Disconnected'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => toggleConnStatus(conn.id)}>
                  <div className={`toggle ${isConnected ? 'on' : ''}`} style={{ width: 32, height: 18 }} />
                </div>
              </div>
              <div className="conn-meta">{conn.meta}</div>
              <div className="conn-footer">
                <span className="sync-badge">{isConnected ? '✓ Connected' : conn.sync}</span>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleConn(conn.id)}>
                  {isExpanded ? 'Close' : 'Configure'}
                </button>
              </div>
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {conn.fields.map((f) => {
                    const isSensitive = /secret|pass|token|key/i.test(f.key)
                    const hasValue = (state.values[f.key] ?? '').trim().length > 0
                    return (
                      <div key={f.key} className="field" style={{ margin: 0 }}>
                        <label>{f.label}</label>
                        <input
                          type={isSensitive ? 'password' : 'text'}
                          placeholder={isSensitive && hasValue ? '••••••••••••••••' : f.placeholder}
                          value={state.values[f.key] ?? ''}
                          onChange={(e) => setField(conn.id, f.key, e.target.value)}
                        />
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-primary" style={{ fontSize: 11, padding: '4px 14px' }} onClick={() => saveConn(conn.id)}>Save</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setExpandedConn(null)}>Cancel</button>
                    {saved && <span style={{ fontSize: 11, color: '#15803d', fontWeight: 500 }}>✓ Saved</span>}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Data Feeds ── */}
      <div className="settings-section" style={{ marginTop: 32 }}>
        <h3>Data Feeds</h3>
        <p>RSS and news feeds monitored by the Permian Brief and market intelligence agents</p>
      </div>
      <div className="conn-grid">
        {RSS_FEEDS_DISPLAY.map((feed) => (
          <div key={feed.name} className="conn-card">
            <div className="conn-card-header">
              <span className="conn-icon">{feed.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="conn-name">{feed.name}</div>
                <div className="conn-status connected">● Active</div>
              </div>
            </div>
            <div className="conn-meta">{feed.desc}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
              <a href={feed.url} target="_blank" rel="noopener noreferrer" style={{ color: '#94a3b8', textDecoration: 'none' }}>{feed.url}</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Newsletter Prompt Library ────────────────────────────────────────────────

function NewsletterPromptCard({ p }: { p: NewsletterPrompt }) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'overview' | 'prompt' | 'output' | 'sources'>('overview')

  const freqColor: Record<string, string> = { Weekly: '#0e7490', Monthly: '#7c3aed' }
  const marketColor: Record<string, string> = { permian: '#d97706', brevard: '#0891b2' }

  const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#9ca3af', display: 'block', marginBottom: 4 }
  const preStyle: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 11, lineHeight: 1.65, color: '#374151', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', userSelect: 'none', background: open ? '#f8fafc' : '#fff' }}
      >
        <span style={{ fontSize: 16 }}>📧</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{p.name}</div>
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{p.schedule} · {p.marketFull}</div>
        </div>
        <span className={`badge ${p.frequency === 'Weekly' ? 'badge-teal' : 'badge-purple'}`} style={{ fontSize: 9 }}>{p.frequency}</span>
        <span className={`badge ${p.market === 'permian' ? 'badge-gold' : 'badge-blue'}`} style={{ fontSize: 9 }}>{p.market === 'permian' ? 'Permian' : 'Brevard'}</span>
        <span style={{ fontSize: 12, color: '#9ca3af', transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }}>▼</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #e5e7eb' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
            {(['overview', 'prompt', 'output', 'sources'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{ padding: '7px 14px', fontSize: 11, fontWeight: tab === t ? 700 : 400, color: tab === t ? '#0e7490' : '#6b7280', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #0e7490' : '2px solid transparent', cursor: 'pointer', textTransform: 'capitalize' }}
              >{t}</button>
            ))}
          </div>

          <div style={{ padding: '14px 16px' }}>
            {tab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <span style={labelStyle}>Trigger</span>
                  <div style={{ fontSize: 11, color: '#374151', background: '#f1f5f9', borderRadius: 5, padding: '6px 10px', fontFamily: 'monospace' }}>{p.endpoint}</div>
                </div>
                <div>
                  <span style={labelStyle}>Recipients</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.recipients.map((r) => (
                      <span key={r} style={{ fontSize: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '2px 8px', color: '#166534' }}>{r}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <span style={labelStyle}>Research Query Sent to Research Agent</span>
                  <pre style={preStyle}>{p.researchQuery}</pre>
                </div>
              </div>
            )}

            {tab === 'prompt' && (
              <div>
                <span style={labelStyle}>Claude System Prompt</span>
                <pre style={preStyle}>{p.systemPrompt}</pre>
              </div>
            )}

            {tab === 'output' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Email Output Sections</span>
                {p.outputSections.map((s) => (
                  <div key={s.title} style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{s.description}</div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'sources' && (
              <div>
                <span style={labelStyle}>Data Sources Targeted by Research Agent</span>
                <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {p.sources.map((s) => (
                    <li key={s} style={{ fontSize: 11, color: '#374151', lineHeight: 1.55 }}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NewsletterPromptLibrary() {
  const [filterMarket, setFilterMarket] = useState<'all' | 'permian' | 'brevard'>('all')
  const filtered = NEWSLETTER_PROMPTS.filter((p) => filterMarket === 'all' || p.market === filterMarket)

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📰</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Agent 1 — Newsletter Prompt Library</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Full prompt instructions, sources, and output specs for all 6 scheduled newsletters</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'permian', 'brevard'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMarket(m)}
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: '1px solid', cursor: 'pointer', fontWeight: filterMarket === m ? 700 : 400, background: filterMarket === m ? '#0e7490' : '#fff', color: filterMarket === m ? '#fff' : '#6b7280', borderColor: filterMarket === m ? '#0e7490' : '#d1d5db' }}
            >{m === 'all' ? 'All' : m === 'permian' ? 'Permian' : 'Brevard'}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map((p) => <NewsletterPromptCard key={p.id} p={p} />)}
      </div>
    </div>
  )
}

// ─── Market Data Source Card ──────────────────────────────────────────────────

function MarketDataCard({ mds }: { mds: MarketDataSource }) {
  const [filterSource, setFilterSource] = useState<'all' | 'FRED' | 'BLS'>('all')
  const filtered = mds.series.filter((s) => filterSource === 'all' || s.source === filterSource)
  const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#9ca3af', display: 'block', marginBottom: 4 }

  return (
    <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {mds.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{mds.marketFull}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>BLS & FRED series IDs and reference links</div>
        </div>
      </div>

      {/* Quick links */}
      <div style={{ display: 'flex', gap: 6 }}>
        <a href={mds.blsPage} target="_blank" rel="noreferrer"
          style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 }}>
          BLS Economy at a Glance ↗
        </a>
        <a href={mds.fredPage} target="_blank" rel="noreferrer"
          style={{ fontSize: 10, padding: '3px 9px', borderRadius: 5, border: '1px solid #d1fae5', background: '#ecfdf5', color: '#065f46', textDecoration: 'none', fontWeight: 600 }}>
          FRED Series ↗
        </a>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 5 }}>
        {(['all', 'FRED', 'BLS'] as const).map((f) => (
          <button key={f} onClick={() => setFilterSource(f)}
            style={{ fontSize: 9, padding: '2px 8px', borderRadius: 4, border: '1px solid', cursor: 'pointer', fontWeight: filterSource === f ? 700 : 400, background: filterSource === f ? '#0e7490' : '#fff', color: filterSource === f ? '#fff' : '#6b7280', borderColor: filterSource === f ? '#0e7490' : '#d1d5db' }}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
      </div>

      {/* Series list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.map((s) => (
          <a key={s.id} href={s.url} target="_blank" rel="noreferrer"
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 10px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, textDecoration: 'none' }}>
            <span style={{ fontSize: 9, fontWeight: 700, background: s.source === 'FRED' ? '#ecfdf5' : '#eff6ff', color: s.source === 'FRED' ? '#065f46' : '#1d4ed8', border: `1px solid ${s.source === 'FRED' ? '#a7f3d0' : '#bfdbfe'}`, borderRadius: 3, padding: '1px 5px', flexShrink: 0, marginTop: 1 }}>{s.source}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{s.label}</div>
              <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{s.id} · {s.description}</div>
            </div>
            <span style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>↗</span>
          </a>
        ))}
      </div>
    </div>
  )
}

// ─── Uploaded Files (Anthropic Files API) ────────────────────────────────────

interface UploadedFileRecord {
  file_id: string
  filename: string
  size_bytes: number | null
  mime_type: string | null
  project_tag: string | null
  uploaded_by: string | null
  expires_at: string | null
  created_at: string
}

function fmtBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function UploadedFilesCard() {
  const [files, setFiles] = useState<UploadedFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tag, setTag] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files/list')
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch { setFiles([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchFiles() }, [])

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    for (const file of Array.from(fileList)) {
      const fd = new FormData()
      fd.append('file', file)
      if (tag) fd.append('projectTag', tag)
      await fetch('/api/files/upload', { method: 'POST', body: fd })
    }
    await fetchFiles()
    setUploading(false)
  }

  const handleDelete = async (fileId: string) => {
    await fetch(`/api/files/${fileId}`, { method: 'DELETE' })
    setFiles(f => f.filter(x => x.file_id !== fileId))
  }

  const copyId = (fileId: string) => {
    navigator.clipboard.writeText(fileId)
    setCopied(fileId)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          📂
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Deal Documents</div>
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>
          {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
        Upload rent rolls, T12s, OMs, or deal PDFs once — reference across OM Writer, Sale Comps, and Deck Builder without re-attaching each time.
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          placeholder="Project tag (e.g. Tampa OM)"
          value={tag}
          onChange={e => setTag(e.target.value)}
          style={{ flex: 1, fontSize: 11, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', background: '#fff', color: '#111827' }}
        />
        <label style={{ cursor: 'pointer', fontSize: 11, padding: '5px 10px', background: '#0e7490', color: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, opacity: uploading ? 0.6 : 1 }}>
          {uploading ? 'Uploading…' : '+ Upload'}
          <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={e => handleUpload(e.target.files)} disabled={uploading} />
        </label>
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>Loading…</div>
      ) : files.length === 0 ? (
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>No files uploaded yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {files.map(f => (
            <div key={f.file_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e5e7eb' }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>📄</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.filename}</div>
                <div style={{ fontSize: 10, color: '#9ca3af' }}>
                  {fmtBytes(f.size_bytes)}{f.project_tag ? ` · ${f.project_tag}` : ''}
                </div>
              </div>
              <button
                onClick={() => copyId(f.file_id)}
                title="Copy file_id for agent use"
                style={{ fontSize: 10, color: copied === f.file_id ? '#16a34a' : '#0e7490', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', flexShrink: 0 }}
              >
                {copied === f.file_id ? 'Copied!' : 'Copy ID'}
              </button>
              <button
                onClick={() => handleDelete(f.file_id)}
                title="Delete file"
                style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── SOPs ─────────────────────────────────────────────────────────────────────

const SOP_CATEGORIES = [
  { icon: '🤖', label: 'Agent Working Guides',          desc: 'How to interact with each agent — submitting tasks, reviewing outputs, handling escalations, and adjusting autonomy settings per agent' },
  { icon: '📊', label: 'Dashboard & Portal How-Tos',    desc: 'Step-by-step instructions for updating portal views: rent roll, capital calls, leasing pipeline, work orders, connections, and agent config' },
  { icon: '💰', label: 'Finance Agent SOPs',            desc: 'Invoice approval workflows and GL coding for the Financial Controls agent; month-end close procedures for the Accounting Operations agent' },
  { icon: '🏢', label: 'Property Operations Agent SOPs',desc: 'Work order submission, vendor dispatch, COI requirements, and escalation handling for the Property Operations agent' },
  { icon: '🔑', label: 'Leasing Agent SOPs',            desc: 'Prospect intake, proposal review, renewal tracking, and lease execution checklist for the Leasing agent' },
  { icon: '👥', label: 'Investor Relations Agent SOPs', desc: 'LP communication standards, capital call procedures, quarterly report cadence, and fund update templates for the IR agent' },
  { icon: '🏭', label: 'Acquisitions Agent SOPs',       desc: 'Deal screening criteria, underwriting process, due diligence checklist, and IC memo format for the Acquisitions agent' },
  { icon: '👤', label: 'People & HR SOPs',              desc: 'Onboarding checklist, benefits enrollment, expense reimbursement, and PTO policy for the People Ops agent' },
]

function SOPsView() {
  const [docs, setDocs] = useState<Record<string, string[]>>({})
  const [dragging, setDragging] = useState<string | null>(null)

  function handleFiles(catLabel: string, files: FileList | null) {
    if (!files) return
    const names = Array.from(files).map((f) => f.name)
    setDocs((prev) => ({ ...prev, [catLabel]: [...(prev[catLabel] ?? []), ...names] }))
  }

  function removeDoc(catLabel: string, name: string) {
    setDocs((prev) => ({ ...prev, [catLabel]: (prev[catLabel] ?? []).filter((n) => n !== name) }))
  }

  return (
    <div>
      <div className="page-header">
        <h2>SOPs & Agent Guides</h2>
        <p>Instructions for working with agents and managing portal dashboards — the team's reference library for how everything runs</p>
      </div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>📌</span>
        <span style={{ fontSize: 12, color: '#92400e' }}>SOPs here cover two things: <strong>how to work with each AI agent</strong> (submitting tasks, reviewing outputs, escalation handling) and <strong>how to update portal dashboards</strong> (data entry, view configuration, connections). They are also indexed into agent knowledge bases so agents follow the same procedures.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <NewsletterPromptLibrary />
        <UploadedFilesCard />
        {MARKET_DATA_SOURCES.map((mds) => <MarketDataCard key={mds.market} mds={mds} />)}
        {SOP_CATEGORIES.map((cat) => {
          const catDocs = docs[cat.label] ?? []
          return (
            <div key={cat.label} className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {cat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{cat.label}</div>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>
                  {catDocs.length} doc{catDocs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{cat.desc}</div>

              {/* Upload zone */}
              <label
                className={`upload-zone${dragging === cat.label ? ' drag-over' : ''}`}
                style={{ padding: '12px 10px' }}
                onDragOver={(e) => { e.preventDefault(); setDragging(cat.label) }}
                onDragLeave={() => setDragging(null)}
                onDrop={(e) => { e.preventDefault(); setDragging(null); handleFiles(cat.label, e.dataTransfer.files) }}
              >
                <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt" style={{ display: 'none' }} onChange={(e) => handleFiles(cat.label, e.target.files)} />
                <span style={{ fontSize: 16 }}>📎</span>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Drop SOP or <span style={{ color: '#0e7490', textDecoration: 'underline' }}>browse</span></div>
              </label>

              {/* Doc list */}
              {catDocs.length > 0 && (
                <div className="doc-list">
                  {catDocs.map((name) => (
                    <div key={name} className="doc-item">
                      <span style={{ fontSize: 13 }}>📄</span>
                      <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                      <button className="doc-item-remove" onClick={() => removeDoc(cat.label, name)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
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
      <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', maxWidth: 380, lineHeight: 1.6 }}>{message}</div>
      <div style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 16px', marginTop: 4 }}>
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
        <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 11, color: '#0e7490', textDecoration: 'none', border: '1px solid #a5f3fc', borderRadius: 6, padding: '3px 10px' }}>{link}</a>
      </div>
    </div>
  )
}

// ─── Requests View ───────────────────────────────────────────────────────────

type RequestItem = {
  id: string
  url: string
  title: string
  category: string
  priority: string
  status: string
  submittedBy: string
  role: string
  date: string
  description: string
}

const REQUEST_CATEGORIES = ['Agent Feature', 'New View', 'Data Integration', 'Bug / Issue', 'Workflow', 'Other']
const REQUEST_PRIORITIES  = ['Low', 'Medium', 'High', 'Urgent']

const STATUS_COLOR: Record<string, string> = {
  Submitted:   '#E8A020',
  'In Review': '#3B82F6',
  Planned:     '#8B5CF6',
  'In Progress':'#0e7490',
  Done:        '#3DAE7A',
}
const PRIORITY_COLOR: Record<string, string> = {
  Low: '#9ca3af', Medium: '#E8A020', High: '#ef4444', Urgent: '#dc2626',
}

function RequestsView({ roleKey, roleName, roleTitle }: { roleKey: string; roleName: string; roleTitle: string }) {
  const [title, setTitle]         = useState('')
  const [category, setCategory]   = useState(REQUEST_CATEGORIES[0])
  const [priority, setPriority]   = useState('Medium')
  const [description, setDesc]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ url: string } | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [notionReady, setNotionReady] = useState(true)

  const [requests, setRequests]   = useState<RequestItem[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedReq, setSelectedReq] = useState<RequestItem | null>(null)

  const isAdmin = roleKey === 'micheleP' || roleKey === 'meghanb'

  React.useEffect(() => {
    fetch('/api/requests')
      .then((r) => r.json())
      .then((d) => {
        if (d.setup) setNotionReady(false)
        setRequests(d.requests ?? [])
      })
      .catch(() => setRequests([]))
      .finally(() => setLoadingList(false))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim() || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category, priority, description }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.setup) setNotionReady(false)
        setError(data.error ?? 'Submission failed')
        return
      }
      setSubmitted({ url: data.url })
      setTitle(''); setDesc(''); setCategory(REQUEST_CATEGORIES[0]); setPriority('Medium')
      // Refresh list
      const list = await fetch('/api/requests').then((r) => r.json())
      setRequests(list.requests ?? [])
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 24, height: '100%', overflow: 'hidden' }}>

      {/* ── Left: submit form ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflow: 'auto' }}>
        <div className="page-header">
          <h2>📮 Requests</h2>
          <p>Submit a feature request, improvement idea, or issue for the agent pipeline. Routed to Notion for triage.</p>
        </div>

        {!notionReady && (
          <div style={{ background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
            <strong>Notion not connected.</strong> Set <code>NOTION_TOKEN</code> and <code>NOTION_REQUESTS_DB_ID</code> in Vercel environment variables, then reconnect in{' '}
            <span style={{ color: '#0e7490', cursor: 'pointer', textDecoration: 'underline' }}>Settings → Connections</span>.
            Requests will submit once connected.
          </div>
        )}

        {submitted && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#166534', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>✅ Request submitted to Notion.</span>
            {submitted.url && (
              <a href={submitted.url} target="_blank" rel="noopener noreferrer" style={{ color: '#0e7490', fontSize: 11 }}>
                Open in Notion ↗
              </a>
            )}
          </div>
        )}

        {error && (
          <div style={{ background: '#fff1f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#991b1b', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Request Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Add lease expiration alerts to Leasing Agent"
              required
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }}
              >
                {REQUEST_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                style={{ width: '100%', fontSize: 12, padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6 }}
              >
                {REQUEST_PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Describe what you need and why it would help your workflow…"
              required
              rows={5}
              style={{ width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Submitting as {roleName} · {roleTitle}</span>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !description.trim()}
              style={{ background: '#111827', color: '#fff', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (submitting || !title.trim() || !description.trim()) ? 0.5 : 1 }}
            >
              {submitting ? 'Submitting…' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>

      {/* ── Right: submitted requests ── */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '0 0 12px', borderBottom: '1px solid #f0f0f0', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>
              {isAdmin ? 'All Requests' : 'My Requests'}
            </h3>
            <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>
              {isAdmin ? 'Manage and triage requests from the full team' : 'Track status of your submitted requests'}
            </p>
          </div>
          {requests.length > 0 && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {loadingList ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: 20 }}>Loading…</div>
          ) : requests.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 8, color: '#9ca3af' }}>
              <div style={{ fontSize: 28 }}>📮</div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>No requests yet</div>
              <div style={{ fontSize: 12 }}>Submit your first request using the form</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {requests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => setSelectedReq(selectedReq?.id === req.id ? null : req)}
                  style={{ background: '#fff', border: `1px solid ${selectedReq?.id === req.id ? '#A6C3C9' : '#e5e7eb'}`, borderRadius: 8, padding: '12px 16px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {req.title}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {req.category && (
                          <span style={{ fontSize: 10, background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '2px 7px' }}>{req.category}</span>
                        )}
                        {req.priority && (
                          <span style={{ fontSize: 10, color: PRIORITY_COLOR[req.priority] ?? '#9ca3af', fontWeight: 600 }}>● {req.priority}</span>
                        )}
                        {isAdmin && req.submittedBy && (
                          <span style={{ fontSize: 10, color: '#9ca3af' }}>{req.submittedBy}</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: STATUS_COLOR[req.status] ?? '#9ca3af', background: STATUS_COLOR[req.status] ? `${STATUS_COLOR[req.status]}18` : '#f3f4f6', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>
                        {req.status}
                      </span>
                      {req.date && <span style={{ fontSize: 10, color: '#9ca3af' }}>{req.date}</span>}
                    </div>
                  </div>
                  {selectedReq?.id === req.id && req.description && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0', fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
                      {req.description}
                      {req.url && (
                        <div style={{ marginTop: 8 }}>
                          <a href={req.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#0e7490' }}>Open in Notion ↗</a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Stub View ────────────────────────────────────────────────────────────────

function StubView({ title, icon, desc }: { title: string; icon: string; desc: string }) {
  return (
    <div>
      <div className="page-header"><h2>{icon} {title}</h2><p>{desc}</p></div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 'calc(100vh - 220px)', gap: 16 }}>
        <div style={{ fontSize: 48 }}>{icon}</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#111827' }}>{title}</div>
        <div style={{ fontSize: 13, color: '#6b7280', maxWidth: 400, textAlign: 'center' }}>{desc}</div>
        <div style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 16px', marginTop: 8 }}>
          Phase 2 — data integration coming soon
        </div>
      </div>
    </div>
  )
}

