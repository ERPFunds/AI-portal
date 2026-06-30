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
import { ENTITY_ORDER, ENTITY_LABELS, type Property } from '@/lib/data/properties'
import { type WorkOrder } from '@/lib/data/workOrders'
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
  const [testBriefsState, setTestBriefsState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [testBriefsResults, setTestBriefsResults] = useState<Record<string, { success: boolean; subject?: string; error?: string }>>({})
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

  async function handleTestAllBriefs() {
    setTestBriefsState('loading')
    setTestBriefsResults({})
    try {
      const res = await fetch('/api/test-all-briefs', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setTestBriefsState('error')
        setTestBriefsResults({ error: { success: false, error: data.message || data.error || 'Unknown error' } })
      } else {
        setTestBriefsState('done')
        setTestBriefsResults(data.results || {})
      }
    } catch (err) {
      setTestBriefsState('error')
      setTestBriefsResults({ error: { success: false, error: String(err) } })
    }
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
    lp: <LpDirectoryView />,
    'ir-qa': <QaReviewView />,
    'fund-qa': <FundQaView />,
    acquisition: <AcquisitionView />,
    'mktg-lp': <StubView title="LP Marketing" icon="📣" desc="Investor newsletter drafts, fund deck management, and content library" />,
    'mktg-brokerage': <BrokerageNewsletterView />,
    fundperf: <StubView title="Fund Performance" icon="📈" desc="Detailed fund-level IRR, cash-on-cash, and waterfall analysis" />,
    peopleops: <StubView title="People Ops" icon="👥" desc="Team directory, onboarding checklists, and HR policy Q&A" />,
    vendors: <StubView title="Vendor Contracts" icon="🔑" desc="Vendor master list, contract status, and COI tracking" />,
    docvault: <StubView title="Document Vault" icon="📁" desc="Centralized file store feeding all agent knowledge bases" />,
    'output-files': <OutputFilesView />,
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
              {drawerAgentId === 'lp-intel' && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: testBriefsState === 'done' ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#0f172a' }}>Run test send</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>All 6 briefs → mparad@erpfunds.com with [TEST] prefix</div>
                    </div>
                    <button
                      onClick={handleTestAllBriefs}
                      disabled={testBriefsState === 'loading'}
                      style={{ fontSize: 11, padding: '5px 14px', borderRadius: 6, border: '1px solid', cursor: testBriefsState === 'loading' ? 'not-allowed' : 'pointer', fontWeight: 600, background: testBriefsState === 'loading' ? '#f3f4f6' : testBriefsState === 'done' ? '#d1fae5' : '#0f172a', color: testBriefsState === 'loading' ? '#9ca3af' : testBriefsState === 'done' ? '#065f46' : '#fff', borderColor: testBriefsState === 'done' ? '#6ee7b7' : '#0f172a', flexShrink: 0 }}
                    >
                      {testBriefsState === 'loading' ? '⏳ Sending…' : testBriefsState === 'done' ? '✓ Sent' : '📧 Send all 6 to me'}
                    </button>
                  </div>
                  {testBriefsState === 'done' && Object.keys(testBriefsResults).length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {Object.entries(testBriefsResults).map(([id, r]) => (
                        <div key={id} style={{ fontSize: 11, color: r.success ? '#065f46' : '#b91c1c', display: 'flex', gap: 6 }}>
                          <span>{r.success ? '✓' : '✗'}</span>
                          <span style={{ color: '#374151' }}>{r.subject || id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              {(() => {
                const agentRuns = recentRuns.filter((r) => r.agent_id === drawerAgentId)
                if (agentRuns.length === 0) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px', gap: 8, color: '#9ca3af' }}>
                      <div style={{ fontSize: 20 }}>📭</div>
                      <div style={{ fontSize: 11, textAlign: 'center' }}>No activity yet — runs will appear here once this agent executes</div>
                    </div>
                  )
                }
                return agentRuns.map((run, i) => {
                  const wfLabel = WF_LABEL[run.workflow_id] ?? run.workflow_id
                  const isErr = run.status === 'error'
                  const pfx = run.prefix ? PREFIX_BADGE[run.prefix as string] : null
                  return (
                    <div key={i} className="activity-item" style={{ display: 'flex', gap: 9, padding: '9px 0', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
                      <div className="activity-dot" style={{ background: isErr ? '#ef4444' : '#3DAE7A', marginTop: 5, flexShrink: 0 }} />
                      <div className="activity-content" style={{ flex: 1, minWidth: 0 }}>
                        <div className="activity-action" style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          {pfx && (
                            <span style={{ fontSize: 9, fontWeight: 700, background: pfx.bg, color: pfx.color, border: `1px solid ${pfx.border}`, borderRadius: 3, padding: '1px 5px', letterSpacing: '.3px' }}>
                              {pfx.label}
                            </span>
                          )}
                          {wfLabel}
                          {isErr && <span style={{ fontSize: 9, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 3, padding: '1px 4px' }}>error</span>}
                        </div>
                        {run.summary && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.summary}</div>}
                        <div className="activity-time">{timeAgo(run.created_at)}</div>
                      </div>
                    </div>
                  )
                })
              })()}
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
  // Monday Briefs
  'weekly-market-update':    'Monday Brief',
  'submarket-brief':         'Submarket Brief',
  'fund-competitor-brief':   'Fund & Competitor Brief',
  // Submarket Watch
  'submarket-intelligence':      'Submarket Watch',
  'brevard-submarket-watch':     'Brevard Submarket Watch',
  'permian-submarket-watch':     'Permian Submarket Watch',
  // Fund Landscape
  'competitor-intelligence':     'Fund Landscape',
  'brevard-fund-landscape':      'Brevard Fund Landscape',
  'permian-fund-landscape':      'Permian Fund Landscape',
  // RESEARCH: email-triggered workflows
  'market-update-digest':    'Market Update',
  'lp-ready-summary':        'LP-Ready Summary',
  'sub-sector-deep-dive':    'Sub-Sector Deep Dive',
  'sale-comps-pull':         'Sale Comps Pull',
  'save-file-only':          'File to KB',
  // BUILD: email-triggered workflows
  'deck-builder':            'Deck Build',
  'om-editor':               'OM Build',
  'om-writer':               'OM Prose Draft',
  'update-pipeline-comps':   'Pipeline Comps Update',
  'update-buyer-list':       'Buyer List Update',
  'update-commitment-schedule': 'Commitment Schedule Update',
  'competitive-intel-xls':   'Competitive Intel',
  // WRITE: email-triggered workflows
  'write':                   'Write',
  // IR workflows
  'email-escalation':        'Email Escalation',
  'attachment-filer':        'Attachment Filer',
  'dialogue-logger':         'Dialogue Log',
  'lp-onboarding':           'LP Onboarding',
}

const PREFIX_BADGE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  RESEARCH: { label: 'RESEARCH', bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc' },
  BUILD:    { label: 'BUILD',    bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  WRITE:    { label: 'WRITE',    bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
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
                const pfx = run.prefix ? PREFIX_BADGE[run.prefix as string] : null
                return (
                  <div key={i} style={{ display: 'flex', gap: 9, padding: '9px 12px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: isErr ? '#fef2f2' : '#f0f9fa', border: `1px solid ${isErr ? '#fecaca' : '#a5f3fc'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0, marginTop: 1 }}>
                      {agent.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#111827', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        {pfx && (
                          <span style={{ fontSize: 9, fontWeight: 700, background: pfx.bg, color: pfx.color, border: `1px solid ${pfx.border}`, borderRadius: 3, padding: '1px 5px', letterSpacing: '.3px' }}>
                            {pfx.label}
                          </span>
                        )}
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

interface AgentInboxItem {
  id: string
  from: string
  fromName: string | null
  to: string[]
  subject: string
  preview: string
  receivedISO: string
  folder: string
  folderKind: 'ir' | 'escalate' | 'forwarded-drafts' | 'draft'
  status: 'active-thread' | 'pending' | 'handled' | 'needs-review'
  isDraft: boolean
  webLink: string | null
}
interface AgentInboxFolder { name: string; kind: AgentInboxItem['folderKind']; count: number }
interface AgentInboxResponse {
  mailbox: string
  folders: AgentInboxFolder[]
  items: AgentInboxItem[]
  itemCount: number
  draftCount: number
  needsReviewCount: number
  syncedAt: string
  error?: string
  diagnostics?: Record<string, unknown>
}

const FOLDER_BADGE: Record<AgentInboxItem['folderKind'], string> = {
  ir: 'badge-blue',
  escalate: 'badge-red',
  'forwarded-drafts': 'badge-gold',
  draft: 'badge-purple',
}
const FOLDER_LABEL: Record<AgentInboxItem['folderKind'], string> = {
  ir: 'Investor Relations',
  escalate: 'Escalate',
  'forwarded-drafts': 'Forwarded Draft',
  draft: 'Draft · needs approval',
}

function formatInboxTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const ms = now.getTime() - d.getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function InboxView({
  inboxStatusFilter, setInboxStatusFilter,
  selectedInboxIdx, setSelectedInboxIdx,
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
  const [data, setData] = useState<AgentInboxResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState('All')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sendMsg, setSendMsg] = useState<string | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent-inbox')
      const json: AgentInboxResponse = await res.json()
      if (!res.ok) { setError(json.error || `Sync failed (${res.status})`); setData(json) }
      else { setError(null); setData(json) }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  async function approveAndSend(item: AgentInboxItem) {
    if (!item.isDraft) return
    const to = item.to.join(', ') || 'the recipient'
    if (!window.confirm(`Send this draft to ${to}?\n\nThis sends the email immediately from ${data?.mailbox ?? 'team@erpfunds.com'} and cannot be undone.`)) return
    setSendingId(item.id)
    setSendMsg(null)
    try {
      const res = await fetch('/api/agent-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', id: item.id }),
      })
      const json = await res.json()
      if (!res.ok) { setSendMsg(`Send failed: ${json.error || res.status}`) }
      else { setSendMsg('Sent ✓'); setSelectedInboxIdx(0); await load() }
    } catch (e) {
      setSendMsg(`Send failed: ${String(e)}`)
    } finally {
      setSendingId(null)
    }
  }

  const items = data?.items ?? []
  const folders = data?.folders ?? []

  const filtered = items.filter((item) => {
    if (folderFilter !== 'All' && item.folder !== folderFilter) return false
    if (inboxStatusFilter === 'pending') return item.status === 'pending'
    if (inboxStatusFilter === 'handled') return item.status === 'handled'
    if (inboxStatusFilter === 'review') return item.status === 'needs-review'
    return true
  })
  const selected = filtered[selectedInboxIdx]

  const subtitle = error
    ? `Sync error — ${data?.mailbox ?? 'team@erpfunds.com'}`
    : data
      ? `${data.itemCount} message${data.itemCount !== 1 ? 's' : ''} · ${data.draftCount} draft${data.draftCount !== 1 ? 's' : ''} awaiting approval · synced from ${data.mailbox}`
      : 'Syncing Investor Relations mailbox…'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Agent Inbox</h2>
          <p>{subtitle}</p>
        </div>
        <button className="btn btn-ghost" onClick={load} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
          {loading ? '↻ Syncing…' : '↻ Sync now'}
        </button>
      </div>
      <div className="inbox-wrap">
        <div className="inbox-left">
          <div className="inbox-filters">
            {folders.length > 0 && (
              <div>
                <div className="filter-label" style={{ marginBottom: 5 }}>Folder</div>
                <div className="pill-row">
                  <div className={`pill ${folderFilter === 'All' ? 'active' : ''}`} onClick={() => { setFolderFilter('All'); setSelectedInboxIdx(0) }}>All</div>
                  {folders.map((f) => (
                    <div key={f.name} className={`pill ${folderFilter === f.name ? 'active' : ''}`} onClick={() => { setFolderFilter(f.name); setSelectedInboxIdx(0) }}>
                      {f.name} {f.count > 0 ? `(${f.count})` : ''}
                    </div>
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
            {filtered.map((item, i) => (
              <div
                key={item.id}
                className={`inbox-item ${item.status} ${i === selectedInboxIdx ? 'active' : ''}`}
                onClick={() => { setSelectedInboxIdx(i); setSendMsg(null) }}
              >
                <div className="inbox-item-header">
                  <div className="inbox-from">{item.fromName || item.from || (item.isDraft ? `To: ${item.to[0] ?? '—'}` : '—')}</div>
                  <div className="inbox-time">{formatInboxTime(item.receivedISO)}</div>
                </div>
                <div className="inbox-subject">{item.subject || '(no subject)'}</div>
                <div className={`inbox-agent-tag badge ${FOLDER_BADGE[item.folderKind]}`}>{FOLDER_LABEL[item.folderKind]}</div>
              </div>
            ))}
            {!loading && filtered.length === 0 && !error && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '48px 24px', gap: 10, color: '#9ca3af' }}>
                <div style={{ fontSize: 28 }}>📭</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>All clear</div>
                <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5, maxWidth: 220 }}>No Investor Relations messages or drafts to review right now</div>
              </div>
            )}
            {error && (
              <div style={{ padding: 20, color: '#9ca3af', fontSize: 12, lineHeight: 1.6 }}>
                <div style={{ fontWeight: 600, color: '#E55A4E', marginBottom: 6 }}>Couldn’t sync the mailbox</div>
                <div style={{ marginBottom: 6 }}>{error}</div>
                {data?.diagnostics?.irFolderFound === false && (
                  <div>No “{String(data.diagnostics.irFolder)}” folder found in {String(data.diagnostics.mailbox)}. Create it (or set <code>IR_FOLDER_NAME</code>) and re-sync.</div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="inbox-right">
          {selected ? (
            <>
              <div className="inbox-thread-header">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{selected.subject || '(no subject)'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                    {selected.isDraft ? `To: ${selected.to.join(', ') || '—'}` : `${selected.fromName || selected.from}`} · {formatInboxTime(selected.receivedISO)} · {selected.folder}
                  </div>
                </div>
                <span className={`badge ${FOLDER_BADGE[selected.folderKind]}`}>{FOLDER_LABEL[selected.folderKind]}</span>
              </div>
              <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                <div style={{ background: '#f8fafc', borderRadius: 8, padding: 14, marginBottom: 12, border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>
                    {selected.isDraft ? `Draft to: ${selected.to.join(', ') || '—'}` : `From: ${selected.from}`}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {selected.preview || '(no preview available)'}
                  </div>
                </div>
              </div>
              <div className="draft-panel">
                <div className="draft-label">
                  <span className={`badge ${FOLDER_BADGE[selected.folderKind]}`} style={{ fontSize: 10 }}>{FOLDER_LABEL[selected.folderKind]}</span>
                  {selected.isDraft ? 'AI draft prepared — review and send in Outlook' : selected.folderKind === 'escalate' ? 'Escalated — needs the fund manager’s attention' : 'Review in Outlook'}
                </div>
                <div className="draft-actions" style={{ alignItems: 'center' }}>
                  {selected.isDraft && (
                    <button
                      className="btn btn-primary"
                      disabled={sendingId === selected.id}
                      onClick={() => approveAndSend(selected)}
                    >
                      {sendingId === selected.id ? '⏳ Sending…' : '✓ Approve & Send'}
                    </button>
                  )}
                  {selected.webLink && (
                    <a className={`btn ${selected.isDraft ? 'btn-ghost' : 'btn-primary'}`} href={selected.webLink} target="_blank" rel="noopener noreferrer">↗ Open in Outlook</a>
                  )}
                  {sendMsg && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: sendMsg.startsWith('Sent') ? '#16a34a' : '#E55A4E' }}>{sendMsg}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12, padding: 40, color: '#9ca3af' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✉️</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{loading ? 'Syncing…' : 'Select a message to view'}</div>
              <div style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>
                Investor Relations messages, escalations, and drafts awaiting approval — synced live from {data?.mailbox ?? 'team@erpfunds.com'}.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  const kpiStyle = {
    background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 0,
  }
  const kpiLabel = { fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' as const, letterSpacing: '.6px', marginBottom: 6 }
  const kpiVal = { fontSize: 20, fontWeight: 700, color: '#d1d5db', lineHeight: 1.1, marginBottom: 3 }
  const kpiSub = { fontSize: 11, color: '#e5e7eb' }
  const cardStyle = { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px' }
  const cardTitle = { fontSize: 12, fontWeight: 700, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '.5px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
  const cardTitleSub = { fontSize: 10, color: '#9ca3af', fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0 }
  const dash = <span style={{ color: '#d1d5db', fontWeight: 600 }}>—</span>

  return (
    <div>
      <div className="page-header">
        <h2>Investment Dashboard</h2>
        <p>Portfolio performance · Fund metrics · Acquisition pipeline</p>
      </div>

      <SourceBar
        source="Yardi · Salesforce · CoStar"
        agents="Investment Analytics · CIO & Chief of Staff · Capital Raising"
        synced="Not yet connected"
        link="Connect data sources ↗"
      />

      <FundSnapshot />

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'AUM',           sub: 'Total assets under management' },
          { label: 'Active LPs',    sub: 'Committed investors across all funds' },
          { label: 'T12 NOI',       sub: 'Trailing 12-month net operating income' },
          { label: 'Fund IV Raised',sub: 'Capital committed vs. target' },
          { label: 'Occupancy',     sub: 'Portfolio-wide occupancy rate' },
        ].map((kpi) => (
          <div key={kpi.label} style={kpiStyle}>
            <div style={kpiLabel}>{kpi.label}</div>
            <div style={kpiVal}>—</div>
            <div style={kpiSub}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Row 2: NOI Chart + Fund IV Progress */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* NOI Chart */}
        <div style={cardStyle}>
          <div style={cardTitle}>
            Net Operating Income — Quarterly
            <span style={cardTitleSub}>by year</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, marginBottom: 10, borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
            {[3, 4, 3, 4, 3, 4, 3, 4, 3, 4].map((_, i) => (
              <div key={i} style={{ flex: 1, height: '30%', background: '#f3f4f6', borderRadius: '2px 2px 0 0' }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Prior Year Full Year', 'Current Year Full Year', 'YTD'].map((lbl) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: '#9ca3af' }}>{lbl}</span>{dash}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 10, color: '#d1d5db', marginTop: 10 }}>
            {['Prior Year', 'Current Year', 'YTD'].map((l) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, background: '#e5e7eb', borderRadius: 2 }} />{l}
              </span>
            ))}
          </div>
        </div>

        {/* Fund IV Capital Raise */}
        <div style={cardStyle}>
          <div style={cardTitle}>
            Fund IV — Capital Raise Progress
            <span style={cardTitleSub}>vs. target</span>
          </div>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: '#6b7280' }}>Committed Capital</span>
              <span style={{ color: '#d1d5db', fontWeight: 600 }}>— / target</span>
            </div>
            <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4 }} />
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 5 }}>Connect Salesforce to track raise progress</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'LP Commitments',    sub: 'Signed commitment docs' },
              { label: 'Soft Circles',      sub: 'Investors in diligence' },
              { label: 'Pipeline (Engaged)',sub: 'Active prospects' },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 7, border: '1px solid #e5e7eb' }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{row.label}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{row.sub}</div>
                </div>
                {dash}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 10px 0' }}>
              <span style={{ color: '#9ca3af' }}>Close target</span>{dash}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Fund Performance + Acquisition Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Fund Performance Table */}
        <div style={cardStyle}>
          <div style={cardTitle}>Fund Performance Summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Fund', 'Vintage', 'Size', 'Net IRR', 'CoC', 'Status'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { fund: 'Fund I',   statusClass: 'badge-gray',  status: 'Realized'   },
                { fund: 'Fund II',  statusClass: 'badge-blue',  status: 'Harvesting' },
                { fund: 'Fund III', statusClass: 'badge-green', status: 'Active'     },
                { fund: 'Fund IV',  statusClass: 'badge-blue',  status: 'Raising'    },
              ].map((row, ri) => (
                <tr key={ri} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 4px 10px 0', fontWeight: 600, color: '#111827' }}>{row.fund}</td>
                  <td style={{ padding: '10px 4px', color: '#d1d5db' }}>—</td>
                  <td style={{ padding: '10px 4px', color: '#d1d5db' }}>—</td>
                  <td style={{ padding: '10px 4px', color: '#d1d5db', fontWeight: 600 }}>—</td>
                  <td style={{ padding: '10px 4px', color: '#d1d5db', fontWeight: 600 }}>—</td>
                  <td style={{ padding: '10px 0' }}><span className={`badge ${row.statusClass}`} style={{ fontSize: 9 }}>{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 10 }}>IRR, CoC, and fund size will populate once connected to Yardi</div>
        </div>

        {/* Acquisition Pipeline */}
        <div style={cardStyle}>
          <div style={cardTitle}>
            Acquisition Pipeline
            <span style={cardTitleSub}>by stage</span>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>
              <span>Stage</span><span>Volume</span>
            </div>
            {[
              { label: 'Screening',       color: '#cbd5e1' },
              { label: 'LOI / Diligence', color: '#93c5fd' },
              { label: 'Under Contract',  color: '#3B82F6' },
              { label: 'Closing',         color: '#3DAE7A' },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#374151', width: 110, flexShrink: 0 }}>{row.label}</div>
                <div style={{ flex: 1, height: 8, background: '#f3f4f6', borderRadius: 4 }} />
                <div style={{ fontSize: 11, color: '#d1d5db', width: 24, textAlign: 'right', flexShrink: 0 }}>—</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>
            Connect CoStar &amp; Salesforce to populate deal list
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── LP Directory ─────────────────────────────────────────────────────────────
interface LpRecord {
  investor: string; commitment: string; commitmentUsd: number; commitType: string;
  contact: string; email: string; phone: string; date: string; notes: string;
  group: string;
  lastInteraction: { date: string; note: string; source: 'ir' | 'sf' } | null;
  sfLpType: string | null; sfCalled: number | null; sfDistributions: number | null; sfCrmId: string | null;
  sfBrokerCompany: string | null; sfBrokerContact: string | null;
  brokerFirm: string; brokerContact: string;
}
interface LpDirectoryData {
  lps: LpRecord[]; lpCount: number; totalCommittedUsd: number;
  groups: string[];
  scheduleName: string; webUrl: string; syncedAt: string;
  sfConfigured?: boolean;
  sfMatched?: number;
  sfFieldMap?: { lpType: string | null; called: string | null; distributions: string | null };
  sfError?: string | null;
}
function fmtUsd(n: number): string {
  if (n === 0) return '—'
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}
const COMMIT_TYPE_COLOR: Record<string, string> = {
  'Hard Commit': '#3DAE7A', 'Signed Docs': '#16a34a',
  'Soft Circle': '#3B82F6', 'Verbal': '#f59e0b', 'TBD': '#9ca3af',
}
const COMMIT_TYPE_BG: Record<string, string> = {
  'Hard Commit': '#f0fdf4', 'Signed Docs': '#dcfce7',
  'Soft Circle': '#eff6ff', 'Verbal': '#fffbeb', 'TBD': '#f9fafb',
}
interface LpEditState {
  commitment: string; commitType: string; contact: string;
  email: string; phone: string; notes: string; date: string;
  brokerFirm: string; brokerContact: string;
}
const COMMIT_TYPE_OPTIONS = ['Soft Circle', 'Hard Commit', 'Signed Docs', 'Verbal', 'TBD']

function LpDirectoryView() {
  const [tab, setTab] = React.useState<'lps' | 'calls'>('lps')
  const [groupView, setGroupView] = React.useState<string>('All')
  const [data, setData] = React.useState<LpDirectoryData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [editingRow, setEditingRow] = React.useState<string | null>(null)
  const [editValues, setEditValues] = React.useState<LpEditState>({ commitment: '', commitType: '', contact: '', email: '', phone: '', notes: '', date: '', brokerFirm: '', brokerContact: '' })
  const [saving, setSaving] = React.useState(false)
  const [saveMsg, setSaveMsg] = React.useState<{ ok: boolean; text: string } | null>(null)
  const [syncing, setSyncing] = React.useState(false)

  const load = React.useCallback(async (manual = false) => {
    setSyncing(true)
    if (manual) setSaveMsg(null)
    try {
      const res = await fetch('/api/lp-directory')
      const d = await res.json()
      if (!res.ok || d.error) {
        setError(d.error ?? `Sync failed (${res.status})`)
        if (manual) setSaveMsg({ ok: false, text: `Sync failed: ${d.error ?? res.status}` })
      } else {
        setError(null); setData(d)
        if (manual) {
          if (d.sfConfigured === false) setSaveMsg({ ok: false, text: 'Salesforce not connected — set SF_TOKEN_URL / SF_CLIENT_ID / SF_CLIENT_SECRET in Vercel (Production) and redeploy.' })
          else if (d.sfError) setSaveMsg({ ok: false, text: `Salesforce error: ${d.sfError}` })
          else setSaveMsg({ ok: true, text: `Synced — ${d.sfMatched ?? 0} of ${d.lpCount} LPs matched in Salesforce.` })
        }
      }
    } catch (e) {
      setError(String(e))
      if (manual) setSaveMsg({ ok: false, text: `Sync failed: ${String(e)}` })
    } finally { setLoading(false); setSyncing(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  function startEdit(lp: LpRecord) {
    setEditingRow(lp.investor)
    setEditValues({ commitment: lp.commitment, commitType: lp.commitType, contact: lp.contact, email: lp.email, phone: lp.phone, notes: lp.notes, date: lp.date, brokerFirm: lp.brokerFirm, brokerContact: lp.brokerContact })
    setSaveMsg(null)
  }
  function cancelEdit() { setEditingRow(null); setSaveMsg(null) }

  async function saveEdit(investor: string) {
    setSaving(true)
    setSaveMsg(null)
    try {
      const res = await fetch('/api/lp-directory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor, ...editValues }),
      })
      const result = await res.json()
      if (!res.ok || result.error) {
        setSaveMsg({ ok: false, text: result.error ?? 'Save failed' })
      } else {
        // Optimistically update local state
        setData(prev => prev ? {
          ...prev,
          lps: prev.lps.map(lp => lp.investor === investor ? {
            ...lp, ...editValues,
            commitmentUsd: parseLpUsd(editValues.commitment),
          } : lp),
        } : prev)
        setEditingRow(null)
        setSaveMsg({ ok: true, text: `${investor} saved to Excel` })
        setTimeout(() => setSaveMsg(null), 3000)
      }
    } catch (e) {
      setSaveMsg({ ok: false, text: String(e) })
    } finally {
      setSaving(false)
    }
  }

  function parseLpUsd(raw: string): number {
    const s = raw.replace(/[$,\s]/g, '').toUpperCase()
    if (!s || s === 'TBD') return 0
    const n = parseFloat(s.replace(/[MBK]/, ''))
    if (isNaN(n)) return 0
    if (s.endsWith('B')) return n * 1e9
    if (s.endsWith('M')) return n * 1e6
    if (s.endsWith('K')) return n * 1e3
    return n
  }

  const badge = (s: string) => (
    <span style={{ fontSize: 10, fontWeight: 600, color: COMMIT_TYPE_COLOR[s] ?? '#6b7280', background: COMMIT_TYPE_BG[s] ?? '#f3f4f6', border: `1px solid ${COMMIT_TYPE_COLOR[s] ?? '#e5e7eb'}22`, borderRadius: 5, padding: '2px 7px' }}>{s || 'TBD'}</span>
  )
  const sfCell = (val: string | number | null, fmt?: (v: number) => string) => (
    <td style={{ padding: '11px 14px', color: '#d1d5db', fontSize: 11 }}>
      {val !== null ? (typeof val === 'number' && fmt ? fmt(val) : String(val)) : <span title="Connect Salesforce to populate">— <span style={{ fontSize: 9, background: '#f3f4f6', color: '#9ca3af', borderRadius: 3, padding: '1px 4px', fontWeight: 600 }}>SF</span></span>}
    </td>
  )
  const inputStyle: React.CSSProperties = { fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 7px', width: '100%', outline: 'none', background: '#fafafa' }

  const syncedLabel = data
    ? `Synced from ${data.scheduleName} · ${new Date(data.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : loading ? 'Loading…' : 'Not connected'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>LP Directory</h2>
          <p>Limited partner profiles · Fund IV commitment schedule · Capital calls</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <button className="btn btn-ghost" onClick={() => load(true)} disabled={syncing} style={{ whiteSpace: 'nowrap' }}>
            {syncing ? '↻ Syncing…' : '↻ Sync with Salesforce'}
          </button>
          {data && (
            <div style={{ fontSize: 10, color: data.sfError ? '#E55A4E' : '#9ca3af', marginTop: 4, maxWidth: 260, marginLeft: 'auto' }}>
              {data.sfConfigured === false
                ? 'Salesforce not connected'
                : data.sfError
                  ? `SF error: ${data.sfError}`
                  : `${data.sfMatched ?? 0} of ${data.lpCount} LPs matched in Salesforce`}
            </div>
          )}
        </div>
      </div>
      <SourceBar source="Commitment Schedule (SharePoint) · Salesforce" agents="Capital Raising · CIO & Chief of Staff" synced={syncedLabel} link={data?.webUrl ? "View in SharePoint ↗" : "Connect data sources ↗"} />

      {/* Group view tabs — derived from section headers in the Excel sheet */}
      {data && data.groups.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {['All', ...data.groups].map(g => {
            const isActive = groupView === g
            const groupLps = g === 'All' ? data.lps : data.lps.filter(lp => lp.group === g)
            return (
              <button
                key={g}
                onClick={() => setGroupView(g)}
                style={{
                  fontSize: 12, fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#fff' : '#374151',
                  background: isActive ? '#111827' : '#f3f4f6',
                  border: `1px solid ${isActive ? '#111827' : '#e5e7eb'}`,
                  borderRadius: 20, padding: '5px 14px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {g}
                <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? '#d1d5db' : '#9ca3af' }}>
                  {groupLps.length}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Summary metrics — scoped to the selected group */}
      {(() => {
        const visibleLps = !data ? [] : groupView === 'All' ? data.lps : data.lps.filter(lp => lp.group === groupView)
        const totalCommitted = visibleLps.reduce((s, lp) => s + lp.commitmentUsd, 0)
        const hardCommits = visibleLps.filter(l => l.commitType === 'Hard Commit' || l.commitType === 'Signed Docs').length
        const anyCalled = visibleLps.some(lp => lp.sfCalled != null)
        const anyDistrib = visibleLps.some(lp => lp.sfDistributions != null)
        const calledToDate = visibleLps.reduce((s, lp) => s + (lp.sfCalled ?? 0), 0)
        const distributions = visibleLps.reduce((s, lp) => s + (lp.sfDistributions ?? 0), 0)
        return (
          <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Total LPs',       value: loading ? '…' : data ? `${visibleLps.length}` : '—',   sub: groupView === 'All' ? 'Fund IV commitment schedule' : groupView },
              { label: 'Total Committed', value: loading ? '…' : data ? fmtUsd(totalCommitted) : '—',   sub: 'Across all commitment types' },
              { label: 'Hard Commits',    value: loading ? '…' : data ? `${hardCommits}` : '—',          sub: 'Hard Commit + Signed Docs' },
              { label: 'Called to Date',  value: loading ? '…' : anyCalled ? fmtUsd(calledToDate) : '—', sub: <span style={{ fontSize: 10, color: '#9ca3af' }}>Via Salesforce <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: 3, padding: '1px 4px', fontWeight: 600, fontSize: 9 }}>SF</span></span> as unknown as string },
              { label: 'Distributions',   value: loading ? '…' : anyDistrib ? fmtUsd(distributions) : '—', sub: <span style={{ fontSize: 10, color: '#9ca3af' }}>Via Salesforce <span style={{ background: '#f3f4f6', color: '#9ca3af', borderRadius: 3, padding: '1px 4px', fontWeight: 600, fontSize: 9 }}>SF</span></span> as unknown as string },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 130 }}>
                <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: k.value === '—' ? '#d1d5db' : '#111827', lineHeight: 1.1, marginBottom: 3 }}>{k.value}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{k.sub}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* Section tabs — LP Profiles / Capital Calls */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #e5e7eb' }}>
        {(['lps', 'calls'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, fontWeight: tab === t ? 700 : 500, color: tab === t ? '#111827' : '#9ca3af', background: 'none', border: 'none', borderBottom: tab === t ? '2px solid #111827' : '2px solid transparent', padding: '8px 16px', cursor: 'pointer', marginBottom: -1 }}>
            {t === 'lps' ? 'LP Profiles' : 'Capital Calls'}
          </button>
        ))}
      </div>

      {tab === 'lps' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          {loading && <div style={{ padding: 24, color: '#9ca3af', fontSize: 13 }}>Loading commitment schedule…</div>}
          {error && <div style={{ padding: 24, color: '#dc2626', fontSize: 13 }}>Error: {error}</div>}
          {saveMsg && (
            <div style={{ padding: '8px 14px', background: saveMsg.ok ? '#f0fdf4' : '#fef2f2', borderBottom: '1px solid #e5e7eb', fontSize: 12, color: saveMsg.ok ? '#16a34a' : '#dc2626' }}>
              {saveMsg.ok ? '✅' : '⚠️'} {saveMsg.text}
            </div>
          )}
          {!loading && !error && data && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['LP Name', 'Broker / Advisor', 'Commitment', 'Status', 'Contact', 'Last Interaction', 'LP Type', 'Called', 'Distributions', 'Notes', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>
                      {h}
                      {(h === 'LP Type' || h === 'Called' || h === 'Distributions') && <span style={{ marginLeft: 4, background: '#f3f4f6', color: '#9ca3af', borderRadius: 3, padding: '1px 4px', fontWeight: 600, fontSize: 9 }}>SF</span>}
                      {h === 'Last Interaction' && <span style={{ marginLeft: 4, background: '#eff6ff', color: '#3b82f6', borderRadius: 3, padding: '1px 4px', fontWeight: 600, fontSize: 9 }}>IR</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.lps.filter(lp => groupView === 'All' || lp.group === groupView).map((lp, i) => {
                  const isEditing = editingRow === lp.investor
                  const ev = editValues
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', background: isEditing ? '#f8faff' : undefined }}>
                      {/* LP Name — never editable (it's the key) */}
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827', maxWidth: 180 }}>
                        {lp.investor}
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                            <input value={ev.contact} onChange={e => setEditValues(v => ({ ...v, contact: e.target.value }))} placeholder="Contact name" style={inputStyle} />
                            <input value={ev.email} onChange={e => setEditValues(v => ({ ...v, email: e.target.value }))} placeholder="Email" style={inputStyle} />
                          </div>
                        ) : (
                          (lp.contact || lp.email) && <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400, marginTop: 2 }}>{lp.contact}{lp.email ? ` · ${lp.email}` : ''}</div>
                        )}
                      </td>

                      {/* Broker / Advisor — firm + rep (editable, saved to the schedule) */}
                      <td style={{ padding: '11px 14px', maxWidth: 180 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input value={ev.brokerFirm} onChange={e => setEditValues(v => ({ ...v, brokerFirm: e.target.value }))} placeholder="Broker/advisor firm" style={inputStyle} />
                            <input value={ev.brokerContact} onChange={e => setEditValues(v => ({ ...v, brokerContact: e.target.value }))} placeholder="Broker/advisor contact" style={inputStyle} />
                          </div>
                        ) : (() => {
                          const firm = lp.brokerFirm || lp.sfBrokerCompany
                          const contact = lp.brokerContact || lp.sfBrokerContact
                          return (firm || contact) ? (
                            <>
                              {firm && <div style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{firm}</div>}
                              {contact && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{contact}</div>}
                            </>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                          )
                        })()}
                      </td>

                      {/* Commitment */}
                      <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                        {isEditing
                          ? <input value={ev.commitment} onChange={e => setEditValues(v => ({ ...v, commitment: e.target.value }))} placeholder="$1M" style={{ ...inputStyle, width: 80 }} />
                          : lp.commitmentUsd > 0 ? fmtUsd(lp.commitmentUsd) : lp.commitment || '—'}
                      </td>

                      {/* Status / commitType */}
                      <td style={{ padding: '11px 14px' }}>
                        {isEditing
                          ? <select value={ev.commitType} onChange={e => setEditValues(v => ({ ...v, commitType: e.target.value }))} style={{ ...inputStyle, width: 'auto' }}>
                              {COMMIT_TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                            </select>
                          : badge(lp.commitType)}
                      </td>

                      {/* Phone */}
                      <td style={{ padding: '11px 14px', color: '#6b7280', fontSize: 11 }}>
                        {isEditing
                          ? <input value={ev.phone} onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))} placeholder="Phone" style={inputStyle} />
                          : lp.phone || '—'}
                      </td>

                      {/* Last Interaction — from IR agent logs or Salesforce */}
                      <td style={{ padding: '11px 14px', fontSize: 11, maxWidth: 200 }}>
                        {lp.lastInteraction ? (
                          <div>
                            <div style={{ color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lp.lastInteraction.note}>
                              {lp.lastInteraction.note.slice(0, 60)}{lp.lastInteraction.note.length > 60 ? '…' : ''}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                              <span style={{ fontSize: 10, color: '#9ca3af' }}>
                                {new Date(lp.lastInteraction.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              <span style={{ fontSize: 9, fontWeight: 700, background: lp.lastInteraction.source === 'ir' ? '#eff6ff' : '#f0fdf4', color: lp.lastInteraction.source === 'ir' ? '#3b82f6' : '#16a34a', borderRadius: 3, padding: '1px 4px' }}>
                                {lp.lastInteraction.source.toUpperCase()}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                        )}
                      </td>

                      {/* Salesforce columns */}
                      {sfCell(lp.sfLpType)}
                      {sfCell(lp.sfCalled, fmtUsd)}
                      {sfCell(lp.sfDistributions, fmtUsd)}

                      {/* Notes */}
                      <td style={{ padding: '11px 14px', color: '#6b7280', fontSize: 11, maxWidth: 200 }}>
                        {isEditing
                          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <input value={ev.notes} onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))} placeholder="Notes" style={inputStyle} />
                              <input value={ev.date} onChange={e => setEditValues(v => ({ ...v, date: e.target.value }))} placeholder="Date (YYYY-MM-DD)" style={inputStyle} />
                            </div>
                          : <><span title={lp.notes}>{lp.notes ? lp.notes.slice(0, 60) + (lp.notes.length > 60 ? '…' : '') : '—'}</span>
                            {lp.date && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{lp.date}</div>}</>}
                      </td>

                      {/* Edit / Save / Cancel */}
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => saveEdit(lp.investor)} disabled={saving} style={{ fontSize: 11, fontWeight: 700, background: '#111827', color: '#fff', border: 'none', borderRadius: 5, padding: '5px 12px', cursor: saving ? 'wait' : 'pointer' }}>
                              {saving ? '…' : 'Save'}
                            </button>
                            <button onClick={cancelEdit} disabled={saving} style={{ fontSize: 11, background: 'none', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 5, padding: '5px 10px', cursor: 'pointer' }}>
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(lp)} style={{ fontSize: 11, background: 'none', color: '#9ca3af', border: '1px solid #e5e7eb', borderRadius: 5, padding: '4px 10px', cursor: 'pointer' }}>
                            ✎ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div style={{ fontSize: 10, color: '#9ca3af', padding: '10px 14px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live from Fund IV Commitment Schedule · SF-tagged columns populate when Salesforce is connected</span>
            {data?.webUrl && <a href={data.webUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>Open in SharePoint ↗</a>}
          </div>
        </div>
      )}

      {tab === 'calls' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Call Date', 'Fund', 'Call #', '% Called', 'Amount', 'Due Date', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={7} style={{ padding: '24px 14px', color: '#9ca3af', fontSize: 12, textAlign: 'center' }}>No capital calls recorded — connect Yardi to populate live call history</td></tr>
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#9ca3af', padding: '10px 14px', borderTop: '1px solid #f3f4f6' }}>Capital call history will sync from Yardi when connected</div>
        </div>
      )}
    </div>
  )
}

// ─── Brokerage Newsletter Creator ────────────────────────────────────────────
const BROKERAGE_TEMPLATES = [
  {
    id: 'availability-blast',
    name: 'Availability Blast',
    audience: 'Broker Network',
    frequency: 'As needed',
    description: 'Available space blast to active brokers — new listings, lease terms, contact',
    sections: [
      { title: 'Subject Line Hook',       hint: 'Punchy 1-liner brokers will open (e.g. "New ±24,000 SF IOS Available — Midland, TX")' },
      { title: 'Property Highlights',     hint: 'Address, size, clear height, dock doors, yard depth, power, zoning, asking rent NNN' },
      { title: 'Why This Space',          hint: '2–3 bullet points — location advantage, access, tenant fit' },
      { title: 'Availability & Terms',    hint: 'Available date, lease term flexibility, TI allowance if applicable' },
      { title: 'Call to Action',          hint: 'Broker contact, tour scheduling link or phone, commission structure' },
    ],
  },
  {
    id: 'property-spotlight',
    name: 'Property Spotlight',
    audience: 'Broker Network + Tenants',
    frequency: 'Per listing',
    description: 'Featured property deep-dive for a single asset — ideal for larger or strategic availabilities',
    sections: [
      { title: 'Property Overview',       hint: 'Asset name, address, submarket, total SF, year built / renovated' },
      { title: 'Space Details',           hint: 'Office SF, warehouse SF, clear height, dock-high doors, drive-in doors, sprinkler, power' },
      { title: 'Site & Location',         hint: 'Acreage, yard depth, access roads, proximity to highway / rail / port' },
      { title: 'Market Context',          hint: 'Submarket vacancy, competing availabilities, why this market is active' },
      { title: 'Lease Terms',             hint: 'Asking NNN rate, available date, lease term, TI, co-broker commission' },
      { title: 'Contact & Tour',          hint: 'Leasing contact name, phone, email, preferred showing windows' },
    ],
  },
  {
    id: 'quarterly-broker-update',
    name: 'Quarterly Broker Update',
    audience: 'Broker Network',
    frequency: 'Quarterly',
    description: 'Portfolio-level update for the broker network — leasing activity, new availabilities, market color',
    sections: [
      { title: 'Quarter in Review',       hint: '2–3 sentences: leases signed, SF absorbed, notable deals this quarter' },
      { title: 'Current Availabilities',  hint: 'Table or bullets: property, SF, asking rent, available date — Permian and Brevard' },
      { title: 'Recent Transactions',     hint: 'Deals closed this quarter — tenant, property, SF, term (no confidential economics)' },
      { title: 'Market Snapshot',         hint: 'Quick external-facing stats: vacancy rate, asking rents, absorption — Permian + Brevard' },
      { title: 'What We\'re Looking For', hint: 'Acquisition targets, ideal tenant profiles, markets of interest — broker call to action' },
    ],
  },
  {
    id: 'new-listing-announcement',
    name: 'New Listing Announcement',
    audience: 'Prospects + Tenants',
    frequency: 'Per listing',
    description: 'Clean single-property announcement for direct prospect outreach and CoStar/LoopNet syndication copy',
    sections: [
      { title: 'Headline',                hint: 'e.g. "±18,500 SF Industrial / IOS Available — Palm Bay, FL"' },
      { title: 'Property Summary',        hint: '3–4 sentences: what it is, where it is, what makes it special' },
      { title: 'Key Specs',               hint: 'Bulleted: SF, clear height, dock doors, yard, power, zoning, asking rent' },
      { title: 'Location Advantage',      hint: 'Highway access, distance to key nodes, labor market, logistics' },
      { title: 'Next Steps',              hint: 'Tour contact, OM availability, deadline or urgency if applicable' },
    ],
  },
]

function BrokerageNewsletterView() {
  const [selectedId, setSelectedId] = React.useState(BROKERAGE_TEMPLATES[0].id)
  const [tab, setTab] = React.useState<'edit' | 'preview'>('edit')
  const [subject, setSubject] = React.useState('')
  const [sections, setSections] = React.useState<Record<string, string>>({})
  const [generating, setGenerating] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  const tpl = BROKERAGE_TEMPLATES.find(p => p.id === selectedId) ?? BROKERAGE_TEMPLATES[0]

  React.useEffect(() => {
    setSubject(`${tpl.name} — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`)
    const init: Record<string, string> = {}
    tpl.sections.forEach(s => { init[s.title] = '' })
    setSections(init)
  }, [selectedId])

  const NAVY = '#0D2D52'
  const TEAL = '#A6C3C9'

  async function handleGenerate() {
    setGenerating(true)
    const prompt = `Write a ${tpl.name} for ERP Funds, an industrial CRE firm with properties in the Permian Basin (Midland-Odessa TX) and Brevard County FL. Audience: ${tpl.audience}. Format with clear section headings matching exactly: ${tpl.sections.map(s => s.title).join(', ')}. Tone: direct, professional, broker-friendly. Use placeholder values like [ADDRESS], [SF], [RATE] where specifics are needed.`
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) throw new Error()
      const reader = res.body?.getReader()
      if (!reader) throw new Error()
      let raw = ''
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        raw += decoder.decode(value, { stream: true })
      }
      const newSecs: Record<string, string> = {}
      tpl.sections.forEach((sec, i) => {
        const next = tpl.sections[i + 1]
        const re = new RegExp(`${sec.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\n]+([\\s\\S]*?)${next ? `(?=${next.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})` : '$'}`, 'i')
        const m = raw.match(re)
        newSecs[sec.title] = m ? m[1].trim() : ''
      })
      if (Object.values(newSecs).some(v => v)) setSections(newSecs)
      else setSections({ [tpl.sections[0].title]: raw, ...Object.fromEntries(tpl.sections.slice(1).map(s => [s.title, ''])) })
    } catch { /* silent */ }
    finally { setGenerating(false) }
  }

  function buildHtml() {
    const rows = tpl.sections.map(s => {
      const body = sections[s.title] || ''
      return `<div style="margin-bottom:22px"><div style="font-size:10px;font-weight:700;color:${TEAL};text-transform:uppercase;letter-spacing:1.2px;margin-bottom:7px;padding-bottom:5px;border-bottom:1px solid #e5e7eb">${s.title}</div><div style="font-size:13px;color:#374151;line-height:1.75;white-space:pre-wrap">${body || '<span style=\\"color:#d1d5db;font-style:italic\\">—</span>'}</div></div>`
    }).join('')
    return `<div style="max-width:620px;margin:0 auto;font-family:'Montserrat','Gotham',system-ui,sans-serif;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="background:${NAVY};padding:26px 30px 22px"><div style="font-size:9px;font-weight:700;color:${TEAL};letter-spacing:2.5px;text-transform:uppercase;margin-bottom:6px">ERP FUNDS · INDUSTRIAL CRE</div><div style="font-size:19px;font-weight:700;color:#fff;line-height:1.3">${subject}</div><div style="font-size:11px;color:#93b8be;margin-top:3px">${tpl.audience} · ${tpl.frequency}</div><div style="height:2px;background:linear-gradient(90deg,${TEAL},transparent);margin-top:14px;border-radius:2px"></div></div><div style="padding:26px 30px">${rows}</div><div style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:14px 30px;display:flex;justify-content:space-between"><div style="font-size:10px;color:#9ca3af">ERP Funds · Permian Basin &amp; Brevard County · Industrial CRE</div><div style="font-size:10px;color:#9ca3af">Unsubscribe</div></div></div>`
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(buildHtml())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnBase: React.CSSProperties = { fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 7, padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: '20px 10px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10, paddingLeft: 8 }}>Brokerage Templates</div>
        {BROKERAGE_TEMPLATES.map(p => (
          <button key={p.id} onClick={() => setSelectedId(p.id)} style={{
            width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: 'none', marginBottom: 3,
            background: selectedId === p.id ? '#f0f7f8' : 'transparent',
            borderLeft: selectedId === p.id ? `3px solid ${TEAL}` : '3px solid transparent',
            cursor: 'pointer',
          }}>
            <div style={{ fontSize: 12, fontWeight: selectedId === p.id ? 700 : 500, color: selectedId === p.id ? NAVY : '#374151' }}>{p.name}</div>
            <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{p.audience}</div>
          </button>
        ))}
        <div style={{ margin: '16px 8px 10px', height: 1, background: '#e5e7eb' }} />
        <div style={{ padding: '2px 8px' }}>
          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 6 }}>About</div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{tpl.description}</div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: '#fff' }}>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line…"
            style={{ flex: 1, fontSize: 13, fontWeight: 600, color: NAVY, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 3, borderRadius: 7, background: '#f3f4f6', padding: 3 }}>
            {(['edit', 'preview'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ ...btnBase, padding: '5px 14px', background: tab === t ? '#fff' : 'transparent', color: tab === t ? NAVY : '#9ca3af', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,.08)' : 'none', fontWeight: tab === t ? 700 : 500, fontSize: 11 }}>
                {t === 'edit' ? 'Edit' : 'Preview'}
              </button>
            ))}
          </div>
          <button onClick={handleGenerate} disabled={generating} style={{ ...btnBase, background: NAVY, color: '#fff', opacity: generating ? 0.6 : 1 }}>
            {generating ? '⏳ Generating…' : '✦ Generate Draft'}
          </button>
          <button onClick={handleCopy} style={{ ...btnBase, background: copied ? '#f0fdf4' : '#f3f4f6', color: copied ? '#3DAE7A' : '#374151' }}>
            {copied ? '✓ Copied' : '⎘ Copy HTML'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'edit' ? (
            <div>
              <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 16 }}>
                {tpl.name} · {tpl.audience} · {tpl.sections.length} sections
              </div>
              {tpl.sections.map((sec, i) => (
                <div key={sec.title} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TEAL, textTransform: 'uppercase', letterSpacing: '1px' }}>§{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{sec.title}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{sec.hint}</span>
                  </div>
                  <textarea value={sections[sec.title] ?? ''} onChange={e => setSections(prev => ({ ...prev, [sec.title]: e.target.value }))}
                    placeholder={sec.hint} rows={3}
                    style={{ width: '100%', fontSize: 12, color: '#374151', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit', outline: 'none', lineHeight: 1.6, background: '#fafafa' }} />
                </div>
              ))}
            </div>
          ) : (
            <div dangerouslySetInnerHTML={{ __html: buildHtml() }} />
          )}
        </div>
      </div>
    </div>
  )
}

// Shared browser Supabase client for editable data views (Properties, Work Orders)
let _editSb: ReturnType<typeof createBrowserClient> | null = null
function editSb() {
  if (!_editSb) {
    _editSb = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _editSb
}

// Generic modal shell used by the editable data views
function EditModal({ title, onClose, onSave, saving, children }: { title: string; onClose: () => void; onSave: () => void; saving: boolean; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,45,82,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0D2D52' }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>{children}</div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// Labeled field wrapper for modal forms
function MField({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: span ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#9ca3af', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  )
}
const mInput: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, width: '100%', boxSizing: 'border-box' }

const EMPTY_PROPERTY: Property = {
  id: 0, entity: 'DST', corridor: '', address: '', tenant: '', built: null, acres: null,
  total: null, office: null, warehouse: null, type: 'single', cranes: null, layout: '',
  structure: '', electrical: '', hvac: '', plumbing: '', exterior: '', notes: '',
  washBay: 'Unknown', leaseExpiry: null,
}

function RentRollView() {
  const [search, setSearch] = React.useState('')
  const [entityFilter, setEntityFilter] = React.useState('all')
  const [typeFilter, setTypeFilter] = React.useState('all')
  const [washBayFilter, setWashBayFilter] = React.useState('all')
  const [expanded, setExpanded] = React.useState<number | null>(null)
  const [sortBy, setSortBy] = React.useState<'expiry' | 'portfolio' | 'building'>('expiry')
  const [expFilter, setExpFilter] = React.useState<'all' | '6' | '12'>('all')
  const [unitDraft, setUnitDraft] = React.useState<{ propId: number; building: string; unit: string; tenant: string; expiry: string; sf: string } | null>(null)
  const [unitSaving, setUnitSaving] = React.useState(false)
  const [loopnetSyncing, setLoopnetSyncing] = React.useState(false)

  async function refreshLoopnet() {
    setLoopnetSyncing(true)
    try {
      const res = await fetch('/api/loopnet-sync', { method: 'POST' })
      const d = await res.json()
      if (d.ok) { alert(`LoopNet refresh complete — ${d.updatedCount} link(s) updated.`); await load() }
      else if (d.blocked) alert('LoopNet could not be reached this time (bot protection). No changes made — try again later.')
      else alert('LoopNet refresh failed: ' + (d.error || 'unknown'))
    } catch (e) { alert('LoopNet refresh error: ' + e) }
    setLoopnetSyncing(false)
  }

  const [rows, setRows] = React.useState<Property[]>([])
  const [loading, setLoading] = React.useState(true)
  const [draft, setDraft] = React.useState<Property | null>(null) // edit/add modal state
  const [isNew, setIsNew] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await editSb().from('properties').select('*').order('sort_order', { ascending: true })
    if (!error && data) setRows(data as Property[])
    setLoading(false)
  }
  React.useEffect(() => { load() }, [])

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    const { id, ...rest } = draft as any
    delete rest.sort_order; delete rest.updated_at
    if (isNew) {
      const maxOrder = rows.reduce((m, r: any) => Math.max(m, r.sort_order ?? 0), 0)
      await editSb().from('properties').insert({ ...rest, sort_order: maxOrder + 1 })
    } else {
      await editSb().from('properties').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDraft(null); await load()
  }

  async function deleteRow(id: number) {
    if (!confirm('Delete this property? This cannot be undone.')) return
    await editSb().from('properties').delete().eq('id', id)
    setExpanded(null); await load()
  }

  const upd = (patch: Partial<Property>) => setDraft(d => d ? { ...d, ...patch } : d)
  const num = (v: string) => v === '' ? null : Number(v)

  async function saveUnit() {
    if (!unitDraft) return
    setUnitSaving(true)
    const { data } = await editSb().from('properties').select('units').eq('id', unitDraft.propId).single()
    const units = ((data?.units as any[]) ?? []).map(u =>
      String(u.unit) === String(unitDraft.unit)
        ? { ...u, tenant: unitDraft.tenant || 'Vacant', expiry: unitDraft.expiry || null, sf: unitDraft.sf ? Number(unitDraft.sf) : null }
        : u)
    await editSb().from('properties').update({ units, updated_at: new Date().toISOString() }).eq('id', unitDraft.propId)
    setUnitSaving(false); setUnitDraft(null); await load()
  }

  const q = search.toLowerCase()
  // Lease-expiry window filter (rows whose lease expires within N months from today)
  const _today = new Date()
  const _expCut = expFilter === 'all' ? null : new Date(_today.getFullYear(), _today.getMonth() + parseInt(expFilter), _today.getDate())
  const passExp = (d?: string | null) => { if (expFilter === 'all') return true; if (!d) return false; const x = new Date(d); return x >= _today && _expCut !== null && x <= _expCut }

  // Metric base: scoped by entity / wash bay / search only (NOT the type filter), so toggling
  // the type filter (e.g. Vacant) doesn't distort the portfolio stats.
  const metricBase = rows.filter(p => {
    const matchEntity = entityFilter === 'all' || p.entity === entityFilter
    const isMulti = !!(p.units && p.units.length > 0)
    const matchWashBay = washBayFilter === 'all' || p.washBay === washBayFilter
    const matchSearch = !q || p.address.toLowerCase().includes(q) || p.tenant.toLowerCase().includes(q) || p.corridor.toLowerCase().includes(q) || (isMulti && (p.units!).some(u => (u.tenant || '').toLowerCase().includes(q)))
    return matchEntity && matchWashBay && matchSearch
  })

  // Table rows: break multi-tenant buildings into one row per unit, then apply the type filter per row
  type Row = Property & { _key: string; _unit?: boolean; _unitNo?: string }
  const flat: Row[] = []
  metricBase.forEach(p => {
    if (p.units && p.units.length > 0) {
      p.units.forEach(u => {
        const utype: Property['type'] = (u.tenant || '').toLowerCase() === 'vacant' ? 'vacant' : 'single'
        if (typeFilter !== 'all' && typeFilter !== 'multi' && utype !== typeFilter) return
        if (!passExp(u.expiry)) return
        if (q && !(`${p.address} unit ${u.unit}`.toLowerCase().includes(q) || (u.tenant || '').toLowerCase().includes(q) || p.corridor.toLowerCase().includes(q))) return
        flat.push({ ...p, _key: `${p.id}-u${u.unit}`, _unit: true, _unitNo: u.unit,
          address: `${p.address} — Unit ${u.unit}`, tenant: u.tenant || 'Vacant', type: utype,
          leaseExpiry: u.expiry ?? null, built: p.built, total: u.sf ?? null, office: null, warehouse: null, cranes: null, units: null })
      })
    } else if ((typeFilter === 'all' || p.type === typeFilter) && passExp(p.leaseExpiry)) {
      flat.push({ ...p, _key: `p${p.id}` })
    }
  })

  // Sort
  const display = [...flat].sort((a, b) => {
    if (sortBy === 'building') {
      // group by building (portfolio order), units kept together and ordered by unit number
      const so = ((a as any).sort_order ?? 0) - ((b as any).sort_order ?? 0)
      if (so !== 0) return so
      return (parseInt((a as any)._unitNo || '0') - parseInt((b as any)._unitNo || '0'))
    }
    if ((a.type === 'vacant') !== (b.type === 'vacant')) return a.type === 'vacant' ? -1 : 1 // vacant first
    if (sortBy === 'portfolio') return 0
    if (!a.leaseExpiry && !b.leaseExpiry) return 0
    if (!a.leaseExpiry) return 1
    if (!b.leaseExpiry) return -1
    return a.leaseExpiry.localeCompare(b.leaseExpiry)
  })

  // WALE — SF-weighted average years of lease term remaining (multi-tenant units weighted by building SF / unit count)
  const yrsLeft = (d: string) => (new Date(d).getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000)
  let waleNum = 0, waleDen = 0
  metricBase.forEach(p => {
    if (p.units && p.units.length > 0) {
      p.units.forEach(u => { if (u.expiry) { const w = u.sf ?? 0; waleNum += w * yrsLeft(u.expiry); waleDen += w } })
    } else if (p.type !== 'vacant' && p.leaseExpiry) {
      const w = p.total ?? 0
      waleNum += w * yrsLeft(p.leaseExpiry); waleDen += w
    }
  })
  const wale = waleDen ? waleNum / waleDen : 0

  // Occupancy by UNIT count across the portfolio: multi-tenant counts each unit; single-tenant = 1 unit
  let totalUnits = 0, occupiedUnits = 0
  metricBase.forEach(p => {
    if (p.units && p.units.length > 0) {
      totalUnits += p.units.length
      occupiedUnits += p.units.filter(u => (u.tenant || '').toLowerCase() !== 'vacant').length
    } else {
      totalUnits += 1
      occupiedUnits += p.type === 'vacant' ? 0 : 1
    }
  })
  const occupancyPct = totalUnits ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  // Type-filter counts at the UNIT level (multi-tenant counts each unit; single building = 1)
  let cntSingle = 0, cntMulti = 0, cntVacant = 0
  rows.forEach(p => {
    if (p.units && p.units.length > 0) {
      cntMulti += p.units.length
      p.units.forEach(u => ((u.tenant || '').toLowerCase() === 'vacant' ? cntVacant++ : cntSingle++))
    } else if (p.type === 'vacant') cntVacant++
    else cntSingle++
  })

  // Leases (incl. multi-tenant units) expiring within the next 6 months
  const now6 = new Date()
  const horizon6 = new Date(now6.getFullYear(), now6.getMonth() + 6, now6.getDate())
  const inWindow = (d?: string | null) => { if (!d) return false; const x = new Date(d); return x >= now6 && x <= horizon6 }
  let expiring6 = 0
  metricBase.forEach(p => {
    if (p.units && p.units.length > 0) expiring6 += p.units.filter(u => inWindow(u.expiry)).length
    else if (inWindow(p.leaseExpiry)) expiring6 += 1
  })

  function exportCsv() {
    const cols: [string, (p: Property) => any][] = [
      ['Fund', p => ENTITY_LABELS[p.entity] ?? p.entity], ['Address', p => p.address], ['Corridor', p => p.corridor],
      ['Tenant', p => p.tenant], ['Type', p => p.type], ['Built', p => p.built], ['Total SF', p => p.total],
      ['Office SF', p => p.office], ['Warehouse SF', p => p.warehouse], ['Acres', p => p.acres],
      ['Wash Bay', p => p.washBay], ['Lease Expiry', p => p.leaseExpiry], ['Cranes', p => p.cranes],
      ['Layout', p => p.layout], ['Structure', p => p.structure], ['Electrical', p => p.electrical],
      ['HVAC', p => p.hvac], ['Plumbing', p => p.plumbing], ['Exterior', p => p.exterior], ['Notes', p => p.notes],
    ]
    const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const lines = [cols.map(c => c[0]).join(',')]
    display.forEach(p => lines.push(cols.map(c => esc(c[1](p))).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ERP-Properties-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const EC: Record<string, {bg: string, text: string, border: string}> = {
    DST:        {bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd'},
    II:         {bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0'},
    'III-191':  {bg: '#fef3c7', text: '#b45309', border: '#fde68a'},
    'III-1788': {bg: '#fdf4ff', text: '#7e22ce', border: '#e9d5ff'},
    IV:         {bg: '#fff1f2', text: '#be123c', border: '#fecdd3'},
    'III-other':{bg: '#f0f9ff', text: '#0c4a6e', border: '#bae6fd'},
  }

  const fmtN = (n: number | null) => n ? n.toLocaleString() : '—'

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>🏢 Properties</h2>
          <p>Full portfolio — {rows.length} properties across {ENTITY_ORDER.length} funds · <span style={{ color: '#16a34a' }}>editable</span></p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={refreshLoopnet} disabled={loopnetSyncing} title="Refresh vacancy LoopNet links from ERP's company page"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: loopnetSyncing ? .6 : 1 }}>
            {loopnetSyncing ? 'Refreshing…' : '🔗 Refresh LoopNet'}
          </button>
          <button onClick={exportCsv}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            ⬇ Export to Excel
          </button>
          <button onClick={() => { setDraft({ ...EMPTY_PROPERTY }); setIsNew(true) }}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            + Add property
          </button>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Properties', value: rows.length },
          { label: 'Occupancy',        value: occupancyPct + '%', color: occupancyPct >= 90 ? '#16a34a' : occupancyPct >= 75 ? '#d97706' : '#dc2626' },
          { label: 'Occupied Units',   value: occupiedUnits + ' / ' + totalUnits },
          { label: 'Expiring ≤6 mo',   value: expiring6, color: expiring6 > 0 ? '#dc2626' : '#16a34a' },
          { label: 'WALE',             value: wale.toFixed(1) + ' yrs' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: (s as any).color ?? '#111827' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search address, tenant, corridor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 220, padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, outline: 'none' }}
        />
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#111827' }}>
          <option value="all">All Portfolios ({rows.length})</option>
          {ENTITY_ORDER.map(e => (
            <option key={e} value={e}>{ENTITY_LABELS[e]} ({rows.filter(p => p.entity === e).length})</option>
          ))}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#111827' }}>
          <option value="all">All Types</option>
          <option value="single">Single-Tenant ({cntSingle})</option>
          <option value="multi">Multi-Tenant ({cntMulti})</option>
          <option value="vacant">Vacant ({cntVacant})</option>
        </select>
        <select value={washBayFilter} onChange={e => setWashBayFilter(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#111827' }}>
          <option value="all">Any Wash Bay</option>
          <option value="Yes">Wash Bay: Yes</option>
          <option value="No">Wash Bay: No</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'expiry' | 'portfolio' | 'building')}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#111827' }}>
          <option value="expiry">Sort: Lease expiry (soonest)</option>
          <option value="building">Sort: Building (group units)</option>
          <option value="portfolio">Sort: Portfolio order</option>
        </select>
        <select value={expFilter} onChange={e => setExpFilter(e.target.value as 'all' | '6' | '12')}
          style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#fff', color: '#111827' }}>
          <option value="all">Expiring: Any time</option>
          <option value="6">Expiring ≤ 6 months</option>
          <option value="12">Expiring ≤ 12 months</option>
        </select>
        {(entityFilter !== 'all' || typeFilter !== 'all' || washBayFilter !== 'all' || expFilter !== 'all' || search) && (
          <button onClick={() => { setSearch(''); setEntityFilter('all'); setTypeFilter('all'); setWashBayFilter('all'); setExpFilter('all'); }}
            style={{ padding: '7px 12px', border: '1px solid #e5e7eb', borderRadius: 7, fontSize: 13, background: '#f9fafb', color: '#6b7280', cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              {['Fund', 'Address', 'Corridor', 'Tenant', 'Built', 'Total SF', 'Office', 'Whse', 'Cranes', 'Type', 'Wash Bay', 'Lease Exp', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {display.map(p => {
              const ec = EC[p.entity] ?? EC.DST
              const isUnit = !!(p as any)._unit
              const isExp = !isUnit && expanded === p.id
              return (
                <React.Fragment key={(p as any)._key}>
                  <tr
                    style={{ borderBottom: '1px solid #f3f4f6', cursor: isUnit ? 'default' : 'pointer', background: isExp ? '#f0f9ff' : isUnit ? '#fcfdff' : undefined }}
                    onClick={() => { if (!isUnit) setExpanded(isExp ? null : p.id) }}
                    onMouseEnter={e => { if (!isExp && !isUnit) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isExp && !isUnit) e.currentTarget.style.background = isUnit ? '#fcfdff' : '' }}
                  >
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: ec.bg, color: ec.text, border: `1px solid ${ec.border}` }}>
                        {p.entity}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', fontWeight: isUnit ? 400 : 500, color: isUnit ? '#4b5563' : '#111827', maxWidth: 260 }}>{isUnit ? '↳ ' + p.address : p.address}</td>
                    <td style={{ padding: '9px 12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{p.corridor}</td>
                    <td style={{ padding: '9px 12px', maxWidth: 220, color: p.type === 'vacant' ? '#ef4444' : '#374151' }}>
                      {p.type === 'vacant'
                        ? (p.loopnetUrl
                            ? <a href={p.loopnetUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textDecoration: 'none', whiteSpace: 'nowrap' }} title="Open LoopNet listing">🔗 LoopNet ↗</a>
                            : <span onClick={(e) => { e.stopPropagation(); if (!isUnit) { setDraft({ ...p }); setIsNew(false) } }}
                                style={{ fontSize: 11, color: '#9ca3af', cursor: isUnit ? 'default' : 'pointer', fontStyle: 'italic' }}>+ add LoopNet link</span>)
                        : p.tenant}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{p.built ?? '—'}</td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: 500 }}>{fmtN(p.total)}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtN(p.office)}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtN(p.warehouse)}</td>
                    <td title={p.cranes ?? ''} style={{ padding: '9px 12px', color: p.cranes && p.cranes !== 'None' ? '#374151' : '#d1d5db', maxWidth: 150, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.cranes ? p.cranes : '—'}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: p.type === 'single' ? '#f0fdf4' : p.type === 'multi' ? '#fef3c7' : '#fef2f2',
                        color: p.type === 'single' ? '#16a34a' : p.type === 'multi' ? '#d97706' : '#dc2626' }}>
                        {p.type}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                      {p.washBay === 'Yes' ? '✅' : p.washBay === 'No' ? '✗' : '?'}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      {(() => {
                        if (!p.leaseExpiry) return p.units && p.units.length > 0
                          ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4f46e5' }}>{p.units.length} units ▾</span>
                          : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>
                        const yr = parseInt(p.leaseExpiry.split('-')[0])
                        const hasMonth = p.leaseExpiry.includes('-')
                        const now = new Date()
                        const expDate = hasMonth ? new Date(p.leaseExpiry) : new Date(yr, 11, 31)
                        const months = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth())
                        const color = months < 6 ? '#dc2626' : months < 12 ? '#d97706' : '#16a34a'
                        const bg = months < 6 ? '#fef2f2' : months < 12 ? '#fef3c7' : '#f0fdf4'
                        const label = hasMonth ? p.leaseExpiry.slice(0, 7) : String(yr)
                        return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color }}>{label}</span>
                      })()}
                    </td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {isUnit ? (
                        <button onClick={(e) => { e.stopPropagation(); setUnitDraft({ propId: p.id, building: p.address.replace(/ — Unit.*$/, ''), unit: (p as any)._unitNo, tenant: p.tenant === 'Vacant' ? '' : p.tenant, expiry: p.leaseExpiry ?? '', sf: p.total != null ? String(p.total) : '' }) }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✎</button>
                      ) : <>
                      <button onClick={(e) => { e.stopPropagation(); setDraft({ ...p }); setIsNew(false) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 11, fontWeight: 600, marginRight: 6 }}>✎</button>
                      <button onClick={(e) => { e.stopPropagation(); deleteRow(p.id) }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600, marginRight: 8 }}>🗑</button>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>{isExp ? '▲' : '▼'}</span>
                      </>}
                    </td>
                  </tr>
                  {isExp && (
                    <tr style={{ background: '#f0f9ff', borderBottom: '2px solid #A6C3C9' }}>
                      <td colSpan={13} style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, fontSize: 12 }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px' }}>Building</div>
                            {[['Layout', p.layout], ['Structure', p.structure]].map(([k, v]) => (
                              <div key={k} style={{ marginBottom: 6 }}>
                                <span style={{ color: '#9ca3af', fontSize: 11 }}>{k}: </span>
                                <span style={{ color: '#374151' }}>{v}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px' }}>Systems</div>
                            {[['Electrical', p.electrical], ['HVAC', p.hvac], ['Plumbing', p.plumbing]].map(([k, v]) => (
                              <div key={k} style={{ marginBottom: 6 }}>
                                <span style={{ color: '#9ca3af', fontSize: 11 }}>{k}: </span>
                                <span style={{ color: '#374151' }}>{v}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px' }}>Site</div>
                            {[['Exterior', p.exterior], ['Acres', p.acres ? p.acres + ' ac' : '—'], ['Notes', p.notes || '—']].map(([k, v]) => (
                              <div key={k} style={{ marginBottom: 6 }}>
                                <span style={{ color: '#9ca3af', fontSize: 11 }}>{k}: </span>
                                <span style={{ color: '#374151' }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {p.units && p.units.length > 0 && (
                          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #dbeafe' }}>
                            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px' }}>Units — Lease Expirations ({p.units.length})</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 6 }}>
                              {p.units.map(u => {
                                let color = '#9ca3af', bg = '#f3f4f6'
                                if (u.expiry) {
                                  const months = (new Date(u.expiry).getFullYear() - new Date().getFullYear()) * 12 + (new Date(u.expiry).getMonth() - new Date().getMonth())
                                  color = months < 6 ? '#dc2626' : months < 12 ? '#d97706' : '#16a34a'
                                  bg = months < 6 ? '#fef2f2' : months < 12 ? '#fef3c7' : '#f0fdf4'
                                }
                                return (
                                  <div key={u.unit} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, padding: '6px 10px', fontSize: 12 }}>
                                    <span style={{ fontWeight: 700, color: '#0D2D52', minWidth: 22 }}>{u.unit}</span>
                                    <span style={{ flex: 1, color: u.tenant === 'Vacant' ? '#ef4444' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={u.tenant}>{u.tenant}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: bg, color, whiteSpace: 'nowrap' }}>{u.expiry ? u.expiry.slice(0, 7) : '—'}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid #dbeafe' }}>
                          <button onClick={(e) => { e.stopPropagation(); setDraft({ ...p }); setIsNew(false) }}
                            style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✎ Edit</button>
                          <button onClick={(e) => { e.stopPropagation(); deleteRow(p.id) }}
                            style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>🗑 Delete</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading properties…</div>
        )}
        {!loading && display.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No properties match your filters.</div>
        )}
      </div>

      {draft && (
        <EditModal title={isNew ? 'Add property' : `Edit — ${draft.address || 'property'}`} onClose={() => setDraft(null)} onSave={saveDraft} saving={saving}>
          <MField label="Fund / Entity">
            <select value={draft.entity} onChange={e => upd({ entity: e.target.value })} style={mInput}>
              {ENTITY_ORDER.map(en => <option key={en} value={en}>{ENTITY_LABELS[en]}</option>)}
            </select>
          </MField>
          <MField label="Corridor"><input style={mInput} value={draft.corridor} onChange={e => upd({ corridor: e.target.value })} /></MField>
          <MField label="Address" span><input style={mInput} value={draft.address} onChange={e => upd({ address: e.target.value })} /></MField>
          <MField label="Tenant" span><input style={mInput} value={draft.tenant} onChange={e => upd({ tenant: e.target.value })} /></MField>
          <MField label="Type">
            <select value={draft.type} onChange={e => upd({ type: e.target.value as Property['type'] })} style={mInput}>
              <option value="single">single</option><option value="multi">multi</option><option value="vacant">vacant</option>
            </select>
          </MField>
          <MField label="Wash Bay">
            <select value={draft.washBay} onChange={e => upd({ washBay: e.target.value as Property['washBay'] })} style={mInput}>
              <option value="Yes">Yes</option><option value="No">No</option><option value="Unknown">Unknown</option>
            </select>
          </MField>
          <MField label="Lease Expiry"><input type="date" style={mInput} value={draft.leaseExpiry ?? ''} onChange={e => upd({ leaseExpiry: e.target.value || null })} /></MField>
          <MField label="LoopNet listing URL" span><input style={mInput} placeholder="https://www.loopnet.com/Listing/..." value={draft.loopnetUrl ?? ''} onChange={e => upd({ loopnetUrl: e.target.value || null })} /></MField>
          <MField label="Year Built"><input type="number" style={mInput} value={draft.built ?? ''} onChange={e => upd({ built: num(e.target.value) })} /></MField>
          <MField label="Acres"><input type="number" step="0.01" style={mInput} value={draft.acres ?? ''} onChange={e => upd({ acres: num(e.target.value) })} /></MField>
          <MField label="Total SF"><input type="number" style={mInput} value={draft.total ?? ''} onChange={e => upd({ total: num(e.target.value) })} /></MField>
          <MField label="Office SF"><input type="number" style={mInput} value={draft.office ?? ''} onChange={e => upd({ office: num(e.target.value) })} /></MField>
          <MField label="Warehouse SF"><input type="number" style={mInput} value={draft.warehouse ?? ''} onChange={e => upd({ warehouse: num(e.target.value) })} /></MField>
          <MField label="Cranes" span><input style={mInput} value={draft.cranes ?? ''} onChange={e => upd({ cranes: e.target.value || null })} /></MField>
          <MField label="Layout" span><input style={mInput} value={draft.layout} onChange={e => upd({ layout: e.target.value })} /></MField>
          <MField label="Structure" span><input style={mInput} value={draft.structure} onChange={e => upd({ structure: e.target.value })} /></MField>
          <MField label="Electrical"><input style={mInput} value={draft.electrical} onChange={e => upd({ electrical: e.target.value })} /></MField>
          <MField label="HVAC"><input style={mInput} value={draft.hvac} onChange={e => upd({ hvac: e.target.value })} /></MField>
          <MField label="Plumbing"><input style={mInput} value={draft.plumbing} onChange={e => upd({ plumbing: e.target.value })} /></MField>
          <MField label="Exterior"><input style={mInput} value={draft.exterior} onChange={e => upd({ exterior: e.target.value })} /></MField>
          <MField label="Notes" span><textarea style={{ ...mInput, minHeight: 60, resize: 'vertical' }} value={draft.notes} onChange={e => upd({ notes: e.target.value })} /></MField>
        </EditModal>
      )}

      {unitDraft && (
        <EditModal title={`Edit unit — ${unitDraft.building} · Unit ${unitDraft.unit}`} onClose={() => setUnitDraft(null)} onSave={saveUnit} saving={unitSaving}>
          <MField label="Tenant (blank = Vacant)" span><input style={mInput} value={unitDraft.tenant} onChange={e => setUnitDraft(d => d ? { ...d, tenant: e.target.value } : d)} /></MField>
          <MField label="Lease Expiry"><input type="date" style={mInput} value={unitDraft.expiry} onChange={e => setUnitDraft(d => d ? { ...d, expiry: e.target.value } : d)} /></MField>
          <MField label="Unit SF"><input type="number" style={mInput} value={unitDraft.sf} onChange={e => setUnitDraft(d => d ? { ...d, sf: e.target.value } : d)} /></MField>
        </EditModal>
      )}
    </div>
  )
}

const EMPTY_WO: WorkOrder = { id: 0, address: '', tenant: '', quicklook_last: null, hvac_last: null, fire_last: null, backflow_last: null, elevator_last: null, crane_last: null }

type InspKey = 'quicklook_last' | 'hvac_last' | 'fire_last' | 'backflow_last' | 'elevator_last' | 'crane_last'
const INSP_TYPES: { key: InspKey; label: string; bg: string; color: string; craneOnly?: boolean }[] = [
  { key: 'quicklook_last', label: '🔍 Quicklook', bg: '#f0fdfa', color: '#0d9488' },
  { key: 'hvac_last',      label: '❄️ HVAC',      bg: '#eff6ff', color: '#2563eb' },
  { key: 'fire_last',      label: '🔥 Fire',      bg: '#fff7ed', color: '#ea580c' },
  { key: 'backflow_last',  label: '🚰 Backflow',  bg: '#eff6ff', color: '#0369a1' },
  { key: 'elevator_last',  label: '🛗 Elevator',  bg: '#faf5ff', color: '#7e22ce' },
  { key: 'crane_last',     label: '🏗️ Crane',     bg: '#fffbeb', color: '#b45309', craneOnly: true },
]

function WorkOrdersView() {
  const [search, setSearch] = React.useState('')
  const [flagOnly, setFlagOnly] = React.useState(false)
  const [sel, setSel] = React.useState<Record<number, string>>({}) // per-row selected inspection type
  const [syncing, setSyncing] = React.useState(false)

  const [rows, setRows] = React.useState<WorkOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [draft, setDraft] = React.useState<WorkOrder | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await editSb().from('work_orders').select('*').order('address', { ascending: true })
    if (!error && data) setRows(data as WorkOrder[])
    setLoading(false)
  }
  React.useEffect(() => { load() }, [])

  const anyDate = (w: WorkOrder) => w.quicklook_last || w.hvac_last || w.fire_last || w.backflow_last || w.elevator_last || w.crane_last
  const latest = (w: WorkOrder) => [w.quicklook_last, w.hvac_last, w.fire_last, w.backflow_last, w.elevator_last, w.crane_last].filter(Boolean).sort().slice(-1)[0] ?? ''

  async function saveDraft() {
    if (!draft) return
    setSaving(true)
    const { id, ...rest } = draft as any
    delete rest.updated_at
    rest.flag = anyDate(draft) ? null : draft.flag // any inspection on record clears the flag
    if (isNew) await editSb().from('work_orders').insert({ ...rest })
    else await editSb().from('work_orders').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(false); setDraft(null); await load()
  }
  async function deleteRow(id: number) {
    if (!confirm('Delete this property from the inspections log?')) return
    await editSb().from('work_orders').delete().eq('id', id); await load()
  }
  const upd = (patch: Partial<WorkOrder>) => setDraft(d => d ? { ...d, ...patch } : d)

  // "Needs first inspection" rows first, then most recent inspection
  const rank = (w: WorkOrder) => (w.flag && !anyDate(w)) ? 0 : anyDate(w) ? 1 : 2
  const enriched = [...rows].sort((a, b) => rank(a) - rank(b) || latest(b).localeCompare(latest(a)))

  const filtered = enriched.filter(w => {
    const matchFlag = !flagOnly || (w.flag && !anyDate(w))
    const q = search.toLowerCase()
    const matchSearch = !q || w.address.toLowerCase().includes(q) || w.tenant.toLowerCase().includes(q)
    return matchFlag && matchSearch
  })

  const hvac = enriched.filter(w => w.hvac_last).length
  const fire = enriched.filter(w => w.fire_last).length
  const quicklook = enriched.filter(w => w.quicklook_last).length
  const needsInspection = enriched.filter(w => w.flag && !anyDate(w)).length

  const fmtDate = (s?: string | null) => {
    if (!s) return null
    const d = new Date(s)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const inputStyle: React.CSSProperties = { padding: '7px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13, background: '#fff' }
  const card = (label: string, value: React.ReactNode, color?: string): React.ReactNode => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 16px', flex: 1 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#9ca3af', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#111827', marginTop: 4 }}>{value}</div>
    </div>
  )

  async function syncWithProperties() {
    setSyncing(true)
    const { data: props } = await editSb().from('properties').select('address,tenant,type')
    const list = (props ?? []) as { address: string; tenant: string; type: string }[]
    const have = new Set(rows.map(r => r.address))
    let changed = 0, added = 0
    // Update tenant / vacancy on existing inspection rows
    for (const w of rows) {
      const p = list.find(x => x.address === w.address)
      if (!p) continue
      const desired = p.type === 'vacant' ? 'Vacant' : p.tenant
      const patch: any = {}
      if (desired !== w.tenant) patch.tenant = desired
      if (p.type === 'vacant' && w.flag) patch.flag = null
      if (Object.keys(patch).length) { await editSb().from('work_orders').update(patch).eq('id', w.id); changed++ }
    }
    // Add any property missing from the inspections log
    for (const p of list) {
      if (have.has(p.address)) continue
      const vacant = p.type === 'vacant'
      await editSb().from('work_orders').insert({ address: p.address, tenant: vacant ? 'Vacant' : p.tenant, flag: vacant ? null : 'Needs first inspection' })
      added++
    }
    setSyncing(false)
    await load()
    alert(`Synced with Properties — ${changed} tenant/vacancy update(s)` + (added ? `, ${added} new propert${added === 1 ? 'y' : 'ies'} added` : '') + '.')
  }

  function exportCsv() {
    const cols: [string, (w: WorkOrder) => any][] = [
      ['Property', w => w.address], ['Tenant', w => w.tenant],
      ['Quicklook Last', w => w.quicklook_last], ['HVAC Last', w => w.hvac_last], ['Fire Last', w => w.fire_last],
      ['Status', w => (w.flag && !anyDate(w)) ? w.flag : ''],
    ]
    const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const lines = [cols.map(c => c[0]).join(',')]
    filtered.forEach(w => lines.push(cols.map(c => esc(c[1](w))).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ERP-Inspections-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><h2>Inspections</h2><p>One row per property — pick an inspection type to see its last date · <span style={{ color: '#16a34a' }}>editable</span></p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={syncWithProperties} disabled={syncing} title="Pull current tenant names and vacancies from the Properties tab"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: syncing ? .6 : 1 }}>
            {syncing ? 'Syncing…' : '⟳ Sync with Properties'}
          </button>
          <button onClick={exportCsv}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
            ⬇ Export to Excel
          </button>
        <button onClick={() => { setDraft({ ...EMPTY_WO }); setIsNew(true) }}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add property</button>
        </div>
      </div>
      <SourceBar source="Industrial Cyclical Maintenance Tracking" agents="Property Operations · Maintenance &amp; Vendor" synced="From maintenance tracker" link="Open tracker ↗" />

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {card('Properties', enriched.length)}
        {card('HVAC on record', hvac, '#2563eb')}
        {card('Fire on record', fire, '#ea580c')}
        {card('Quicklook on record', quicklook, '#0d9488')}
        <div onClick={() => setFlagOnly(v => !v)} title="Occupied properties with no inspection on record"
          style={{ background: flagOnly ? '#fffbeb' : '#fff', border: `1px solid ${flagOnly ? '#f59e0b' : '#e5e7eb'}`, borderRadius: 10, padding: '12px 16px', flex: 1, cursor: 'pointer' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#9ca3af', fontWeight: 600 }}>🚩 Needs 1st Inspection</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#b45309', marginTop: 4 }}>{needsInspection}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search address or tenant…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, minWidth: 220 }} />
        {(search || flagOnly) && (
          <button onClick={() => { setSearch(''); setFlagOnly(false) }}
            style={{ ...inputStyle, cursor: 'pointer', color: '#6b7280' }}>Clear filters</button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#9ca3af' }}>{filtered.length} of {enriched.length}</span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
              {['Property', 'Tenant', 'Inspection Type', 'Last Done', ''].map((h, i) => (
                <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(w => {
              const opts = INSP_TYPES.filter(t => !t.craneOnly || w.has_crane)
              const selKey = (sel[w.id] ?? 'quicklook_last') as InspKey
              const typ = INSP_TYPES.find(t => t.key === selKey)!
              const dateVal = w[selKey]
              return (
                <tr key={w.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 500, color: '#111827' }}>{w.address}</td>
                  <td style={{ padding: '9px 12px', color: '#374151', maxWidth: 220 }}>{w.tenant}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <select value={selKey} onChange={e => setSel(s => ({ ...s, [w.id]: e.target.value }))}
                      style={{ fontSize: 12, fontWeight: 600, padding: '3px 6px', borderRadius: 6, border: `1px solid ${typ.color}33`, background: typ.bg, color: typ.color, cursor: 'pointer' }}>
                      {opts.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    {dateVal ? <span style={{ color: '#374151', fontWeight: 500 }}>{fmtDate(dateVal)}</span>
                      : (w.flag && !anyDate(w)) ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>🚩 {w.flag}</span>
                      : <span style={{ color: '#d1d5db' }}>— not recorded</span>}
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button onClick={() => { setDraft({ ...w }); setIsNew(false) }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 11, fontWeight: 600, marginRight: 6 }}>✎</button>
                    <button onClick={() => deleteRow(w.id)}
                      style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading inspections…</div>}
        {!loading && filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>No properties match your filters.</div>}
      </div>

      {draft && (
        <EditModal title={isNew ? 'Add property' : `Edit — ${draft.address || 'property'}`} onClose={() => setDraft(null)} onSave={saveDraft} saving={saving}>
          <MField label="Property / Address" span><input style={mInput} value={draft.address} onChange={e => upd({ address: e.target.value })} /></MField>
          <MField label="Tenant" span><input style={mInput} value={draft.tenant} onChange={e => upd({ tenant: e.target.value })} /></MField>
          <MField label="🔍 Quicklook — last done"><input type="date" style={mInput} value={draft.quicklook_last ?? ''} onChange={e => upd({ quicklook_last: e.target.value || null })} /></MField>
          <MField label="❄️ HVAC — last done"><input type="date" style={mInput} value={draft.hvac_last ?? ''} onChange={e => upd({ hvac_last: e.target.value || null })} /></MField>
          <MField label="🔥 Fire — last done"><input type="date" style={mInput} value={draft.fire_last ?? ''} onChange={e => upd({ fire_last: e.target.value || null })} /></MField>
          <MField label="🚰 Backflow — last done"><input type="date" style={mInput} value={draft.backflow_last ?? ''} onChange={e => upd({ backflow_last: e.target.value || null })} /></MField>
          <MField label="🛗 Elevator — last done"><input type="date" style={mInput} value={draft.elevator_last ?? ''} onChange={e => upd({ elevator_last: e.target.value || null })} /></MField>
          {draft.has_crane && (
            <MField label="🏗️ Crane — last done"><input type="date" style={mInput} value={draft.crane_last ?? ''} onChange={e => upd({ crane_last: e.target.value || null })} /></MField>
          )}
        </EditModal>
      )}
    </div>
  )
}

// ─── Leasing Pipeline ─────────────────────────────────────────────────────────

function LeasingView() {
  const TEAL = '#A6C3C9'
  const NAVY = '#0D2D52'

  const leases = [
    { property: 'Midland Service Yard',    tenant: 'Permian Oilfield Svcs',  sf: 18500, rent: 11.40, expiry: '2025-09-30', status: 'Renewal Risk',  market: 'Permian' },
    { property: 'Odessa IOS Yard',         tenant: 'Basin Logistics LLC',    sf: 24000, rent: 10.80, expiry: '2025-12-31', status: 'In Renewal',    market: 'Permian' },
    { property: 'Midland Flex I',          tenant: 'West TX Mechanical',     sf: 8200,  rent: 12.20, expiry: '2026-03-31', status: 'Stable',        market: 'Permian' },
    { property: 'Midland Flex I',          tenant: 'Permian Tools & Supply', sf: 6400,  rent: 11.90, expiry: '2026-06-30', status: 'Stable',        market: 'Permian' },
    { property: 'Palm Bay Industrial',     tenant: 'Space Coast Logistics',  sf: 21000, rent: 13.10, expiry: '2025-11-30', status: 'Renewal Risk',  market: 'Brevard' },
    { property: 'Melbourne Cold Storage',  tenant: 'Coastal Cold Chain',     sf: 14500, rent: 14.80, expiry: '2026-09-30', status: 'Stable',        market: 'Brevard' },
    { property: 'Titusville Service Bay',  tenant: 'Aero Ground Support',    sf: 11200, rent: 12.60, expiry: '2027-01-31', status: 'Long Term',     market: 'Brevard' },
    { property: 'Palm Bay Industrial',     tenant: 'SpaceX Subcontractor',   sf: 9800,  rent: 13.50, expiry: '2027-06-30', status: 'Long Term',     market: 'Brevard' },
  ]

  const occupancy = [
    { property: 'Midland Service Yard',   market: 'Permian', totalSf: 18500, occupiedSf: 18500, submarket: 96.3 },
    { property: 'Odessa IOS Yard',        market: 'Permian', totalSf: 24000, occupiedSf: 24000, submarket: 96.3 },
    { property: 'Midland Flex I',         market: 'Permian', totalSf: 16200, occupiedSf: 14600, submarket: 96.3 },
    { property: 'Palm Bay Industrial',    market: 'Brevard', totalSf: 30800, occupiedSf: 30800, submarket: 94.4 },
    { property: 'Melbourne Cold Storage', market: 'Brevard', totalSf: 14500, occupiedSf: 14500, submarket: 94.4 },
    { property: 'Titusville Service Bay', market: 'Brevard', totalSf: 11200, occupiedSf: 11200, submarket: 94.4 },
  ]

  const statusColor: Record<string, string> = {
    'Renewal Risk': '#ef4444', 'In Renewal': '#f59e0b', 'Stable': '#3DAE7A', 'Long Term': '#3B82F6',
  }
  const statusBg: Record<string, string> = {
    'Renewal Risk': '#fef2f2', 'In Renewal': '#fffbeb', 'Stable': '#f0fdf4', 'Long Term': '#eff6ff',
  }

  const now = new Date()
  const monthsUntil = (dateStr: string) => {
    const d = new Date(dateStr)
    return (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth())
  }
  const fmtExpiry = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

  const totalSf    = occupancy.reduce((s, p) => s + p.totalSf, 0)
  const occupiedSf = occupancy.reduce((s, p) => s + p.occupiedSf, 0)
  const portfolioOcc = Math.round(occupiedSf / totalSf * 100)

  const expiryBuckets = [
    { label: '< 6 months',  count: leases.filter(l => monthsUntil(l.expiry) < 6).length,  color: '#ef4444' },
    { label: '6–12 months', count: leases.filter(l => { const m = monthsUntil(l.expiry); return m >= 6 && m < 12 }).length, color: '#f59e0b' },
    { label: '12–24 months',count: leases.filter(l => { const m = monthsUntil(l.expiry); return m >= 12 && m < 24 }).length, color: '#3B82F6' },
    { label: '24+ months',  count: leases.filter(l => monthsUntil(l.expiry) >= 24).length, color: '#3DAE7A' },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Leasing</h2>
        <p>Lease expirations · Rollover risk · Portfolio occupancy</p>
      </div>

      <SourceBar source="VTS" agents="Leasing · Property Operations" synced="Not yet connected" link="Connect VTS ↗" />

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Portfolio Occupancy', value: `${portfolioOcc}%`,                                           sub: `${occupiedSf.toLocaleString()} / ${totalSf.toLocaleString()} SF` },
          { label: 'Leases Expiring <6mo', value: `${expiryBuckets[0].count}`,                                sub: `${leases.filter(l=>monthsUntil(l.expiry)<6).reduce((s,l)=>s+l.sf,0).toLocaleString()} SF at risk` },
          { label: 'In Renewal',           value: `${leases.filter(l=>l.status==='In Renewal').length}`,      sub: 'Active renewal discussions' },
          { label: 'Total Leases',         value: `${leases.length}`,                                          sub: `${leases.reduce((s,l)=>s+l.sf,0).toLocaleString()} SF leased` },
          { label: 'Wtd. Avg Rent',        value: `$${(leases.reduce((s,l)=>s+l.rent*l.sf,0)/leases.reduce((s,l)=>s+l.sf,0)).toFixed(2)}/sf`, sub: 'NNN across portfolio' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: 3 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Lease Expiration Schedule ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 2 }}>Lease Expiration Schedule</h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Rollover risk by property and tenant</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {expiryBuckets.map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color, display: 'inline-block' }} />
                {b.label} ({b.count})
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Property', 'Market', 'Tenant', 'SF', 'NNN Rate', 'Expiry', 'Months Left', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', padding: '10px 14px', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...leases].sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime()).map((l, i) => {
                const mos = monthsUntil(l.expiry)
                const barColor = mos < 6 ? '#ef4444' : mos < 12 ? '#f59e0b' : mos < 24 ? '#3B82F6' : '#3DAE7A'
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: '#111827' }}>{l.property}</td>
                    <td style={{ padding: '11px 14px', color: '#6b7280' }}>{l.market}</td>
                    <td style={{ padding: '11px 14px', color: '#374151' }}>{l.tenant}</td>
                    <td style={{ padding: '11px 14px', color: '#6b7280' }}>{l.sf.toLocaleString()}</td>
                    <td style={{ padding: '11px 14px', color: '#111827', fontWeight: 500 }}>${l.rent.toFixed(2)}</td>
                    <td style={{ padding: '11px 14px', color: '#374151' }}>{fmtExpiry(l.expiry)}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 5, background: '#f3f4f6', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (mos / 30) * 100)}%`, background: barColor, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#374151' }}>{mos}mo</span>
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: statusColor[l.status], background: statusBg[l.status], borderRadius: 5, padding: '2px 7px' }}>{l.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#9ca3af', padding: '10px 14px', borderTop: '1px solid #f3f4f6' }}>Placeholder data — connect VTS to populate live lease records</div>
        </div>
      </div>

      {/* ── Occupancy Tracker ── */}
      <div>
        <div style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 2 }}>Occupancy Tracker</h2>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Portfolio occupancy vs. submarket average by property</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {['Permian', 'Brevard'].map(mkt => {
            const props = occupancy.filter(p => p.market === mkt)
            const mktOcc = Math.round(props.reduce((s,p)=>s+p.occupiedSf,0) / props.reduce((s,p)=>s+p.totalSf,0) * 100)
            const subMkt = props[0]?.submarket ?? 0
            const color  = mkt === 'Permian' ? TEAL : '#6366f1'
            return (
              <div key={mkt} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{mkt === 'Permian' ? 'Permian Basin' : 'Brevard County'}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{props.length} properties · {props.reduce((s,p)=>s+p.totalSf,0).toLocaleString()} SF</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{mktOcc}%</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>vs {subMkt}% submarket</div>
                  </div>
                </div>
                {props.map((p, i) => {
                  const pOcc = Math.round(p.occupiedSf / p.totalSf * 100)
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>{p.property}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#111827' }}>{pOcc}%</span>
                      </div>
                      <div style={{ position: 'relative', height: 8, background: '#f3f4f6', borderRadius: 4 }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${p.submarket}%`, background: '#e5e7eb', borderRadius: 4 }} />
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pOcc}%`, background: color, borderRadius: 4 }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>{p.occupiedSf.toLocaleString()} / {p.totalSf.toLocaleString()} SF occupied</span>
                        <span style={{ fontSize: 9, color: '#9ca3af' }}>Submarket {p.submarket}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 10, textAlign: 'center' }}>Placeholder data — connect VTS to populate live occupancy records</div>
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
  { icon: '🗂️', label: 'Investor Relations (SharePoint)', desc: 'Auto-synced weekly from the Investor Relations SharePoint folder — review and prune manually', agents: ['Investor Relations'] },
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

function KBCategoryCard({ kb }: { kb: { icon: string; label: string; desc: string; agents: string[] } }) {
  const [docs, setDocs] = useState<UploadedFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)

  const fetchDocs = async () => {
    try {
      const res = await fetch(`/api/files/list?category=${encodeURIComponent(kb.label)}`)
      const data = await res.json()
      setDocs(data.files ?? [])
    } catch { setDocs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDocs() }, [])

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    for (const file of Array.from(fileList)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', kb.label)
      await fetch('/api/files/upload', { method: 'POST', body: fd })
    }
    await fetchDocs()
    setUploading(false)
  }

  const removeDoc = async (fileId: string) => {
    await fetch(`/api/files/${fileId}`, { method: 'DELETE' })
    setDocs((d) => d.filter((x) => x.file_id !== fileId))
  }

  return (
    <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f0f9fa', border: '1px solid #a5f3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{kb.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{kb.label}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{kb.desc}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
            {kb.agents.map((a) => <span key={a} className="badge badge-blue" style={{ fontSize: 9 }}>{a}</span>)}
          </div>
        </div>
        <span style={{ fontSize: 11, color: '#9ca3af', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{docs.length} doc{docs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Upload zone */}
      <label
        className={`upload-zone${dragging ? ' drag-over' : ''}`}
        style={{ padding: '16px 12px', opacity: uploading ? 0.6 : 1 }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
        <span style={{ fontSize: 18 }}>📄</span>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{uploading ? 'Uploading…' : <>Drop files here or <span style={{ color: '#0e7490', textDecoration: 'underline' }}>browse</span></>}</div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>PDF, Word, Excel, PowerPoint, CSV</div>
      </label>

      {/* Doc list */}
      {loading ? (
        <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>Loading…</div>
      ) : docs.length > 0 && (
        <div className="doc-list">
          {docs.map((d) => (
            <div key={d.file_id} className="doc-item">
              <span style={{ fontSize: 14 }}>📄</span>
              <span style={{ fontSize: 12, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
              <button className="doc-item-remove" onClick={() => removeDoc(d.file_id)} title="Remove">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function KnowledgeBaseView() {
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncOk, setSyncOk] = useState(true)

  async function syncFromSharePoint() {
    setSyncing(true); setSyncMsg(null)
    try {
      const res = await fetch('/api/ir-kb-sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setSyncOk(false); setSyncMsg(data.error || 'Sync failed'); return }
      const results: any[] = data.results ?? []
      const summary = results
        .map((r) => r.error ? `${r.folder}: error` : `${r.category}: +${r.added?.length ?? 0} added, ${r.updated?.length ?? 0} updated`)
        .join('  ·  ')
      setSyncOk(true)
      setSyncMsg(`Synced from SharePoint — ${summary || 'no changes'}. Refreshing…`)
      setTimeout(() => window.location.reload(), 1500)
    } catch (e) {
      setSyncOk(false); setSyncMsg(String(e))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Knowledge Bases</h2>
          <p>Upload documents to each knowledge base — agents read these when they work</p>
        </div>
        <button
          onClick={syncFromSharePoint}
          disabled={syncing}
          title="Pull the latest files from the SharePoint folders (Investor Relations, ERP Funds IV) into their knowledge bases"
          style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, cursor: syncing ? 'default' : 'pointer', border: '1px solid #a5f3fc', background: syncing ? '#e0f2fe' : '#f0f9fa', color: '#0e7490', opacity: syncing ? 0.7 : 1 }}
        >
          {syncing ? 'Syncing…' : '🔄 Sync from SharePoint'}
        </button>
      </div>
      {syncMsg && (
        <div style={{ fontSize: 12, color: syncOk ? '#0e7490' : '#b91c1c', background: syncOk ? '#f0f9fa' : '#fef2f2', border: `1px solid ${syncOk ? '#a5f3fc' : '#fca5a5'}`, borderRadius: 8, padding: '8px 14px', marginBottom: 14 }}>
          {syncMsg}
        </div>
      )}
      <div style={{ background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 8, padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>💡</span>
        <span style={{ fontSize: 12, color: '#0e7490' }}>Documents uploaded here are indexed and made available to the agents listed. PDFs, Word, Excel, and PowerPoint files are all supported. <strong>Sync from SharePoint</strong> pulls the latest from the Investor Relations and ERP Funds IV folders.</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {KB_CATEGORIES.map((kb) => <KBCategoryCard key={kb.label} kb={kb} />)}
      </div>
    </div>
  )
}

// ─── Acquisition Research ─────────────────────────────────────────────────────

// ─── IR Q&A Review (Workflow 5) ─────────────────────────────────────────────────

interface QaItem {
  id: string; question: string; answer: string; category: string | null;
  status: string; source_subject: string | null; source_mailbox: string | null;
  source_sent_at: string | null; created_at: string; reviewed_by: string | null;
}

function qaBtn(color: string, bg = '#fff', border = '#e5e7eb'): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', color, background: bg, border: `1px solid ${border}` }
}

function QaReviewView() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [items, setItems] = useState<QaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ question: '', answer: '', category: '' })

  const load = async () => {
    setLoading(true)
    try { const r = await fetch(`/api/ir-qa?status=${tab}`); const d = await r.json(); setItems(d.items ?? []) }
    catch { setItems([]) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    try {
      await fetch('/api/ir-qa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      setEditId(null)
      await load()
    } finally { setBusy(null) }
  }

  return (
    <div>
      <div className="page-header">
        <h2>IR Q&amp;A</h2>
        <p>Auto-collected from sent investor replies. Approve entries to add them to the IR drafter&apos;s knowledge.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['pending', 'approved', 'rejected'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', textTransform: 'capitalize', border: tab === t ? '1px solid #0ea5e9' : '1px solid #e5e7eb', background: tab === t ? '#f0f9ff' : '#fff', color: tab === t ? '#0369a1' : '#6b7280' }}>{t}</button>
        ))}
      </div>
      {loading ? <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div>
        : items.length === 0 ? <div style={{ fontSize: 13, color: '#9ca3af', padding: '20px 0' }}>No {tab} Q&amp;A yet.</div>
        : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(it => (
            <div key={it.id} className="card" style={{ margin: 0 }}>
              {editId === it.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })} placeholder="category" style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
                  <textarea value={draft.question} onChange={e => setDraft({ ...draft, question: e.target.value })} rows={2} style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
                  <textarea value={draft.answer} onChange={e => setDraft({ ...draft, answer: e.target.value })} rows={4} style={{ fontSize: 12, padding: '6px 8px', border: '1px solid #e5e7eb', borderRadius: 6 }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => patch(it.id, { question: draft.question, answer: draft.answer, category: draft.category })} disabled={busy === it.id} style={qaBtn('#fff', '#0ea5e9', '#0ea5e9')}>Save</button>
                    <button onClick={() => setEditId(null)} style={qaBtn('#6b7280')}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {it.category && <span className="badge badge-blue" style={{ fontSize: 9 }}>{it.category}</span>}
                    {it.source_subject && <span style={{ fontSize: 10, color: '#9ca3af' }}>from: {it.source_subject}</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{it.question}</div>
                  <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{it.answer}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {tab !== 'approved' && <button onClick={() => patch(it.id, { status: 'approved' })} disabled={busy === it.id} style={qaBtn('#166534', '#f0fdf4', '#86efac')}>✓ Approve</button>}
                    {tab !== 'rejected' && <button onClick={() => patch(it.id, { status: 'rejected' })} disabled={busy === it.id} style={qaBtn('#b91c1c', '#fef2f2', '#fca5a5')}>✕ Reject</button>}
                    <button onClick={() => { setEditId(it.id); setDraft({ question: it.question, answer: it.answer, category: it.category ?? '' }) }} style={qaBtn('#6b7280')}>Edit</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Fund Q&A Agent (Workflow 6) ────────────────────────────────────────────────

function FundQaView() {
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [thread, setThread] = useState<{ q: string; a: string; count: number }[]>([])
  const [err, setErr] = useState<string | null>(null)

  async function ask() {
    const question = q.trim()
    if (!question || loading) return
    setLoading(true); setErr(null)
    try {
      const res = await fetch('/api/fund-qa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Request failed'); return }
      setThread(t => [{ q: question, a: d.answer ?? '', count: d.docCount ?? 0 }, ...t])
      setQ('')
    } catch (e) { setErr(String(e)) } finally { setLoading(false) }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Fund Q&amp;A</h2>
        <p>Ask about the fund — answered only from the Investor Relations &amp; Capital documents, with sources cited inline.</p>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask() }} placeholder="e.g. What is the minimum investment and target hold period for Fund IV?" style={{ flex: 1, fontSize: 13, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }} />
        <button onClick={ask} disabled={loading || !q.trim()} style={{ fontSize: 13, fontWeight: 600, padding: '10px 18px', borderRadius: 8, border: '1px solid #0ea5e9', background: loading ? '#e0f2fe' : '#0ea5e9', color: loading ? '#0369a1' : '#fff', cursor: loading || !q.trim() ? 'default' : 'pointer' }}>{loading ? 'Thinking…' : 'Ask'}</button>
      </div>
      {err && <div style={{ fontSize: 12, color: '#b91c1c', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 14px', marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {thread.map((it, i) => (
          <div key={i} className="card" style={{ margin: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 8 }}>{it.q}</div>
            <div style={{ fontSize: 13, color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{it.a}</div>
            {it.count > 0 && <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f3f4f6', fontSize: 10, color: '#9ca3af' }}>Answered from {it.count} fund document{it.count !== 1 ? 's' : ''} · sources cited inline</div>}
          </div>
        ))}
      </div>
    </div>
  )
}

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
    meta: 'LP profiles, capital calls, distributions · uses Connected App (client-credentials) credentials set in Vercel env',
    sync: 'Client-credentials OAuth',
    fields: [
      { label: 'Token URL',     key: 'url',    placeholder: 'SF_TOKEN_URL (set in Vercel env)' },
      { label: 'Client ID',     key: 'client', placeholder: 'SF_CLIENT_ID (set in Vercel env)' },
      { label: 'Client Secret', key: 'secret', placeholder: 'SF_CLIENT_SECRET (set in Vercel env)' },
    ],
  },
  {
    id: 'onedrive',
    icon: '🗂️',
    name: 'SharePoint',
    status: 'connected' as const,
    meta: 'Agent outputs saved to SharePoint via Microsoft Graph API · uses Azure app credentials set in Vercel env',
    sync: 'On-demand via Graph API',
    fields: [
      { label: 'Tenant ID',     key: 'tenant', placeholder: 'AZURE_TENANT_ID (set in Vercel env)' },
      { label: 'Client ID',     key: 'client', placeholder: 'AZURE_CLIENT_ID (set in Vercel env)' },
      { label: 'Client Secret', key: 'secret', placeholder: 'AZURE_CLIENT_SECRET (set in Vercel env)' },
      { label: 'Site ID',       key: 'siteId', placeholder: 'SHAREPOINT_SITE_ID (set in Vercel env)' },
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
    id: 'granola',
    icon: '🎙️',
    name: 'Granola',
    status: 'disconnected' as const,
    meta: 'AI meeting notes — captures transcripts and summaries from investor calls, LP meetings, and deal reviews to power Executive Assistant follow-up workflows',
    sync: 'Not connected',
    fields: [
      { label: 'API Key', key: 'apiKey', placeholder: 'Granola API key' },
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
    id: 'census',
    icon: '🏛️',
    name: 'Census Bureau API',
    status: 'connected' as const,
    meta: 'Building permits, population growth, and economic indicators by county — powers Brevard / Space Coast macro signals',
    sync: 'On-demand via Census API',
    fields: [
      { label: 'API Key', key: 'apiKey', placeholder: 'Register free at api.census.gov/data/key_signup.html' },
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
  // ── Shared Industrial CRE (all newsletters) ───────────────────────────
  { icon: '📣', agent: 'All Newsletters · Shared', name: 'PR Newswire',              url: 'https://www.prnewswire.com/rss/news-releases-list.rss',       desc: 'Fund closes, acquisitions, JV announcements from industrial PE players' },
  { icon: '📢', agent: 'All Newsletters · Shared', name: 'Business Wire',            url: 'https://www.businesswire.com/rss/home',                        desc: 'Institutional CRE deals and capital markets — alternative wire to PR Newswire' },
  { icon: '🌍', agent: 'All Newsletters · Shared', name: 'GlobeNewswire',            url: 'https://www.globenewswire.com/RssFeed/country/United+States',  desc: 'US press releases — broker deals, fund announcements, industrial transactions' },
  { icon: '🏭', agent: 'All Newsletters · Shared', name: 'GlobeSt Industrial',       url: 'https://www.globest.com/industrial/feed/',                     desc: 'Industrial-only feed from GlobeSt — warehouse, flex, logistics deals' },
  { icon: '🌐', agent: 'All Newsletters · Shared', name: 'GlobeSt',                  url: 'https://www.globest.com/feed/',                                desc: 'Industrial, net lease, and multifamily market intelligence' },
  { icon: '📰', agent: 'All Newsletters · Shared', name: 'Commercial Observer',      url: 'https://commercialobserver.com/feed/',                         desc: 'CRE finance, acquisitions, and industrial market news' },
  { icon: '📋', agent: 'All Newsletters · Shared', name: 'CRE Daily',                url: 'https://credaily.com/feed/',                                   desc: 'National CRE — picks up institutional industrial deals across markets' },
  { icon: '🔗', agent: 'All Newsletters · Shared', name: 'Connect CRE',              url: 'https://connectcre.com/feed/',                                 desc: 'National and regional CRE transactions' },
  { icon: '🏗️', agent: 'All Newsletters · Shared', name: 'The Real Deal',            url: 'https://therealdeal.com/feed/',                                desc: 'Large industrial transactions and fund activity' },
  { icon: '🏛️', agent: 'All Newsletters · Shared', name: 'NAIOP',                    url: 'https://www.naiop.org/rss',                                    desc: 'Industrial and commercial real estate policy, research, and market updates' },
  { icon: '🤝', agent: 'All Newsletters · Shared', name: 'SIOR',                     url: 'https://www.sior.com/news/press-releases?format=rss',          desc: 'Industrial broker market reports and transaction news' },
  { icon: '🏢', agent: 'All Newsletters · Shared', name: 'CoStar News',              url: 'https://www.costar.com/rss',                                   desc: 'CRE deal announcements and market news' },
  { icon: '🚚', agent: 'All Newsletters · Shared', name: 'FreightWaves',             url: 'https://www.freightwaves.com/news/feed',                       desc: 'Freight demand, trucking, and logistics — direct demand signal for industrial' },
  { icon: '📦', agent: 'All Newsletters · Shared', name: 'Supply Chain Dive',        url: 'https://www.supplychaindive.com/feeds/news/',                  desc: 'Supply chain shifts, reshoring, and nearshoring — industrial occupier demand drivers' },
  { icon: '🏪', agent: 'All Newsletters · Shared', name: 'DC Velocity',              url: 'https://www.dcvelocity.com/rss/',                              desc: 'Distribution center and warehouse operations — tenant activity signals' },
  { icon: '🚛', agent: 'All Newsletters · Shared', name: 'Logistics Management',     url: 'https://www.logisticsmgmt.com/rss/articles',                   desc: 'Logistics industry news — 3PL activity and distribution center demand' },
  { icon: '⚙️', agent: 'All Newsletters · Shared', name: 'Modern Materials Handling', url: 'https://www.mmh.com/rss/articles',                           desc: 'Warehouse automation and materials handling — capex demand signal' },
  { icon: '🌎', agent: 'All Newsletters · Shared', name: 'Bisnow National',          url: 'https://bisnow.com/rss/national',                              desc: 'National CRE news — industrial, office, multifamily headlines' },
  // ── Agent 1 — Permian Brief (Permian-specific additions) ─────────────
  { icon: '🏙️', agent: 'Agent 1 · Permian Brief', name: 'Bisnow Dallas',            url: 'https://bisnow.com/rss/dallas',                                desc: 'DFW CRE news — Texas industrial transactions and market trends' },
  { icon: '🏙️', agent: 'Agent 1 · Permian Brief', name: 'Bisnow Houston',           url: 'https://bisnow.com/rss/houston',                               desc: 'Houston CRE and Texas energy market coverage' },
  { icon: '💼', agent: 'Agent 1 · Permian Brief', name: 'Dallas Business Journal',   url: 'https://www.bizjournals.com/dallas/feed/latest-news',          desc: 'DFW business news — industrial leasing, economic development activity' },
  { icon: '💼', agent: 'Agent 1 · Permian Brief', name: 'San Antonio Business Journal', url: 'https://www.bizjournals.com/sanantonio/feed/latest-news',  desc: 'San Antonio business and CRE — West Texas gateway market coverage' },
  { icon: '📰', agent: 'Agent 1 · Permian Brief', name: 'Midland Reporter-Telegram', url: 'https://www.mrt.com/search/?f=rss&t=article&c=news',          desc: 'Midland local news — ground-level Permian Basin activity and deals' },
  { icon: '🤠', agent: 'Agent 1 · Permian Brief', name: 'Texas Tribune',             url: 'https://www.texastribune.org/feeds/latest/',                   desc: 'Texas policy, energy regulation, and economic development coverage' },
  { icon: '⛽', agent: 'Agent 1 · Permian Brief', name: 'Oil & Gas 360',             url: 'https://www.oilandgas360.com/feed/',                           desc: 'Upstream and midstream news — drilling activity, production, pipeline updates' },
  { icon: '🔧', agent: 'Agent 1 · Permian Brief', name: 'World Oil',                 url: 'https://www.worldoil.com/rss/news',                            desc: 'Operator activity, frac sand, midstream, in-basin facilities' },
  { icon: '📡', agent: 'Agent 1 · Permian Brief', name: 'Rigzone',                   url: 'https://www.rigzone.com/rss/news.aspx',                        desc: 'Rig counts, offshore/onshore drilling, and energy workforce news' },
  { icon: '⚡', agent: 'Agent 1 · Permian Brief', name: 'EIA Today in Energy',       url: 'https://www.eia.gov/rss/todayinenergy.xml',                    desc: 'Permian production updates, regulatory changes, basin economics — from EIA' },
  { icon: '🛢️', agent: 'Agent 1 · Permian Brief', name: 'OilPrice.com',              url: 'https://oilprice.com/rss/main',                                desc: 'Energy press, WTI commentary, occasional Permian operator coverage' },
  { icon: '⚒️', agent: 'Agent 1 · Permian Brief', name: 'Hart Energy',               url: 'https://www.hartenergy.com/rss',                               desc: 'Upstream oil and gas industry news — Permian operator and services coverage' },
  { icon: '📄', agent: 'Agent 1 · Permian Brief', name: 'Oil & Gas Journal',         url: 'https://www.ogj.com/rss/all-ogj-news.rss',                    desc: 'Technical and market coverage of oil and gas industry' },
  { icon: '🏦', agent: 'Agent 1 · Permian Brief', name: 'Dallas Fed Research',       url: 'https://www.dallasfed.org/rss/research',                       desc: 'Dallas Fed Energy Survey — E&P capex, activity outlook, and breakeven prices; leading demand signal for Permian industrial' },
  // ── Agent 1 — Brevard Brief (Florida-specific additions) ─────────────
  { icon: '🌴', agent: 'Agent 1 · Brevard Brief', name: 'Bisnow South Florida',      url: 'https://bisnow.com/rss/south-florida',                         desc: 'South Florida CRE — industrial and logistics market coverage' },
  { icon: '🌴', agent: 'Agent 1 · Brevard Brief', name: 'Bisnow Orlando',            url: 'https://bisnow.com/rss/orlando',                               desc: 'Central Florida CRE — industrial demand and development activity' },
  { icon: '🌴', agent: 'Agent 1 · Brevard Brief', name: 'Bisnow Tampa',              url: 'https://bisnow.com/rss/tampa',                                 desc: 'Tampa Bay CRE — industrial leasing, logistics, and development news' },
  { icon: '🏡', agent: 'Agent 1 · Brevard Brief', name: 'Florida Realtors',          url: 'https://floridarealtors.org/news-media/news-articles/rss',     desc: 'Florida commercial real estate market reports and transaction data' },
  { icon: '💼', agent: 'Agent 1 · Brevard Brief', name: 'Orlando Business Journal',  url: 'https://www.bizjournals.com/orlando/feed/latest-news',         desc: 'Central Florida business and CRE — Brevard-adjacent market activity' },
  { icon: '💼', agent: 'Agent 1 · Brevard Brief', name: 'South Florida Business Journal', url: 'https://www.bizjournals.com/southflorida/feed/latest-news', desc: 'South Florida business news and industrial market coverage' },
  { icon: '💼', agent: 'Agent 1 · Brevard Brief', name: 'Tampa Bay Business Journal', url: 'https://www.bizjournals.com/tampabay/feed/latest-news',       desc: 'Tampa Bay business and CRE market coverage' },
  { icon: '🚀', agent: 'Agent 1 · Brevard Brief', name: 'Space Coast Daily',         url: 'https://www.spacecoastdaily.com/feed/',                        desc: 'Brevard County local news — economic development and business activity' },
  { icon: '📰', agent: 'Agent 1 · Brevard Brief', name: 'Florida Today (Brevard)',   url: 'https://www.floridatoday.com/arcio/rss/',                      desc: 'Brevard County newspaper — local economy, employment, and development coverage' },
  { icon: '📊', agent: 'Agent 1 · Brevard Brief', name: 'Brevard Business News',     url: 'https://brevardbusinessnews.com/feed/',                        desc: 'Brevard County business journal — commercial real estate and employer activity' },
  { icon: '🛸', agent: 'Agent 1 · Brevard Brief', name: 'SpaceflightNow',            url: 'https://spaceflightnow.com/feed/',                             desc: 'Launch schedule and mission news — aerospace employment demand signal for Space Coast industrial' },
  { icon: '🛰️', agent: 'Agent 1 · Brevard Brief', name: 'SpaceNews',                 url: 'https://spacenews.com/feed/',                                  desc: 'Aerospace industry news — contractor activity and workforce growth signals' },
  { icon: '🔭', agent: 'Agent 1 · Brevard Brief', name: 'NASASpaceflight.com',       url: 'https://www.nasaspaceflight.com/feed/',                        desc: 'Detailed launch and mission coverage — KSC activity and contractor demand' },
  { icon: '🛸', agent: 'Agent 1 · Brevard Brief', name: 'Ars Technica Space',        url: 'https://feeds.arstechnica.com/arstechnica/space',              desc: 'Space industry analysis — SpaceX, Boeing, Blue Origin contractor activity near KSC' },
  { icon: '🌌', agent: 'Agent 1 · Brevard Brief', name: 'NASA Breaking News',        url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',               desc: 'NASA announcements — KSC programs and contractor workforce signals' },
  { icon: '🚀', agent: 'Agent 1 · Brevard Brief', name: 'NASA Kennedy Space Center', url: 'https://blogs.nasa.gov/kennedy/feed/',                         desc: 'KSC blog — mission updates, construction, and contractor activity on the Space Coast' },
  { icon: '🌠', agent: 'Agent 1 · Brevard Brief', name: 'Universe Today',            url: 'https://www.universetoday.com/feed/',                          desc: 'Space science and industry — launch cadence and aerospace demand signals' },
  { icon: '🏗️', agent: 'Agent 1 · Brevard Brief', name: 'Space Coast EDC',           url: 'https://www.spacecoastedc.org/feed/',                          desc: 'Space Coast Economic Development Commission — job announcements and business expansions in Brevard' },
  { icon: '📈', agent: 'Agent 1 · Brevard Brief', name: 'Enterprise Florida',        url: 'https://floridajobs.org/feeds/news-rss.xml',                  desc: 'State economic development — business relocations and expansions across Florida' },
  // ── Agent 1 · Fund Landscape Brief ────────────────────────────────────
  { icon: '📁', agent: 'Agent 1 · Fund Landscape', name: 'SEC EDGAR Form D',         url: 'https://efts.sec.gov/LATEST/search-index?q=%22Form+D%22&dateRange=custom&startdt=2024-01-01&forms=D', desc: 'Every Reg D filing nationwide — tracks private fund raises by structure and amount' },
  { icon: '💼', agent: 'Agent 1 · Fund Landscape', name: 'PERE / IPE Real Assets',   url: 'https://pere.privateequityinternational.com/feed/',            desc: 'Institutional industrial fund fundraising news and strategy announcements' },
]
function ConnectionsTab({ saved, saveChanges }: { saved: boolean; saveChanges: () => void }) {
  const [conns, setConns] = useState<Record<string, { status: 'connected' | 'disconnected'; values: Record<string, string> }>>(() =>
    Object.fromEntries(
      CONNECTIONS_DATA.map((c) => [c.id, { status: c.status as 'connected' | 'disconnected', values: Object.fromEntries(c.fields.map((f) => [f.key, ''])) }])
    )
  )
  const [expandedConn, setExpandedConn] = useState<string | null>(null)
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set())
  const [envDriven, setEnvDriven] = useState<Set<string>>(new Set())
  const toggleReveal = (key: string) =>
    setRevealedFields(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  // Microsoft 365 multi-account state
  const [m365Accounts, setM365Accounts] = useState<M365Account[]>(DEFAULT_M365_ACCOUNTS)
  const [expandedM365, setExpandedM365] = useState<string | null>(null)
  const [showAddM365, setShowAddM365] = useState(false)
  const [newM365, setNewM365] = useState({ label: '', email: '', tenantId: '', clientId: '' })

  // Load shared connector + M365 state from Supabase, then overlay real env-var status
  useEffect(() => {
    // 1. Load saved field values from Supabase
    fetch('/api/app-settings?key=conn-state')
      .then(r => r.json())
      .then(d => {
        if (d.value && Object.keys(d.value).length > 0) {
          setConns((prev) => ({ ...prev, ...d.value }))
        }
      })
      .catch(() => {})
    fetch('/api/app-settings?key=m365-state')
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d.value) && d.value.length > 0) setM365Accounts(d.value)
      })
      .catch(() => {})
    // 2. Overlay actual connected/disconnected status from server env vars
    fetch('/api/env-status')
      .then(r => r.json())
      .then(d => {
        if (d.status) {
          const driven = new Set<string>()
          setConns(prev => {
            const next = { ...prev }
            for (const [id, st] of Object.entries(d.status as Record<string, 'connected' | 'disconnected'>)) {
              next[id] = { ...(next[id] ?? { values: {} }), status: st }
              driven.add(id)
            }
            return next
          })
          setEnvDriven(driven)
        }
      })
      .catch(() => {})
  }, [])

  function toggleConn(id: string) {
    setExpandedConn((prev) => (prev === id ? null : id))
  }
  function persistConns(next: Record<string, { status: 'connected' | 'disconnected'; values: Record<string, string> }>) {
    fetch('/api/app-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'conn-state', value: next }) }).catch(() => {})
  }

  function toggleConnStatus(id: string) {
    setConns((prev) => {
      const next = { ...prev, [id]: { ...prev[id], status: prev[id].status === 'connected' ? 'disconnected' as const : 'connected' as const } }
      persistConns(next)
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
    persistConns(next)
    saveChanges()
    setExpandedConn(null)
  }

  function saveM365(next: M365Account[]) {
    setM365Accounts(next)
    fetch('/api/app-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'm365-state', value: next }) }).catch(() => {})
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

        {/* ── All other single-account connections — connected first ── */}
        {[...CONNECTIONS_DATA].sort((a, b) => {
          const aConn = conns[a.id]?.status === 'connected' ? 0 : 1
          const bConn = conns[b.id]?.status === 'connected' ? 0 : 1
          return aConn - bConn
        }).map((conn) => {
          const state = conns[conn.id]
          const isConnected = state.status === 'connected'
          const isExpanded = expandedConn === conn.id
          const isEnvDriven = envDriven.has(conn.id)
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
                {isEnvDriven ? (
                  <span title="Status is read directly from Vercel environment variables" style={{ fontSize: 10, fontWeight: 600, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>🔐 Vercel env</span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }} onClick={() => toggleConnStatus(conn.id)}>
                    <div className={`toggle ${isConnected ? 'on' : ''}`} style={{ width: 32, height: 18 }} />
                  </div>
                )}
              </div>
              <div className="conn-meta">{conn.meta}</div>
              <div className="conn-footer">
                <span className="sync-badge">{isConnected ? (isEnvDriven ? '✓ Active — key set in Vercel' : '✓ Connected') : conn.sync}</span>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }} onClick={() => toggleConn(conn.id)}>
                  {isExpanded ? 'Close' : 'Configure'}
                </button>
              </div>
              {isExpanded && (
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 10, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {conn.fields.map((f) => {
                    const isSensitive = /secret|pass|token|key/i.test(f.key)
                    const fieldId = `${conn.id}-${f.key}`
                    const isRevealed = revealedFields.has(fieldId)
                    const hasValue = (state.values[f.key] ?? '').trim().length > 0
                    return (
                      <div key={f.key} className="field" style={{ margin: 0 }}>
                        <label>{f.label}</label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <input
                            type={isSensitive && !isRevealed ? 'password' : 'text'}
                            placeholder={isSensitive && hasValue && !isRevealed ? '••••••••••••••••' : f.placeholder}
                            value={state.values[f.key] ?? ''}
                            onChange={(e) => setField(conn.id, f.key, e.target.value)}
                            style={{ flex: 1, paddingRight: isSensitive ? 32 : undefined }}
                          />
                          {isSensitive && (
                            <button
                              type="button"
                              onClick={() => toggleReveal(fieldId)}
                              style={{ position: 'absolute', right: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9ca3af', fontSize: 14, lineHeight: 1 }}
                              title={isRevealed ? 'Hide' : 'Show'}
                            >
                              {isRevealed ? '🙈' : '👁'}
                            </button>
                          )}
                        </div>
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
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const freqColor: Record<string, string> = { Weekly: '#0e7490', Monthly: '#7c3aed' }
  const marketColor: Record<string, string> = { permian: '#d97706', brevard: '#0891b2' }

  const labelStyle: React.CSSProperties = { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#9ca3af', display: 'block', marginBottom: 4 }
  const preStyle: React.CSSProperties = { margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 11, lineHeight: 1.65, color: '#374151', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }

  async function handlePreview(e: React.MouseEvent) {
    e.stopPropagation()
    // normalize reportType: prompts.ts uses 'weekly-market-update', API expects 'weekly-update'
    const apiReportType = p.reportType === 'weekly-market-update' ? 'weekly-update' : p.reportType
    setPreviewState('loading')
    setShowPreview(true)
    try {
      const res = await fetch('/api/preview-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: p.market, reportType: apiReportType }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPreviewError(data.message || data.error || 'Unknown error')
        setPreviewState('error')
      } else {
        setPreviewSubject(data.subject)
        setPreviewHtml(data.htmlBody)
        setPreviewState('done')
      }
    } catch (err: any) {
      setPreviewError(String(err))
      setPreviewState('error')
    }
  }

  return (
    <>
      {/* Preview modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 780, boxShadow: '0 20px 60px rgba(0,0,0,.25)', display: 'flex', flexDirection: 'column' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Email Preview — {p.name}</div>
                {previewSubject && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Subject: {previewSubject}</div>}
              </div>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', padding: 4 }}>✕</button>
            </div>
            {/* Modal body */}
            <div style={{ padding: '20px', minHeight: 200 }}>
              {previewState === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0', color: '#6b7280' }}>
                  <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#0e7490', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontSize: 12 }}>Generating {p.name}… this takes 1–2 minutes</div>
                </div>
              )}
              {previewState === 'error' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#991b1b' }}>
                  <strong>Error:</strong> {previewError}
                </div>
              )}
              {previewState === 'done' && (
                <iframe
                  srcDoc={previewHtml}
                  style={{ width: '100%', height: 560, border: '1px solid #e5e7eb', borderRadius: 8 }}
                  title="Email preview"
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
        </div>
      )}

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
        <button
          onClick={handlePreview}
          style={{ fontSize: 10, fontWeight: 600, color: '#0e7490', background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', flexShrink: 0 }}
        >
          Preview
        </button>
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
    </>
  )
}

function NewsletterPromptLibrary() {
  const [filterMarket, setFilterMarket] = useState<'all' | 'permian' | 'brevard'>('all')
  const [testState, setTestState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; subject?: string; error?: string }>>({})
  const filtered = NEWSLETTER_PROMPTS.filter((p) => filterMarket === 'all' || p.market === filterMarket)

  async function handleTestAll() {
    setTestState('loading')
    setTestResults({})
    try {
      const res = await fetch('/api/test-all-briefs', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setTestState('error')
        setTestResults({ error: { success: false, error: data.message || data.error || 'Unknown error' } })
      } else {
        setTestState('done')
        setTestResults(data.results || {})
      }
    } catch (err) {
      setTestState('error')
      setTestResults({ error: { success: false, error: String(err) } })
    }
  }

  return (
    <div className="card" style={{ margin: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📰</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Agent 1 — Newsletter Prompt Library</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Full prompt instructions, sources, and output specs — 1 Permian weekly · 3 Brevard weekly · 2 Permian monthly</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(['all', 'permian', 'brevard'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setFilterMarket(m)}
              style={{ fontSize: 10, padding: '3px 10px', borderRadius: 5, border: '1px solid', cursor: 'pointer', fontWeight: filterMarket === m ? 700 : 400, background: filterMarket === m ? '#0e7490' : '#fff', color: filterMarket === m ? '#fff' : '#6b7280', borderColor: filterMarket === m ? '#0e7490' : '#d1d5db' }}
            >{m === 'all' ? 'All' : m === 'permian' ? 'Permian' : 'Brevard'}</button>
          ))}
          <button
            onClick={handleTestAll}
            disabled={testState === 'loading'}
            style={{ fontSize: 10, padding: '3px 12px', borderRadius: 5, border: '1px solid', cursor: testState === 'loading' ? 'not-allowed' : 'pointer', fontWeight: 600, background: testState === 'loading' ? '#f3f4f6' : testState === 'done' ? '#d1fae5' : '#0f172a', color: testState === 'loading' ? '#9ca3af' : testState === 'done' ? '#065f46' : '#fff', borderColor: testState === 'done' ? '#6ee7b7' : '#0f172a', marginLeft: 4 }}
          >
            {testState === 'loading' ? '⏳ Sending…' : testState === 'done' ? '✓ Sent to you' : '📧 Send all 6 to me'}
          </button>
        </div>
      </div>

      {/* Test results */}
      {(testState === 'done' || testState === 'error') && Object.keys(testResults).length > 0 && (
        <div style={{ background: testState === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${testState === 'error' ? '#fecaca' : '#bbf7d0'}`, borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
          {testState === 'done' && <div style={{ fontWeight: 600, color: '#065f46', marginBottom: 6 }}>All 6 briefs queued — check mparad@erpfunds.com. Subject lines prefixed with [TEST].</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {Object.entries(testResults).map(([id, r]) => (
              <div key={id} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span>{r.success ? '✓' : '✗'}</span>
                <span style={{ color: r.success ? '#065f46' : '#991b1b' }}>{r.subject || id}</span>
                {r.error && <span style={{ color: '#b91c1c', fontSize: 11 }}>— {r.error}</span>}
              </div>
            ))}
          </div>
          <button onClick={() => setTestState('idle')} style={{ marginTop: 8, fontSize: 10, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Dismiss</button>
        </div>
      )}

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
  category: string | null
  uploaded_by: string | null
  expires_at: string | null
  created_at: string
}

const DEAL_DOCUMENTS_CATEGORY = 'Deal Documents'

function fmtBytes(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// Caret that rotates when its section is open.
function Caret({ open }: { open: boolean }) {
  return (
    <span style={{ fontSize: 10, color: '#9ca3af', width: 10, flexShrink: 0, display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
  )
}

// Groups files by their project_tag ("subfolder"). Named subfolders come first
// (alphabetical), untagged files last under an empty tag.
function groupByTag(files: UploadedFileRecord[]): { tag: string; files: UploadedFileRecord[] }[] {
  const map = new Map<string, UploadedFileRecord[]>()
  for (const f of files) {
    const k = f.project_tag && f.project_tag.trim() ? f.project_tag.trim() : ''
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(f)
  }
  const groups = [...map.entries()]
    .filter(([k]) => k !== '')
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, files]) => ({ tag, files }))
  const untagged = map.get('')
  if (untagged) groups.push({ tag: '', files: untagged })
  return groups
}

function UploadedFilesCard({ query = '' }: { query?: string }) {
  const [files, setFiles] = useState<UploadedFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [tag, setTag] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set())

  const fetchFiles = async () => {
    try {
      const res = await fetch(`/api/files/list?category=${encodeURIComponent(DEAL_DOCUMENTS_CATEGORY)}`)
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
      fd.append('category', DEAL_DOCUMENTS_CATEGORY)
      if (tag.trim()) fd.append('projectTag', tag.trim())
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

  const q = query.trim().toLowerCase()
  const visible = q ? files.filter(f => f.filename.toLowerCase().includes(q)) : files
  const expanded = open || (q.length > 0 && visible.length > 0)
  const groups = groupByTag(visible)
  const tagOpen = (t: string) => q.length > 0 ? true : !collapsedTags.has(t)
  const toggleTag = (t: string) => setCollapsedTags(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })

  return (
    <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start', opacity: q && visible.length === 0 ? 0.5 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Caret open={expanded} />
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          📂
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Deal Documents</div>
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>
          {q ? `${visible.length} match${visible.length !== 1 ? 'es' : ''}` : `${files.length} file${files.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {expanded && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Upload rent rolls, T12s, OMs, or deal PDFs once — reference across OM Writer, Sale Comps, and Deck Builder without re-attaching each time.
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <input
              placeholder="Subfolder / project tag (e.g. Tampa OM)"
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
          ) : visible.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>No matches</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups.map(g => (
                <div key={g.tag || '__none__'} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.tag && (
                    <div onClick={() => toggleTag(g.tag)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0' }}>
                      <Caret open={tagOpen(g.tag)} />
                      <span style={{ fontSize: 11 }}>📁</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{g.tag}</span>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{g.files.length}</span>
                    </div>
                  )}
                  {(!g.tag || tagOpen(g.tag)) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: g.tag ? 16 : 0 }}>
                      {g.files.map(f => (
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
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── SOPs ─────────────────────────────────────────────────────────────────────

const SOP_CATEGORIES = [
  { icon: '🎓', label: 'Claude Training and Assets',    desc: 'Claude training decks, brand & messaging guidelines, deck/OM build guides, and the skills & commands reference — the team’s AI enablement library' },
  { icon: '🤖', label: 'Agent Working Guides',          desc: 'How to interact with each agent — submitting tasks, reviewing outputs, handling escalations, and adjusting autonomy settings per agent' },
  { icon: '📊', label: 'Dashboard & Portal How-Tos',    desc: 'Step-by-step instructions for updating portal views: rent roll, capital calls, leasing pipeline, work orders, connections, and agent config' },
  { icon: '💰', label: 'Finance Agent SOPs',            desc: 'Invoice approval workflows and GL coding for the Financial Controls agent; month-end close procedures for the Accounting Operations agent' },
  { icon: '🏢', label: 'Property Operations Agent SOPs',desc: 'Work order submission, vendor dispatch, COI requirements, and escalation handling for the Property Operations agent' },
  { icon: '🔑', label: 'Leasing Agent SOPs',            desc: 'Prospect intake, proposal review, renewal tracking, and lease execution checklist for the Leasing agent' },
  { icon: '👥', label: 'Investor Relations Agent SOPs', desc: 'LP communication standards, capital call procedures, quarterly report cadence, and fund update templates for the IR agent' },
  { icon: '📨', label: 'Agent 2 — Investor Relations',   desc: 'Investor Relations (Agent 2) reference — the IR Q&A Reference doc (approved response templates, routing contacts, classification + escalation rules) and Agent 2 working guides' },
  { icon: '🏭', label: 'Acquisitions Agent SOPs',       desc: 'Deal screening criteria, underwriting process, due diligence checklist, and IC memo format for the Acquisitions agent' },
  { icon: '👤', label: 'People & HR SOPs',              desc: 'Onboarding checklist, benefits enrollment, expense reimbursement, and PTO policy for the People Ops agent' },
]

function SOPCategoryCard({ cat, query = '' }: { cat: { icon: string; label: string; desc: string }; query?: string }) {
  const [docs, setDocs] = useState<UploadedFileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  const [subfolder, setSubfolder] = useState('')
  const [collapsedTags, setCollapsedTags] = useState<Set<string>>(new Set())

  const fetchDocs = async () => {
    try {
      const res = await fetch(`/api/files/list?category=${encodeURIComponent(cat.label)}`)
      const data = await res.json()
      setDocs(data.files ?? [])
    } catch { setDocs([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchDocs() }, [])

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)
    for (const file of Array.from(fileList)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('category', cat.label)
      if (subfolder.trim()) fd.append('projectTag', subfolder.trim())
      await fetch('/api/files/upload', { method: 'POST', body: fd })
    }
    await fetchDocs()
    setUploading(false)
  }

  const removeDoc = async (fileId: string) => {
    await fetch(`/api/files/${fileId}`, { method: 'DELETE' })
    setDocs((d) => d.filter((x) => x.file_id !== fileId))
  }

  const q = query.trim().toLowerCase()
  const visible = q ? docs.filter(d => d.filename.toLowerCase().includes(q)) : docs
  const expanded = open || (q.length > 0 && visible.length > 0)
  const groups = groupByTag(visible)
  const tagOpen = (t: string) => q.length > 0 ? true : !collapsedTags.has(t)
  const toggleTag = (t: string) => setCollapsedTags(prev => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })

  return (
    <div className="card" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'start', opacity: q && visible.length === 0 ? 0.5 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Caret open={expanded} />
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {cat.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{cat.label}</div>
        </div>
        <span style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>
          {q ? `${visible.length} match${visible.length !== 1 ? 'es' : ''}` : `${docs.length} doc${docs.length !== 1 ? 's' : ''}`}
        </span>
      </div>

      {expanded && (
        <>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>{cat.desc}</div>

          {/* Upload zone with optional subfolder */}
          <input
            placeholder="Subfolder (optional, e.g. Agent 1)"
            value={subfolder}
            onChange={e => setSubfolder(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, outline: 'none', background: '#fff', color: '#111827' }}
          />
          <label
            className={`upload-zone${dragging ? ' drag-over' : ''}`}
            style={{ padding: '12px 10px', opacity: uploading ? 0.6 : 1 }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          >
            <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: 'none' }} onChange={(e) => handleFiles(e.target.files)} disabled={uploading} />
            <span style={{ fontSize: 16 }}>📎</span>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{uploading ? 'Uploading…' : <>Drop SOP{subfolder.trim() ? ` into "${subfolder.trim()}"` : ''} or <span style={{ color: '#0e7490', textDecoration: 'underline' }}>browse</span></>}</div>
          </label>

          {/* Doc list grouped by subfolder */}
          {loading ? (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>Loading…</div>
          ) : docs.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>No docs yet</div>
          ) : visible.length === 0 ? (
            <div style={{ fontSize: 11, color: '#9ca3af', padding: '4px 0' }}>No matches</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {groups.map(g => (
                <div key={g.tag || '__none__'} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.tag && (
                    <div onClick={() => toggleTag(g.tag)} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '2px 0' }}>
                      <Caret open={tagOpen(g.tag)} />
                      <span style={{ fontSize: 11 }}>📁</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{g.tag}</span>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>{g.files.length}</span>
                    </div>
                  )}
                  {(!g.tag || tagOpen(g.tag)) && (
                    <div className="doc-list" style={{ marginLeft: g.tag ? 16 : 0 }}>
                      {g.files.map((d) => (
                        <div key={d.file_id} className="doc-item">
                          <span style={{ fontSize: 13 }}>📄</span>
                          <span style={{ fontSize: 11, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</span>
                          <button className="doc-item-remove" onClick={() => removeDoc(d.file_id)} title="Remove">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SOPsView() {
  const [query, setQuery] = useState('')
  return (
    <div>
      <div className="page-header">
        <h2>SOPs & Agent Guides</h2>
        <p>Instructions for working with agents and managing portal dashboards — the team's reference library for how everything runs</p>
      </div>
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 13 }}>📌</span>
        <span style={{ fontSize: 12, color: '#92400e' }}>SOPs here cover two things: <strong>how to work with each AI agent</strong> (submitting tasks, reviewing outputs, escalation handling) and <strong>how to update portal dashboards</strong> (data entry, view configuration, connections). They are also indexed into agent knowledge bases so agents follow the same procedures.</span>
      </div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af' }}>🔍</span>
        <input
          placeholder="Search all SOP files by name…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '9px 12px 9px 34px', border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none', background: '#fff', color: '#111827' }}
        />
        {query && (
          <button onClick={() => setQuery('')} title="Clear" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        {/* Claude Training and Assets + Agent Working Guides lead, side by side */}
        {SOP_CATEGORIES.slice(0, 2).map((cat) => (
          <SOPCategoryCard key={cat.label} cat={cat} query={query} />
        ))}
        <UploadedFilesCard query={query} />
        {SOP_CATEGORIES.slice(2).map((cat) => (
          <SOPCategoryCard key={cat.label} cat={cat} query={query} />
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

// ─── Output Files View ────────────────────────────────────────────────────────

const WORKFLOW_LABELS: Record<string, string> = {
  'market-update-digest': 'Market Update',
  'lp-ready-summary':     'LP Summary',
  'sub-sector-deep-dive': 'Deep Dive',
  'sale-comps-pull':      'Sale Comps',
  'save-file-only':       'File Save',
  'deck-builder':         'Deck',
  'om-editor':            'OM Edit',
  'om-writer':            'OM Writer',
}

const PREFIX_COLORS: Record<string, string> = {
  RESEARCH: '#0e7490',
  BUILD:    '#7c3aed',
  WRITE:    '#b45309',
}

interface SPFile {
  name: string
  webUrl: string
  lastModifiedDateTime: string
  lastModifiedBy?: { user?: { displayName?: string; email?: string } }
  size: number
  folder: string
  path: string
  triggeredBy?: string   // from_email of whoever triggered the workflow
  workflowId?: string
}

function inferLabel(file: SPFile): string {
  const parts = file.path.split('/')
  if (file.folder.toLowerCase() === 'newsletters') {
    return [parts[1], parts[2]].filter(Boolean).join(' · ')
  }
  return parts.slice(1).join(' / ') || file.folder
}

function folderBadge(folder: string) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    Research:    { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
    Newsletters: { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
    Build:       { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    Write:       { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  }
  const c = colors[folder] ?? { bg: '#f3f4f6', text: '#6b7280', border: '#e5e7eb' }
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700,
      color: c.text, background: c.bg, border: `1px solid ${c.border}`,
      borderRadius: 4, padding: '1px 6px',
    }}>{folder.toUpperCase()}</span>
  )
}

// ─── SharePoint Browse types ──────────────────────────────────────────────────

interface BrowseItem {
  id: string
  name: string
  type: 'file' | 'folder'
  extension: string
  size: number
  webUrl: string
  lastModifiedDateTime: string
}

// Quick-access top-level folders shown as chips
const BROWSE_ROOT_FOLDERS = [
  { label: 'ERP Funds IV',       icon: '💼', path: 'ERP Funds IV' },
  { label: 'Deal Pipelines',     icon: '🏭', path: 'ERP Deal Pipelines' },
  { label: 'Research',           icon: '🔬', path: 'Research' },
  { label: 'Investor Relations', icon: '🤝', path: 'Investor Relations' },
  { label: 'Newsletters',        icon: '📰', path: 'Newsletters' },
  { label: 'Write',              icon: '✍️',  path: 'Write' },
]

function fileIcon(ext: string): string {
  switch (ext) {
    case '.xlsx': case '.xls': case '.csv': return '📊'
    case '.pptx': case '.ppt': return '📑'
    case '.docx': case '.doc': return '📄'
    case '.pdf':  return '🗎'
    case '.html': return '🌐'
    case '.txt':  return '📝'
    default:      return '📎'
  }
}

function extBadgeColor(ext: string): { bg: string; text: string; border: string } {
  if (['.xlsx', '.xls', '.csv'].includes(ext))  return { bg: '#f0fdf4', text: '#166534', border: '#86efac' }
  if (['.pptx', '.ppt'].includes(ext))          return { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' }
  if (['.docx', '.doc'].includes(ext))          return { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' }
  if (ext === '.pdf')                           return { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' }
  if (ext === '.html')                          return { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' }
  return { bg: '#f3f4f6', text: '#4b5563', border: '#e5e7eb' }
}

// ─── OutputFilesView ──────────────────────────────────────────────────────────

// Workflows that edit existing SharePoint files rather than creating new ones.
// Their runs are tracked in research_log but never appear in the file-sync list.
const EXCEL_EDIT_WORKFLOWS = new Set([
  'update-pipeline-comps',
  'update-buyer-list',
  'competitive-intel-xls',
  'update-commitment-schedule',
])

const EXCEL_EDIT_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  'update-pipeline-comps':      { icon: '🏭', label: 'Pipeline Comps',       color: '#0e7490' },
  'update-buyer-list':          { icon: '🤝', label: 'Buyer List',            color: '#7c3aed' },
  'competitive-intel-xls':      { icon: '📊', label: 'Competitive Intel',     color: '#b45309' },
  'update-commitment-schedule': { icon: '💼', label: 'Commitment Schedule',   color: '#166534' },
}

// Workflows that create new document/deck files (appear in files table, but
// the run log adds context: who triggered, summary, what changed).
const DOC_RUN_WORKFLOWS = new Set([
  'deck-builder',
  'om-writer',
  'om-editor',
])

const DOC_RUN_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  'deck-builder': { icon: '📑', label: 'Fund Deck',   color: '#c2410c' },
  'om-writer':    { icon: '📄', label: 'OM Write',    color: '#1d4ed8' },
  'om-editor':    { icon: '✏️',  label: 'OM Edit',     color: '#7c3aed' },
}

interface EditLogRow {
  id: number
  created_at: string
  from_email: string | null
  workflow_id: string
  output_summary: string | null
  onedrive_url: string | null
}

const EMAIL_DISPLAY: Record<string, string> = {
  'mparad@erpfunds.com':  'Michele P.',
  'mberry@erpfunds.com':  'Meghan',
  'wmeyer@erpfunds.com':  'William',
  'bberry@erpfunds.com':  'Brennan',
}

function senderChip(email: string | null) {
  if (!email) return null
  const name = EMAIL_DISPLAY[email.toLowerCase()] ?? email.split('@')[0]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, color: '#374151',
      background: '#f3f4f6', border: '1px solid #e5e7eb',
      borderRadius: 10, padding: '2px 7px',
    }}>
      <span style={{ fontSize: 11 }}>👤</span>{name}
    </span>
  )
}

function OutputFilesView() {
  // ── Agent output tab state ───────────────────────────────────────────────
  const [files, setFiles] = React.useState<SPFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [syncing, setSyncing] = React.useState(false)
  const [syncResult, setSyncResult] = React.useState<{ ok: boolean; message: string; count?: number } | null>(null)

  // ── Excel edit history state ─────────────────────────────────────────────
  const [editLog, setEditLog] = React.useState<EditLogRow[]>([])
  const [editLogLoading, setEditLogLoading] = React.useState(true)

  // ── Deck & doc run history state ─────────────────────────────────────────
  const [docLog, setDocLog] = React.useState<EditLogRow[]>([])
  const [docLogLoading, setDocLogLoading] = React.useState(true)

  // ── Browse tab state ─────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = React.useState<'output' | 'browse'>('output')
  const [browsePath, setBrowsePath] = React.useState('')           // current folder path
  const [browseItems, setBrowseItems] = React.useState<BrowseItem[]>([])
  const [browseLoading, setBrowseLoading] = React.useState(false)
  const [browseError, setBrowseError] = React.useState<string | null>(null)

  function fmtDate(iso: string) {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  // ── Agent output loaders ─────────────────────────────────────────────────
  function loadFiles() {
    setLoading(true)
    setError(null)
    fetch('/api/sharepoint-sync')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setLoading(false); return }
        setFiles(d.files ?? [])
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }

  function loadEditLog() {
    setEditLogLoading(true)
    fetch('/api/research-log')
      .then(r => r.json())
      .then(d => {
        const rows: EditLogRow[] = (d.rows ?? []).filter(
          (r: EditLogRow) => EXCEL_EDIT_WORKFLOWS.has(r.workflow_id)
        )
        setEditLog(rows)
        setEditLogLoading(false)
      })
      .catch(() => setEditLogLoading(false))
  }

  function loadDocLog() {
    setDocLogLoading(true)
    fetch('/api/research-log')
      .then(r => r.json())
      .then(d => {
        const rows: EditLogRow[] = (d.rows ?? []).filter(
          (r: EditLogRow) => DOC_RUN_WORKFLOWS.has(r.workflow_id)
        )
        setDocLog(rows)
        setDocLogLoading(false)
      })
      .catch(() => setDocLogLoading(false))
  }

  React.useEffect(() => { loadFiles(); loadEditLog(); loadDocLog() }, [])

  async function testSharePointSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sharepoint-sync')
      const data = await res.json()
      if (!res.ok) {
        setSyncResult({ ok: false, message: data.error ?? 'SharePoint sync failed' })
      } else {
        setSyncResult({ ok: true, message: data.message, count: data.count })
        setFiles(data.files ?? [])
      }
    } catch (e) {
      setSyncResult({ ok: false, message: String(e) })
    } finally {
      setSyncing(false)
    }
  }

  // ── Browse loaders ───────────────────────────────────────────────────────
  async function browseTo(path: string) {
    setBrowsePath(path)
    setBrowseLoading(true)
    setBrowseError(null)
    setBrowseItems([])
    try {
      const url = '/api/sharepoint/browse' + (path ? `?folder=${encodeURIComponent(path)}` : '')
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok || data.error) { setBrowseError(data.error ?? 'Failed to load folder'); setBrowseLoading(false); return }
      setBrowseItems(data.items ?? [])
    } catch (e) { setBrowseError(String(e)) }
    finally { setBrowseLoading(false) }
  }

  // Navigate into a subfolder
  function enterFolder(item: BrowseItem) {
    const next = browsePath ? `${browsePath}/${item.name}` : item.name
    browseTo(next)
  }

  // Breadcrumb segments: ['ERP Funds IV', 'Subfolder']
  const breadcrumbs = browsePath ? browsePath.split('/') : []

  // Tab style helper
  function tabStyle(tab: 'output' | 'browse') {
    const active = activeTab === tab
    return {
      padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
      border: active ? '1px solid #0ea5e9' : '1px solid #e5e7eb',
      background: active ? '#f0f9ff' : '#fff',
      color: active ? '#0369a1' : '#6b7280',
    } as React.CSSProperties
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2>📁 SharePoint Files</h2>
          <p>Agent output files and direct SharePoint folder browser</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
          {activeTab === 'output' ? (
            <>
              <button onClick={loadFiles} disabled={loading} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                🔄 Refresh
              </button>
              <button onClick={testSharePointSync} disabled={syncing} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #0ea5e9', background: syncing ? '#e0f2fe' : '#f0f9ff', color: '#0369a1', cursor: 'pointer', fontWeight: 600 }}>
                {syncing ? 'Syncing…' : '☁️ Sync'}
              </button>
            </>
          ) : (
            <button onClick={() => browseTo(browsePath)} disabled={browseLoading} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
              🔄 Refresh
            </button>
          )}
        </div>
      </div>

      {/* ── Tab switcher ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, padding: '0 24px 16px' }}>
        <button style={tabStyle('output')} onClick={() => setActiveTab('output')}>Agent Output</button>
        <button style={tabStyle('browse')} onClick={() => { setActiveTab('browse'); if (!browsePath && browseItems.length === 0) browseTo('') }}>Browse SharePoint</button>
      </div>

      {/* ── Agent Output tab ───────────────────────────────────────────────── */}
      {activeTab === 'output' && (
        <div style={{ padding: '0 24px 24px' }}>
          {syncResult && (
            <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500, background: syncResult.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${syncResult.ok ? '#86efac' : '#fca5a5'}`, color: syncResult.ok ? '#166534' : '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{syncResult.ok ? '✅' : '❌'} {syncResult.message}{syncResult.count !== undefined ? ` (${syncResult.count} files)` : ''}</span>
              <button onClick={() => setSyncResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'inherit', opacity: 0.6 }}>×</button>
            </div>
          )}
          {loading && <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {error && <div style={{ textAlign: 'center', padding: 60, color: '#dc2626', fontSize: 13 }}>{error}</div>}
          {!loading && !error && files.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 13 }}>No files saved yet — files will appear here once agents run.</div>
          )}
          {!loading && files.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Modified', 'File', 'By', 'Location', 'Size', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((file, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => window.open(file.webUrl, '_blank')} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{fmtDate(file.lastModifiedDateTime)}</td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', maxWidth: 340 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{inferLabel(file)}</div>
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      {(() => {
                        // 1st priority: research_log from_email (who triggered the workflow)
                        const trigEmail = file.triggeredBy?.toLowerCase()
                        if (trigEmail) {
                          const name = EMAIL_DISPLAY[trigEmail] ?? trigEmail.split('@')[0]
                          return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 4, padding: '2px 7px' }}>{name}</span>
                        }
                        // 2nd priority: SharePoint lastModifiedBy.user (works for manually uploaded files)
                        const dn = file.lastModifiedBy?.user?.displayName
                        const em = file.lastModifiedBy?.user?.email?.toLowerCase()
                        if (dn || em) {
                          const name = (em && EMAIL_DISPLAY[em]) ?? (dn ? dn.split(' ')[0] : em?.split('@')[0] ?? '?')
                          return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 4, padding: '2px 7px' }}>{name}</span>
                        }
                        return <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>{folderBadge(file.folder)}</td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtBytes(file.size)}</td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5 }}>Open →</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── Excel Edit History ────────────────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#6b7280' }}>
                Excel Edit History
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>— rows appended to existing SharePoint files</span>
            </div>
            {editLogLoading && <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Loading…</div>}
            {!editLogLoading && editLog.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>No Excel edits yet — pipeline comps, buyer list, and commitment schedule updates will appear here.</div>
            )}
            {!editLogLoading && editLog.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['When', 'Workflow / By', 'Summary', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {editLog.map((row, i) => {
                    const meta = EXCEL_EDIT_LABEL[row.workflow_id] ?? { icon: '📝', label: row.workflow_id, color: '#374151' }
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33`, borderRadius: 4, padding: '2px 7px' }}>
                            {meta.icon} {meta.label}
                          </span>
                          <div style={{ marginTop: 5 }}>{senderChip(row.from_email)}</div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#374151', maxWidth: 420 }}>
                          <div style={{ fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {row.output_summary ?? '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {row.onedrive_url ? (
                            <span
                              onClick={() => window.open(row.onedrive_url!, '_blank')}
                              style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer' }}
                            >
                              Open File →
                            </span>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 11 }}>no link</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Deck & Doc History ───────────────────────────────────────── */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#6b7280' }}>
                Deck &amp; Doc History
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>— fund decks and OMs built or edited by agents</span>
            </div>
            {docLogLoading && <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Loading…</div>}
            {!docLogLoading && docLog.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>No deck or OM runs yet — fund deck builds and OM writes will appear here.</div>
            )}
            {!docLogLoading && docLog.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    {['When', 'Workflow / By', 'Summary', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {docLog.map((row, i) => {
                    const meta = DOC_RUN_LABEL[row.workflow_id] ?? { icon: '📎', label: row.workflow_id, color: '#374151' }
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap', verticalAlign: 'top', fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33`, borderRadius: 4, padding: '2px 7px' }}>
                            {meta.icon} {meta.label}
                          </span>
                          <div style={{ marginTop: 5 }}>{senderChip(row.from_email)}</div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#374151', maxWidth: 420 }}>
                          <div style={{ fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {row.output_summary ?? '—'}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                          {row.onedrive_url ? (
                            <span
                              onClick={() => window.open(row.onedrive_url!, '_blank')}
                              style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer' }}
                            >
                              Open File →
                            </span>
                          ) : (
                            <span style={{ color: '#d1d5db', fontSize: 11 }}>no link</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── Browse SharePoint tab ───────────────────────────────────────────── */}
      {activeTab === 'browse' && (
        <div style={{ padding: '0 24px 24px' }}>

          {/* Quick-access folder chips */}
          {!browsePath && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {BROWSE_ROOT_FOLDERS.map(f => (
                <button
                  key={f.path}
                  onClick={() => browseTo(f.path)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.borderColor = '#94a3b8' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#e5e7eb' }}
                >
                  <span style={{ fontSize: 16 }}>{f.icon}</span> {f.label}
                </button>
              ))}
              <button
                onClick={() => browseTo('')}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px dashed #d1d5db', background: '#fafafa', fontSize: 13, fontWeight: 500, color: '#6b7280', cursor: 'pointer' }}
              >
                📂 Browse all
              </button>
            </div>
          )}

          {/* Breadcrumb */}
          {browsePath && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, fontSize: 12, flexWrap: 'wrap' }}>
              <button onClick={() => { setBrowsePath(''); setBrowseItems([]); setBrowseError(null) }} style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 12 }}>Home</button>
              {breadcrumbs.map((seg, idx) => {
                const pathUpTo = breadcrumbs.slice(0, idx + 1).join('/')
                const isLast = idx === breadcrumbs.length - 1
                return (
                  <React.Fragment key={idx}>
                    <span style={{ color: '#d1d5db' }}>/</span>
                    {isLast
                      ? <span style={{ color: '#111827', fontWeight: 700 }}>{seg}</span>
                      : <button onClick={() => browseTo(pathUpTo)} style={{ background: 'none', border: 'none', color: '#0369a1', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 12 }}>{seg}</button>
                    }
                  </React.Fragment>
                )
              })}
              <button
                onClick={() => {
                  const parent = breadcrumbs.slice(0, -1).join('/')
                  parent ? browseTo(parent) : (setBrowsePath(''), setBrowseItems([]), setBrowseError(null))
                }}
                style={{ marginLeft: 8, padding: '2px 10px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, color: '#6b7280', cursor: 'pointer', fontWeight: 500 }}
              >
                ← Up
              </button>
            </div>
          )}

          {/* Loading / error */}
          {browseLoading && <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {browseError && <div style={{ padding: '12px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fca5a5', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>❌ {browseError}</div>}

          {/* Empty state */}
          {!browseLoading && !browseError && browsePath && browseItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 13 }}>This folder is empty.</div>
          )}

          {/* Folder/file list */}
          {!browseLoading && browseItems.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                  {['Name', 'Type', 'Modified', 'Size', ''].map((h, i) => (
                    <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {browseItems.map((item, i) => {
                  const isFolder = item.type === 'folder'
                  const c = isFolder ? null : extBadgeColor(item.extension)
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                      onClick={() => isFolder ? enterFolder(item) : window.open(item.webUrl, '_blank')}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', maxWidth: 380 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 16 }}>{isFolder ? '📁' : fileIcon(item.extension)}</span>
                          <span style={{ fontWeight: isFolder ? 700 : 500, color: isFolder ? '#1d4ed8' : '#111827' }}>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {isFolder
                          ? <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 4, padding: '1px 6px' }}>FOLDER</span>
                          : c && <span style={{ fontSize: 10, fontWeight: 700, color: c.text, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: '1px 6px' }}>{item.extension.toUpperCase().replace('.', '')}</span>
                        }
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {item.lastModifiedDateTime ? fmtDate(item.lastModifiedDateTime) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {isFolder ? '—' : fmtBytes(item.size)}
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                        {isFolder
                          ? <span style={{ fontSize: 11, color: '#0369a1', fontWeight: 600 }}>Open →</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5 }}>Open →</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
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

