'use client'

import React, { useState } from 'react'
import { INBOUND_LISTINGS as LISTINGS, BUY_BOX as BOX, type Fit, type Source } from '../lib/data/inboundListings'

// UI MOCKUP — Acquisition EA Workflow #9: Inbound Listing Intake, Screen & Quick-Score.
// Demonstrates the flow with sample data (not wired to a live inbox). Captures broker-supplied
// listing data (email + OM/flyer or Crexi/LoopNet links), dedupes, screens against the Buy Box,
// tags fit/borderline/no-fit with a reason, and adds a first-pass quick-score. Triage gate only —
// deep scoring + full underwriting stay with the Acquisition Research agent. Listing data + the
// listing→deal mapping live in lib/data/inboundListings.ts (shared with the Deal Pipeline
// live tracker and the /api/deal-pipeline/import-listings auto-add mechanism).

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const FIT_STYLE: Record<Fit, { color: string; bg: string; border: string; label: string }> = {
  'fit':        { color: '#16a34a', bg: '#f0fdf4', border: '#86efac', label: 'Fit' },
  'borderline': { color: '#b45309', bg: '#fffbeb', border: '#fde68a', label: 'Borderline' },
  'no-fit':     { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca', label: 'No-fit' },
}
const SOURCE_ICON: Record<Source, string> = { 'Crexi': '🟧', 'LoopNet': '🔵', 'Broker email': '✉️', 'OM attachment': '📎' }

export default function InboundListingIntake() {
  const [market, setMarket] = useState<'All' | 'TX' | 'FL'>('All')
  const [fitFilter, setFitFilter] = useState<'All' | Fit>('All')

  const visible = LISTINGS.filter(l =>
    (market === 'All' || l.state === market) &&
    (fitFilter === 'All' || l.fit === fitFilter))

  const fitCount = LISTINGS.filter(l => l.fit === 'fit' && !l.deduped).length
  const borderlineCount = LISTINGS.filter(l => l.fit === 'borderline').length
  const noFitCount = LISTINGS.filter(l => l.fit === 'no-fit').length
  const avgYield = (() => {
    const q = LISTINGS.filter(l => l.fit !== 'no-fit')
    if (!q.length) return 0
    return q.reduce((s, l) => s + (l.inPlaceNoi / l.askingPrice) * 100, 0) / q.length
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
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>📥 Inbound Listings — Prospective Deals</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, maxWidth: 640, lineHeight: 1.5 }}>
            Auto-captured from broker emails and Crexi / LoopNet links or OM attachments, filtered to TX &amp; FL, deduped, and screened against the Buy Box. A triage gate — not the analytical score.
          </div>
        </div>
      </div>

      {/* Mockup marker */}
      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — Acquisition EA Workflow #9. Sample data; not yet wired to the live inbox. Captures broker-supplied data only (no Crexi/LoopNet scraping).</span>
      </div>

      {/* Buy Box being screened against */}
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 600, color: '#0D2D52' }}>🎯 Screening vs Buy Box:</span>
        {[BOX.markets, BOX.assetClass, BOX.sf, BOX.psf, `cap ≥ ${BOX.capFloor}`, BOX.dealSize].map(t => (
          <span key={t} style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 8px' }}>{t}</span>
        ))}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('New · 7d', String(LISTINGS.length))}
        {kpi('Fit', String(fitCount), '#16a34a')}
        {kpi('Borderline', String(borderlineCount), '#b45309')}
        {kpi('No-fit', String(noFitCount), '#b91c1c')}
        {kpi('Avg going-in yield', `${avgYield.toFixed(1)}%`, '#0e7490')}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Market</span>
          {(['All', 'TX', 'FL'] as const).map(m => <button key={m} style={pill(market === m)} onClick={() => setMarket(m)}>{m}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Fit</span>
          {(['All', 'fit', 'borderline', 'no-fit'] as const).map(f => <button key={f} style={pill(fitFilter === f)} onClick={() => setFitFilter(f)}>{f === 'All' ? 'All' : FIT_STYLE[f].label}</button>)}
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {visible.map(l => {
          const yieldPct = (l.inPlaceNoi / l.askingPrice) * 100
          const psf = l.askingPrice / l.sf
          const vsComp = Math.round(((psf - l.compPsf) / l.compPsf) * 100)
          const fs = FIT_STYLE[l.fit]
          return (
            <div key={l.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, opacity: l.deduped ? 0.7 : 1, position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '1px 7px', color: '#374151' }}>{SOURCE_ICON[l.source]} {l.source}</span>
                  <span style={{ fontSize: 10, background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 5, padding: '1px 7px', color: '#0e7490' }}>{l.state}</span>
                </div>
                {l.deduped
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, padding: '2px 8px' }}>Deduped</span>
                  : <span style={{ fontSize: 11, fontWeight: 700, color: fs.color, background: fs.bg, border: `1px solid ${fs.border}`, borderRadius: 6, padding: '2px 9px' }}>{fs.label}</span>}
              </div>

              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 8 }}>{l.address}</div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{l.submarket}</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 10 }}>
                <Metric label="Asking" value={usd(l.askingPrice)} />
                <Metric label="Cap (in-place)" value={`${yieldPct.toFixed(1)}%`} />
                <Metric label="SF" value={l.sf.toLocaleString('en-US')} />
                <Metric label="$/SF" value={`$${Math.round(psf)}`} sub={`${vsComp >= 0 ? '+' : ''}${vsComp}% vs comps`} subColor={vsComp <= 0 ? '#16a34a' : '#b45309'} />
              </div>

              {/* Quick-score */}
              {!l.deduped && (
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
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10, lineHeight: 1.5, background: l.deduped ? '#f9fafb' : fs.bg, border: `1px solid ${l.deduped ? '#e5e7eb' : fs.border}`, borderRadius: 8, padding: '7px 10px' }}>
                {l.deduped ? `🔁 ${l.deduped}` : l.reason}
              </div>

              {/* Broker + actions */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 11, color: '#374151' }}>
                  👤 {l.broker} · {l.brokerFirm}
                  <span title="Broker captured to Salesforce via Contact Auto-Capture" style={{ marginLeft: 6, fontSize: 9, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, padding: '1px 6px' }}>→ SF</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!l.deduped && l.fit !== 'no-fit' && <button style={btn('#0D2D52', '#fff')}>→ Auto-Scoring</button>}
                  <button style={btn('#374151')}>Source ↗</button>
                  {!l.deduped && <button style={btn('#9ca3af')}>Dismiss</button>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer caveats */}
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Buy-box tag is a lightweight fit flag off broker-supplied data only — a triage gate, not the analytical score. Deep multi-factor scoring and top-10 ranking stay with the Acquisition Research agent&apos;s Property Auto-Scoring workflow (which this feeds). Full underwriting — levered model, IRR, sensitivities — stays with Acquisition Research, not this EA agent. Fit listings become prospective-deal candidates, distinct from the active Deal Pipeline.
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
