'use client'

import React, { useState, useEffect } from 'react'

// Deal Pipeline — active acquisition deals from LOI through closing. Portal-managed (like the
// capital-raise pipeline); the Acquisition Assistant agents feed/act on it later. Each deal carries
// its stage, owner, key dates, a "next action" (the per-deal priority), and a costs-vs-budget
// snapshot (the Deal Cost & Invoice Tracker concept). Closing readiness lives in Acquisition Checklist.

const STAGES = ['Sourcing', 'LOI', 'Under Contract', 'Due Diligence', 'IC Approval', 'Closing', 'Closed']
const STAGE_COLOR: Record<string, string> = {
  'Sourcing': '#9ca3af', 'LOI': '#3b82f6', 'Under Contract': '#0ea5e9', 'Due Diligence': '#8b5cf6',
  'IC Approval': '#f59e0b', 'Closing': '#059669', 'Closed': '#10b981',
}
const MARKETS = ['Permian Basin', 'Brevard / Space Coast', 'Other']
const OWNERS = ['Meghan', 'William', 'Michele']

type DealRow = {
  id: string; deal_name: string; entity: string | null; market: string | null; stage: string;
  owner: string | null; purchase_price: number | null; budget: number | null; costs_to_date: number | null;
  next_action: string | null; next_action_due: string | null; dd_deadline: string | null; closing_date: string | null;
  notes: string | null; created_at: string; updated_at: string
}

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const todayStr = () => new Date().toISOString().slice(0, 10)
const daysUntil = (iso: string | null) => { if (!iso) return null; return Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 86400000) }

function dateChip(label: string, iso: string | null) {
  if (!iso) return null
  const d = daysUntil(iso)
  const overdue = d != null && d < 0
  const soon = d != null && d >= 0 && d <= 14
  const color = overdue ? '#b91c1c' : soon ? '#b45309' : '#6b7280'
  return (
    <span style={{ fontSize: 11, color, fontWeight: overdue || soon ? 600 : 400 }}>
      {label}: {iso}{d != null ? (overdue ? ` · ${Math.abs(d)}d overdue` : d === 0 ? ' · today' : ` · ${d}d`) : ''}
    </span>
  )
}

export default function DealPipelineView() {
  const [rows, setRows] = useState<DealRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Partial<DealRow> | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try { const r = await fetch('/api/deal-pipeline'); const d = await r.json(); if (r.ok) setRows(d.items ?? []) }
    catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing || !editing.deal_name?.trim() || saving) return
    setSaving(true); setErr('')
    try {
      const method = editing.id ? 'PATCH' : 'POST'
      const r = await fetch('/api/deal-pipeline', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Save failed'); return }
      setEditing(null); await load()
    } catch (e) { setErr(String(e)) } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    setRows((prev) => prev.filter((x) => x.id !== id)); setEditing(null)
    try { await fetch(`/api/deal-pipeline?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { /* ignore */ }
  }

  const active = rows.filter((r) => r.stage !== 'Closed')
  const pipelineValue = active.reduce((s, r) => s + (r.purchase_price || 0), 0)
  const inDD = active.filter((r) => r.stage === 'Due Diligence').length
  const underContractPlus = active.filter((r) => ['Under Contract', 'Due Diligence', 'IC Approval', 'Closing'].includes(r.stage)).length
  const closingSoon = active.filter((r) => { const d = daysUntil(r.closing_date); return d != null && d >= 0 && d <= 30 }).length

  const sorted = [...rows].sort((a, b) => (STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)) || (b.purchase_price || 0) - (a.purchase_price || 0))

  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || '#0D2D52', marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Deal Pipeline</h2>
          <p>Active acquisitions from LOI through closing — stage, next action, key dates, and cost-to-budget per deal. Closing readiness lives in Acquisition Checklist.</p>
        </div>
        <button onClick={() => setEditing({ stage: 'Sourcing', market: 'Permian Basin' })}
          style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add deal</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('Active Deals', String(active.length))}
        {kpi('Under Contract+', String(underContractPlus))}
        {kpi('In Diligence', String(inDD), inDD ? '#8b5cf6' : undefined)}
        {kpi('Closing ≤30d', String(closingSoon), closingSoon ? '#059669' : undefined)}
        {kpi('Pipeline Value', pipelineValue ? usd(pipelineValue) : '—', '#0e7490')}
      </div>

      {/* Stage funnel */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {STAGES.map((s) => {
          const n = rows.filter((r) => r.stage === s).length
          const amt = rows.filter((r) => r.stage === s).reduce((a, r) => a + (r.purchase_price || 0), 0)
          return (
            <div key={s} style={{ flex: 1, minWidth: 92, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: STAGE_COLOR[s], display: 'inline-block' }} />
                <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280' }}>{s}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0D2D52', marginTop: 3 }}>{n}</div>
              <div style={{ fontSize: 10, color: '#9ca3af' }}>{amt ? usd(amt) : '—'}</div>
            </div>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading pipeline…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏗️</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No deals yet</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Add an acquisition to start tracking the pipeline.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sorted.map((r) => {
            const spentPct = r.budget && r.budget > 0 ? Math.min(100, Math.round(((r.costs_to_date || 0) / r.budget) * 100)) : null
            return (
              <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: `3px solid ${STAGE_COLOR[r.stage] || '#9ca3af'}`, borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{r.deal_name}</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: STAGE_COLOR[r.stage], background: `${STAGE_COLOR[r.stage]}14`, borderRadius: 5, padding: '1px 8px' }}>{r.stage}</span>
                      {r.market && <span style={{ fontSize: 10, color: '#6b7280', background: '#f3f4f6', borderRadius: 5, padding: '1px 7px' }}>{r.market}</span>}
                      {r.purchase_price != null && r.purchase_price > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#0D2D52' }}>{usd(r.purchase_price)}</span>}
                    </div>
                    {r.entity && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{r.entity}</div>}
                    {r.next_action && (
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 6 }}>
                        <span style={{ fontWeight: 600 }}>Next:</span> {r.next_action}
                        {r.next_action_due && <span style={{ marginLeft: 6 }}>{dateChip('due', r.next_action_due)}</span>}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
                      {r.owner && <span style={{ fontSize: 11, color: '#9ca3af' }}>👤 {r.owner}</span>}
                      {dateChip('DD', r.dd_deadline)}
                      {dateChip('Close', r.closing_date)}
                    </div>
                    {spentPct != null && (
                      <div style={{ marginTop: 8, maxWidth: 320 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 3 }}>
                          <span>Costs vs budget</span><span>{usd(r.costs_to_date || 0)} / {usd(r.budget || 0)}</span>
                        </div>
                        <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ width: `${spentPct}%`, height: '100%', background: spentPct >= 90 ? '#b91c1c' : '#0e7490' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <button onClick={() => setEditing(r)} style={{ flexShrink: 0, background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>Edit</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2D52', marginBottom: 16 }}>{editing.id ? 'Edit deal' : 'Add deal'}</div>
            {(() => {
              const set = (k: keyof DealRow, v: unknown) => setEditing((p) => ({ ...p, [k]: v }))
              const lbl = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.4px', marginBottom: 4, display: 'block' }
              const inp = { width: '100%', boxSizing: 'border-box' as const, fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#111827' }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={lbl}>Deal name</label><input style={inp} value={editing.deal_name || ''} onChange={(e) => set('deal_name', e.target.value)} placeholder="e.g. 9105 I-20, Midland" /></div>
                  <div><label style={lbl}>Entity</label><input style={inp} value={editing.entity || ''} onChange={(e) => set('entity', e.target.value)} placeholder="ERP Industrials 9105, LLC" /></div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={lbl}>Stage</label><select style={inp} value={editing.stage || 'Sourcing'} onChange={(e) => set('stage', e.target.value)}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Market</label><select style={inp} value={editing.market || ''} onChange={(e) => set('market', e.target.value)}><option value="">—</option>{MARKETS.map((m) => <option key={m}>{m}</option>)}</select></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Owner</label><select style={inp} value={editing.owner || ''} onChange={(e) => set('owner', e.target.value)}><option value="">—</option>{OWNERS.map((o) => <option key={o}>{o}</option>)}</select></div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={lbl}>Purchase price</label><input type="number" style={inp} value={editing.purchase_price ?? ''} onChange={(e) => set('purchase_price', e.target.value)} placeholder="0" /></div>
                    <div style={{ flex: 1 }}><label style={lbl}>DD deadline</label><input type="date" style={inp} value={editing.dd_deadline || ''} onChange={(e) => set('dd_deadline', e.target.value)} /></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Closing date</label><input type="date" style={inp} value={editing.closing_date || ''} onChange={(e) => set('closing_date', e.target.value)} /></div>
                  </div>
                  <div><label style={lbl}>Next action</label><input style={inp} value={editing.next_action || ''} onChange={(e) => set('next_action', e.target.value)} placeholder="What needs to happen next" /></div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}><label style={lbl}>Next action due</label><input type="date" style={inp} value={editing.next_action_due || ''} onChange={(e) => set('next_action_due', e.target.value)} /></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Costs to date</label><input type="number" style={inp} value={editing.costs_to_date ?? ''} onChange={(e) => set('costs_to_date', e.target.value)} placeholder="0" /></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Deal budget</label><input type="number" style={inp} value={editing.budget ?? ''} onChange={(e) => set('budget', e.target.value)} placeholder="0" /></div>
                  </div>
                  <div><label style={lbl}>Notes</label><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' as const }} value={editing.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div>
                  {err && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                    <div>{editing.id && <button onClick={() => remove(editing.id!)} style={{ background: 'none', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Delete</button>}</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setEditing(null)} style={{ background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={save} disabled={saving || !editing.deal_name?.trim()} style={{ border: 'none', background: '#0D2D52', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving || !editing.deal_name?.trim() ? .6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
