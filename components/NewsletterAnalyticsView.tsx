'use client'

import React from 'react'

// UI MOCKUP — Newsletter Analytics. Open/click engagement across sent newsletters. Populated with
// sample campaigns; wires to the email service provider (Mailchimp / SendGrid / Outlook) once
// connected. Matches the app's stat-tile + inline-bar style.

type Campaign = {
  id: string
  name: string
  audience: string
  sent: string
  recipients: number
  opens: number
  clicks: number
  unsub: number
  bounce: number
}

const CAMPAIGNS: Campaign[] = [
  { id: 'c1', name: 'July Availability Blast',        audience: 'Broker Network',        sent: '2026-07-08', recipients: 420, opens: 160, clicks: 38, unsub: 2, bounce: 5 },
  { id: 'c2', name: 'Palm Bay Spotlight — 18,500 SF', audience: 'Broker Network + Tenants', sent: '2026-06-24', recipients: 380, opens: 167, clicks: 46, unsub: 1, bounce: 3 },
  { id: 'c3', name: 'Q2 Broker Update',               audience: 'Broker Network',        sent: '2026-06-30', recipients: 512, opens: 179, clicks: 36, unsub: 3, bounce: 8 },
  { id: 'c4', name: 'New Listing — Odessa IOS',       audience: 'Prospects + Tenants',   sent: '2026-06-12', recipients: 405, opens: 166, clicks: 45, unsub: 0, bounce: 4 },
  { id: 'c5', name: 'June Availability Blast',        audience: 'Broker Network',        sent: '2026-06-03', recipients: 410, opens: 135, clicks: 25, unsub: 2, bounce: 6 },
]

const TOP_LINKS = [
  { label: '650 Azalea Ave — OM download', clicks: 48 },
  { label: 'Tour scheduling', clicks: 34 },
  { label: 'Odessa IOS flyer', clicks: 27 },
  { label: 'Reply / contact leasing', clicks: 19 },
]

const rate = (n: number, d: number) => d > 0 ? (n / d) * 100 : 0
const pct = (n: number) => `${n.toFixed(0)}%`

export default function NewsletterAnalyticsView() {
  const totalRecipients = CAMPAIGNS.reduce((s, c) => s + c.recipients, 0)
  const totalOpens = CAMPAIGNS.reduce((s, c) => s + c.opens, 0)
  const totalClicks = CAMPAIGNS.reduce((s, c) => s + c.clicks, 0)
  const totalUnsub = CAMPAIGNS.reduce((s, c) => s + c.unsub, 0)
  const avgOpen = rate(totalOpens, totalRecipients)
  const avgClick = rate(totalClicks, totalRecipients)
  const maxOpen = Math.max(...CAMPAIGNS.map(c => rate(c.opens, c.recipients)))

  // oldest → newest for the trend
  const trend = [...CAMPAIGNS].sort((a, b) => a.sent.localeCompare(b.sent))

  const kpi = (label: string, value: string, sub: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#0D2D52', marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
    </div>
  )
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 12px', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: '#374151', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }

  return (
    <div>
      <div className="page-header">
        <h2>📬 Newsletter Analytics</h2>
        <p>Open and click engagement across sent newsletters — per campaign, with trend and top links.</p>
      </div>

      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — sample campaigns. Wires to the email service provider (Mailchimp / SendGrid / Outlook) once connected.</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Sends · 90d', String(CAMPAIGNS.length), `${totalRecipients.toLocaleString('en-US')} recipients`)}
        {kpi('Avg open rate', pct(avgOpen), `${totalOpens.toLocaleString('en-US')} opens`, '#0e7490')}
        {kpi('Avg click rate', pct(avgClick), `${totalClicks} clicks`, '#7c3aed')}
        {kpi('Unsubscribes', String(totalUnsub), 'across all sends', totalUnsub > 5 ? '#b91c1c' : undefined)}
      </div>

      {/* Open-rate trend */}
      <div className="card" style={{ margin: '0 0 16px', padding: '16px 18px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>Open rate by edition</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 120, borderBottom: '1px solid #f3f4f6', paddingBottom: 4 }}>
          {trend.map(c => {
            const o = rate(c.opens, c.recipients)
            return (
              <div key={c.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0D2D52' }}>{pct(o)}</div>
                <div style={{ width: '100%', maxWidth: 46, height: `${(o / maxOpen) * 90}px`, background: '#0e7490', borderRadius: '3px 3px 0 0' }} />
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6 }}>
          {trend.map(c => (
            <div key={c.id} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sent.slice(5)}</div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Campaign table */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Newsletter', 'Sent', 'Recipients', 'Open', 'Click', 'Unsub', 'Bounce'].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CAMPAIGNS.map(c => {
                  const o = rate(c.opens, c.recipients)
                  const cl = rate(c.clicks, c.recipients)
                  return (
                    <tr key={c.id}>
                      <td style={{ ...td, fontWeight: 600, color: '#111827' }}>{c.name}<div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{c.audience}</div></td>
                      <td style={{ ...td, color: '#6b7280' }}>{c.sent.slice(5)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{c.recipients}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#0e7490' }}>{pct(o)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#7c3aed' }}>{pct(cl)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{c.unsub}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>{c.bounce}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top links */}
        <div className="card" style={{ margin: 0, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>Top links clicked</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TOP_LINKS.map(l => (
              <div key={l.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#374151', marginBottom: 3 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{l.label}</span>
                  <span style={{ fontWeight: 700, color: '#0D2D52' }}>{l.clicks}</span>
                </div>
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${(l.clicks / TOP_LINKS[0].clicks) * 100}%`, height: '100%', background: '#7c3aed' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Sample data. Open/click/unsubscribe tracking populates from the email service provider once connected; sends originate from the Newsletter drafts and Distribution Lists.
      </div>
    </div>
  )
}
