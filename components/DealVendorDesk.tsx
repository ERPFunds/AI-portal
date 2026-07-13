'use client'

import React, { useState } from 'react'

// UI MOCKUP — Deal Vendor Desk (part of the Deal Execution section, Acquisition EA WF10).
// Per-deal coordination of the vendors executing diligence/closing — contractors, environmental,
// appraisal, survey, title, inspection. Tracks each thread's status, bids and invoices, chases COIs,
// and drafts the outbound nudge. Sample data; drafts are for review, never auto-sent.

type VType = 'Contractor' | 'Environmental' | 'Appraisal' | 'Survey' | 'Title/Escrow' | 'Inspection'
type Status = 'Bid pending' | 'Awaiting reply' | 'Overdue follow-up' | 'COI missing' | 'Invoice pending' | 'Scheduled' | 'Complete'

type Row = {
  id: string; vendor: string; type: VType; deal: string; contact: string; status: Status;
  detail: string; draft: string; amount?: number; due?: string; lastTouch: string
}

const ROWS: Row[] = [
  { id: 'd1', vendor: 'Tall City Contractors', type: 'Contractor', deal: '3001 S CR 1255', contact: 'J. Dyer', status: 'Bid pending', detail: 'Barn remodel scope — revised bid requested, not yet returned.', draft: 'Hi Jordan — following up on the revised bid for the CR 1255 barn remodel. Can you get us the updated scope + number by Friday so we can fold it into diligence costs?', amount: 185000, due: '2026-07-18', lastTouch: '2026-07-09' },
  { id: 'd2', vendor: 'Tetra Tech', type: 'Environmental', deal: '12700 Highway 191', contact: 'J. Wimberley', status: 'Overdue follow-up', detail: 'Phase I ESA — report outstanding 9 days past expected delivery.', draft: 'Hi Jake — the Phase I ESA for 12700 Hwy 191 was expected last week and DD expires 8/5. Can you confirm the delivery date? Flagging as time-sensitive.', due: '2026-07-04', lastTouch: '2026-06-30' },
  { id: 'd3', vendor: 'Colliers (Valuation)', type: 'Appraisal', deal: '9105 I-20', contact: 'J. Georgiades', status: 'Awaiting reply', detail: 'Appraisal engagement signed — awaiting confirmed delivery date.', draft: 'Hi Jake — we returned the signed engagement for the 9105 I-20 appraisal. Can you confirm the expected delivery date so we can align it with the financing timeline?', lastTouch: '2026-07-08' },
  { id: 'd4', vendor: 'Maverick Engineering', type: 'Survey', deal: '12700 Highway 191', contact: 'G. Shoults', status: 'COI missing', detail: 'Survey / re-plat underway — no current certificate of insurance on file.', draft: 'Hi Grant — before we proceed on the 12700 survey/re-plat we need a current COI naming ERP Industrials as certificate holder. Could you send that over?', lastTouch: '2026-07-05' },
  { id: 'd5', vendor: 'WT Abstract', type: 'Title/Escrow', deal: '3001 S CR 1255', contact: 'M. Ruckman', status: 'Invoice pending', detail: 'Title/escrow invoice received — confirm against the correct entity before payment.', draft: 'Hi Melissa — received the title invoice on CR 1255 (file #48802633101). Confirming it should bill to ERP Industrials 1255, LLC — good to release payment?', amount: 6400, due: '2026-07-16', lastTouch: '2026-07-10' },
  { id: 'd6', vendor: 'Permian Inspection Co.', type: 'Inspection', deal: '9105 I-20', contact: 'Scheduling', status: 'Scheduled', detail: 'Roof / HVAC inspection scheduled Jul 16 — no action needed.', draft: '', due: '2026-07-16', lastTouch: '2026-07-11' },
]

const STATUS_STYLE: Record<Status, { color: string; bg: string; border: string }> = {
  'Bid pending':      { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  'Awaiting reply':   { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  'Overdue follow-up':{ color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'COI missing':      { color: '#9f1239', bg: '#fff1f2', border: '#fecdd3' },
  'Invoice pending':  { color: '#0e7490', bg: '#f0f9fa', border: '#a5f3fc' },
  'Scheduled':        { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  'Complete':         { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
}
const TYPE_ICON: Record<VType, string> = { 'Contractor': '🔨', 'Environmental': '🌱', 'Appraisal': '📐', 'Survey': '🗺️', 'Title/Escrow': '📜', 'Inspection': '🔎' }
const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`

export default function DealVendorDesk() {
  const deals = ['All', ...Array.from(new Set(ROWS.map(r => r.deal)))]
  const [deal, setDeal] = useState('All')
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = ROWS.filter(r => deal === 'All' || r.deal === deal)
  const openThreads = ROWS.filter(r => !['Scheduled', 'Complete'].includes(r.status)).length
  const overdue = ROWS.filter(r => r.status === 'Overdue follow-up').length
  const coi = ROWS.filter(r => r.status === 'COI missing').length
  const bids = ROWS.filter(r => r.status === 'Bid pending').length
  const invoices = ROWS.filter(r => r.status === 'Invoice pending').length

  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
    border: active ? '1px solid #0D2D52' : '1px solid #e5e7eb', background: active ? '#0D2D52' : '#fff', color: active ? '#fff' : '#6b7280',
  })
  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#0D2D52', marginTop: 3 }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — Deal Vendor Communication &amp; Follow-Up (Acquisition EA WF10). Sample data; drafts prepared for review, never auto-sent. Feeds the checklist&apos;s diligence &amp; cost items.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Open threads', String(openThreads))}
        {kpi('Overdue', String(overdue), overdue ? '#b91c1c' : undefined)}
        {kpi('COIs missing', String(coi), coi ? '#9f1239' : undefined)}
        {kpi('Bids pending', String(bids), bids ? '#1d4ed8' : undefined)}
        {kpi('Invoices', String(invoices), invoices ? '#0e7490' : undefined)}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Deal</span>
        {deals.map(d => <button key={d} style={pill(deal === d)} onClick={() => setDeal(d)}>{d}</button>)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(r => {
          const ss = STATUS_STYLE[r.status]
          const isOpen = openId === r.id
          return (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{TYPE_ICON[r.type]} {r.vendor}</span>
                    <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 5, padding: '1px 7px' }}>{r.type}</span>
                    <span style={{ fontSize: 10, color: '#0e7490', background: '#f0f9fa', border: '1px solid #a5f3fc', borderRadius: 5, padding: '1px 7px' }}>{r.deal}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: 6, padding: '1px 8px' }}>{r.status}</span>
                    {r.amount != null && <span style={{ fontSize: 12, fontWeight: 600, color: '#0D2D52' }}>{usd(r.amount)}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{r.detail}</div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                    <span>👤 {r.contact}
                      <span title="Vendor captured to Salesforce via Contact Auto-Capture" style={{ marginLeft: 6, fontSize: 9, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 5, padding: '1px 6px' }}>→ SF</span>
                    </span>
                    {r.due && <span>📅 {r.due}</span>}
                    <span>last touch {r.lastTouch}</span>
                  </div>
                </div>
                {r.draft && (
                  <button onClick={() => setOpenId(isOpen ? null : r.id)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0D2D52', background: isOpen ? '#0D2D52' : '#fff', color: isOpen ? '#fff' : '#0D2D52' }}>
                    {isOpen ? 'Hide draft' : '✦ Draft'}
                  </button>
                )}
              </div>
              {isOpen && r.draft && (
                <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Drafted follow-up</div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.draft}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: 'none', background: '#0D2D52', color: '#fff' }}>Send for review</button>
                    <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>Edit</button>
                    <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#9ca3af' }}>Snooze</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Deal vendors only — the counterparties executing diligence and closing. Drafts are prepared for a human to review and send, never auto-sent; vendor contacts are captured via Contact Auto-Capture. Bids and invoices flow to the checklist&apos;s cost items. Corporate/admin vendors live in the Finance &amp; Admin → Admin Vendors desk.
      </div>
    </div>
  )
}
