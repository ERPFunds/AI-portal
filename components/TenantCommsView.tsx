'use client'

import React, { useState } from 'react'

// UI MOCKUP — Tenant Communications (Property). A tenant-facing AI concierge + an internal
// staff hub. Tenants self-serve via the bot (report maintenance, check renewal status, get
// building/emergency info); anything needing a person lands in the staff Threads queue with a
// drafted reply for review. Broadcasts push building-wide notices. Sample data; drafts and bot
// actions are prepared for review, never auto-sent. Maintenance intake ties to the Inspections /
// work-order flow; renewals tie to Lease Processing.

type Ttype = 'Maintenance' | 'Renewal' | 'General'
type Tstatus = 'Needs reply' | 'Bot handled' | 'Awaiting tenant' | 'Resolved'

type Thread = {
  id: string
  tenant: string
  unit: string
  building: string
  type: Ttype
  status: Tstatus
  channel: 'Portal bot' | 'Email' | 'SMS'
  preview: string
  when: string
  draft: string
  workOrder?: string
}

const THREADS: Thread[] = [
  { id: 't1', tenant: 'Basin Pump & Supply', unit: 'Unit 4', building: '10800 Hwy 191, Midland', type: 'Maintenance', status: 'Needs reply', channel: 'Portal bot', when: 'Today 8:42 AM',
    preview: 'Overhead door on the north bay won’t close all the way — stuck about a foot from the ground.',
    workOrder: 'WO-2617',
    draft: 'Hi — thanks for flagging this. I’ve logged maintenance request WO-2617 for the north-bay overhead door at Unit 4. Our vendor (Permian Door & Dock) will reach out to schedule within 1 business day; if the bay is a security concern overnight, call the after-hours line at (432) 242-8850. I’ll keep you posted here.' },
  { id: 't2', tenant: 'West Texas Mechanical', unit: 'Bldg 2', building: 'FM 1788, Midland', type: 'Renewal', status: 'Needs reply', channel: 'Email', when: 'Today 7:15 AM',
    preview: 'Got your renewal notice — what would the new rate look like if we extend 3 years instead of 1?',
    draft: 'Hi Roy — happy to run the 3-year scenario. Your current NNN rate is $12.20/SF; a 3-year extension would hold escalations at 3%/yr vs. the 4% on a 1-year. I’ll send a side-by-side today and loop in Leasing to paper whichever you prefer. Lease currently expires 3/31/2026.' },
  { id: 't3', tenant: 'Coastal Cold Chain', unit: 'CS-1', building: 'Melbourne Cold Storage, FL', type: 'Maintenance', status: 'Bot handled', channel: 'Portal bot', when: 'Yesterday 4:03 PM',
    preview: 'Refrigeration unit throwing a high-temp alarm in the east cooler.',
    workOrder: 'WO-2615',
    draft: 'Logged as WO-2615 (priority: urgent — cold storage). Dispatched to Space Coast Refrigeration with a 4-hour SLA; tenant notified of the ETA and given the emergency line. Awaiting vendor confirmation.' },
  { id: 't4', tenant: 'Space Coast Logistics', unit: 'Unit 200', building: 'Palm Bay Industrial, FL', type: 'Renewal', status: 'Awaiting tenant', channel: 'Email', when: 'Jul 20',
    preview: 'Renewal offer sent — tenant reviewing with their ops team.',
    draft: 'Following up on the renewal offer sent 7/18 (expiry 11/30/2025). No pressure — just confirming you received it and flagging that the early-renewal incentive holds through 8/15. Let me know if a call would help.' },
  { id: 't5', tenant: 'Permian Tools & Supply', unit: 'Unit 120', building: 'Midland Flex I', type: 'General', status: 'Needs reply', channel: 'SMS', when: 'Today 9:20 AM',
    preview: 'Who do we send the updated COI to, and what limits do you need named?',
    draft: 'Hi Janet — send the updated COI to insurance@erpfunds.com. Please name ERP Industrials as additional insured / certificate holder, $1M per occurrence / $2M aggregate GL. Let me know if your carrier needs our exact entity name for the endorsement.' },
  { id: 't6', tenant: 'Aero Ground Support', unit: 'Unit 3', building: 'Titusville Service Bay, FL', type: 'Maintenance', status: 'Resolved', channel: 'Portal bot', when: 'Jul 18',
    preview: 'Parking-lot light out near the front gate.',
    workOrder: 'WO-2608',
    draft: 'WO-2608 completed — photocell replaced, light back on. Closed out and tenant confirmed.' },
]

const TYPE_META: Record<Ttype, { icon: string; color: string; bg: string; border: string }> = {
  Maintenance: { icon: '🔧', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  Renewal:     { icon: '📝', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  General:     { icon: '💬', color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb' },
}
const STATUS_STYLE: Record<Tstatus, { color: string; bg: string; border: string }> = {
  'Needs reply':    { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  'Bot handled':    { color: '#0e7490', bg: '#f0f9fa', border: '#a5f3fc' },
  'Awaiting tenant':{ color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  'Resolved':       { color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
}

// Scripted tenant-facing bot conversation (preview of the self-service side)
const BOT_CHAT: { from: 'tenant' | 'bot'; text: string }[] = [
  { from: 'tenant', text: 'Hi — the north overhead door in our unit won’t close all the way.' },
  { from: 'bot', text: 'Sorry about that! I can log a maintenance request for you. Which building/unit — is this Basin Pump & Supply, Unit 4 at 10800 Hwy 191?' },
  { from: 'tenant', text: 'Yes that’s us.' },
  { from: 'bot', text: 'Done — I’ve created request WO-2617 for the north-bay overhead door and routed it to Permian Door & Dock. Expect a scheduling call within 1 business day. If it’s a security concern overnight, the after-hours line is (432) 242-8850. Anything else?' },
  { from: 'tenant', text: 'Also — when does our lease end? Thinking about renewing.' },
  { from: 'bot', text: 'Your lease at Unit 4 runs through 6/30/2026. You’re inside the renewal window, so I’ve flagged your account for the leasing team to send renewal options — someone will follow up. Want me to note a preferred term (1 vs 3 years)?' },
]

const BROADCAST_LOG: { id: string; building: string; subject: string; recipients: number; when: string; channel: string }[] = [
  { id: 'b1', building: 'FM 1788 (all buildings)', subject: 'Scheduled gate maintenance — Sat 7/26, 7–9 AM', recipients: 41, when: 'Jul 21', channel: 'Email + SMS' },
  { id: 'b2', building: '10800 / 10810 Hwy 191', subject: 'Parking-lot restriping — please move trailers by Fri', recipients: 18, when: 'Jul 15', channel: 'Email' },
  { id: 'b3', building: 'Palm Bay Industrial', subject: 'Tropical storm prep — secure outdoor materials', recipients: 9, when: 'Jul 9', channel: 'Email + SMS' },
]

const BUILDINGS = ['FM 1788 (all buildings)', '10800 / 10810 Hwy 191', 'Midland Flex I', 'Palm Bay Industrial', 'Melbourne Cold Storage', 'Titusville Service Bay']

export default function TenantCommsView() {
  const [tab, setTab] = useState<'threads' | 'bot' | 'broadcasts'>('threads')
  const [typeFilter, setTypeFilter] = useState<'All' | Ttype>('All')
  const [openId, setOpenId] = useState<string | null>('t1')
  const [bcBuilding, setBcBuilding] = useState(BUILDINGS[0])
  const [bcSubject, setBcSubject] = useState('')
  const [bcBody, setBcBody] = useState('')

  const visible = THREADS.filter(t => typeFilter === 'All' || t.type === typeFilter)
  const needsReply = THREADS.filter(t => t.status === 'Needs reply').length
  const maintOpen = THREADS.filter(t => t.type === 'Maintenance' && t.status !== 'Resolved').length
  const renewalsOpen = THREADS.filter(t => t.type === 'Renewal' && t.status !== 'Resolved').length
  const botHandled = THREADS.filter(t => t.status === 'Bot handled').length

  const pill = (active: boolean): React.CSSProperties => ({
    fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
    border: active ? '1px solid #0D2D52' : '1px solid #e5e7eb', background: active ? '#0D2D52' : '#fff', color: active ? '#fff' : '#6b7280',
  })
  const tabBtn = (active: boolean): React.CSSProperties => ({
    fontSize: 13, fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
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
        <h2>Tenant Communications</h2>
        <p>A tenant-facing AI concierge plus an internal staff hub — tenants self-serve (report maintenance, check renewals, get building info); anything needing a person lands in Threads with a drafted reply. Broadcasts push building-wide notices.</p>
      </div>

      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — Tenant Communications concierge. Sample data; bot actions and replies are prepared for review, never auto-sent. Maintenance intake would tie to the Inspections / work-order flow; renewals to Lease Processing.</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {kpi('Needs reply', String(needsReply), needsReply ? '#b91c1c' : undefined)}
        {kpi('Maintenance open', String(maintOpen), maintOpen ? '#b45309' : undefined)}
        {kpi('Renewals in window', String(renewalsOpen), renewalsOpen ? '#1d4ed8' : undefined)}
        {kpi('Bot-handled (7d)', String(botHandled), '#0e7490')}
        {kpi('Broadcasts (30d)', String(BROADCAST_LOG.length))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={tabBtn(tab === 'threads')} onClick={() => setTab('threads')}>📥 Threads</button>
        <button style={tabBtn(tab === 'bot')} onClick={() => setTab('bot')}>🤖 Tenant Bot</button>
        <button style={tabBtn(tab === 'broadcasts')} onClick={() => setTab('broadcasts')}>📣 Broadcasts</button>
      </div>

      {tab === 'threads' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>Type</span>
            {(['All', 'Maintenance', 'Renewal', 'General'] as const).map(c => <button key={c} style={pill(typeFilter === c)} onClick={() => setTypeFilter(c)}>{c}</button>)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visible.map(t => {
              const tm = TYPE_META[t.type]
              const ss = STATUS_STYLE[t.status]
              const isOpen = openId === t.id
              return (
                <div key={t.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{tm.icon} {t.tenant}</span>
                        <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 5, padding: '1px 7px' }}>{t.unit} · {t.building}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: tm.color, background: tm.bg, border: `1px solid ${tm.border}`, borderRadius: 6, padding: '1px 8px' }}>{t.type}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: ss.color, background: ss.bg, border: `1px solid ${ss.border}`, borderRadius: 6, padding: '1px 8px' }}>{t.status}</span>
                        {t.workOrder && <span style={{ fontSize: 10, fontWeight: 600, color: '#0D2D52', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 5, padding: '1px 7px' }}>{t.workOrder}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>{t.preview}</div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 11, color: '#9ca3af' }}>
                        <span>via {t.channel}</span>
                        <span>{t.when}</span>
                      </div>
                    </div>
                    <button onClick={() => setOpenId(isOpen ? null : t.id)} style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #0D2D52', background: isOpen ? '#0D2D52' : '#fff', color: isOpen ? '#fff' : '#0D2D52' }}>
                      {isOpen ? 'Hide draft' : '✦ Draft reply'}
                    </button>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 10, background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>
                        {t.status === 'Bot handled' || t.status === 'Resolved' ? 'Bot action' : 'Drafted reply'}
                      </div>
                      <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{t.draft}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: 'none', background: '#0D2D52', color: '#fff' }}>Approve &amp; send</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>Edit</button>
                        {t.type === 'Maintenance' && <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>Open work order</button>}
                        {t.type === 'Renewal' && <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: '1px solid #d1d5db', background: '#fff', color: '#374151' }}>Send to Leasing</button>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {tab === 'bot' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 14, maxWidth: 720 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ background: '#0D2D52', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>ERP Tenant Concierge</div>
                <div style={{ fontSize: 11, opacity: .8 }}>Report an issue · check your lease · building info — 24/7</div>
              </div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: '#f8fafc' }}>
              {BOT_CHAT.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.from === 'tenant' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '78%', fontSize: 12.5, lineHeight: 1.55, padding: '9px 12px', borderRadius: 12,
                    background: m.from === 'tenant' ? '#0D2D52' : '#fff',
                    color: m.from === 'tenant' ? '#fff' : '#374151',
                    border: m.from === 'tenant' ? 'none' : '1px solid #e5e7eb',
                    borderBottomRightRadius: m.from === 'tenant' ? 3 : 12,
                    borderBottomLeftRadius: m.from === 'bot' ? 3 : 12 }}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #e5e7eb', background: '#fff' }}>
              <input disabled placeholder="Ask about your lease, report a maintenance issue, or get building info…"
                style={{ flex: 1, fontSize: 12.5, padding: '9px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', color: '#9ca3af' }} />
              <button disabled style={{ fontSize: 12, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', opacity: .5 }}>Send</button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6 }}>
            Embeddable as a tenant-portal widget or reachable by email/SMS. The bot is grounded on each tenant’s lease facts (term, expiry, COI requirements) and building info (access, emergency contacts). It can open a maintenance work order and flag renewals, but never commits terms or sends money — those route to a person.
          </div>
        </div>
      )}

      {tab === 'broadcasts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>New broadcast</div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Building / group</label>
            <select value={bcBuilding} onChange={e => setBcBuilding(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, margin: '4px 0 12px', background: '#fff', color: '#111827' }}>
              {BUILDINGS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Subject</label>
            <input value={bcSubject} onChange={e => setBcSubject(e.target.value)} placeholder="e.g. Scheduled gate maintenance"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, margin: '4px 0 12px' }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280' }}>Message</label>
            <textarea value={bcBody} onChange={e => setBcBody(e.target.value)} placeholder="Write the announcement, or let the bot draft it from a few words…"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, margin: '4px 0 12px', minHeight: 90, resize: 'vertical', lineHeight: 1.5 }} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer' }}>Queue for review</button>
              <button style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' }}>✦ Draft with bot</button>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 12 }}>Recent broadcasts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {BROADCAST_LOG.map(b => (
                <div key={b.id} style={{ border: '1px solid #f3f4f6', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#111827' }}>{b.subject}</div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 5, fontSize: 11, color: '#9ca3af' }}>
                    <span>🏢 {b.building}</span>
                    <span>👥 {b.recipients} tenants</span>
                    <span>{b.channel}</span>
                    <span>{b.when}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 16, lineHeight: 1.6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
        Concierge + staff hub for tenant communication. Bot handles self-service (maintenance intake, renewal/lease questions, building info) and escalates anything needing judgment to the Threads queue as a drafted reply. Nothing is auto-sent and the bot never commits lease terms or payments. Would wire to the tenant/unit records behind Properties, the work-order flow behind Inspections, and lease dates behind Lease Processing.
      </div>
    </div>
  )
}
