'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { LpRecord } from '@/app/api/lp-directory/route'
import ImportModal from './ImportModal'

// ── Investor CRM ──────────────────────────────────────────────────────────────
// A relationship + fundraising CRM built on the live LP-directory data. Two populations
// (PE and DST) shown as tabs; click an investor to open the detail drawer. Capital
// accounting (called/uncalled/NAV) lives in the fund admin portal, not here.

const FUNNEL_STAGES = ['Identified', 'Contacted', 'Deck/OM sent', 'Diligence', 'Soft-circle', 'Subscription docs', 'Funded']
const OWNERS = ['Meghan Berry', 'William Meyer']
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME',
  'MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]
const SOURCES = [
  'Referral', 'Existing LP', 'Placement agent', 'Broker / advisor',
  'Conference', 'Inbound', 'Outreach', 'Other',
]

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
  is_lp?: boolean
  investor_type?: string | null
  fund?: string | null
  prior_fund?: string | null
  fund_commitments?: Record<string, number> | null
  committed_usd?: number | string | null
  contact?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  website?: string | null
  notes?: string | null
  next_steps?: string | null
  state?: string | null
  broker_dealer?: string | null
  advisor?: string | null
  about?: string | null
  about_sources?: string[] | null
  about_researched_at?: string | null
}
interface InvestorDoc { id: string; file_id: string; filename: string; size_bytes: number; created_at: string; uploaded_by: string | null }
interface Fund { id: string; name: string; program: string | null }
interface Person {
  match_key: string; id: string | null; name: string; title: string | null; email: string | null
  phone_office: string | null; phone_cell: string | null; address: string | null
  notes: string | null; is_primary: boolean; company: string | null; funds: string[]
  linkedin_url?: string | null; bio?: string | null
}

// Must match the key stored in investor_crm: lowercase, punctuation collapsed to single
// spaces. A weaker normalization misses the overlay for any punctuated name, which makes a
// saved edit render as a second row.
const normKey = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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
    date: '', notes: ov.notes ?? '', nextSteps: ov.next_steps ?? '',
    group: isDst ? DST_GROUP : (ov.fund || ''),
    portalFund: !isDst && !!ov.fund,
    lastInteraction: null,
    sfLpType: null, sfCalled: null, sfDistributions: null, sfCrmId: null,
    sfBrokerCompany: null, sfBrokerContact: null, sfAdvisorFirm: null, sfAdvisorContact: null,
    brokerFirm: ov.broker_dealer ?? '', brokerContact: ov.advisor ?? '',
    resolvedEmail: ov.email ?? null,
    committedUsd: ov.committed_usd != null ? Number(ov.committed_usd) : null,
    priorFunds: [],
    dstFunds: isDst && ov.fund_commitments ? Object.keys(ov.fund_commitments) : undefined,
  }
}

// Every fund an investor is associated with — the current fund plus any prior ones.
function fundsOf(lp: LpRecord): string[] {
  const out: string[] = []
  // A DST investor's funds come from its per-fund commitment split; the generic
  // 'DST / 1031' label is only the fallback for a record with no split recorded.
  if (lp.group === DST_GROUP) { if (lp.dstFunds?.length) out.push(...lp.dstFunds); else out.push('DST / 1031') }
  else if (lp.group !== 'Prior Fund LPs') {
    const g = lp.group || ''
    // An investor in several funds is stored as 'Fund II, Fund III' — count them under each
    // fund rather than inventing a combined option.
    // A portal-owned record names its fund explicitly, so take it as given. Only a
    // SharePoint schedule section falls through to the live-raise guess — without this,
    // any fund whose name lacks the word "Fund" (IEP Capital I, say) was mislabelled
    // Fund IV and could not be filtered on.
    if (lp.portalFund || /fund|dst/i.test(g)) {
      for (const part of g.split(',').map(x => x.trim()).filter(Boolean)) { if (!out.includes(part)) out.push(part) }
    } else if (g.trim()) out.push('Fund IV')  // a named schedule section means the live raise
  }
  for (const pf of lp.priorFunds ?? []) if (!out.includes(pf)) out.push(pf)
  return out
}

// The table's columns. Each knows how to render nothing (renderRow does that) but how to be
// filtered and sorted, so every column gets both for free.
interface ColDef {
  key: string; label: string; dstOnly?: boolean; prospectsOnly?: boolean
  text: (lp: LpRecord) => string
  sort: (lp: LpRecord) => string | number
}
const bdOf = (lp: LpRecord) => lp.sfBrokerDealer || lp.brokerFirm || lp.sfAdvisorFirm || ''
const advOf = (lp: LpRecord) => lp.brokerContact || lp.sfAdvisorContact || ''
const COLUMN_DEFS: ColDef[] = [
  { key: 'fund', label: 'Fund', text: lp => [typeTag(lp).label, ...(lp.priorFunds ?? []), lp.commitType || ''].join(' '), sort: lp => typeTag(lp).label },
  { key: 'investor', label: 'Investor', text: lp => lp.investor, sort: lp => lp.investor.toLowerCase() },
  { key: 'contacts', label: 'Contact(s)', text: () => '', sort: () => '' },
  { key: 'commitment', label: 'Commitment', text: lp => String(effectiveCommitted(lp) || ''), sort: lp => effectiveCommitted(lp) },
  { key: 'brokerDealer', label: 'Broker Dealer / RIA', dstOnly: true, text: bdOf, sort: lp => bdOf(lp).toLowerCase() },
  { key: 'advisor', label: 'Advisor', dstOnly: true, text: advOf, sort: lp => advOf(lp).toLowerCase() },
  { key: 'notes', label: 'Notes', text: lp => lp.notes || '', sort: lp => (lp.notes || '').toLowerCase() },
  // Where the prospect stands and what happens next — merged from the two Next Steps
  // columns on the PE prospect sheet.
  { key: 'nextSteps', label: 'Next Steps', prospectsOnly: true, text: lp => lp.nextSteps || '', sort: lp => (lp.nextSteps || '').toLowerCase() },
]

// LP-directory tagging: the investor's Type derived from its group + commitment status.
// Fund IV investors split into committed LPs vs prospects (targets not yet committed).
function typeTag(lp: LpRecord, isLp = false): { label: string; bg: string; color: string } {
  // Show which DST rather than a label every row shares.
  if (lp.group === DST_GROUP) return { label: lp.dstFunds?.[0] ?? 'DST / 1031', bg: '#fef3c7', color: '#92400e' }
  if (lp.group === 'Prior Fund LPs') return { label: 'Prior Fund LP', bg: '#f3e8ff', color: '#7e22ce' }
  // The record's own fund. An investor in several funds is stored as "Fund II, Fund III" —
  // the tag names the first, and the Fund column adds a chip for each of the others.
  // No fund on the record means we don't know which one yet — say so rather than guessing.
  const fund = fundsOf(lp)[0]
  return effectiveCommitted(lp) > 0 || isLp
    ? { label: fund ? `${fund} LP` : 'LP', bg: '#eff6ff', color: '#1d4ed8' }
    : { label: fund ? `${fund} Prospect` : 'Prospect', bg: '#e5f2eb', color: '#197a52' }
}

// mode splits each population by whether capital has actually been committed:
// 'lps' = committed, 'prospects' = no commitment recorded yet, 'all' = both.
export default function InvestorCrmView({ program, mode = 'all', onNavigate }: { program: 'PE' | 'DST'; mode?: 'lps' | 'prospects' | 'all'; onNavigate?: (view: string) => void }) {
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [fundFilter, setFundFilter] = useState('All')
  const [stageFilter, setStageFilter] = useState('All')
  const [stateFilter, setStateFilter] = useState('All')
  const [ownerFilter, setOwnerFilter] = useState('All')
  const [funds, setFunds] = useState<Fund[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [showFunds, setShowFunds] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const [sortKey, setSortKey] = useState('commitment')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<LpRecord | null>(null)
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [contactPrimary, setContactPrimary] = useState<Record<string, { name: string; email: string; more: number }>>({})
  const [syncMsg, setSyncMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const ovRes = await fetch('/api/investor-crm')
      if (!ovRes.ok) { setError(`Load failed (${ovRes.status})`); return }
      const ovJson = await ovRes.json().catch(() => ({}))
      if (ovJson.error) { setError(ovJson.error); return }
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
      .then(r => r.json())
      .then(j => { setContactCounts(j.counts ?? {}); setContactPrimary(j.primary ?? {}) })
      .catch(() => {})
  }, [])

  // The Contact(s) column only appears once there are contacts in the portal store — while it's
  // empty (e.g. after a reset, before an import) the column is hidden rather than shown blank.
  const hasContacts = Object.keys(contactPrimary).length > 0
  // PE Prospects are all Fund IV by definition, so the Fund column is dropped there.
  const hideFund = program === 'PE' && mode === 'prospects'
  // The LP Directory is portal-owned now, so it carries no Salesforce sync or fund admin.
  const isLpDirectory = program === 'PE' && mode === 'lps'
  const columns = useMemo(
    () => COLUMN_DEFS.filter(c =>
      (!c.dstOnly || program === 'DST') &&
      (c.key !== 'contacts' || hasContacts) &&
      (c.key !== 'fund' || !hideFund) &&
      (!c.prospectsOnly || mode === 'prospects')),
    [program, hasContacts, hideFund, mode]
  )
  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'commitment' ? 'desc' : 'asc') }
  }

  useEffect(() => {
    setFundFilter('All'); setStageFilter('All'); setStateFilter('All'); setOwnerFilter('All'); setSearch('')
  }, [program, mode])

  const overlayFor = useCallback((lp: LpRecord): Overlay | undefined => overlays[normKey(lp.investor)], [overlays])

  const rows = useMemo(() => {
    const inProgram = (lp: LpRecord) => program === 'DST' ? lp.group === DST_GROUP : lp.group !== DST_GROUP
    const q = search.trim().toLowerCase()
    const portal = Object.values(overlays)
      .filter(ov => ov.portal_created && !ov.archived && (ov.program ?? 'PE') === program)
      .map(overlayToLp)
    // DST used to be layered on top of the SharePoint cache. Its investors, fund splits,
    // commitments, broker/advisor and contacts all live in the portal now, so every CRM
    // list is portal-owned and none of them read the feed.
    return portal
      .filter(lp => !overlays[normKey(lp.investor)]?.archived)
      .filter(inProgram)
      .filter(lp => {
        if (mode === 'all') return true
        const isLp = effectiveCommitted(lp) > 0 || !!overlays[normKey(lp.investor)]?.is_lp
        return mode === 'lps' ? isLp : !isLp
      })
      .filter(lp => fundFilter === 'All' || fundsOf(lp).includes(fundFilter))
      .filter(lp => {
        if (ownerFilter === 'All') return true
        const ow = overlays[normKey(lp.investor)]?.owner ?? ''
        return ownerFilter === 'Unassigned' ? !ow : ow === ownerFilter
      })
      .filter(lp => {
        if (stateFilter === 'All') return true
        const st = overlays[normKey(lp.investor)]?.state ?? ''
        return stateFilter === 'Unknown' ? !st : st === stateFilter
      })
      .filter(lp => {
        if (stageFilter === 'All') return true
        const st = overlays[normKey(lp.investor)]?.funnel_stage ?? ''
        return stageFilter === 'Unset' ? !st : st === stageFilter
      })
      .filter(lp => !q || lp.investor.toLowerCase().includes(q) || (lp.contact || '').toLowerCase().includes(q) || (lp.email || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const c = columns.find(x => x.key === sortKey) ?? columns[0]
        const av = c.sort(a), bv = c.sort(b)
        const r = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv))
        return sortDir === 'asc' ? r : -r
      })
  }, [overlays, program, search, fundFilter, stageFilter, stateFilter, ownerFilter, mode, columns, sortKey, sortDir])

  const stateOptions = useMemo(() => {
    const set = new Set<string>()
    for (const ov of Object.values(overlays)) {
      if ((ov.program ?? 'PE') !== program || ov.archived) continue
      if (ov.state) set.add(ov.state)
    }
    return [...set].sort()
  }, [overlays, program])

  // Fund options present in this program, newest fund first.
  const fundOptions = useMemo(() => {
    const set = new Set<string>()
    // Deliberately not derived from the SharePoint cache. Its rows are grouped by schedule
    // section, so reading funds out of them put labels like "Fund II Investors (Not in
    // Fund III)" in the filter. Every row in these lists is portal-owned and states its
    // own fund, so the managed list plus the records themselves are the whole truth.
    // Managed funds lead, in their configured order; anything else seen in the data follows.
    for (const ov of Object.values(overlays)) {
      if ((ov.program ?? 'PE') !== program || ov.archived || !ov.fund) continue
      for (const part of ov.fund.split(',').map(x => x.trim()).filter(Boolean)) set.add(part)
    }
    const managed = funds.filter(f => !f.program || f.program === program).map(f => f.name)
    const derived = [...set].filter(n => !managed.includes(n)).sort()
    return [...managed, ...derived]
  }, [overlays, program, funds])

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
        '',
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
  // Label what the figure actually totals: the filtered fund, or everything in view.
  const committedLabel = mode === 'prospects' ? 'TOTAL TARGET'
    : fundFilter !== 'All' ? fundFilter.toUpperCase() + ' COMMITTED'
    : program === 'DST' ? 'DST COMMITTED'
    : 'TOTAL COMMITTED'

  const colCount = columns.length + 1

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
    const t = typeTag(lp, !!overlays[normKey(lp.investor)]?.is_lp)
    const contactEmail = contactPrimary[normEntity(lp.investor)]?.email || lp.resolvedEmail || lp.email || ''
    const pc = contactPrimary[normEntity(lp.investor)]
    return (
      <tr key={key} onClick={() => setSelected(lp)}
        style={{ borderTop: '1px solid #f0f1f3', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
        {/* Fund — hidden where every record is the same fund, so the cells must drop too,
            otherwise each row sits one column left of its header. */}
        {!hideFund && <td style={tdCss}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 170 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap', background: t.bg, color: t.color }}>{t.label}</span>
            {fundsOf(lp).slice(1).map(f => <span key={f} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', whiteSpace: 'nowrap' }}>{f}</span>)}
            {lp.priorFunds?.map(pf => <span key={pf} style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f3e8ff', color: '#7e22ce', whiteSpace: 'nowrap' }}>{pf}</span>)}
            {lp.commitType && <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20, background: '#f1f5f9', color: '#475569', whiteSpace: 'nowrap' }}>{lp.commitType}</span>}
          </div>
        </td>}
        {/* Investor (the account / entity) */}
        <td style={tdCss}><div style={{ fontWeight: 600, color: '#1a2233' }}>{lp.investor}</div></td>
        {/* Contact(s) — from the portal contact store only */}
        {hasContacts && <td style={tdCss}>
          {pc
            ? <div>
                <div style={{ fontSize: 13, color: '#374151' }}>{pc.name || pc.email || '—'}</div>
                {pc.name && pc.email && <div style={{ fontSize: 12, color: '#9ca3af' }}>{pc.email}</div>}
                {pc.more > 0 && <div style={{ fontSize: 11, fontWeight: 600, color: '#0f766e', marginTop: 2 }}>+{pc.more} more</div>}
              </div>
            : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>}
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
        {/* Next Steps — prospects only */}
        {mode === 'prospects' && <td style={{ ...tdCss, maxWidth: 320 }}>
          {lp.nextSteps ? <span style={{ fontSize: 12.5, color: '#374151' }}>{lp.nextSteps}</span> : <span style={{ color: '#d1d5db' }}>—</span>}
        </td>}
        {/* Email / Edit */}
        <td style={{ ...tdCss, whiteSpace: 'nowrap', textAlign: 'right' }}>
          {contactEmail
            ? <a href={`mailto:${contactEmail}?subject=${encodeURIComponent('ERP Industrials — ' + lp.investor)}`}
                onClick={e => e.stopPropagation()} style={emailBtn}>Email</a>
            : <span style={{ ...rowBtn, color: '#cbd5e1', background: '#f8fafc', borderColor: '#e2e8f0', cursor: 'default' }}>Email</span>}
          <button onClick={e => { e.stopPropagation(); setSelected(lp) }} style={{ ...rowBtn, color: '#374151', background: '#f8fafc', borderColor: '#e2e8f0' }}>Edit</button>
          {!isLpDirectory && <button onClick={e => { e.stopPropagation(); archiveInvestor(lp) }} title="Hide from the CRM"
            style={{ ...rowBtn, color: '#b91c1c', background: '#fef2f2', borderColor: '#fecaca' }}>
            {overlays[normKey(lp.investor)]?.portal_created ? 'Delete' : 'Archive'}
          </button>}
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
        {/* Prospects are all Fund IV, so the fund filter gives way to the funnel stage. */}
        {hideFund && <select value={stageFilter} onChange={e => setStageFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All stages</option>
          {FUNNEL_STAGES.map(st => <option key={st} value={st}>{st}</option>)}
          <option value="Unset">— no stage set —</option>
        </select>}
        {isLpDirectory && (
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
            <option value="All">All owners</option>
            {OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            <option value="Unassigned">— unassigned —</option>
          </select>
        )}
        {isLpDirectory && stateOptions.length > 0 && (
          <select value={stateFilter} onChange={e => setStateFilter(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
            <option value="All">All states</option>
            {stateOptions.map(st => <option key={st} value={st}>{st}</option>)}
            <option value="Unknown">— no state on file —</option>
          </select>
        )}
        {!hideFund && <select value={fundFilter} onChange={e => setFundFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All funds</option>
          {fundOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>}
        <button onClick={exportCsv} disabled={loading || rows.length === 0} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#374151', cursor: rows.length ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>⤓ Export to Excel</button>
        <button onClick={() => setShowImport(true)}
          style={{ border: '1px solid #0f766e', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#0f766e', cursor: 'pointer', whiteSpace: 'nowrap' }}>⤒ Import</button>
        <button onClick={() => setShowAdd(true)}
          style={{ border: 0, background: accent, color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Investor</button>
        {/* Prospects are all Fund IV, so there is no fund list to manage there. */}
        {!hideFund && <button onClick={() => setShowFunds(true)}
          style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ Add Fund</button>}

      </div>
      {syncMsg && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: syncMsg.ok ? '#197a52' : '#b91c1c' }}>{syncMsg.text}</div>}

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
              </thead>
              <tbody>
                {rows.map((lp, i) => renderRow(lp, i))}
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
      {showImport && (
        <ImportModal
          program={program}
          defaultFund={fundFilter !== 'All' ? fundFilter : undefined}
          onClose={() => setShowImport(false)}
          onDone={() => { load(); loadFunds() }}
        />
      )}
      {showFunds && <ManageFundsModal funds={funds} program={program} onClose={() => setShowFunds(false)} onChanged={loadFunds} />}

      {selected && (
        <InvestorDrawer
          lp={selected}
          program={program}
          isLpDirectory={isLpDirectory || program === 'DST'}
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

// Row actions render as real buttons rather than text links.
const emailBtn: React.CSSProperties = { display: 'inline-block', fontWeight: 600, fontSize: 12.5, color: '#fff', background: '#2563eb', border: '1px solid #1d4ed8', borderRadius: 7, padding: '5px 13px', marginLeft: 6, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4 }
const rowBtn: React.CSSProperties = { display: 'inline-block', fontWeight: 600, fontSize: 12.5, color: '#0e7490', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 7, padding: '5px 11px', marginLeft: 6, textDecoration: 'none', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.4 }
const thCss: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const tdCss: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }

// ── Detail drawer ─────────────────────────────────────────────────────────────

function InvestorDrawer({ lp, program, isLpDirectory, overlay, accent, onClose, onSaved }: {
  lp: LpRecord
  program: 'PE' | 'DST'
  isLpDirectory?: boolean
  overlay?: Overlay
  accent: string
  onClose: () => void
  onSaved: (key: string, ov: Overlay) => void
}) {
  const key = normKey(lp.investor)
  const [stage, setStage] = useState(overlay?.funnel_stage ?? '')
  const [owner, setOwner] = useState(overlay?.owner ?? '')
  const [source, setSource] = useState(overlay?.source ?? '')
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [people, setPeople] = useState<Person[] | null>(null)
  const [editingContact, setEditingContact] = useState<Partial<Person> | null>(null)
  const [docs, setDocs] = useState<InvestorDoc[] | null>(null)
  const [acct, setAcct] = useState({
    investor: lp.investor,
    investor_type: overlay?.investor_type ?? lp.sfLpType ?? '',
    source: overlay?.source ?? '',
    owner: overlay?.owner ?? '',
    // Prospects are all Fund IV, so defaulting the field there is right. In the LP
    // Directory it is not: the contacts imported without a fund genuinely have none yet,
    // and showing Fund IV made an unknown look like an answer.
    fund: overlay?.fund ?? (program === 'PE' && !isLpDirectory ? 'Fund IV' : ''),
    committed_usd: overlay?.committed_usd != null ? String(overlay.committed_usd) : String(effectiveCommitted(lp) || ''),
    phone: overlay?.phone ?? lp.phone ?? '',
    website: overlay?.website ?? '',
    address: overlay?.address ?? '',
    state: overlay?.state ?? '',
  })
  // Every account field is editable; the entity name is the record's key, so renaming it
  // is sent as a rename rather than a plain field update.
  async function saveAccount(patch: Record<string, string>) {
    setAcct(a => ({ ...a, ...patch }))
    const body: Record<string, unknown> = { investor: lp.investor, program, ...patch }
    if (patch.investor !== undefined) { body.investor = lp.investor; body.rename_to = patch.investor }
    try {
      const res = await fetch('/api/investor-crm', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!res.ok || j.error) { setSaveMsg(`Save failed: ${j.error ?? res.status}`); return }
      onSaved(key, j.overlay)
      setSaveMsg('Saved'); setTimeout(() => setSaveMsg(null), 1500)
    } catch (e) { setSaveMsg(`Save failed: ${String(e)}`) }
  }
  const [moving, setMoving] = useState(false)
  async function moveToLpDirectory() {
    if (!window.confirm(`Move "${lp.investor}" to the LP Directory?`)) return
    setMoving(true)
    try {
      const res = await fetch('/api/investor-crm', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor: lp.investor, program, is_lp: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setSaveMsg(`Move failed: ${j.error ?? res.status}`); return }
      onSaved(key, j.overlay)
      setSaveMsg('Moved to LP Directory')
      setTimeout(onClose, 900)
    } catch (e) { setSaveMsg(`Move failed: ${String(e)}`) }
    finally { setMoving(false) }
  }

  const [about, setAbout] = useState(overlay?.about ?? '')
  const [aboutSources, setAboutSources] = useState<string[]>(overlay?.about_sources ?? [])
  const [aboutBusy, setAboutBusy] = useState(false)
  const [aboutMsg, setAboutMsg] = useState<string | null>(null)
  // Researches the About line from public sources. The result is written server-side, so a
  // failed request leaves whatever was already on the record untouched.
  async function researchAbout() {
    setAboutBusy(true); setAboutMsg(null)
    try {
      const res = await fetch('/api/investor-crm/about', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor: lp.investor }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setAboutMsg(`Research failed: ${j.error ?? res.status}`); return }
      const r = j.results?.[0]
      // The route also fills website and address where the record had none — mirror that
      // into the account fields so the drawer shows it without a reload.
      const filled: Record<string, string> = {}
      if (r?.website && !acct.website) filled.website = r.website
      if (r?.address && !acct.address) filled.address = r.address
      if (Object.keys(filled).length) setAcct(a => ({ ...a, ...filled }))
      if (!r?.about) {
        setAboutMsg(Object.keys(filled).length
          ? `No About line found, but filled ${Object.keys(filled).join(' and ')}.`
          : 'Nothing specific found on the public web — add a line by hand.')
        return
      }
      setAbout(r.about); setAboutSources(r.sources ?? [])
      onSaved(key, { ...(overlay ?? { investor_key: key }), about: r.about, about_sources: r.sources ?? null, ...filled })
    } catch (e) { setAboutMsg(`Research failed: ${String(e)}`) }
    finally { setAboutBusy(false) }
  }
  const [stepsDraft, setStepsDraft] = useState(overlay?.next_steps ?? lp.nextSteps ?? '')
  const [stepsSaved, setStepsSaved] = useState(false)
  const [notesDraft, setNotesDraft] = useState(overlay?.notes ?? lp.notes ?? '')
  const [notesSaved, setNotesSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const docTag = `investor:${key}`

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



  const loadDocs = useCallback(async () => {
    try {
      const r = await fetch(`/api/files/list?project_tag=${encodeURIComponent(`investor:${key}`)}`)
      const j = await r.json(); setDocs(j.files ?? [])
    } catch { setDocs([]) }
  }, [key])
  useEffect(() => { loadDocs() }, [loadDocs])

  async function uploadDocs(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('projectTag', docTag)
        fd.append('category', 'Investor Docs')
        fd.append('uploadedBy', lp.investor)
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd })
        if (!res.ok) { const j = await res.json().catch(() => ({})); alert(`${file.name}: ${j.error ?? res.status}`) }
      }
      await loadDocs()
    } finally { setUploading(false) }
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
  const [liBusy, setLiBusy] = useState<string | null>(null)
  const [liMsg, setLiMsg] = useState<Record<string, string>>({})
  // Bio here is only what the person publishes on LinkedIn — deliberately different from
  // the account's About line, which is general web research about the entity.
  async function findLinkedIn(id: string) {
    setLiBusy(id); setLiMsg(m => ({ ...m, [id]: '' }))
    try {
      const res = await fetch('/api/investor-crm/linkedin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setLiMsg(m => ({ ...m, [id]: `Lookup failed: ${j.error ?? res.status}` })); return }
      const r = j.results?.[0]
      if (!r?.linkedin_url) { setLiMsg(m => ({ ...m, [id]: 'No profile could be tied to this person.' })); return }
      loadPeople()
    } catch (e) { setLiMsg(m => ({ ...m, [id]: `Lookup failed: ${String(e)}` })) }
    finally { setLiBusy(null) }
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
          <div style={{ display: 'flex', gap: 8 }}>
            {/* A prospect that has come in becomes an LP; the flag moves it across without
                needing a commitment figure yet. */}
            {!isLpDirectory && <button onClick={moveToLpDirectory} disabled={moving}
              style={{ border: '1px solid #0f766e', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: moving ? 'wait' : 'pointer', fontWeight: 600, color: '#0f766e' }}>
              {moving ? 'Moving…' : '→ Move to LP Directory'}
            </button>}
            {isLpDirectory && saveMsg && <span style={{ alignSelf: 'center', fontSize: 12.5, fontWeight: 600, color: saveMsg === 'Saved' ? '#197a52' : '#b91c1c' }}>{saving ? 'Saving…' : saveMsg}</span>}
            {isLpDirectory && email && <a href={`mailto:${email}?subject=${encodeURIComponent('ERP Industrials — ' + lp.investor)}`}
              style={{ border: '1px solid #2563eb', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 600, textDecoration: 'none' }}>✉ Email</a>}
            <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Close ✕</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isLpDirectory ? '1fr' : '300px 1fr', gap: 16, padding: 16, alignItems: 'start' }}>
          {/* LEFT RAIL — prospects and DST only; it carries the funnel fields there */}
          {!isLpDirectory && <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...cardCss, padding: 20, textAlign: 'center' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto 12px', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 25, background: `linear-gradient(150deg, ${accent}, #1a2233)` }}>{initials}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233', lineHeight: 1.15 }}>{lp.investor}</div>

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
                ? <a href={`mailto:${email}?subject=${encodeURIComponent('ERP Industrials — ' + lp.investor)}`} style={{ display: 'block', marginTop: 16, padding: 11, borderRadius: 9, background: '#2563eb', color: '#fff', fontWeight: 600, textDecoration: 'none' }}>✉ Send Email</a>
                : null}
            </div>

            {/* editable rail fields */}
            <div style={{ ...cardCss, padding: '4px 18px 10px' }}>
              {!isLpDirectory && <RailField label="Fundraising Stage">
                <select value={stage} onChange={e => { setStage(e.target.value); saveOverlay({ funnel_stage: e.target.value }) }} style={selCss}>
                  <option value="">— set stage —</option>
                  {FUNNEL_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </RailField>}
              {!isLpDirectory && <RailField label="Target Amount">
                <input value={targetDraft} onChange={e => setTargetDraft(e.target.value)}
                  onBlur={() => saveOverlay({ target_amount: targetDraft })}
                  placeholder="e.g. 1,000,000" style={{ ...selCss, cursor: 'text' }} />
              </RailField>}
              {!isLpDirectory && <RailField label="Expected Close">
                <input type="date" value={closeDraft} onChange={e => { setCloseDraft(e.target.value); saveOverlay({ expected_close: e.target.value }) }}
                  style={{ ...selCss, cursor: 'text' }} />
              </RailField>}
              {saveMsg && <div style={{ fontSize: 12, color: saveMsg === 'Saved' ? '#197a52' : '#b91c1c', padding: '6px 0', fontWeight: 600 }}>{saving ? 'Saving…' : saveMsg}</div>}
            </div>
          </aside>}

          {/* MAIN */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ ...sectTitle, marginBottom: 0 }}>About</div>
                    <button onClick={researchAbout} disabled={aboutBusy}
                      style={{ border: '1px solid #c7d2da', background: aboutBusy ? '#f1f5f9' : '#fff', color: '#0f766e',
                               borderRadius: 7, padding: '5px 11px', fontSize: 12.5, fontWeight: 600,
                               cursor: aboutBusy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      {aboutBusy ? 'Searching the web…' : about ? 'Re-research' : 'Research from the web'}
                    </button>
                  </div>
                  <textarea
                    value={about}
                    onChange={e => setAbout(e.target.value)}
                    onBlur={() => { if (about !== (overlay?.about ?? '')) saveAccount({ about }) }}
                    placeholder="Who this investor is — profession, firm, where they're based. Research pulls this plus website and address from LinkedIn and the web, then you can edit."
                    rows={3}
                    style={{ width: '100%', marginTop: 8, padding: '9px 11px', borderRadius: 8, border: '1px solid #e2e8f0',
                             fontSize: 14.5, color: '#374151', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical', background: '#f8fafc' }}
                  />
                  {aboutMsg && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{aboutMsg}</div>}
                  {!about && overlay?.about_researched_at && !aboutMsg && (
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                      Searched the public web — nothing that could be confirmed as this investor. Worth filling in by hand.
                    </div>
                  )}
                  {about && aboutSources.length > 0 && (
                    <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <span>Sources:</span>
                      {aboutSources.slice(0, 4).map((u, i) => (
                        <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>
                          {(() => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return 'link' } })()}
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={sectTitle}>Account Summary</div>
                  {/* On a prospect this only ever restated the stage and that no commitment
                      exists yet — both of which move, and both already shown elsewhere. */}
                  {isLpDirectory && <div style={{ fontSize: 14.5, color: '#374151', lineHeight: 1.55 }}>{summaryText}</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 12, marginTop: 16 }}>
                    <Stat label="Committed" value={committed ? fmtUsd(committed) : '—'} accent="#0f766e" />
                    {!isLpDirectory && <Stat label="Target" value={fmtUsd(targetAmount)} />}
                    <Stat label="People" value={people == null ? '·' : String(people.length)} />
                  </div>
                </div>

                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={sectTitle}>Account Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                    <EditField k="Account (Entity)" value={acct.investor} onSave={v => saveAccount({ investor: v })} />
                    <Field k="Primary Contact" v={people?.find(x => x.is_primary)?.name || people?.[0]?.name || '—'} />
                    <EditSelect k="Source" value={acct.source} options={SOURCES} onSave={v => saveAccount({ source: v })} />
                    <EditSelect k="Owner" value={acct.owner} options={OWNERS} onSave={v => saveAccount({ owner: v })} />
                    <EditField k="Fund" value={acct.fund} onSave={v => saveAccount({ fund: v })} />
                    <EditField k="Committed (total)" value={acct.committed_usd} onSave={v => saveAccount({ committed_usd: v })} />
                    {overlay?.fund_commitments && Object.entries(overlay.fund_commitments).map(([f, amt]) => (
                      <Field key={f} k={f + ' Committed'} v={fmtUsd(Number(amt))} />
                    ))}
                    <EditField k="Phone" value={acct.phone} onSave={v => saveAccount({ phone: v })} />
                    <EditField k="Website" value={acct.website} onSave={v => saveAccount({ website: v })} />
                    <EditSelect k="State" value={acct.state} options={US_STATES} onSave={v => saveAccount({ state: v })} />
                    <EditField k="Address" value={acct.address} onSave={v => saveAccount({ address: v })} full />
                  </div>
                  {!isLpDirectory && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f1f3' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>Next Steps</div>
                      {stepsSaved && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#197a52' }}>Saved</span>}
                    </div>
                    <textarea
                      value={stepsDraft}
                      onChange={e => setStepsDraft(e.target.value)}
                      onBlur={() => { if (stepsDraft !== (overlay?.next_steps ?? lp.nextSteps ?? '')) { saveOverlay({ next_steps: stepsDraft }); setStepsSaved(true); setTimeout(() => setStepsSaved(false), 1500) } }}
                      placeholder="Where this stands and what happens next…"
                      rows={3}
                      style={{ width: '100%', marginTop: 6, padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' }}
                    />
                  </div>}
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f1f3' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>Notes</div>
                      {notesSaved && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#197a52' }}>Saved</span>}
                    </div>
                    <textarea
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      onBlur={() => { if (notesDraft !== (overlay?.notes ?? lp.notes ?? '')) { saveOverlay({ notes: notesDraft }); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 1500) } }}
                      placeholder="Add a note about this account…"
                      rows={3}
                      style={{ width: '100%', marginTop: 6, padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' }}
                    />
                  </div>
                </div>

                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={sectTitle}>People Under This Account {people && people.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>{people.length}</span>}</div>
                    <button onClick={() => setEditingContact({})} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#374151' }}>+ Add contact</button>
                  </div>
                  {people == null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
                  {people && people.length === 0 && (
                    <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
                      No individual contacts on file for this entity.
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '2px 16px', marginTop: 6 }}>
                              <ContactBit label="Email" value={pn.email} href={pn.email ? `mailto:${pn.email}` : undefined} />
                              <ContactBit label="Office" value={pn.phone_office} />
                              <ContactBit label="Cell" value={pn.phone_cell} />
                            </div>
                            {pn.linkedin_url && (
                              <div style={{ marginTop: 5 }}>
                                <a href={pn.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 12.5, fontWeight: 600, color: '#0a66c2', textDecoration: 'none' }}>in · LinkedIn profile ↗</a>
                              </div>
                            )}
                            {pn.bio && <div style={{ fontSize: 12.5, color: '#4b5563', marginTop: 4, lineHeight: 1.5 }}>{pn.bio}</div>}
                            {liMsg[pn.id ?? ''] && <div style={{ fontSize: 11.5, color: '#b45309', marginTop: 4 }}>{liMsg[pn.id ?? '']}</div>}
                            {pn.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{pn.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {pn.id && !pn.linkedin_url && (
                              <button onClick={() => findLinkedIn(pn.id!)} disabled={liBusy === pn.id}
                                title="Search for this person's LinkedIn profile and the bio they publish there"
                                style={{ border: 0, background: 'none', cursor: liBusy === pn.id ? 'default' : 'pointer', fontWeight: 600, fontSize: 12.5, color: '#0a66c2' }}>
                                {liBusy === pn.id ? 'Searching…' : 'Find LinkedIn'}
                              </button>
                            )}
                            <button onClick={() => setEditingContact(pn)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#0e7490' }}>Edit</button>
                            {pn.id && <button onClick={() => deleteContact(pn.id!)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#b91c1c' }}>✕</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Docs live with the account now rather than behind their own tab. */}
                <div style={{ ...cardCss, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={sectTitle}>Documents {docs && docs.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>{docs.length}</span>}</div>
                  <label style={{ border: '1px solid #0f766e', background: uploading ? '#f0f9f7' : '#fff', color: '#0f766e', borderRadius: 8, padding: '6px 13px', cursor: uploading ? 'wait' : 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {uploading ? 'Uploading…' : '⤒ Upload'}
                    <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
                      onChange={e => { uploadDocs(e.target.files); e.target.value = '' }} />
                  </label>
                </div>
                {docs == null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
                {docs && docs.length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 13.5 }}>
                    No documents yet — sub-docs, K-1s and statements for this investor can be uploaded here.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {docs?.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
                      <span style={{ fontSize: 16 }}>📄</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>
                          {Math.max(1, Math.round((d.size_bytes ?? 0) / 1024))} KB · {fmtDate(d.created_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
          </div>
        </div>
      </div>
      {editingContact && <ContactModal draft={editingContact} onCancel={() => setEditingContact(null)} onSave={saveContact} />}
    </div>
  )
}

// One labelled contact detail (email / office / cell / address).
function ContactBit({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div style={{ fontSize: 12.5, color: '#6b7280' }}>
      <span style={{ color: '#b6bcc6', fontWeight: 600 }}>{label}: </span>
      {!value ? <span style={{ color: '#d1d5db' }}>—</span>
        : href ? <a href={href} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>{value}</a>
        : value}
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
          {fld('Email', 'email', true)}
          {fld('Office Phone', 'phone_office')}
          {fld('Cell Phone', 'phone_cell')}
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
// A picker for fields with a known set of values. Any value already on the record is kept as
// an option so existing data isn't silently dropped.
function EditSelect({ k, value, options, onSave }: { k: string; value: string; options: string[]; onSave: (v: string) => void }) {
  const all = [...new Set([...options, value].filter(Boolean))]
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{k}</div>
      <select
        value={value}
        onChange={e => onSave(e.target.value)}
        style={{ width: '100%', marginTop: 3, padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0',
                 fontSize: 15, color: value ? '#1a2233' : '#9ca3af', fontWeight: 500, fontFamily: 'inherit',
                 background: '#f8fafc', cursor: 'pointer' }}
      >
        <option value="">—</option>
        {all.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
function EditField({ k, value, onSave, full }: { k: string; value: string; onSave: (v: string) => void; full?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{k}</div>
      <input
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft) }}
        // Enter commits and Escape reverts. Blur-only saving reads as a dead field: you
        // type, press Enter, nothing visibly happens, and the edit looks lost.
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
        }}
        placeholder="Add…"
        // A visible border matters: with a transparent one an empty field is
        // indistinguishable from the read-only values sitting next to it.
        style={{ width: '100%', marginTop: 3, padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0',
                 fontSize: 15, color: '#1a2233', fontWeight: 500, fontFamily: 'inherit', background: '#f8fafc' }}
        onFocus={e => { e.currentTarget.style.borderColor = '#0f766e'; e.currentTarget.style.background = '#fff' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }}
      />
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
