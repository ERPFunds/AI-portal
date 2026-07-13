'use client'

import React, { useState, useEffect } from 'react'

// Deal Economics — the quantitative view across the acquisition pipeline. Reads the same
// deal_pipeline records as the Deal Pipeline section, but presents the money side: purchase price,
// all-in budget, costs to date, and budget usage. Underwriting return metrics (cap rate, IRR,
// equity multiple, hold) are shown as columns to be populated from the underwriting model / IC memo
// handoff — not yet stored in the portal.

const STAGES = ['Sourcing', 'LOI', 'Under Contract', 'Due Diligence', 'IC Approval', 'Closing', 'Closed']

type DealRow = {
  id: string; deal_name: string; entity: string | null; market: string | null; stage: string;
  purchase_price: number | null; budget: number | null; costs_to_date: number | null; closing_date: string | null
}

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const dash = <span style={{ color: '#d1d5db' }}>—</span>

export default function AcquisitionEconomicsView() {
  const [rows, setRows] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/deal-pipeline').then(r => r.json()).then(d => setRows(d.items ?? [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const active = rows.filter(r => r.stage !== 'Closed')
  const totalPrice = active.reduce((s, r) => s + (r.purchase_price || 0), 0)
  const totalBudget = active.reduce((s, r) => s + (r.budget || 0), 0)
  const totalCosts = rows.reduce((s, r) => s + (r.costs_to_date || 0), 0)
  const sorted = [...rows].sort((a, b) => (STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) || (b.purchase_price || 0) - (a.purchase_price || 0))

  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#0D2D52', marginTop: 4 }}>{value}</div>
    </div>
  )

  const th = { textAlign: 'left' as const, fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '.4px', padding: '8px 10px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' as const }
  const td = { padding: '10px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' as const }

  return (
    <div>
      <div className="page-header">
        <h2>Deal Economics</h2>
        <p>The money side of the pipeline — price, all-in budget, and cost-to-date per deal. Underwriting returns populate from the model / IC handoff.</p>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Active Deals', String(active.length))}
        {kpi('Purchase Price (active)', totalPrice ? usd(totalPrice) : '—', '#0e7490')}
        {kpi('All-in Budget (active)', totalBudget ? usd(totalBudget) : '—')}
        {kpi('Costs to Date', totalCosts ? usd(totalCosts) : '—', '#b45309')}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading economics…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📈</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No deals to analyze</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Add deals in the Deal Pipeline and their economics appear here.</div>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Deal', 'Stage', 'Purchase Price', 'All-in Budget', 'Costs to Date', 'Budget Used', 'Going-in Cap', 'Levered IRR', 'Equity Mult.', 'Hold'].map(h => (
                    <th key={h} style={{ ...th, textAlign: ['Deal', 'Stage'].includes(h) ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => {
                  const used = r.budget && r.budget > 0 ? Math.round(((r.costs_to_date || 0) / r.budget) * 100) : null
                  return (
                    <tr key={r.id}>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>
                        {r.deal_name}{r.market ? <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{r.market}</div> : null}
                      </td>
                      <td style={td}>{r.stage}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#0D2D52' }}>{r.purchase_price ? usd(r.purchase_price) : dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.budget ? usd(r.budget) : dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.costs_to_date ? usd(r.costs_to_date) : dash}</td>
                      <td style={{ ...td, textAlign: 'right', color: used != null && used >= 90 ? '#b91c1c' : '#374151', fontWeight: used != null ? 600 : 400 }}>{used != null ? `${used}%` : dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{dash}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{dash}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 10, color: '#9ca3af', padding: '10px 12px' }}>Going-in cap, IRR, equity multiple, and hold populate from the underwriting model / IC memo handoff.</div>
        </div>
      )}
    </div>
  )
}
