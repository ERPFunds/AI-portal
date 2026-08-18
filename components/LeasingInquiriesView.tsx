'use client'

import React, { useState, useEffect } from 'react'

// Inbound Leasing Inquiries — the demand side. Prospective tenants (or their brokers) asking to
// lease ERP space (storage yard, warehouse, flex, IOS), auto-captured from the mailboxes, extracted,
// and matched to available (vacant) ERP properties so they tie back to the Properties tab.
// Data + scan: /api/leasing-inquiries (+ /scan). Live rows; empty until the first scan runs.

type Inquiry = {
  id: string
  source_mailbox: string | null
  received_at: string | null
  contact_name: string | null
  contact_company: string | null
  contact_email: string | null
  contact_phone: string | null
  inquiry_type: string | null
  sf_needed: number | null
  acreage_needed: number | null
  needs_yard: boolean | null
  needs_crane: boolean | null
  office_needed: boolean | null
  market: string | null
  submarket: string | null
  budget_psf: number | null
  timeline: string | null
  summary: string | null
  status: string
  matched_address: string | null
  match_note: string | null
  raw_subject: string | null
}

const TYPE_ICON: Record<string, string> = { 'Storage yard': '🪵', 'Warehouse': '🏭', 'Flex/office': '🏢', 'IOS': '🚚', 'Other': '📦' }

export default function LeasingInquiriesView() {
  const [rows, setRows] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [marketFilter, setMarketFilter] = useState<'All' | 'Permian' | 'Space Coast'>('All')

  async function load() {
    setLoading(true)
    try { const r = await fetch('/api/leasing-inquiries'); const d = await r.json(); if (r.ok) setRows(d.items ?? []) }
    catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function scan() {
    setScanning(true); setMsg(null)
    try {
      const r = await fetch('/api/leasing-inquiries/scan', { method: 'POST' })
      const d = await r.json()
      if (r.ok) { setMsg(`Scan complete — ${d.inserted ?? 0} new inquir${(d.inserted ?? 0) === 1 ? 'y' : 'ies'}, ${d.matched ?? 0} matched to a property.`); await load() }
      else setMsg(d.error || 'Scan failed')
    } catch { setMsg('Scan failed') } finally { setScanning(false) }
  }

  async function dismiss(id: string) {
    await fetch('/api/leasing-inquiries', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'dismissed' }) })
    setRows(rs => rs.filter(r => r.id !== id))
  }

  const visible = rows.filter(r => marketFilter === 'All' || r.market === marketFilter)
  const num = (n: number | null) => (n ? n.toLocaleString('en-US') : null)

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
  const badge = (t: string) => <span key={t} style={{ fontSize: 10, fontWeight: 600, background: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: 5, padding: '1px 7px' }}>{t}</span>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>📥 Inbound Leasing Inquiries</h2>
          <p>Prospective tenants & their brokers asking to lease ERP space — captured from the inboxes, screened, and matched to available properties · <span style={{ color: '#16a34a' }}>live</span></p>
        </div>
        <button onClick={scan} disabled={scanning} title="Scan Meghan / Brennan / William's inboxes for inbound leasing inquiries"
          style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 8, border: '1px solid #0D2D52', background: '#0D2D52', color: '#fff', cursor: scanning ? 'default' : 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', opacity: scanning ? .6 : 1 }}>
          {scanning ? 'Scanning inboxes…' : '✉️ Scan inboxes'}
        </button>
      </div>

      {msg && <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#0c4a6e' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Open inquiries', String(rows.length))}
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Market</span>
        {(['All', 'Permian', 'Space Coast'] as const).map(m => <button key={m} style={pill(marketFilter === m)} onClick={() => setMarketFilter(m)}>{m}</button>)}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading…</div>}
      {!loading && visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', border: '1px dashed #e5e7eb', borderRadius: 12 }}>
          No leasing inquiries yet. Click <strong>✉️ Scan inboxes</strong> to sweep the last 90 days.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {visible.map(r => (
          <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 5, padding: '1px 7px', color: '#374151' }}>{TYPE_ICON[r.inquiry_type ?? 'Other'] ?? '📦'} {r.inquiry_type ?? 'Inquiry'}</span>
                {r.market && <span style={{ fontSize: 10, background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 5, padding: '1px 7px', color: '#0e7490' }}>{r.market}</span>}
              </div>
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 8 }}>{r.contact_name || r.contact_email || 'Unknown contact'}</div>
            <div style={{ fontSize: 11, color: '#9ca3af' }}>{[r.contact_company, r.contact_email].filter(Boolean).join(' · ')}</div>

            {r.summary && <div style={{ fontSize: 12, color: '#374151', marginTop: 8, lineHeight: 1.5 }}>{r.summary}</div>}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {num(r.sf_needed) && badge(`${num(r.sf_needed)} SF`)}
              {r.acreage_needed && badge(`${r.acreage_needed} ac`)}
              {r.needs_yard && badge('Yard')}
              {r.needs_crane && badge('Crane')}
              {r.office_needed && badge('Office')}
              {r.budget_psf && badge(`$${r.budget_psf}/SF`)}
              {r.timeline && badge(r.timeline)}
            </div>

            <div style={{ fontSize: 11, marginTop: 10, background: r.matched_address ? '#f0fdf4' : '#f9fafb', border: `1px solid ${r.matched_address ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 8, padding: '7px 10px', color: '#374151', lineHeight: 1.5 }}>
              {r.matched_address
                ? <>🏢 <strong>Suggested match:</strong> {r.matched_address} <span style={{ color: '#6b7280' }}>(available in Properties){r.match_note ? ` — ${r.match_note}` : ''}</span></>
                : <span style={{ color: '#9ca3af' }}>No available ERP property matched — worth a manual look.</span>}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 8 }}>
              <div style={{ fontSize: 11, color: '#9ca3af' }} title={r.raw_subject ?? ''}>
                {r.received_at ? new Date(r.received_at).toLocaleDateString() : ''} · via {r.source_mailbox?.split('@')[0] ?? 'inbox'}
              </div>
              <button onClick={() => dismiss(r.id)} style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', color: '#9ca3af', background: '#fff', border: '1px solid #e5e7eb' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Auto-captured from the acquisition inboxes and screened as leasing demand (not for-sale listings). Suggested matches are ERP properties currently marked vacant in the Properties tab, ranked by size and yard fit — a starting point, not a commitment.
      </div>
    </div>
  )
}
