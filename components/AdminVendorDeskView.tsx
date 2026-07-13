'use client'

import React, { useState } from 'react'

// UI MOCKUP — Admin Vendor Desk (Finance & Admin). Corporate/admin vendor communication —
// insurance, banking, benefits — the same vendor-comms pattern as the deal-vendor coordinator, but
// scoped to admin vendors. Tracks each vendor thread's status, drafts the outbound (renewal request,
// COI chase, invoice confirmation, follow-up nudge), and surfaces what's awaiting action. Sample
// data; drafts are for review, never auto-sent.

type Category = 'Insurance' | 'Banking' | 'Benefits' | 'Payroll/HR' | 'Other'
type Status = 'Awaiting reply' | 'Renewal due' | 'COI missing' | 'Invoice pending' | 'Current'

type Vendor = {
  id: string
  vendor: string
  category: Category
  contact: string
  status: Status
  detail: string
  draft: string          // the drafted outbound nudge/request
  amount?: number
  due?: string
  lastTouch: string
}

const VENDORS: Vendor[] = [
  { id: 'v1', vendor: 'Lockton', category: 'Insurance', contact: 'T. Power', status: 'Renewal due', detail: 'E&O + Crime/EPL package renews Aug 15 — needs updated renewal quote & COI.', draft: 'Hi Tyler — our E&O/Crime/EPL package renews 8/15. Can you send the renewal quote and an updated COI for ERP Industrials by 8/1 so we can review ahead of binding?', due: '2026-08-15', lastTouch: '2026-07-02' },
  { id: 'v2', vendor: 'Prosperity Bank', category: 'Banking', contact: 'S. Garcia', status: 'Awaiting reply', detail: 'Operating account for ERP Industrials PB, LLC — signature card outstanding.', draft: 'Hi Shae — following up on the new operating account for ERP Industrials PB, LLC. We returned the resolution; could you confirm what’s still needed on the signature card so we can fund this week?', lastTouch: '2026-07-08' },
  { id: 'v3', vendor: 'Blue Cross Blue Shield', category: 'Benefits', contact: 'Billing dept.', status: 'Invoice pending', detail: 'July premium invoice — confirm headcount before approval.', draft: 'Hi — the July premium invoice looks to include one termed employee. Can you confirm the current enrolled headcount so we can reconcile before paying?', amount: 4820, due: '2026-07-20', lastTouch: '2026-07-09' },
  { id: 'v4', vendor: 'ADP', category: 'Payroll/HR', contact: 'Account team', status: 'COI missing', detail: 'No current COI on file — required for the vendor compliance binder.', draft: 'Hi — we don’t have a current certificate of insurance on file for ADP. Could you send an updated COI naming ERP Industrials as certificate holder?', lastTouch: '2026-06-28' },
  { id: 'v5', vendor: 'Guideline (401k)', category: 'Benefits', contact: 'Support', status: 'Current', detail: 'Q2 contributions reconciled; nothing outstanding.', draft: '', lastTouch: '2026-07-01' },
  { id: 'v6', vendor: 'Pitney Bowes (office)', category: 'Other', contact: 'Renewals', status: 'Renewal due', detail: 'Equipment lease auto-renews Sep 1 — decide renew vs cancel.', draft: 'Hi — our lease auto-renews 9/1. Please hold any renewal until we confirm; send current terms and the cancellation window.', due: '2026-09-01', lastTouch: '2026-06-20' },
]

const STATUS_STYLE: Record<Status, { color: string; bg: string; border: string }> = {
  'Awaiting reply':  { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  'Renewal due':     { color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  'COI missing':     { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'Invoice pending': { color: '#0e7490', bg: '#f0f9fa', border: '#a5f3fc' },
  'Current':         { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
}
const CAT_ICON: Record<Category, string> = { 'Insurance': '🛡️', 'Banking': '🏦', 'Benefits': '🩺', 'Payroll/HR': '👥', 'Other': '📦' }
const usd = (n: number) => n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Math.round(n)}`

export default function AdminVendorDeskView() {
  const [cat, setCat] = useState<'All' | Category>('All')
  const [openId, setOpenId] = useState<string | null>(null)

  const visible = VENDORS.filter(v => cat === 'All' || v.category === cat)
  const open = VENDORS.filter(v => v.status !== 'Current').length
  const renewals = VENDORS.filter(v => v.status === 'Renewal due').length
  const coisMissing = VENDORS.filter(v => v.status === 'COI missing').length
  const invoices = VENDORS.filter(v => v.status === 'Invoice pending').length

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
    <div>
      <div className="page-header">
        <h2>Admin Vendor Desk</h2>
        <p>Corporate vendor communication — insurance, banking, benefits, payroll. Tracks each thread and drafts the outbound (renewal request, COI chase, invoice confirmation, follow-up) for review.</p>
      </div>

      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — Admin Vendor Communication &amp; Follow-Up. Sample data; drafts are prepared for review, never auto-sent. Pairs with Contact Auto-Capture.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Open threads', String(open))}
        {kpi('Renewals due', String(renewals), renewals ? '#1d4ed8' : undefined)}
        {kpi('COIs missing', String(coisMissing), coisMissing ? '#b91c1c' : undefined)}
        {kpi('Invoices pending', String(invoices), invoices ? '#0e7490' : undefined)}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Category</span>
        {(['All', 'Insurance', 'Banking', 'Benefits', 'Payroll/HR', 'Other'] as const).map(c => <button key={c} style={pill(cat === c)} onClick={() => setCat(c)}>{c}</button>)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.map(v => {
          const ss = STATUS_STYLE[v.status]
          const isOpen = openId === v.id
          return (
            <div key={v.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{CAT_ICON[v.category]} {v.vendor}</span>
                    <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 5, padding: '1px 7px' }}>{v.category}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: 6, padding: '1px 8px' }}>{v.status}</span>
                    {v.amount != null && <span style={{ fontSize: 12, fontWeight: 600, color: '#0D2D52' }}>{usd(v.amount)}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 5 }}>{v.detail}</div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                    <span>👤 {v.contact}</span>
                    {v.due && <span>📅 due {v.due}</span>}
                    <span>last touch {v.lastTouch}</span>
                  </div>
                </div>
                {v.draft && (
                  <button onClick={() => setOpenId(isOpen ? null : v.id)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0D2D52', background: isOpen ? '#0D2D52' : '#fff', color: isOpen ? '#fff' : '#0D2D52' }}>
                    {isOpen ? 'Hide draft' : '✦ Draft'}
                  </button>
                )}
              </div>
              {isOpen && v.draft && (
                <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Drafted follow-up</div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{v.draft}</div>
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
        Scoped to corporate/admin vendors (insurance, banking, benefits, payroll) — separate from the deal-vendor coordinator on the Acquisition EA. Drafts are prepared for a human to review and send, never auto-sent. Vendor contacts are captured via Contact Auto-Capture.
      </div>
    </div>
  )
}
