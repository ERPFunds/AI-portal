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
  investor?: string | null
  program?: string | null
  funnel_stage?: string | null
  tier?: string | null
  owner?: string | null
  source?: string | null
  entity?: string | null
  target_amount?: number | string | null
  expected_close?: string | null
  archived?: boolean
  portal_created?: boolean
  fund?: string | null
  committed_usd?: number | string | null
  contact?: string | null
  email?: string | null
  phone?: string | null
  notes?: string | null
}
interface Fund { id: string; name: string; program: string | null }
interface Person {
  match_key: string; id: string | null; name: string; title: string | null; email: string | null
  phone_office: string | null; phone_cell: string | null; address: string | null
  notes: string | null; is_primary: boolean; company: string | null; funds: string[]
}
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
const normEntity = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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

// An investor created in the portal, shaped like an imported record so the list, filters,
// sorting and the detail drawer all treat it identically.
function overlayToLp(ov: Overlay): LpRecord {
  const isDst = ov.program === 'DST'
  return {
    investor: ov.investor ?? '',
    commitment: '', commitmentUsd: Number(ov.target_amount ?? 0) || 0, commitType: '',
    contact: ov.contact ?? '', email: ov.email ?? '', phone: ov.phone ?? '',
    date: '', notes: ov.notes ?? '',
    group: isDst ? DST_GROUP : (ov.fund || 'Fund IV'),
    lastInteraction: null,
    sfLpType: null, sfCalled: null, sfDistributions: null, sfCrmId: null,
    sfBrokerCompany: null, sfBrokerContact: null, sfAdvisorFirm: null, sfAdvisorContact: null,
    brokerFirm: '', brokerContact: '',
    resolvedEmail: ov.email ?? null,
    committedUsd: ov.committed_usd != null ? Number(ov.committed_usd) : null,
    priorFunds: [],
  }
}

// Every fund an investor is associated with — the current fund plus any prior ones.
function fundsOf(lp: LpRecord): string[] {
  const out: string[] = []
  if (lp.group === DST_GROUP) out.push('DST / 1031')
  else if (lp.group !== 'Prior Fund LPs') out.push(/fund|dst/i.test(lp.group || '') ? lp.group : 'Fund IV')
  for (const pf of lp.priorFunds ?? []) if (!out.includes(pf)) out.push(pf)
  return out
}

// The table's columns. Each knows how to render nothing (renderRow does that) but how to be
// filtered and sorted, so every column gets both for free.
interface ColDef {
  key: string; label: string; dstOnly?: boolean
  text: (lp: LpRecord) => string
  sort: (lp: LpRecord) => string | number
}
const bdOf = (lp: LpRecord) => lp.sfBrokerDealer || lp.brokerFirm || lp.sfAdvisorFirm || ''
const advOf = (lp: LpRecord) => lp.brokerContact || lp.sfAdvisorContact || ''
const COLUMN_DEFS: ColDef[] = [
  { key: 'fund', label: 'Fund', text: lp => [typeTag(lp).label, ...(lp.priorFunds ?? []), lp.commitType || ''].join(' '), sort: lp => typeTag(lp).label },
  { key: 'investor', label: 'Investor', text: lp => lp.investor, sort: lp => lp.investor.toLowerCase() },
  { key: 'contacts', label: 'Contact(s)', text: lp => [lp.contact, lp.resolvedEmail || lp.email].filter(Boolean).join(' '), sort: lp => (lp.contact || '').toLowerCase() },
  { key: 'commitment', label: 'Commitment', text: lp => String(effectiveCommitted(lp) || ''), sort: lp => effectiveCommitted(lp) },
  { key: 'brokerDealer', label: 'Broker Dealer / RIA', dstOnly: true, text: bdOf, sort: lp => bdOf(lp).toLowerCase() },
  { key: 'advisor', label: 'Advisor', dstOnly: true, text: advOf, sort: lp => advOf(lp).toLowerCase() },
  { key: 'notes', label: 'Notes', text: lp => lp.notes || '', sort: lp => (lp.notes || '').toLowerCase() },
]

// LP-directory tagging: the investor's Type derived from its group + commitment status.
// Fund IV investors split into committed LPs vs prospects (targets not yet committed).
function typeTag(lp: LpRecord): { label: string; bg: string; color: string } {
  if (lp.group === DST_GROUP) return { label: 'DST / 1031', bg: '#fef3c7', color: '#92400e' }
  if (lp.group === 'Prior Fund LPs') return { label: 'Prior Fund LP', bg: '#f3e8ff', color: '#7e22ce' }
  if (effectiveCommitted(lp) > 0) return { label: 'Fund IV LP', bg: '#eff6ff', color: '#1d4ed8' }
  return { label: 'Fund IV Prospect', bg: '#e5f2eb', color: '#197a52' }
}

// mode splits each population by whether capital has actually been committed:
// 'lps' = committed, 'prospects' = no commitment recorded yet, 'all' = both.
export default function InvestorCrmView({ program, mode = 'all', onNavigate }: { program: 'PE' | 'DST'; mode?: 'lps' | 'prospects' | 'all'; onNavigate?: (view: string) => void }) {
  const [lps, setLps] = useState<LpRecord[]>([])
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fundFilter, setFundFilter] = useState('All')
  const [funds, setFunds] = useState<Fund[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showFunds, setShowFunds] = useState(false)
  const [colFilters, setColFilters] = useState<Record<string, string>>({})
  const [sortKey, setSortKey] = useState('commitment')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<LpRecord | null>(null)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
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

  const loadFunds = useCallback(async () => {
    try { const r = await fetch('/api/crm-funds'); const j = await r.json(); setFunds(j.funds ?? []) } catch { /* non-fatal */ }
  }, [])
  useEffect(() => { loadFunds() }, [loadFunds])

  // How many individuals sit under each investing entity (for the Contact(s) column).
  useEffect(() => {
    fetch('/api/investor-crm/people')
      .then(r => r.json()).then(j => setContactCounts(j.counts ?? {})).catch(() => {})
  }, [])

  const columns = useMemo(() => COLUMN_DEFS.filter(c => !c.dstOnly || program === 'DST'), [program])
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'commitment' ? 'desc' : 'asc') }
  }

  const overlayFor = useCallback((lp: LpRecord): Overlay | undefined => overlays[normKey(lp.investor)], [overlays])

  const rows = useMemo(() => {
    const inProgram = (lp: LpRecord) => program === 'DST' ? lp.group === DST_GROUP : lp.group !== DST_GROUP
    const q = search.trim().toLowerCase()
    const portal = Object.values(overlays)
      .filter(ov => ov.portal_created && !ov.archived && (ov.program ?? 'PE') === program)
      .map(overlayToLp)
    return [...lps, ...portal]
      .filter(lp => !overlays[normKey(lp.investor)]?.archived)
      .filter(inProgram)
      .filter(lp => mode === 'all' ? true : mode === 'lps' ? effectiveCommitted(lp) > 0 : effectiveCommitted(lp) === 0)
      .filter(lp => fundFilter === 'All' || fundsOf(lp).includes(fundFilter))
      .filter(lp => !q || lp.investor.toLowerCase().includes(q) || (lp.contact || '').toLowerCase().includes(q) || (lp.email || '').toLowerCase().includes(q))
      .filter(lp => columns.every(c => {
        const f = (colFilters[c.key] ?? '').trim().toLowerCase()
        return !f || c.text(lp).toLowerCase().includes(f)
      }))
      .sort((a, b) => {
        const c = columns.find(x => x.key === sortKey) ?? columns[0]
        const av = c.sort(a), bv = c.sort(b)
        const r = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? r : -r
      })
  }, [lps, overlays, program, search, fundFilter, mode, columns, colFilters, sortKey, sortDir])

  // Fund options present in this program, newest fund first.
  const fundOptions = useMemo(() => {
    const set = new Set<string>()
    for (const lp of lps) {
      if (program === 'DST' ? lp.group !== DST_GROUP : lp.group === DST_GROUP) continue
      for (const f of fundsOf(lp)) set.add(f)
    }
    for (const f of funds) if (!f.program || f.program === program) set.add(f.name)
    return [...set].sort().reverse()
  }, [lps, program, funds])

  const totalCommitted = useMemo(() => rows.reduce((s, lp) => s + effectiveCommitted(lp), 0), [rows])
  const totalTarget = useMemo(() => rows.reduce((s, lp) => s + (lp.sfAmount ?? lp.commitmentUsd ?? 0), 0), [rows])

  // Heading + headline metric per view.
  const heading = mode === 'lps' ? (program === 'DST' ? 'DST Investors' : 'LP Directory')
    : mode === 'prospects' ? (program === 'DST' ? 'DST Prospects' : 'PE Prospects')
    : (program === 'DST' ? 'DST Investors' : 'PE Investors')
  const subtitle = mode === 'lps' ? 'Committed limited partners'
    : mode === 'prospects' ? 'Targets with no commitment recorded yet' : ''

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
    const cols = ['Fund', 'Investor', 'Contact', 'Commitment', 'Broker Dealer / RIA', 'Advisor', 'Notes', 'Prior Funds', 'Program', 'Funnel Stage', 'Target', 'Expected Close', 'Owner', 'Source', 'Broker/Advisor Firm', 'Broker/Advisor Rep', 'Email', 'Phone', 'Last Interaction']
    const lines = rows.map(lp => {
      const ov = overlayFor(lp)
      const target = lp.sfAmount ?? (lp.commitmentUsd > 0 ? lp.commitmentUsd : null)
      return [
        typeTag(lp).label,
        lp.investor,
        lp.contact || '',
        effectiveCommitted(lp) ? fmtUsd(effectiveCommitted(lp)) : '',
        lp.sfBrokerDealer || lp.brokerFirm || lp.sfAdvisorFirm || '',
        lp.brokerContact || lp.sfAdvisorContact || '',
        lp.notes || '',
        (lp.priorFunds || []).join(', '),
        program,
        ov?.funnel_stage || '',
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
    a.download = `${heading.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const accent = program === 'DST' ? '#8a5a1a' : '#26324a'
  const committedLabel = mode === 'prospects' ? 'TOTAL TARGET' : program === 'DST' ? 'DST COMMITTED' : 'FUND IV COMMITTED'

  // Group-by-account (the investor's Salesforce parent-account / company).
  const [groupByAccount, setGroupByAccount] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const NO_ACCOUNT = '(No account in Salesforce)'
  const colCount = program === 'DST' ? 8 : 6
  const accountGroups = useMemo(() => {
    const m = new Map<string, LpRecord[]>()
    for (const lp of rows) { const k = (lp.sfCompany || '').trim() || NO_ACCOUNT; if (!m.has(k)) m.set(k, []); m.get(k)!.push(lp) }
    return [...m.entries()]
      .map(([name, lps]) => ({ name, lps, committed: lps.reduce((s, l) => s + effectiveCommitted(l), 0) }))
      .sort((a, b) => a.name === NO_ACCOUNT ? 1 : b.name === NO_ACCOUNT ? -1 : (b.committed - a.committed) || a.name.localeCompare(b.name))
  }, [rows])

  async function archiveInvestor(lp: LpRecord) {
    const ov = overlays[normKey(lp.investor)]
    const portalOwned = !!ov?.portal_created
    const msg = portalOwned
      ? `Delete "${lp.investor}"? This investor exists only in the portal, so it will be removed for good.`
      : `Archive "${lp.investor}"? It stays in the source data but is hidden from the CRM. You can restore it later.`
    if (!window.confirm(msg)) return
    try {
      if (portalOwned) {
        await fetch(`/api/investor-crm?investor_key=${encodeURIComponent(normKey(lp.investor))}`, { method: 'DELETE' })
        setOverlays(prev => { const n = { ...prev }; delete n[normKey(lp.investor)]; return n })
      } else {
        const res = await fetch('/api/investor-crm', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investor: lp.investor, program, archived: true }),
        })
        const j = await res.json()
        if (j.overlay) setOverlays(prev => ({ ...prev, [normKey(lp.investor)]: j.overlay }))
      }
    } catch (e) { alert(`Failed: ${String(e)}`) }
  }

  // Jump to the DST Vendor directory, pre-filtered to this broker-dealer / advisor.
  function openVendor(name: string) {
    try { window.sessionStorage.setItem('dstVendorFilter', name) } catch { /* storage unavailable */ }
    onNavigate?.('dst-vendors')
  }

  const renderRow = (lp: LpRecord, key: string | number) => {
    const t = typeTag(lp)
    const contactEmail = lp.resolvedEmail || lp.email || ''
    const extra = (contactCounts[normEntity(lp.investor)] ?? 0) - 1
    return (
      <tr key={key} onClick={() => setSelected(lp)}
        style={{ borderTop: '1px solid #f0f1f3', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        {/* Fund */}
        <td style={tdCss}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 170 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: t.bg, color: t.color }}>{t.label}</span>
            {lp.priorFunds?.map(pf => <span key={pf} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7e22ce', whiteSpace: 'nowrap' }}>{pf}</span>)}
            {lp.commitType && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', whiteSpace: 'nowrap' }}>{lp.commitType}</span>}
          </div>
        </td>
        {/* Investor (the account / entity) */}
        <td style={tdCss}><div style={{ fontWeight: 600, color: '#1a2233' }}>{lp.investor}</div></td>
        {/* Contact(s) */}
        <td style={tdCss}>
          {lp.contact || contactEmail
            ? <div>
                <div style={{ fontSize: 13, color: '#374151' }}>{lp.contact || '—'}</div>
                {contactEmail && <div style={{ fontSize: 12, color: '#9ca3af' }}>{contactEmail}</div>}
                {extra > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', marginTop: 2 }}>+{extra} more</div>}
              </div>
            : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>
        {/* Commitment */}
        <td style={{ ...tdCss, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: effectiveCommitted(lp) ? '#0f766e' : '#d1d5db' }}>{fmtUsd(effectiveCommitted(lp))}</td>
        {/* Broker Dealer / RIA + Advisor — both link into the DST Vendor directory */}
        {program === 'DST' && <td style={tdCss}>
          <VendorLink name={lp.sfBrokerDealer || lp.brokerFirm || lp.sfAdvisorFirm || ''} onOpen={openVendor} />
        </td>}
        {program === 'DST' && <td style={tdCss}>
          <VendorLink name={lp.brokerContact || lp.sfAdvisorContact || ''} onOpen={openVendor} />
        </td>}
        {/* Notes */}
        <td style={{ ...tdCss, maxWidth: 260 }}>
          {lp.notes ? <span style={{ fontSize: 12.5, color: '#6b7280' }}>{lp.notes}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>
        {/* Email / Edit */}
        <td style={{ ...tdCss, whiteSpace: 'nowrap', textAlign: 'right' }}>
          {contactEmail
            ? <a href={`mailto:${contactEmail}?subject=${encodeURIComponent('ERP Industrials — ' + lp.investor)}`}
                onClick={e => e.stopPropagation()} style={rowBtn}>Email</a>
            : <span style={{ ...rowBtn, color: '#d1d5db', cursor: 'default' }}>Email</span>}
          <button onClick={e => { e.stopPropagation(); setSelected(lp) }} style={{ ...rowBtn, border: 0, background: 'none' }}>Edit</button>
          <button onClick={e => { e.stopPropagation(); archiveInvestor(lp) }} title="Hide from the CRM"
            style={{ ...rowBtn, border: 0, background: 'none', color: '#b91c1c' }}>
            {overlays[normKey(lp.investor)]?.portal_created ? 'Delete' : 'Archive'}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Investor CRM</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>{heading}</h1>
          {subtitle && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{mode === 'prospects' ? 'PROSPECTS' : 'INVESTORS'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233' }}>{rows.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{committedLabel}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f766e' }}>{fmtUsd(mode === 'prospects' ? totalTarget : totalCommitted)}</div>
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
        <select value={fundFilter} onChange={e => setFundFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All funds</option>
          {fundOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={() => setGroupByAccount(v => !v)} style={{ border: `1px solid ${groupByAccount ? '#c7d2fe' : '#d1d5db'}`, background: groupByAccount ? '#eef2ff' : '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: groupByAccount ? '#3730a3' : '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>☰ {groupByAccount ? 'Grouped by account' : 'Group by account'}</button>
        <button onClick={exportCsv} disabled={loading || rows.length === 0} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#374151', cursor: rows.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>⤓ Export to Excel</button>
        <button onClick={() => setShowAdd(true)}
          style={{ border: 0, background: accent, color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Investor</button>
        <button onClick={() => setShowFunds(true)}
          style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>Manage funds</button>
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
                  {columns.map(c => (
                    <th key={c.key} style={{ ...thCss, cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => toggleSort(c.key)} title={`Sort by ${c.label}`}>
                      {c.label}
                      <span style={{ marginLeft: 4, opacity: sortKey === c.key ? 1 : 0.25 }}>
                        {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </th>
                  ))}
                  <th style={thCss}></th>
                </tr>
                <tr style={{ background: '#fff', borderTop: '1px solid #f0f1f3' }}>
                  {columns.map(c => (
                    <th key={c.key} style={{ padding: '6px 10px', fontWeight: 400 }}>
                      <input
                        value={colFilters[c.key] ?? ''}
                        onChange={e => setColFilters(f => ({ ...f, [c.key]: e.target.value }))}
                        placeholder="Filter…"
                        style={{ width: '100%', minWidth: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, color: '#374151' }}
                      />
                    </th>
                  ))}
                  <th style={{ padding: '6px 10px', textAlign: 'right' }}>
                    {Object.values(colFilters).some(v => (v ?? '').trim()) && (
                      <button onClick={() => setColFilters({})}
                        style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, color: '#0e7490' }}>Clear</button>
                    )}
                  </th>
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

      {showAdd && (
        <AddInvestorModal
          program={program}
          funds={fundOptions}
          onCancel={() => setShowAdd(false)}
          onSaved={ov => { setOverlays(prev => ({ ...prev, [normKey(ov.investor ?? '')]: ov })); setShowAdd(false) }}
        />
      )}
      {showFunds && <ManageFundsModal funds={funds} program={program} onClose={() => setShowFunds(false)} onChanged={loadFunds} />}

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

function AddInvestorModal({ program, funds, onCancel, onSaved }: {
  program: 'PE' | 'DST'; funds: string[]; onCancel: () => void; onSaved: (ov: Overlay) => void
}) {
  const [d, setD] = useState<Record<string, string>>({ fund: funds[0] ?? '' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setD(p => ({ ...p, [k]: v }))
  const fld = (label: string, k: string, full?: boolean, ph?: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      <input value={d[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={ph} style={modalInput} />
    </label>
  )
  async function save() {
    if (!(d.investor ?? '').trim()) { alert('Investor name is required'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/investor-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...d, program }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert(`Could not add: ${j.error ?? res.status}`); return }
      onSaved(j.overlay)
    } catch (e) { alert(`Could not add: ${String(e)}`) }
    finally { setBusy(false) }
  }
  return (
    <div onClick={onCancel} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={modalCard}>
        <h2 style={modalTitle}>Add {program === 'DST' ? 'DST Investor' : 'Investor'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {fld('Investor / Entity Name', 'investor', true)}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Fund</span>
            <select value={d.fund ?? ''} onChange={e => set('fund', e.target.value)} style={modalInput}>
              <option value="">— none —</option>
              {funds.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          {fld('Commitment', 'committed_usd', false, '1,000,000')}
          {fld('Primary Contact', 'contact')}
          {fld('Email', 'email')}
          {fld('Phone', 'phone')}
          {fld('Target Amount', 'target_amount', false, '1,000,000')}
          {fld('Notes', 'notes', true)}
        </div>
        <div style={modalActions}>
          <button onClick={onCancel} style={modalGhost}>Cancel</button>
          <button onClick={save} disabled={busy} style={{ ...modalPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? 'Adding…' : 'Add Investor'}</button>
        </div>
      </div>
    </div>
  )
}

function ManageFundsModal({ funds, program, onClose, onChanged }: {
  funds: Fund[]; program: 'PE' | 'DST'; onClose: () => void; onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/crm-funds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), program }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert(`Could not add: ${j.error ?? res.status}`); return }
      setName(''); onChanged()
    } finally { setBusy(false) }
  }
  async function remove(f: Fund) {
    if (!window.confirm(`Delete the fund "${f.name}"? Investors keep their data — they just lose this label.`)) return
    setBusy(true)
    try { await fetch(`/api/crm-funds?id=${f.id}`, { method: 'DELETE' }); onChanged() }
    finally { setBusy(false) }
  }
  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={modalCard}>
        <h2 style={modalTitle}>Manage Funds</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Fund V, DST III"
            onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ ...modalInput, flex: 1 }} />
          <button onClick={add} disabled={busy || !name.trim()} style={modalPrimary}>Add</button>
        </div>
        {funds.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13.5 }}>No funds defined yet. Add the ones you use to tag investors.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {funds.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid #eef0f2', borderRadius: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{f.name}</span>
              {f.program && <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280' }}>{f.program}</span>}
              <button onClick={() => remove(f)} disabled={busy} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#b91c1c' }}>Delete</button>
            </div>
          ))}
        </div>
        <div style={modalActions}><button onClick={onClose} style={modalGhost}>Done</button></div>
      </div>
    </div>
  )
}

const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,20,32,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modalCard: React.CSSProperties = { width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }
const modalTitle: React.CSSProperties = { margin: '0 0 16px', fontSize: 19, fontWeight: 700, color: '#1a2233' }
const modalActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }
const modalInput: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }
const modalGhost: React.CSSProperties = { border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#374151' }
const modalPrimary: React.CSSProperties = { border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }

// A broker-dealer / advisor name that opens the DST Vendor directory filtered to it.
function VendorLink({ name, onOpen }: { name: string; onOpen: (n: string) => void }) {
  if (!name) return <span style={{ color: '#d1d5db' }}>—</span>
  return (
    <button
      onClick={e => { e.stopPropagation(); onOpen(name) }}
      title="Open in the DST Vendor directory"
      style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#0e7490', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
    >{name}</button>
  )
}

const rowBtn: React.CSSProperties = { fontWeight: 600, fontSize: 13, color: '#0e7490', padding: '0 6px', textDecoration: 'none', cursor: 'pointer' }
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
  const [tab, setTab] = useState<'overview' | 'meetings' | 'docs'>('overview')
  const [stage, setStage] = useState(overlay?.funnel_stage ?? '')
  const [owner, setOwner] = useState(overlay?.owner ?? '')
  const [source, setSource] = useState(overlay?.source ?? '')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [meetings, setMeetings] = useState<Meeting[] | null>(null)
  const [people, setPeople] = useState<Person[] | null>(null)
  const [editingContact, setEditingContact] = useState<Partial<Person> | null>(null)

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
    if (ds != null) parts.push(`Last contact was ${ds} day${ds === 1 ? '' : 's'} ago.`)
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



  async function loadPeople() {
    try {
      const r = await fetch(`/api/investor-crm/people?investor=${encodeURIComponent(lp.investor)}`)
      const j = await r.json(); setPeople(j.people ?? [])
    } catch { setPeople([]) }
  }
  async function saveContact(d: Partial<Person>) {
    const res = await fetch('/api/investor-crm/people', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...d, investor: lp.investor }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditingContact(null); loadPeople()
  }
  async function deleteContact(id: string) {
    if (!window.confirm('Remove this contact?')) return
    const res = await fetch(`/api/investor-crm/people?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadPeople()
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
              {([['overview', 'Overview'], ['meetings', `Meetings${meetings ? ` (${meetings.length})` : ''}`], ['docs', 'Subscription Docs']] as const).map(([k, label]) => (
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={sectTitle}>People Under This Account {people && people.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>{people.length}</span>}</div>
                    <button onClick={() => setEditingContact({})} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#374151' }}>+ Add contact</button>
                  </div>
                  {people == null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
                  {people && people.length === 0 && (
                    <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
                      No individual contacts on file for this entity.{lp.contact ? ` Primary contact of record: ${lp.contact}.` : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {people?.map((pn) => (
                      <div key={pn.match_key} style={{ padding: '11px 13px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: 14.5 }}>{pn.name}</span>
                              {pn.is_primary && <span style={{ fontSize: 10, fontWeight: 700, color: '#9a6b12' }}>★ PRIMARY</span>}
                              {pn.funds.map(f => <span key={f} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7e22ce', whiteSpace: 'nowrap' }}>{f}</span>)}
                            </div>
                            {pn.title && <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 1 }}>{pn.title}</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '2px 16px', marginTop: 6 }}>
                              <ContactBit label="Email" value={pn.email} href={pn.email ? `mailto:${pn.email}` : undefined} />
                              <ContactBit label="Office" value={pn.phone_office} />
                              <ContactBit label="Cell" value={pn.phone_cell} />
                              <ContactBit label="Address" value={pn.address} />
                            </div>
                            {pn.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{pn.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setEditingContact(pn)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#0e7490' }}>Edit</button>
                            {pn.id && <button onClick={() => deleteContact(pn.id!)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#b91c1c' }}>✕</button>}
                          </div>
                        </div>
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

            {tab === 'docs' && (
              <div style={{ ...cardCss, padding: 40, textAlign: 'center', color: '#9ca3af' }}>Subscription documents — sub-docs, K-1s, statements (links to fund admin) — coming next.</div>
            )}
          </div>
        </div>
      </div>
      {editingContact && <ContactModal draft={editingContact} onCancel={() => setEditingContact(null)} onSave={saveContact} />}
    </div>
  )
}

// One labelled contact detail (email / office / cell / address).
function ContactBit({ label, value, href }: { label: string; value: string | null; href?: string }) {
  if (!value) return null
  return (
    <div style={{ fontSize: 12.5, color: '#6b7280' }}>
      <span style={{ color: '#b6bcc6', fontWeight: 600 }}>{label}: </span>
      {href ? <a href={href} style={{ color: '#0e7490', textDecoration: 'none' }}>{value}</a> : value}
    </div>
  )
}

function ContactModal({ draft, onCancel, onSave }: { draft: Partial<Person>; onCancel: () => void; onSave: (d: Partial<Person>) => void }) {
  const [d, setD] = useState<Partial<Person>>(draft)
  const set = (k: keyof Person, v: string | boolean) => setD(prev => ({ ...prev, [k]: v }))
  const fld = (label: string, k: keyof Person, full?: boolean) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      <input value={(d[k] as string) || ''} onChange={e => set(k, e.target.value)}
        style={{ width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }} />
    </label>
  )
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 700, color: '#1a2233' }}>{draft.match_key ? 'Edit Contact' : 'Add Contact'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {fld('Name', 'name')}
          {fld('Title', 'title')}
          {fld('Email', 'email', true)}
          {fld('Office Phone', 'phone_office')}
          {fld('Cell Phone', 'phone_cell')}
          {fld('Address', 'address', true)}
          {fld('Notes', 'notes', true)}
          <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151', fontWeight: 600 }}>
            <input type="checkbox" checked={!!d.is_primary} onChange={e => set('is_primary', e.target.checked)} /> Primary contact for this account
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={() => { if (!String(d.name ?? '').trim()) { alert('Name is required'); return } onSave(d) }} style={{ border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
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
