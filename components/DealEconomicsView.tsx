'use client'

import React, { useState, useEffect } from 'react'

// Deal Economics / Underwriting Summary Capture (Agent 3 · Workflow 1)
// Single source of deal economics feeding IC Memo Drafter, Pipeline Status Board, and deal charts.

type SURow = { label: string; amount: string }
type SU = { sources: SURow[]; uses: SURow[] }

type Econ = {
  id: string; deal_id: string | null; deal_name: string
  purchase_price: number | null; going_in_cap: number | null; exit_cap: number | null
  levered_irr: number | null; unlevered_irr: number | null; equity_multiple: number | null
  cash_on_cash: number | null; hold_period: number | null
  sources_uses: SU | null; key_assumptions: string | null; analyst_notes: string | null
  confirmed_by: string | null; confirmed_at: string | null
  created_at: string; updated_at: string
}

type PipelineDeal = { id: string; deal_name: string }

// ─── Formatters ────────────────────────────────────────────────────────────────

const usd = (n: number | null) => {
  if (n == null) return '—'
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${n}`
}
const pct  = (n: number | null) => n == null ? '—' : `${n.toFixed(1)}%`
const mult = (n: number | null) => n == null ? '—' : `${n.toFixed(2)}x`
const yrs  = (n: number | null) => n == null ? '—' : `${n}y`

// ─── Shared styles ─────────────────────────────────────────────────────────────

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4, display: 'block' }
const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#111827' }

// ─── Metric tile ──────────────────────────────────────────────────────────────

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#0e7490' : '#0D2D52' }}>{value}</div>
    </div>
  )
}

// ─── Sources & Uses mini table ─────────────────────────────────────────────────

function SUTable({ su }: { su: SU }) {
  const srcTotal = su.sources.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const useTotal = su.uses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const tdL: React.CSSProperties = { padding: '5px 8px', fontSize: 11, color: '#374151', borderBottom: '1px solid #f3f4f6' }
  const tdR: React.CSSProperties = { ...tdL, textAlign: 'right', fontWeight: 500 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
      {([['Sources', su.sources, srcTotal], ['Uses', su.uses, useTotal]] as [string, SURow[], number][]).map(([title, rows, total]) => (
        <div key={title} style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ background: '#f3f4f6', padding: '6px 10px', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>{title}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.filter(r => r.label).map((r, i) => (
                <tr key={i}>
                  <td style={tdL}>{r.label}</td>
                  <td style={tdR}>{r.amount ? usd(parseFloat(r.amount)) : '—'}</td>
                </tr>
              ))}
              {total > 0 && (
                <tr style={{ background: '#f9fafb' }}>
                  <td style={{ ...tdL, fontWeight: 700, borderBottom: 'none' }}>Total</td>
                  <td style={{ ...tdR, fontWeight: 700, borderBottom: 'none' }}>{usd(total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── S&U editor rows ──────────────────────────────────────────────────────────

function SUEditor({ su, onChange }: { su: SU; onChange: (su: SU) => void }) {
  const addRow = (side: 'sources' | 'uses') => onChange({ ...su, [side]: [...su[side], { label: '', amount: '' }] })
  const removeRow = (side: 'sources' | 'uses', i: number) => onChange({ ...su, [side]: su[side].filter((_, idx) => idx !== i) })
  const updateRow = (side: 'sources' | 'uses', i: number, field: 'label' | 'amount', val: string) => {
    const rows = su[side].map((r, idx) => idx === i ? { ...r, [field]: val } : r)
    onChange({ ...su, [side]: rows })
  }
  const rowStyle: React.CSSProperties = { display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }
  const miniInp: React.CSSProperties = { flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', color: '#111827' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {(['sources', 'uses'] as const).map(side => (
        <div key={side}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>{side}</div>
          {su[side].map((r, i) => (
            <div key={i} style={rowStyle}>
              <input style={miniInp} placeholder="Label" value={r.label} onChange={e => updateRow(side, i, 'label', e.target.value)} />
              <input style={{ ...miniInp, flex: '0 0 90px' }} placeholder="$" value={r.amount} onChange={e => updateRow(side, i, 'amount', e.target.value)} />
              <button onClick={() => removeRow(side, i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
            </div>
          ))}
          <button onClick={() => addRow(side)} style={{ fontSize: 11, color: '#0e7490', background: 'none', border: '1px solid #A6C3C9', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', marginTop: 2 }}>+ Add row</button>
        </div>
      ))}
    </div>
  )
}

// ─── Capture / Edit modal ─────────────────────────────────────────────────────

const BLANK_SU: SU = { sources: [{ label: '', amount: '' }], uses: [{ label: '', amount: '' }] }

function CaptureModal({
  initial, deals, onSave, onDelete, onClose,
}: {
  initial: Partial<Econ>
  deals: PipelineDeal[]
  onSave: (v: Partial<Econ>) => Promise<void>
  onDelete?: () => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState<Partial<Econ>>({ sources_uses: BLANK_SU, ...initial })
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof Econ, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  const numField = (key: keyof Econ, label: string, placeholder: string) => (
    <div>
      <label style={lbl}>{label}</label>
      <input type="number" step="any" style={inp} placeholder={placeholder}
        value={(form[key] as number | null) ?? ''} onChange={e => set(key, e.target.value)} />
    </div>
  )

  const handleSave = async () => {
    if (!form.deal_name?.trim()) { setErr('Deal name is required'); return }
    setSaving(true); setErr('')
    try { await onSave(form) } catch (e) { setErr(String(e)) } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!onDelete) return
    setSaving(true); setErr('')
    try { await onDelete() } catch (e) { setErr(String(e)) } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 640, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2D52' }}>{initial.id ? 'Edit deal economics' : 'Capture deal economics'}</div>

        {/* Deal identity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Deal name</label>
            <input style={inp} placeholder="e.g. 9105 I-20, Midland" value={form.deal_name || ''}
              onChange={e => set('deal_name', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Link to pipeline deal (optional)</label>
            <select style={inp} value={form.deal_id || ''} onChange={e => set('deal_id', e.target.value || null)}>
              <option value="">— Not linked —</option>
              {deals.map(d => <option key={d.id} value={d.id}>{d.deal_name}</option>)}
            </select>
          </div>
        </div>

        {/* Headline metrics */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Headline metrics</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {numField('purchase_price',  'Purchase price ($)',   '6800000')}
            {numField('going_in_cap',    'Going-in cap (%)',     '6.2')}
            {numField('exit_cap',        'Exit cap (%)',         '6.8')}
            {numField('hold_period',     'Hold period (yrs)',    '5')}
            {numField('levered_irr',     'Levered IRR (%)',      '18.4')}
            {numField('unlevered_irr',   'Unlevered IRR (%)',    '12.1')}
            {numField('equity_multiple', 'Equity multiple (x)',  '1.85')}
            {numField('cash_on_cash',    'Cash-on-cash (%)',     '7.2')}
          </div>
        </div>

        {/* Sources & Uses */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10 }}>Sources & Uses</div>
          <SUEditor su={form.sources_uses ?? BLANK_SU} onChange={su => set('sources_uses', su)} />
        </div>

        {/* Key assumptions */}
        <div>
          <label style={lbl}>Key assumptions & sensitivities</label>
          <textarea style={{ ...inp, minHeight: 72, resize: 'vertical', lineHeight: 1.5 }}
            placeholder="Rent growth: 3%/yr. Vacancy: 5%. Refi at year 3 assumed at 6.5% rate…"
            value={form.key_assumptions || ''} onChange={e => set('key_assumptions', e.target.value)} />
        </div>

        {/* Analyst notes + confirmation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Analyst notes</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical', lineHeight: 1.5 }}
              placeholder="Any caveats or pending items…"
              value={form.analyst_notes || ''} onChange={e => set('analyst_notes', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Confirmed by</label>
            <input style={inp} placeholder="Analyst name" value={form.confirmed_by || ''}
              onChange={e => set('confirmed_by', e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <label style={lbl}>Confirmed on</label>
              <input type="date" style={inp} value={form.confirmed_at?.slice(0, 10) || ''}
                onChange={e => set('confirmed_at', e.target.value)} />
            </div>
          </div>
        </div>

        {err && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <div>
            {onDelete && (
              <button onClick={handleDelete} disabled={saving}
                style={{ background: 'none', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>
                Delete
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !form.deal_name?.trim()}
              style={{ border: 'none', background: '#0D2D52', color: '#fff', borderRadius: 8, padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving || !form.deal_name?.trim() ? .6 : 1 }}>
              {saving ? 'Saving…' : initial.id ? 'Save changes' : 'Capture'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function DealEconomicsView() {
  const [records, setRecords] = useState<Econ[]>([])
  const [deals, setDeals] = useState<PipelineDeal[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Partial<Econ> | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [econRes, pipeRes] = await Promise.all([fetch('/api/deal-economics'), fetch('/api/deal-pipeline')])
      const [econData, pipeData] = await Promise.all([econRes.json(), pipeRes.json()])
      if (econRes.ok) setRecords(econData.items ?? [])
      if (pipeRes.ok) setDeals((pipeData.items ?? []).map((d: any) => ({ id: d.id, deal_name: d.deal_name })))
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async (form: Partial<Econ>) => {
    const method = form.id ? 'PATCH' : 'POST'
    const r = await fetch('/api/deal-economics', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await r.json()
    if (!r.ok) throw new Error(d.error || 'Save failed')
    setModal(null)
    await load()
  }

  const remove = async (id: string) => {
    const r = await fetch(`/api/deal-economics?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Delete failed') }
    setModal(null)
    await load()
  }

  // KPI aggregates
  const avgCapIn = records.length ? records.filter(r => r.going_in_cap != null).reduce((s, r) => s + r.going_in_cap!, 0) / (records.filter(r => r.going_in_cap != null).length || 1) : null
  const avgIRR   = records.length ? records.filter(r => r.levered_irr   != null).reduce((s, r) => s + r.levered_irr!,   0) / (records.filter(r => r.levered_irr   != null).length || 1) : null
  const totalVal  = records.reduce((s, r) => s + (r.purchase_price ?? 0), 0)

  const kpi = (label: string, value: string, accent?: boolean) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ? '#0e7490' : '#0D2D52', marginTop: 4 }}>{value}</div>
    </div>
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Deal Economics</h2>
          <p>Underwriting headline outputs per deal — the single source feeding IC memos, the pipeline board, and deal charts. Analyst confirms figures after model is finalized.</p>
        </div>
        <button onClick={() => setModal({})}
          style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
          + Capture economics
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {kpi('Deals captured', String(records.length))}
        {kpi('Total pipeline value', totalVal > 0 ? usd(totalVal) : '—', true)}
        {kpi('Avg going-in cap', avgCapIn != null ? pct(avgCapIn) : '—')}
        {kpi('Avg levered IRR', avgIRR != null ? pct(avgIRR) : '—', true)}
      </div>

      {err && <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
      ) : records.length === 0 ? (
        <div style={{ background: '#fff', border: '1px dashed #d1d5db', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📐</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>No economics captured yet</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4, marginBottom: 16 }}>
            Capture the finalized underwriting model outputs for each deal.
          </div>
          <button onClick={() => setModal({})}
            style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: '#0D2D52', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            Capture first deal
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {records.map(r => (
            <div key={r.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderLeft: '3px solid #0e7490', borderRadius: 10, padding: '16px 18px' }}>
              {/* Deal header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{r.deal_name}</div>
                  {r.confirmed_by && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                      Confirmed by {r.confirmed_by}{r.confirmed_at ? ` · ${r.confirmed_at.slice(0, 10)}` : ''}
                    </div>
                  )}
                </div>
                <button onClick={() => setModal(r)}
                  style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', color: '#374151' }}>
                  Edit
                </button>
              </div>

              {/* Metrics grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                <Metric label="Purchase price"  value={usd(r.purchase_price)} />
                <Metric label="Going-in cap"    value={pct(r.going_in_cap)} accent />
                <Metric label="Exit cap"        value={pct(r.exit_cap)} />
                <Metric label="Hold period"     value={yrs(r.hold_period)} />
                <Metric label="Levered IRR"     value={pct(r.levered_irr)} accent />
                <Metric label="Unlevered IRR"   value={pct(r.unlevered_irr)} />
                <Metric label="Equity multiple" value={mult(r.equity_multiple)} accent />
                <Metric label="Cash-on-cash"    value={pct(r.cash_on_cash)} />
              </div>

              {/* Sources & Uses */}
              {r.sources_uses && (r.sources_uses.sources.some(s => s.label) || r.sources_uses.uses.some(u => u.label)) && (
                <SUTable su={r.sources_uses} />
              )}

              {/* Key assumptions */}
              {r.key_assumptions && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Key assumptions</div>
                  <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{r.key_assumptions}</div>
                </div>
              )}

              {r.analyst_notes && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280', fontStyle: 'italic' }}>Note: {r.analyst_notes}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <CaptureModal
          initial={modal}
          deals={deals}
          onSave={save}
          onDelete={modal.id ? () => remove(modal.id!) : undefined}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}
