'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { LpRecord } from '@/app/api/lp-directory/route'

// ── Investor CRM ──────────────────────────────────────────────────────────────
// A relationship + fundraising CRM built on the live LP-directory data. Two populations
// (PE and DST) shown as tabs; click an investor to open the detail drawer. Capital
// accounting (called/uncalled/NAV) lives in the fund admin portal, not here.

const FUNNEL_STAGES = ['Identified', 'Contacted', 'Deck/OM sent', 'Diligence', 'Soft-circle', 'Subscription docs', 'Funded']
const OWNERS = ['Meghan Berry', 'William Meyer', 'Michele Parad', 'Pippi Espinoza']

const DST_GROUP = 'DST / 1031'

// Which IR mailbox corresponds with an LP is the Graph-derived signal for who owns the
// relationship in practice. team@ is shared, so it never implies an individual owner.
const MAILBOX_OWNERS: Record<string, string> = {
  'mberry@erpfunds.com': 'Meghan Berry',
  'wmeyer@erpfunds.com': 'William Meyer',
  'mparad@erpfunds.com': 'Michele Parad',
  'pespinoza@erpfunds.com': 'Pippi Espinoza',
}

// Relationship owner: a manual override wins, then the Salesforce account owner,
// then whoever actually corresponds with the LP (from the mailbox scan).
function resolveOwner(lp: LpRecord, manual?: string | null): { name: string; source: 'manual' | 'salesforce' | 'email' | 'none' } {
  if (manual && manual.trim()) return { name: manual.trim(), source: 'manual' }
  if (lp.sfOwner && lp.sfOwner.trim()) return { name: lp.sfOwner.trim(), source: 'salesforce' }
  const mb = (lp.lastInteraction?.mailbox || '').toLowerCase()
  if (mb && MAILBOX_OWNERS[mb]) return { name: MAILBOX_OWNERS[mb], source: 'email' }
  return { name: '', source: 'none' }
}

interface Overlay {
  investor_key: string
  program?: string | null
  funnel_stage?: string | null
  tier?: string | null
  owner?: string | null
  source?: string | null
  entity?: string | null
  target_amount?: number | string | null
  expected_close?: string | null
}
interface Person { name: string; email: string | null; phone: string | null; company: string | null; location: string | null; funds: string[] }
interface Meeting {
  id: string
  meeting_date: string | null
  created_at: string
  medium: string | null
  interest_level: string | null
  sticking_points: unknown
  follow_up_commitments: unknown
  relationship_context: string | null
  next_touch_suggestion: string | null
  onedrive_url: string | null
}

const normKey = (s: string) => (s || '').trim().toLowerCase()
function fmtUsd(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n === 0) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}
function daysSince(dateStr?: string | null): number | null {
  if (!dateStr) return null
  const t = new Date(dateStr).getTime()
  if (isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}
function fmtDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function effectiveCommitted(lp: LpRecord): number {
  if (lp.committedUsd != null) return lp.committedUsd
  if (lp.group === DST_GROUP && lp.commitmentUsd > 0) return lp.commitmentUsd
  return 0
}
function stageColor(stage?: string | null): string {
  const i = FUNNEL_STAGES.indexOf(stage || '')
  if (i < 0) return '#9ca3af'
  if (i >= 5) return '#0f766e'     // Subscription docs / Funded
  if (i >= 3) return '#9a5b12'     // Diligence / Soft-circle
  return '#5b6472'                 // early
}

// LP-directory tagging: the investor's Type derived from its group + commitment status.
// Fund IV investors split into committed LPs vs prospects (targets not yet committed).
function typeTag(lp: LpRecord): { label: string; bg: string; color: string } {
  if (lp.group === DST_GROUP) return { label: 'DST / 1031', bg: '#fef3c7', color: '#92400e' }
  if (lp.group === 'Prior Fund LPs') return { label: 'Prior Fund LP', bg: '#f3e8ff', color: '#7e22ce' }
  if (effectiveCommitted(lp) > 0) return { label: 'Fund IV LP', bg: '#eff6ff', color: '#1d4ed8' }
  return { label: 'Fund IV Prospect', bg: '#e5f2eb', color: '#197a52' }
}

export default function InvestorCrmView({ program }: { program: 'PE' | 'DST' }) {
  const [lps, setLps] = useState<LpRecord[]>([])
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<LpRecord | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [lpRes, ovRes] = await Promise.all([
        fetch('/api/lp-directory'),
        fetch('/api/investor-crm'),
      ])
      const lpJson = await lpRes.json()
      if (!lpRes.ok || lpJson.error) { setError(lpJson.error ?? `Load failed (${lpRes.status})`); return }
      setLps(Array.isArray(lpJson.lps) ? lpJson.lps : [])
      const ovJson = await ovRes.json().catch(() => ({}))
      setOverlays(ovJson.overlays ?? {})
      setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const overlayFor = useCallback((lp: LpRecord): Overlay | undefined => overlays[normKey(lp.investor)], [overlays])

  const rows = useMemo(() => {
    const inProgram = (lp: LpRecord) => program === 'DST' ? lp.group === DST_GROUP : lp.group !== DST_GROUP
    const q = search.trim().toLowerCase()
    return lps
      .filter(inProgram)
      .filter(lp => !q || lp.investor.toLowerCase().includes(q) || (lp.contact || '').toLowerCase().includes(q) || (lp.email || '').toLowerCase().includes(q))
      .sort((a, b) => effectiveCommitted(b) - effectiveCommitted(a) || a.investor.localeCompare(b.investor))
  }, [lps, program, search])

  const totalCommitted = useMemo(() => rows.reduce((s, lp) => s + effectiveCommitted(lp), 0), [rows])

  function onOverlaySaved(key: string, ov: Overlay) {
    setOverlays(prev => ({ ...prev, [key]: { ...prev[key], ...ov } }))
  }

  // Force the heavy Salesforce/SharePoint recompute (same as the LP Directory "Sync" button),
  // then refresh overlays. Reports company-account coverage inline so grouping can be verified.
  async function syncSalesforce() {
    setSyncing(true); setSyncMsg(null)
    try {
      const [lpRes, ovRes] = await Promise.all([fetch('/api/lp-directory?refresh=1'), fetch('/api/investor-crm')])
      const lpJson = await lpRes.json()
      if (!lpRes.ok || lpJson.error) { setSyncMsg({ ok: false, text: lpJson.error ?? `Sync failed (${lpRes.status})` }); return }
      const nextLps: LpRecord[] = Array.isArray(lpJson.lps) ? lpJson.lps : []
      setLps(nextLps)
      const ovJson = await ovRes.json().catch(() => ({}))
      setOverlays(ovJson.overlays ?? {})
      const inProg = nextLps.filter(l => program === 'DST' ? l.group === DST_GROUP : l.group !== DST_GROUP)
      const withSf = inProg.filter(l => (l.sfOwner || '').trim()).length
      const withAny = inProg.filter(l => resolveOwner(l, overlays[normKey(l.investor)]?.owner).name).length
      setSyncMsg({ ok: true, text: `Synced. Relationship owner known for ${withAny} of ${inProg.length} ${program} investors (${withSf} from Salesforce, the rest inferred from email activity).` })
    } catch (e) { setSyncMsg({ ok: false, text: `Sync failed: ${String(e)}` }) }
    finally { setSyncing(false) }
  }

  // Export the currently-filtered rows to CSV (opens in Excel), mirroring the LP Directory export.
  function exportCsv() {
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    const cols = ['Investor', 'Account (SF)', 'Type', 'Prior Funds', 'Program', 'Funnel Stage', 'Committed', 'Target', 'Expected Close', 'Owner', 'Source', 'Broker/Advisor Firm', 'Broker/Advisor Rep', 'Email', 'Phone', 'Last Interaction']
    const lines = rows.map(lp => {
      const ov = overlayFor(lp)
      const target = lp.sfAmount ?? (lp.commitmentUsd > 0 ? lp.commitmentUsd : null)
      return [
        lp.investor,
        lp.sfCompany || '',
        typeTag(lp).label,
        (lp.priorFunds || []).join(', '),
        program,
        ov?.funnel_stage || '',
        effectiveCommitted(lp) ? fmtUsd(effectiveCommitted(lp)) : '',
        target != null ? fmtUsd(target) : '',
        lp.sfCloseDate || '',
        resolveOwner(lp, ov?.owner).name,
        ov?.source || '',
        lp.brokerFirm || lp.sfAdvisorFirm || '',
        lp.brokerContact || lp.sfAdvisorContact || '',
        lp.resolvedEmail || lp.email || '',
        lp.phone || '',
        lp.lastInteraction ? `${lp.lastInteraction.date} · ${lp.lastInteraction.note}` : '',
      ].map(v => esc(String(v ?? ''))).join(',')
    })
    const csv = [cols.map(esc).join(','), ...lines].join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${program}-Investors-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const accent = program === 'DST' ? '#8a5a1a' : '#26324a'
  const committedLabel = program === 'DST' ? 'DST COMMITTED' : 'FUND IV COMMITTED'

  // Group-by-account (the investor's Salesforce parent-account / company).
  const [groupByAccount, setGroupByAccount] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const NO_ACCOUNT = '(No account in Salesforce)'
  const colCount = program === 'DST' ? 6 : 5
  const accountGroups = useMemo(() => {
    const m = new Map<string, LpRecord[]>()
    for (const lp of rows) { const k = (lp.sfCompany || '').trim() || NO_ACCOUNT; if (!m.has(k)) m.set(k, []); m.get(k)!.push(lp) }
    return [...m.entries()]
      .map(([name, lps]) => ({ name, lps, committed: lps.reduce((s, l) => s + effectiveCommitted(l), 0) }))
      .sort((a, b) => a.name === NO_ACCOUNT ? 1 : b.name === NO_ACCOUNT ? -1 : (b.committed - a.committed) || a.name.localeCompare(b.name))
  }, [rows])

  const renderRow = (lp: LpRecord, key: string | number) => {
    const ov = overlayFor(lp)
    const stage = ov?.funnel_stage
    const ds = daysSince(lp.lastInteraction?.date)
    return (
      <tr key={key} onClick={() => setSelected(lp)}
        style={{ borderTop: '1px solid #f0f1f3', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        <td style={tdCss}>
          <div style={{ fontWeight: 600, color: '#1a2233' }}>{lp.investor}</div>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>{[lp.contact, lp.resolvedEmail || lp.email].filter(Boolean).join(' · ')}</div>
        </td>
        <td style={tdCss}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 220 }}>
            {(() => { const t = typeTag(lp); return <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: t.bg, color: t.color }}>{t.label}</span> })()}
            {lp.priorFunds?.map(pf => <span key={pf} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7e22ce', whiteSpace: 'nowrap' }}>{pf}</span>)}
            {lp.commitType && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', whiteSpace: 'nowrap' }}>{lp.commitType}</span>}
          </div>
        </td>
        <td style={{ ...tdCss, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: effectiveCommitted(lp) ? '#0f766e' : '#d1d5db' }}>{fmtUsd(effectiveCommitted(lp))}</td>
        <td style={tdCss}>{stage
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor(stage) }} />{stage}</span>
          : <span style={{ color: '#d1d5db' }}>—</span>}</td>
        {program === 'DST' && <td style={tdCss}>{(lp.brokerFirm || lp.sfAdvisorFirm)
          ? <div><div style={{ fontSize: 13 }}>{lp.brokerFirm || lp.sfAdvisorFirm}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{lp.brokerContact || lp.sfAdvisorContact}</div></div>
          : <span style={{ color: '#d1d5db' }}>—</span>}</td>}
        <td style={tdCss}>{lp.lastInteraction
          ? <div><div style={{ fontSize: 13 }}>{fmtDate(lp.lastInteraction.date)}</div>{ds != null && <div style={{ fontSize: 11, fontWeight: 600, color: ds <= 14 ? '#197a52' : ds <= 45 ? '#9a5b12' : '#b91c1c' }}>{ds}d ago</div>}</div>
          : <span style={{ color: '#d1d5db' }}>No contact logged</span>}</td>
      </tr>
    )
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Investor CRM</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>{program === 'DST' ? 'DST Investors' : 'PE Investors'}</h1>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>INVESTORS</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233' }}>{rows.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{committedLabel}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f766e' }}>{fmtUsd(totalCommitted)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search investors, contacts, email…"
          style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }}
        />
        <button onClick={() => setGroupByAccount(v => !v)} style={{ border: `1px solid ${groupByAccount ? '#c7d2fe' : '#d1d5db'}`, background: groupByAccount ? '#eef2ff' : '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: groupByAccount ? '#3730a3' : '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>☰ {groupByAccount ? 'Grouped by account' : 'Group by account'}</button>
        <button onClick={exportCsv} disabled={loading || rows.length === 0} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#374151', cursor: rows.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>⤓ Export to Excel</button>
        <button onClick={syncSalesforce} disabled={syncing} title="Pull the latest from Salesforce (also refreshes company accounts)" style={{ border: '1px solid #0f766e', background: syncing ? '#f0f9f7' : '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#0f766e', cursor: syncing ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>{syncing ? '⟳ Syncing…' : '⟳ Sync with Salesforce'}</button>
      </div>
      {syncMsg && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: syncMsg.ok ? '#197a52' : '#b91c1c' }}>{syncMsg.text}</div>}
      {syncing && <div style={{ marginBottom: 12, fontSize: 12.5, color: '#9ca3af' }}>Pulling the commitment schedule + Salesforce + mailbox scan — this can take up to a minute.</div>}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading investors…</div>}
      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <th style={thCss}>Investor</th>
                  <th style={thCss}>Tags</th>
                  <th style={thCss}>Committed</th>
                  <th style={thCss}>Stage</th>
                  {program === 'DST' && <th style={thCss}>Advisor / Broker</th>}
                  <th style={thCss}>Last Contact</th>
                </tr>
              </thead>
              <tbody>
                {groupByAccount
                  ? accountGroups.flatMap(g => {
                      const open = !collapsed.has(g.name)
                      const header = (
                        <tr key={'h:' + g.name} onClick={() => setCollapsed(prev => { const n = new Set(prev); if (n.has(g.name)) n.delete(g.name); else n.add(g.name); return n })}
                          style={{ background: '#f3f5f8', cursor: 'pointer', borderTop: '2px solid #e5e7eb' }}>
                          <td colSpan={colCount} style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ color: '#6b7280', width: 12 }}>{open ? '▾' : '▸'}</span>
                              <span style={{ fontWeight: 700, color: g.name === NO_ACCOUNT ? '#9ca3af' : '#1a2233' }}>{g.name}</span>
                              <span style={{ fontSize: 12, color: '#6b7280' }}>{g.lps.length} investor{g.lps.length === 1 ? '' : 's'}</span>
                              <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(g.committed)}</span>
                            </div>
                          </td>
                        </tr>
                      )
                      return open ? [header, ...g.lps.map(lp => renderRow(lp, g.name + '|' + lp.investor))] : [header]
                    })
                  : rows.map((lp, i) => renderRow(lp, i))}
                {rows.length === 0 && <tr><td colSpan={colCount} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No investors match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <InvestorDrawer
          lp={selected}
          program={program}
          overlay={overlayFor(selected)}
          accent={accent}
          onClose={() => setSelected(null)}
          onSaved={onOverlaySaved}
        />
      )}
    </div>
  )
}

const thCss: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const tdCss: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }

// ── Detail drawer ─────────────────────────────────────────────────────────────

function InvestorDrawer({ lp, program, overlay, accent, onClose, onSaved }: {
  lp: LpRecord
  program: 'PE' | 'DST'
  overlay?: Overlay
  accent: string
  onClose: () => void
  onSaved: (key: string, ov: Overlay) => void
}) {
  const key = normKey(lp.investor)
  const [tab, setTab] = useState<'overview' | 'meetings' | 'emails' | 'docs'>('overview')
  const [stage, setStage] = useState(overlay?.funnel_stage ?? '')
  const [owner, setOwner] = useState(overlay?.owner ?? '')
  const [source, setSource] = useState(overlay?.source ?? '')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)

  const email = lp.resolvedEmail || lp.email || ''
  const committed = effectiveCommitted(lp)
  const targetAmount = (overlay?.target_amount != null ? Number(overlay.target_amount) : null) ?? lp.sfAmount ?? (lp.commitmentUsd || null)
  const closeDate = overlay?.expected_close || lp.sfCloseDate || null
  const resolvedOwner = resolveOwner(lp, overlay?.owner)
  const ownerOptions = [...new Set([...OWNERS, resolvedOwner.name].filter(Boolean))].sort()
  const [targetDraft, setTargetDraft] = useState(targetAmount != null ? String(targetAmount) : '')
  const [closeDraft, setCloseDraft] = useState(closeDate ?? '')

  // One-line rollup of the account for the summary card.
  const summaryText = (() => {
    const t = typeTag(lp).label
    const parts: string[] = []
    parts.push(committed > 0
      ? `${lp.investor} is a ${t} with ${fmtUsd(committed)} committed${targetAmount ? ` against a ${fmtUsd(targetAmount)} target` : ''}.`
      : `${lp.investor} is a ${t}${targetAmount ? ` with a ${fmtUsd(targetAmount)} target` : ''} — no commitment recorded yet.`)
    if (lp.priorFunds?.length) parts.push(`Prior investor in ${lp.priorFunds.join(' and ')}.`)
    if (stage) parts.push(`Currently at the ${stage} stage.`)
    const firm = lp.brokerFirm || lp.sfAdvisorFirm
    if (firm) parts.push(`Introduced through ${firm}.`)
    const ds = daysSince(lp.lastInteraction?.date)
    parts.push(ds != null ? `Last contact was ${ds} day${ds === 1 ? '' : 's'} ago.` : 'No contact logged yet.')
    return parts.join(' ')
  })()

  useEffect(() => {
    // Meetings from the IR dialogue log
    const params = new URLSearchParams()
    params.set('investor', lp.investor)
    if (email) params.set('email', email)
    fetch(`/api/investor-crm/meetings?${params}`).then(r => r.json()).then(j => setMeetings(j.meetings ?? [])).catch(() => setMeetings([]))
    // People under this account (the individuals tied to the investing entity)
    setPeople(null)
    fetch(`/api/investor-crm/people?investor=${encodeURIComponent(lp.investor)}`)
      .then(r => r.json()).then(j => setPeople(j.people ?? [])).catch(() => setPeople([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lp.investor])


  async function saveOverlay(patch: Partial<Overlay>) {
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch('/api/investor-crm', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor: lp.investor, program, funnel_stage: stage, owner, source, ...patch }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { setSaveMsg(`Save failed: ${j.error ?? res.status}`); return }
      onSaved(key, j.overlay)
      setSaveMsg('Saved')
      setTimeout(() => setSaveMsg(null), 1500)
    } catch (e) { setSaveMsg(`Save failed: ${String(e)}`) }
    finally { setSaving(false) }
  }



  const initials = lp.investor.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 96vw)', height: '100%', background: '#eef0f4', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,.2)' }}>
        {/* top bar */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{program === 'DST' ? 'DST Investors' : 'PE Investors'} <span style={{ color: '#c7ccd4' }}>›</span> <b style={{ color: '#1a2233' }}>{lp.investor}</b></div>
          <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Close ✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, padding: 16, alignItems: 'start' }}>
          {/* LEFT RAIL */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...cardCss, padding: 20, textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 25, background: `linear-gradient(150deg, ${accent}, #1a2233)` }}>{initials}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233', lineHeight: 1.15 }}>{lp.investor}</div>
              {lp.contact && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{lp.contact}</div>}
              {email && <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 2, wordBreak: 'break-all' }}>{email}</div>}

              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 20, color: program === 'DST' ? '#8a5a1a' : '#3b4a86', background: program === 'DST' ? '#f8efe0' : '#eceff9' }}>● {program === 'DST' ? 'DST — 1031' : 'PE — Fund IV'}</span>
                {lp.priorFunds?.map(f => <span key={f} style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 6, background: '#f1f2f4', color: '#6b7280' }}>{f}</span>)}
              </div>

              <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #eef0f2' }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 5 }}>Total Committed Capital</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtUsd(committed)}</div>
              </div>

              {email
                ? <a href={`mailto:${email}?subject=${encodeURIComponent('ERP Industrials — ' + lp.investor)}`} style={{ display: 'block', marginTop: 16, padding: 11, borderRadius: 9, background: accent, color: '#fff', fontWeight: 600, textDecoration: 'none' }}>✉ Send Email</a>
                : <div style={{ marginTop: 16, padding: 11, borderRadius: 9, background: '#f1f2f4', color: '#9ca3af', fontWeight: 600 }}>No email on file</div>}
            </div>

            {/* editable rail fields */}
            <div style={{ ...cardCss, padding: '4px 18px 10px' }}>
              <RailField label="Fundraising Stage">
                <select value={stage} onChange={e => { setStage(e.target.value); saveOverlay({ funnel_stage: e.target.value }) }} style={selCss}>
                  <option value="">— set stage —</option>
                  {FUNNEL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </RailField>
              <RailField label="Target Amount">
                <input value={targetDraft} onChange={e => setTargetDraft(e.target.value)}
                  onBlur={() => saveOverlay({ target_amount: targetDraft })}
                  placeholder="e.g. 1,000,000" style={{ ...selCss, cursor: 'text' }} />
              </RailField>
              <RailField label="Expected Close">
                <input type="date" value={closeDraft} onChange={e => { setCloseDraft(e.target.value); saveOverlay({ expected_close: e.target.value }) }}
                  style={{ ...selCss, cursor: 'text' }} />
              </RailField>
              <RailField label="Relationship Owner">
                <select value={owner || resolvedOwner.name} onChange={e => { setOwner(e.target.value); saveOverlay({ owner: e.target.value }) }} style={selCss}>
                  <option value="">— unassigned —</option>
                  {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
                {!owner && resolvedOwner.source !== 'none' && (
                  <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3 }}>
                    Auto — {resolvedOwner.source === 'salesforce' ? 'Salesforce account owner' : 'from email activity'}
                  </div>
                )}
              </RailField>
              {program === 'DST' && (
                <RailField label="Advisor / Broker">
                  <div style={railVal}>{lp.brokerFirm || lp.sfAdvisorFirm || '—'}</div>
                  {(lp.brokerContact || lp.sfAdvisorContact) && <div style={{ fontSize: 13, color: '#6b7280' }}>{lp.brokerContact || lp.sfAdvisorContact}</div>}
                </RailField>
              )}
              <RailField label="Source">
                <input value={source} onChange={e => setSource(e.target.value)} onBlur={() => saveOverlay({ source })} placeholder="e.g. Referral, Conference…" style={{ ...selCss, cursor: 'text' }} />
              </RailField>
              <RailField label="Last Contact">
                <div style={railVal}>{lp.lastInteraction ? fmtDate(lp.lastInteraction.date) : 'No contact logged'}</div>
                {lp.lastInteraction?.note && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{lp.lastInteraction.note.slice(0, 120)}</div>}
              </RailField>
              {saveMsg && <div style={{ fontSize: 12, color: saveMsg === 'Saved' ? '#197a52' : '#b91c1c', padding: '6px 0', fontWeight: 600 }}>{saving ? 'Saving…' : saveMsg}</div>}
            </div>
          </aside>

          {/* MAIN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb' }}>
              {([['overview', 'Overview'], ['meetings', `Meetings${meetings ? ` (${meetings.length})` : ''}`], ['emails', 'Emails'], ['docs', 'Subscription Docs']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: tab === k ? '#1a2233' : '#9ca3af', padding: '10px 14px', borderBottom: tab === k ? '2px solid #0f766e' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <>
                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={sectTitle}>Account Summary</div>
                  <div style={{ fontSize: 14.5, color: '#374151', lineHeight: 1.55 }}>{summaryText}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12, marginTop: 16 }}>
                    <Stat label="Committed" value={committed ? fmtUsd(committed) : '—'} accent="#0f766e" />
                    <Stat label="Target" value={fmtUsd(targetAmount)} />
                    <Stat label="People" value={people == null ? '·' : String(people.length)} />
                    <Stat label="Last Contact" value={lp.lastInteraction ? `${daysSince(lp.lastInteraction.date)}d ago` : '—'} />
                  </div>
                </div>

                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={sectTitle}>Account Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                    <Field k="Account (Entity)" v={lp.investor} />
                    <Field k="Primary Contact" v={lp.contact || '—'} />
                    <Field k="Email" v={email || '—'} />
                    <Field k="Source" v={source || '—'} />
                    <Field k="Program" v={program === 'DST' ? 'DST / 1031' : 'PE — Fund IV'} />
                    <Field k="Group" v={lp.group} />
                    <Field k="Prior Funds" v={lp.priorFunds?.length ? lp.priorFunds.join(', ') : '—'} />
                  </div>
                  {lp.notes && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f1f3' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>Notes</div>
                    <div style={{ fontSize: 14, color: '#374151', marginTop: 4 }}>{lp.notes}</div>
                  </div>}
                </div>

                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={sectTitle}>People Under This Account {people && people.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>{people.length}</span>}</div>
                  {people == null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
                  {people && people.length === 0 && (
                    <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
                      No individual contacts on file for this entity.{lp.contact ? ` Primary contact of record: ${lp.contact}.` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {people?.map((pn, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 14.5 }}>{pn.name}</span>
                            {pn.funds.map(f => <span key={f} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7e22ce', whiteSpace: 'nowrap' }}>{f}</span>)}
                          </div>
                          <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>{[pn.email, pn.phone].filter(Boolean).join(' · ') || '—'}</div>
                          {(pn.company || pn.location) && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{[pn.company, pn.location].filter(Boolean).join(' · ')}</div>}
                        </div>
                        {pn.email && <a href={`mailto:${pn.email}`} style={{ fontSize: 12.5, fontWeight: 600, color: '#0e7490', textDecoration: 'none', whiteSpace: 'nowrap' }}>Email</a>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {tab === 'meetings' && (
              <div style={{ ...cardCss, padding: 20 }}>
                <div style={sectTitle}>Meeting History <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>IR DIALOGUE LOG</span></div>
                {meetings == null && <div style={{ color: '#9ca3af' }}>Loading…</div>}
                {meetings && meetings.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14, padding: '20px 0' }}>No meetings logged yet. Meetings recorded by the IR agent will appear here.</div>}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {meetings?.map(m => (
                    <div key={m.id} style={{ padding: '14px 0', borderTop: '1px solid #f0f1f3', display: 'flex', gap: 14 }}>
                      <div style={{ flex: '0 0 70px', color: '#0f766e', fontWeight: 700, fontSize: 13 }}>{fmtDate(m.meeting_date || m.created_at)}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                          {m.medium && <span style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', background: '#f1f2f4', padding: '1px 8px', borderRadius: 20 }}>{m.medium}</span>}
                          {m.interest_level && <span style={{ fontSize: 11, fontWeight: 700, color: '#197a52', background: '#e5f2eb', padding: '1px 8px', borderRadius: 20 }}>{m.interest_level}</span>}
                        </div>
                        {m.relationship_context && <div style={{ fontSize: 13.5, color: '#374151' }}>{m.relationship_context}</div>}
                        {m.next_touch_suggestion && <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 5 }}><b style={{ color: '#6b7280' }}>Next touch:</b> {m.next_touch_suggestion}</div>}
                        {m.onedrive_url && <a href={m.onedrive_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: '#0e7490', display: 'inline-block', marginTop: 4 }}>Open notes ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'emails' && (
              <div style={{ ...cardCss, padding: 40, textAlign: 'center', color: '#9ca3af' }}>Threaded email history (IR email log &amp; mailbox scan) — coming next.</div>
            )}
            {tab === 'docs' && (
              <div style={{ ...cardCss, padding: 40, textAlign: 'center', color: '#9ca3af' }}>Subscription documents — sub-docs, K-1s, statements (links to fund admin) — coming next.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const cardCss: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 1px 2px rgba(20,28,45,.05)' }
const sectTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 14 }
const selCss: React.CSSProperties = { width: '100%', marginTop: 3, background: '#f8f9fb', border: '1px solid #d1d5db', borderRadius: 8, padding: '8px 10px', fontSize: 13.5, fontWeight: 600, color: '#1a2233', cursor: 'pointer' }
const railVal: React.CSSProperties = { fontSize: 14, color: '#1a2233', fontWeight: 500, marginTop: 3 }

function RailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '11px 0', borderBottom: '1px solid #f0f1f3' }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</div>
      {children}
    </div>
  )
}
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ background: '#f8f9fb', border: '1px solid #eef0f2', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 700, color: accent ?? '#1a2233', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{value}</div>
    </div>
  )
}
function Field({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{k}</div>
      <div style={{ fontSize: 15, color: '#1a2233', fontWeight: 500, marginTop: 3 }}>{v}</div>
    </div>
  )
}
