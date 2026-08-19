'use client'

import React, { useState, useEffect } from 'react'
import { BUY_BOXES, type Fit, type Source, type ReferralKind } from '../lib/data/inboundListings'
import { downloadXlsx, shapeRows } from '../lib/exportXlsx'

// Inbound Listing Intake — live. Pulls forwarded property listings out of the acquisition principals'
// mailboxes (Meghan / Brennan / William) via the inbound-listings scan, screens each against the
// market Buy Box, and shows them as triage cards. A triage gate — deep scoring + full underwriting
// stay with the Acquisition Research agent.

// Live row shape (from /api/inbound-listings; a subset of the inbound_listings table).
type Row = {
  id: string
  source_mailbox: string
  received_at: string | null
  referred_by: string | null
  referral_kind: string | null
  channel: string | null
  address: string | null
  submarket: string | null
  state: string | null
  asking_price: number | null
  sf: number | null
  in_place_noi: number | null
  cap_pct: number | null
  broker: string | null
  broker_firm: string | null
  fit: string | null
  score: number | null
  reason: string | null
  status: string
  raw_subject: string | null
  preview: string | null
  origin: string | null
  listing_url: string | null
  source_url: string | null
  attachments: string[] | null
}

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
// Deal Pipeline categories (unified FL scheme) — Meghan picks one when moving a listing to the board.
const PIPE_CATEGORIES = ['Under Review', 'Prospects', 'Comparables']

// Everything the scans pull from, surfaced at the top so it's clear what's being watched.
const SOURCE_GROUPS: { label: string; items: string[] }[] = [
  { label: 'Market platforms', items: ['LoopNet', 'Crexi', 'LinkedIn'] },
  { label: 'Broker sites · Permian', items: ['NRG Realty', 'Kirk Strahan', 'Moriah', 'The Real Estate Ranch', 'VIP Realty', 'thisRealty', 'Sondra Gomez', 'Iron Wolf'] },
  { label: 'Broker sites · Space Coast', items: ['Team LBR', 'Ullian', 'Jack Jeffcoat', 'Space Coast CRE', 'MaxLife', 'JM Real Estate', 'ITG Realty', 'Scott Langston', 'Perrone'] },
  { label: 'Broker sites · National', items: ['Marcus & Millichap'] },
]
const SRC_CHIP: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px', color: '#475569', whiteSpace: 'nowrap' }
// Whose inbox a forwarded broker email landed in.
const MAILBOX_NAMES: Record<string, string> = {
  'mberry@erpfunds.com': 'Meghan', 'bberry@erpfunds.com': 'Brennan', 'wmeyer@erpfunds.com': 'William',
  'mparad@erpfunds.com': 'Michele', 'hpowell@erpfunds.com': 'Hannah',
}
const inboxName = (m: string | null) => (m && (MAILBOX_NAMES[m.toLowerCase()] || m.split('@')[0])) || null
// Effective fit for the badge/ranking: a score of 70+ is a green "fit", 55+ borderline, else no-fit.
// Derived from score when present so the thresholds apply to every row regardless of when it was captured.
const fitOf = (l: { fit: string | null; score: number | null }): string =>
  l.score != null ? (l.score >= 70 ? 'fit' : l.score >= 55 ? 'borderline' : 'no-fit') : (l.fit ?? 'no-fit')
const FIT_STYLE: Record<Fit, { color: string; bg: string; border: string; label: string }> = {
  'fit':        { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Fit' },
  'borderline': { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'Borderline' },
  'no-fit':     { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'No-fit' },
}
const NEUTRAL_FIT = { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', label: 'Unscored' }
const fitStyle = (f: string | null) => (f && f in FIT_STYLE ? FIT_STYLE[f as Fit] : NEUTRAL_FIT)
const SOURCE_ICON: Record<Source, string> = { 'Crexi': '🟧', 'LoopNet': '🔵', 'Broker email': '✉️', 'OM attachment': '📎' }
const REFERRAL_ICON: Record<ReferralKind, string> = { 'Broker': '🤝', 'Investor/LP': '💼', 'Colleague': '👥', 'Crexi': '🟧', 'LoopNet': '🔵', 'Direct/Cold': '📩' }
const icon = <T extends string>(map: Record<T, string>, k: string | null, fallback: string) => (k && k in map ? map[k as T] : fallback)

export default function InboundListingIntake({ market: locked }: { market?: 'TX' | 'FL' } = {}) {
  const [market, setMarket] = useState<'All' | 'TX' | 'FL'>('All')
  const [fitFilter, setFitFilter] = useState<'All' | Fit>('All')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [marketScanning, setMarketScanning] = useState<false | 'brokers' | 'platforms'>(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const r = await fetch('/api/inbound-listings'); const d = await r.json(); if (r.ok) setRows(d.items ?? []) }
    catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const scan = async () => {
    setScanning(true); setScanMsg(null)
    try {
      const r = await fetch('/api/inbound-listings/scan?days=90', { method: 'POST' })
      const d = await r.json()
      if (r.ok) { setScanMsg(`Scan complete — ${d.inserted ?? 0} new, ${d.duplicates ?? 0} duplicate, ${d.skippedExisting ?? 0} already seen.`); await load() }
      else setScanMsg(d.error || 'Scan failed')
    } catch { setScanMsg('Scan failed') } finally { setScanning(false) }
  }

  const scanMarket = async (source: 'brokers' | 'platforms') => {
    setMarketScanning(source); setScanMsg(null)
    try {
      const r = await fetch(`/api/inbound-listings/market-scan?source=${source}`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        const per = (d.perSource ?? []) as { source: string; inserted?: number; updated?: number; error?: string; skipped?: string }[]
        const ins = per.reduce((s, x) => s + (x.inserted ?? 0), 0)
        const upd = per.reduce((s, x) => s + (x.updated ?? 0), 0)
        const notes = per.map(x => `${x.source}: ${x.inserted ?? 0} new${x.updated ? `, ${x.updated} updated` : ''}${x.error ? ` (error: ${x.error})` : x.skipped ? ` (${x.skipped})` : ''}`).join(' · ')
        setScanMsg(`Market scan complete — ${ins} new, ${upd} refreshed. ${notes}`); await load()
      } else setScanMsg(d.error || 'Market scan failed')
    } catch { setScanMsg('Market scan failed') } finally { setMarketScanning(false) }
  }

  const dismiss = async (id: string) => {
    setRows(rs => rs.filter(r => r.id !== id))
    try { await fetch('/api/inbound-listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }) } catch { /* ignore */ }
  }

  // Export the currently-shown listings (respecting the market view) to a .xlsx workbook.
  const exportExcel = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const cols: [string, string][] = [['received_at', 'Date'], ['state', 'Market'], ['address', 'Address'], ['submarket', 'Submarket'], ['fit', 'Fit'], ['score', 'Score'], ['asking_price', 'Asking Price'], ['sf', 'SF'], ['broker_firm', 'Broker / Firm'], ['broker', 'Broker'], ['referred_by', 'Source'], ['channel', 'Channel'], ['reason', 'Screen Note'], ['listing_url', 'Listing URL'], ['source_mailbox', 'Mailbox']]
      const out = base.map(r => ({ ...r, received_at: r.received_at ? String(r.received_at).slice(0, 10) : '' }))
      await downloadXlsx([{ name: `Inbound ${effMarket}`, rows: shapeRows(out, cols) }], `ERP-Inbound-Listings-${effMarket}-${new Date().toISOString().slice(0, 10)}.xlsx`)
    } finally { setExporting(false) }
  }

  // Move a listing into the Deal Pipeline mirror board under a category Meghan picks (no auto-routing
  // by score). Maps the listing to a TX (status) or FL (section) row, then removes it from inbound.
  const moveToPipeline = async (l: Row, category: string) => {
    if (!category) return
    setAdding(l.id)
    try {
      const psf = l.asking_price && l.sf ? Math.round((l.asking_price / l.sf) * 100) / 100 : null
      const notes = l.reason || ''
      const listingUrl = l.listing_url || null // only a real web link — Outlook message links aren't accessible
      const isFL = l.state === 'FL'
      const data: Record<string, unknown> = isFL
        ? { section: category, name: l.address || l.submarket || 'Listing', status: '', source: l.referred_by || l.channel || '', propertyType: 'Industrial', location: l.submarket || '', yearBuilt: null, units: null, occupancy: null, capRate: l.cap_pct ?? null, sqft: l.sf ?? null, acres: null, price: l.asking_price ?? null, psf, notes, listingUrl }
        : { kind: 'pipeline', status: category, location: l.submarket || '', owner: l.broker_firm || l.broker || '', address: l.address || '', tenant: '', source: l.referred_by || l.channel || '', price: l.asking_price ?? null, pricePsf: psf, yield: null, acreage: null, sqft: l.sf ?? null, yearBuilt: null, nextSteps: '', notes, listingUrl }
      // Auto-generate an AI recommendation for the new deal (best-effort — never block the move on it).
      try {
        const rr = await fetch('/api/deal-pipeline/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal: data, market: isFL ? 'FL' : 'TX' }) })
        const rd = await rr.json().catch(() => ({}))
        if (rr.ok && rd.verdict) data.aiRec = { verdict: rd.verdict, rationale: rd.rationale ?? '', at: new Date().toISOString() }
      } catch { /* recommendation is optional */ }
      const r = await fetch('/api/deal-pipeline/mirror', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: isFL ? 'FL' : 'TX', data }) })
      if (r.ok) {
        await fetch('/api/inbound-listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id, status: 'dismissed' }) })
        setRows(rs => rs.filter(x => x.id !== l.id))
        setScanMsg(`Moved to the ${isFL ? 'Florida' : 'Texas'} pipeline → ${category}.`)
      } else { const d = await r.json().catch(() => ({})); setScanMsg(d.error || 'Could not move to pipeline') }
    } catch { setScanMsg('Could not move to pipeline') } finally { setAdding(null) }
  }

  // When `locked` is set (a market-specific page), the market is fixed and its toggle is hidden.
  const effMarket: 'All' | 'TX' | 'FL' = locked ?? market
  const base = rows.filter(r => effMarket === 'All' || r.state === effMarket)
  const visible = base.filter(r => fitFilter === 'All' || fitOf(r) === fitFilter)

  // Rank by Buy-Box fit: fit → borderline → no-fit, then by quick-score, then most-recent.
  // Duplicates sink to the bottom.
  const FIT_RANK: Record<string, number> = { fit: 0, borderline: 1, 'no-fit': 2 }
  const ranked = [...visible].sort((a, b) => {
    const du = (a.status === 'duplicate' ? 1 : 0) - (b.status === 'duplicate' ? 1 : 0)
    if (du) return du
    const fr = (FIT_RANK[fitOf(a)] ?? 3) - (FIT_RANK[fitOf(b)] ?? 3)
    if (fr) return fr
    const sc = (b.score ?? 0) - (a.score ?? 0)
    if (sc) return sc
    return String(b.received_at ?? '').localeCompare(String(a.received_at ?? ''))
  })

  const fitCount = base.filter(r => fitOf(r) === 'fit' && r.status !== 'duplicate').length
  const borderlineCount = base.filter(r => fitOf(r) === 'borderline').length

  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
    border: active ? '1px solid #0D2D52' : '1px solid #e5e7eb', background: active ? '#0D2D52' : '#fff', color: active ? '#fff' : '#6b7280',
  })
  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#0D2D52', marginTop: 3 }}>{value}</div>
    </div>
  )

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>📥 Inbound Listings — {locked === 'TX' ? 'Texas (Permian)' : locked === 'FL' ? 'Florida (Space Coast)' : 'Prospective Deals'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={scan} disabled={scanning} title="Scan Meghan / Brennan / William's inboxes for newly forwarded listings"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#0D2D52', color: '#fff', cursor: scanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: scanning ? .6 : 1 }}>
            {scanning ? 'Scanning inboxes…' : '✉️ Scan inboxes'}
          </button>
          <button onClick={() => scanMarket('brokers')} disabled={!!marketScanning} title="Scrape broker websites for on-market for-sale industrial matching the Buy Box"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: marketScanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: marketScanning ? .6 : 1 }}>
            {marketScanning === 'brokers' ? 'Scanning brokers…' : '🏢 Scan broker sites'}
          </button>
          <button onClick={() => scanMarket('platforms')} disabled={!!marketScanning} title="Scrape LoopNet / Crexi / LinkedIn for on-market for-sale industrial matching the Buy Box"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: marketScanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: marketScanning ? .6 : 1 }}>
            {marketScanning === 'platforms' ? 'Scanning platforms…' : '🔎 Scan platforms'}
          </button>
          <button onClick={exportExcel} disabled={exporting || !base.length} title="Export the listings shown to an Excel workbook"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: exporting || !base.length ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: exporting || !base.length ? .5 : 1 }}>
            {exporting ? 'Exporting…' : '⬇ Export Excel'}
          </button>
        </div>
      </div>

      {/* Where listings come from — mailboxes are the source of record; the rest are proactively scanned. */}
      <div style={{ border: '1px solid #eef2f7', background: '#fbfcfe', borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 7, fontSize: 11 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontWeight: 700, color: '#0D2D52', minWidth: 150 }}>Source of record</span>
          <span style={SRC_CHIP}>Meghan / Brennan / William inboxes · Microsoft Graph</span>
        </div>
        {SOURCE_GROUPS.map(g => (
          <div key={g.label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: '#64748b', minWidth: 150 }}>{g.label}</span>
            {g.items.map(it => <span key={it} style={SRC_CHIP}>{it}</span>)}
          </div>
        ))}
      </div>

      {scanMsg && (
        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#4338ca' }}>{scanMsg}</div>
      )}

      {/* Buy Box(es) being screened against — market-specific. TX is portfolio-derived; FL illustrative. */}
      <div style={{ marginBottom: 12 }}>
        {(effMarket === 'All' ? (['TX', 'FL'] as const) : [effMarket]).map(mk => {
          const box = BUY_BOXES[mk]
          return (
            <div key={mk} style={{ fontSize: 11, color: '#6b7280', marginBottom: 6, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#0D2D52' }}>🎯 {mk} Buy Box:</span>
              {[box.markets, box.assetClass, box.sf, box.psf, box.yieldTarget, box.dealSize].map(t => (
                <span key={t} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>{t}</span>
              ))}
            </div>
          )
        })}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Listings', String(base.length))}
        {kpi('Fit', String(fitCount), '#16a34a')}
        {kpi('Borderline', String(borderlineCount), '#b45309')}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        {!locked && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Market</span>
            {(['All', 'TX', 'FL'] as const).map(m => <button key={m} style={pill(market === m)} onClick={() => setMarket(m)}>{m}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Fit</span>
          {(['All', 'fit', 'borderline'] as const).map(f => <button key={f} style={pill(fitFilter === f)} onClick={() => setFitFilter(f)}>{f === 'All' ? 'All' : FIT_STYLE[f].label}</button>)}
        </div>
      </div>

      {/* Empty / loading states */}
      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>Loading listings…</div>}
      {!loading && base.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280', background: '#fff', border: '1px dashed #d1d5db', borderRadius: 12 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No inbound listings yet{effMarket !== 'All' ? ` for ${effMarket}` : ''}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Click <strong>Scan inboxes</strong> to pull forwarded listings from Meghan, Brennan &amp; William&apos;s mail.</div>
        </div>
      )}

      {/* Cards */}
      {!loading && base.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranked.map((l, i) => {
          const dup = l.status === 'duplicate'
          const yieldPct = l.cap_pct ?? (l.in_place_noi && l.asking_price ? (l.in_place_noi / l.asking_price) * 100 : null)
          const psf = l.asking_price && l.sf ? l.asking_price / l.sf : null
          const fs = fitStyle(fitOf(l))
          const web = !!l.listing_url || l.channel === 'Crexi' || l.channel === 'LoopNet'
          const metrics = [l.sf != null ? l.sf.toLocaleString('en-US') + ' SF' : null, psf != null ? `$${Math.round(psf)}/SF` : null, yieldPct != null ? `${yieldPct.toFixed(1)}% cap` : null].filter(Boolean).join(' · ')
          return (
            <div key={l.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#fff', border: '1px solid #e5e7eb', borderLeft: `3px solid ${dup ? '#e5e7eb' : fs.color}`, borderRadius: 10, padding: '9px 12px', opacity: dup ? 0.7 : 1 }}>
              {/* rank + score */}
              <div style={{ width: 40, flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
                {dup ? <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>DUP</span>
                  : <><div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af' }}>#{i + 1}</div>{l.score != null && <div style={{ fontSize: 16, fontWeight: 800, color: fs.color, lineHeight: 1.1 }}>{l.score}</div>}</>}
              </div>
              {/* main */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{l.address || (l.raw_subject ? l.raw_subject.replace(/^(re|fw|fwd)\s*:\s*/i, '').split(/\s*\|\s*/)[0].trim() : 'Listing')}</span>
                  {l.state && <span style={{ fontSize: 10, background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 5, padding: '0 6px', color: '#0e7490' }}>{l.state}</span>}
                  <span style={{ fontSize: 10, fontWeight: 700, background: web ? '#eff6ff' : '#f0fdf4', border: `1px solid ${web ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: 5, padding: '0 6px', color: web ? '#1d4ed8' : '#15803d' }}>{web ? '🔗 Web link' : '✉️ Broker email'}</span>
                  {l.referral_kind && <span style={{ fontSize: 10, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '0 6px', color: '#6d28d9' }}>{icon(REFERRAL_ICON, l.referral_kind, '📨')} {l.referral_kind}</span>}
                  {!dup && fitOf(l) !== 'no-fit' && <span style={{ fontSize: 10, fontWeight: 700, color: fs.color }}>{fs.label}</span>}
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {l.submarket && <span>{l.submarket}</span>}
                  <span>{l.origin === 'discovered' ? `🔎 ${l.referral_kind ?? 'platform'}` : `📨 ${l.referred_by ?? 'unknown'}`}</span>
                  {l.origin !== 'discovered' && l.source_mailbox && l.source_mailbox !== 'market-scan' && inboxName(l.source_mailbox) && (
                    <span style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 5, padding: '0 6px', color: '#4338ca', fontWeight: 600 }}>📥 {inboxName(l.source_mailbox)}&apos;s inbox</span>
                  )}
                  {l.received_at && <span title={new Date(l.received_at).toLocaleString()} style={{ color: '#9ca3af' }}>📅 {new Date(l.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                  {l.listing_url && <a href={l.listing_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>Listing ↗</a>}
                  {(l.attachments ?? []).slice(0, 2).map((n, j) => <span key={j} title={n} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '0 6px' }}>📎 {n.length > 18 ? n.slice(0, 16) + '…' : n}</span>)}
                </div>
                {l.reason && !dup && <div title={l.reason} style={{ fontSize: 11, color: '#6b7280', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.reason}</div>}
                {dup && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>🔁 Same property already captured from another inbox.</div>}
              </div>
              {/* metrics */}
              <div style={{ flexShrink: 0, textAlign: 'right', minWidth: 120 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{l.asking_price != null ? usd(l.asking_price) : '—'}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{metrics || '—'}</div>
                {(l.broker || l.broker_firm) && <div title={[l.broker, l.broker_firm].filter(Boolean).join(' · ')} style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }}>👤 {[l.broker, l.broker_firm].filter(Boolean).join(' · ')}</div>}
              </div>
              {/* actions */}
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <select value="" disabled={adding === l.id} onChange={(e) => moveToPipeline(l, e.target.value)} title="Move to the Deal Pipeline — Meghan picks the category"
                  style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 6, border: '1px solid #16a34a', background: '#fff', color: '#16a34a', cursor: adding === l.id ? 'default' : 'pointer' }}>
                  <option value="">{adding === l.id ? 'Moving…' : '→ Pipeline…'}</option>
                  {PIPE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => dismiss(l.id)} style={btn('#9ca3af')}>Dismiss</button>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Footer caveats */}
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Read-only mailbox sweep — nothing is moved, replied to, or modified. Fields are extracted from the forwarded email, so figures are only as complete as the broker supplied. The buy-box tag is a lightweight triage flag, not the analytical score; deep multi-factor scoring and full underwriting stay with the Acquisition Research agent. Fit listings become prospective-deal candidates, distinct from the active Deal Pipeline.
      </div>
    </div>
  )
}

function Metric({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.3px' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{value}{sub ? <span style={{ fontSize: 10, fontWeight: 500, color: subColor || '#9ca3af', marginLeft: 5 }}>{sub}</span> : null}</div>
    </div>
  )
}

function btn(color: string, bg = '#fff'): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', color, background: bg, border: `1px solid ${bg === '#fff' ? '#d1d5db' : bg}` }
}
