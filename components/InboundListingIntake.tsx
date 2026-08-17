'use client'

import React, { useState, useEffect } from 'react'
import { BUY_BOXES, type Fit, type Source, type ReferralKind } from '../lib/data/inboundListings'

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
}

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
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
  const [marketScanning, setMarketScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)

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

  const scanMarket = async () => {
    setMarketScanning(true); setScanMsg(null)
    try {
      const r = await fetch('/api/inbound-listings/market-scan', { method: 'POST' })
      const d = await r.json()
      if (r.ok) {
        const per = (d.perSource ?? []) as { source: string; inserted?: number; error?: string; skipped?: string }[]
        const ins = per.reduce((s, x) => s + (x.inserted ?? 0), 0)
        const notes = per.map(x => `${x.source}: ${x.inserted ?? 0} new${x.error ? ' (error)' : x.skipped ? ' (not configured)' : ''}`).join(' · ')
        setScanMsg(`Market scan complete — ${ins} new. ${notes}`); await load()
      } else setScanMsg(d.error || 'Market scan failed')
    } catch { setScanMsg('Market scan failed') } finally { setMarketScanning(false) }
  }

  const dismiss = async (id: string) => {
    setRows(rs => rs.filter(r => r.id !== id))
    try { await fetch('/api/inbound-listings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }) } catch { /* ignore */ }
  }

  const addToPipeline = async (id: string) => {
    setAdding(id)
    try {
      const r = await fetch('/api/inbound-listings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const d = await r.json()
      if (r.ok) {
        setRows(rs => rs.map(x => x.id === id ? { ...x, status: 'imported' } : x))
        setScanMsg(d.duplicate ? `"${d.deal_name}" is already in the Deal Pipeline.` : `Added "${d.deal_name}" to the Deal Pipeline.`)
      } else setScanMsg(d.error || 'Could not add to the Deal Pipeline')
    } catch { setScanMsg('Could not add to the Deal Pipeline') } finally { setAdding(null) }
  }

  // When `locked` is set (a market-specific page), the market is fixed and its toggle is hidden.
  const effMarket: 'All' | 'TX' | 'FL' = locked ?? market
  const base = rows.filter(r => effMarket === 'All' || r.state === effMarket)
  const visible = base.filter(r => fitFilter === 'All' || r.fit === fitFilter)

  // Rank by Buy-Box fit: fit → borderline → no-fit, then by quick-score, then most-recent.
  // Duplicates sink to the bottom.
  const FIT_RANK: Record<string, number> = { fit: 0, borderline: 1, 'no-fit': 2 }
  const ranked = [...visible].sort((a, b) => {
    const du = (a.status === 'duplicate' ? 1 : 0) - (b.status === 'duplicate' ? 1 : 0)
    if (du) return du
    const fr = (FIT_RANK[a.fit ?? ''] ?? 3) - (FIT_RANK[b.fit ?? ''] ?? 3)
    if (fr) return fr
    const sc = (b.score ?? 0) - (a.score ?? 0)
    if (sc) return sc
    return String(b.received_at ?? '').localeCompare(String(a.received_at ?? ''))
  })

  const fitCount = base.filter(r => r.fit === 'fit' && r.status !== 'duplicate').length
  const borderlineCount = base.filter(r => r.fit === 'borderline').length
  const noFitCount = base.filter(r => r.fit === 'no-fit').length
  const avgYield = (() => {
    const q = base.filter(r => r.fit !== 'no-fit' && r.in_place_noi && r.asking_price)
    if (!q.length) return null
    return q.reduce((s, r) => s + (r.in_place_noi! / r.asking_price!) * 100, 0) / q.length
  })()

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
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, maxWidth: 640, lineHeight: 1.5 }}>
            Pulled from Meghan, Brennan &amp; William&apos;s inboxes — listings that brokers or others forwarded them, deduped and screened against the {locked === 'TX' ? 'Texas' : locked === 'FL' ? 'Florida' : ''} Buy Box. A triage gate — not the analytical score.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={scan} disabled={scanning} title="Scan Meghan / Brennan / William's inboxes for newly forwarded listings"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#0D2D52', color: '#fff', cursor: scanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: scanning ? .6 : 1 }}>
            {scanning ? 'Scanning inboxes…' : '✉️ Scan inboxes'}
          </button>
          <button onClick={scanMarket} disabled={marketScanning} title="Scrape LoopNet + Crexi for on-market for-sale industrial matching the Buy Box"
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: marketScanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: marketScanning ? .6 : 1 }}>
            {marketScanning ? 'Scanning market…' : '🔎 Scan market'}
          </button>
        </div>
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
        {kpi('No-fit', String(noFitCount), '#b91c1c')}
        {kpi('Avg going-in yield', avgYield == null ? '—' : `${avgYield.toFixed(1)}%`, '#0e7490')}
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
          {(['All', 'fit', 'borderline', 'no-fit'] as const).map(f => <button key={f} style={pill(fitFilter === f)} onClick={() => setFitFilter(f)}>{f === 'All' ? 'All' : FIT_STYLE[f].label}</button>)}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {ranked.map((l, i) => {
          const dup = l.status === 'duplicate'
          const yieldPct = l.cap_pct ?? (l.in_place_noi && l.asking_price ? (l.in_place_noi / l.asking_price) * 100 : null)
          const psf = l.asking_price && l.sf ? l.asking_price / l.sf : null
          const fs = fitStyle(l.fit)
          return (
            <div key={l.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, opacity: dup ? 0.7 : 1, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {!dup && <span title="Buy-Box rank" style={{ fontSize: 10, fontWeight: 800, color: '#0D2D52', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 5, padding: '1px 6px' }}>#{i + 1}</span>}
                  {l.channel && <span style={{ fontSize: 10, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '1px 7px', color: '#374151' }}>{icon(SOURCE_ICON, l.channel, '✉️')} {l.channel}</span>}
                  {l.referral_kind && <span style={{ fontSize: 10, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 5, padding: '1px 7px', color: '#6d28d9' }} title={`Forwarded to ERP by ${l.referred_by ?? 'unknown'}`}>{icon(REFERRAL_ICON, l.referral_kind, '📨')} {l.referral_kind}</span>}
                  {l.state && <span style={{ fontSize: 10, background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 5, padding: '1px 7px', color: '#0e7490' }}>{l.state}</span>}
                </div>
                {dup
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '2px 8px' }}>Duplicate</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, color: fs.color, background: fs.bg, border: `1px solid ${fs.border}`, borderRadius: 6, padding: '2px 9px' }}>{fs.label}</span>}
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 8 }}>{l.address || l.raw_subject || 'Listing'}</div>
              {l.submarket && <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.submarket}</div>}
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>
                {l.origin === 'discovered'
                  ? <>🔎 Discovered on <span style={{ fontWeight: 600, color: '#374151' }}>{l.referral_kind ?? 'platform'}</span>{l.listing_url && <> · <a href={l.listing_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>View ↗</a></>}</>
                  : <>📨 Source: forwarded by <span style={{ fontWeight: 600, color: '#374151' }}>{l.referred_by ?? 'unknown'}</span></>}
              </div>
              {l.preview && (
                <div title={l.preview} style={{ fontSize: 11, color: '#6b7280', marginTop: 6, fontStyle: 'italic', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', borderLeft: '2px solid #e5e7eb', paddingLeft: 8 }}>
                  &ldquo;{l.preview}&rdquo;
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 10 }}>
                <Metric label="Asking" value={l.asking_price != null ? usd(l.asking_price) : '—'} />
                <Metric label="Cap (in-place)" value={yieldPct != null ? `${yieldPct.toFixed(1)}%` : '—'} />
                <Metric label="SF" value={l.sf != null ? l.sf.toLocaleString('en-US') : '—'} />
                <Metric label="$/SF" value={psf != null ? `$${Math.round(psf)}` : '—'} />
              </div>

              {/* Quick-score */}
              {!dup && l.score != null && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9ca3af', marginBottom: 3 }}>
                    <span>Quick-score</span><span style={{ fontWeight: 700, color: fs.color }}>{l.score}/100</span>
                  </div>
                  <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${l.score}%`, height: '100%', background: fs.color }} />
                  </div>
                </div>
              )}

              {/* Fit reason */}
              {l.reason && (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10, lineHeight: 1.5, background: dup ? '#f9fafb' : fs.bg, border: `1px solid ${dup ? '#e5e7eb' : fs.border}`, borderRadius: 8, padding: '7px 10px' }}>
                  {dup ? '🔁 Same property already captured from another inbox.' : <><span style={{ fontWeight: 700, color: fs.color }}>Why this score: </span>{l.reason}</>}
                </div>
              )}

              {/* Broker + actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#374151' }}>
                  {l.broker || l.broker_firm ? `👤 ${[l.broker, l.broker_firm].filter(Boolean).join(' · ')}` : <span style={{ color: '#9ca3af' }}>Broker not identified</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {l.status === 'imported'
                    ? <span style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '4px 9px' }}>✓ In Deal Pipeline</span>
                    : (!dup && l.fit === 'fit' && <button onClick={() => addToPipeline(l.id)} disabled={adding === l.id} style={btn('#fff', '#16a34a')}>{adding === l.id ? 'Adding…' : '➕ Add to Deal Pipeline'}</button>)}
                  <button onClick={() => dismiss(l.id)} style={btn('#9ca3af')}>Dismiss</button>
                </div>
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
