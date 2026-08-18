'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { TX_AS_OF, FL_AS_OF, FL_STRATEGY_NOTES, type TxRow, type FlRow } from '../lib/data/dealPipelineData'
import PipelineLiveTracker from './PipelineLiveTracker'

// Deal Pipeline — the two ERP workbooks (TX Permian, FL Space Coast), now editable and portal-managed.
// Rows live in pipeline_rows (via /api/deal-pipeline/mirror), seeded once from the generated workbook
// data. Edit a row to change any field — including Status (TX) / Section (FL), which moves it between
// groups (e.g. Target → Prospects, Active → Pending → Decline). The Live Tracker (separate table)
// still backs the Acquisition Economics views.

const NAVY = '#0D2D52'

// Unified category scheme (matches the FL spreadsheet) — groups BOTH boards: TX by `status`, FL by `section`.
const CATEGORIES = ['Under Review', 'Prospects', 'Comparables']
const CAT_COLOR: Record<string, string> = { 'Under Review': '#2563eb', 'Prospects': '#d97706', 'Comparables': '#6b7280' }

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)
const money = (v: unknown) => (isNum(v) ? `$${Math.round(v).toLocaleString('en-US')}` : v ? String(v) : '—')
const psf = (v: unknown) => (isNum(v) ? `$${v.toFixed(2)}` : v ? String(v) : '—')
const pct = (v: unknown) => (isNum(v) ? `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%` : v ? String(v) : '—')
const num = (v: unknown) => (isNum(v) ? v.toLocaleString('en-US') : v ? String(v) : '—')
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

const TH: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9', color: '#334155', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '7px 10px', fontSize: 12, color: '#1f2937', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' }
const numTD: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

type TxRowE = TxRow & { _id: string }
type FlRowE = FlRow & { _id: string }

function NoteCell({ text, minWidth = 130 }: { text: string; minWidth?: number }) {
  const [open, setOpen] = useState(false)
  if (!text) return <td style={{ ...TD, color: '#cbd5e1' }}>—</td>
  return (
    <td onClick={() => setOpen((o) => !o)} title={open ? 'Click to collapse' : text}
      style={{ ...TD, fontSize: 11.5, color: '#4b5563', cursor: 'pointer', minWidth, maxWidth: open ? 520 : 210, whiteSpace: open ? 'pre-line' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {text}{!open && <span style={{ color: '#94a3b8', marginLeft: 4 }}>▸</span>}
    </td>
  )
}

function StatusBand({ label, color, count, sub }: { label: string; color: string; count: number; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: `${color}12`, borderLeft: `4px solid ${color}` }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{label}</span>
      {sub && <span style={{ fontSize: 11, color: '#64748b' }}>· {sub}</span>}
      <span style={{ fontSize: 11, fontWeight: 600, color, marginLeft: 'auto' }}>{count} {count === 1 ? 'property' : 'properties'}</span>
    </div>
  )
}

const editBtn = (onClick: () => void) => (
  <button onClick={(e) => { e.stopPropagation(); onClick() }} style={{ background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '2px 9px', fontSize: 11, cursor: 'pointer', color: '#374151', whiteSpace: 'nowrap' }}>✎ Edit</button>
)

// Inline category dropdown — changing it moves the row between groups (decline/move), no save needed.
const catSelect = (val: string | null | undefined, onChange: (v: string) => void) => (
  <select value={val ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); onChange(e.target.value) }}
    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', maxWidth: 168 }}>
    <option value="">—</option>
    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
  </select>
)

// =============================== TEXAS ===============================
function TexasPipeline({ rows, query, showMarket, onEdit, onMove }: { rows: TxRowE[]; query: string; showMarket: boolean; onEdit: (r: TxRowE) => void; onMove: (r: TxRowE, cat: string) => void }) {
  const q = query.trim().toLowerCase()
  const match = (r: TxRow) => !q || [r.location, r.owner, r.address, r.tenant, r.source, r.notes, r.nextSteps].join(' ').toLowerCase().includes(q)
  const pipeline = useMemo(() => rows.filter((r) => r.kind === 'pipeline' && match(r)), [rows, q])
  const market = useMemo(() => rows.filter((r) => r.kind === 'market' && match(r)), [rows, q])
  const cols = ['Location', 'Status', 'Owner', 'Address', 'Tenant', 'Source', 'Price', '$ PSF', '% Yield', 'Acreage', 'Sq. Ft.', 'Year Built', 'Next Steps', 'Notes / Comments', '']
  const rightCols = new Set(['Price', '$ PSF', '% Yield', 'Acreage', 'Sq. Ft.'])
  const marketByLoc = useMemo(() => {
    const m = new Map<string, TxRowE[]>()
    for (const r of market) { const k = r.location || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [market])

  const dataRow = (r: TxRowE, i: number) => (
    <tr key={r._id} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
      <td style={{ ...TD, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{txt(r.location)}</td>
      <td style={TD}>{catSelect(r.status, (v) => onMove(r, v))}</td>
      <td style={TD}>{txt(r.owner)}</td>
      <td style={{ ...TD, minWidth: 180 }}>{txt(r.address)}</td>
      <td style={TD}>{txt(r.tenant)}</td>
      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{txt(r.source)}</td>
      <td style={{ ...numTD, fontWeight: 600 }}>{money(r.price)}</td>
      <td style={numTD}>{psf(r.pricePsf)}</td>
      <td style={numTD}>{pct(r.yield)}</td>
      <td style={numTD}>{num(r.acreage)}</td>
      <td style={numTD}>{num(r.sqft)}</td>
      <td style={{ ...numTD, textAlign: 'left' }}>{txt(r.yearBuilt)}</td>
      <NoteCell text={r.nextSteps} />
      <NoteCell text={r.notes} />
      <td style={{ ...TD, textAlign: 'right' }}>{editBtn(() => onEdit(r))}</td>
    </tr>
  )

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1240 }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={rightCols.has(c) ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr></thead>
          <tbody>
            {CATEGORIES.map((st) => {
              const g = pipeline.filter((r) => r.status === st)
              if (!g.length) return null
              return (
                <React.Fragment key={st}>
                  <tr><td colSpan={cols.length} style={{ padding: 0 }}><StatusBand label={st} color={CAT_COLOR[st]} count={g.length} /></td></tr>
                  {g.map(dataRow)}
                </React.Fragment>
              )
            })}
            {pipeline.length === 0 && <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', color: '#9ca3af', padding: 24 }}>No pipeline deals{query ? ` match “${query}”` : ''}.</td></tr>}
          </tbody>
        </table>
      </div>

      {showMarket && marketByLoc.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Market Analysis — Submarket Inventory</div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10 }}>Every industrial property tracked in the target submarkets ({market.length} rows) — editable.</div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1060 }}>
              <thead><tr>{['Owner', 'Address', 'Tenant', 'Acreage', 'Sq. Ft.', 'Year Built', 'Notes', ''].map((c, i) => <th key={i} style={c === 'Acreage' || c === 'Sq. Ft.' ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr></thead>
              <tbody>
                {marketByLoc.map(([loc, g]) => (
                  <React.Fragment key={loc}>
                    <tr><td colSpan={8} style={{ padding: '7px 12px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#475569', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>{loc} <span style={{ fontWeight: 500, color: '#94a3b8' }}>· {g.length}</span></td></tr>
                    {g.map((r, i) => (
                      <tr key={r._id} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                        <td style={TD}>{txt(r.owner)}</td>
                        <td style={{ ...TD, minWidth: 170 }}>{txt(r.address)}</td>
                        <td style={TD}>{txt(r.tenant)}</td>
                        <td style={numTD}>{num(r.acreage)}</td>
                        <td style={numTD}>{num(r.sqft)}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{txt(r.yearBuilt)}</td>
                        <NoteCell text={r.notes} />
                        <td style={{ ...TD, textAlign: 'right' }}>{editBtn(() => onEdit(r))}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================== FLORIDA ===============================
function FloridaPipeline({ rows, query, onEdit, onMove }: { rows: FlRowE[]; query: string; onEdit: (r: FlRowE) => void; onMove: (r: FlRowE, cat: string) => void }) {
  const q = query.trim().toLowerCase()
  const match = (r: FlRow) => !q || [r.name, r.status, r.source, r.propertyType, r.location, r.notes].join(' ').toLowerCase().includes(q)
  const list = useMemo(() => rows.filter(match), [rows, q])
  const cols = ['Name', 'Status', 'Source', 'Property Type', 'Location', 'Year Built', 'Units', 'Occup.', 'Cap Rate', 'SQFT', 'Acres', 'Purchase Price', 'PSF / P-Acre', 'Notes / Status', '']
  const rightCols = new Set(['Year Built', 'Units', 'Occup.', 'Cap Rate', 'SQFT', 'Acres', 'Purchase Price', 'PSF / P-Acre'])
  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1300 }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={rightCols.has(c) ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr></thead>
          <tbody>
            {CATEGORIES.map((sec) => {
              const g = list.filter((r) => r.section === sec)
              if (!g.length) return null
              return (
                <React.Fragment key={sec}>
                  <tr><td colSpan={cols.length} style={{ padding: 0 }}><StatusBand label={sec} color={CAT_COLOR[sec] || '#6b7280'} count={g.length} /></td></tr>
                  {g.map((r, i) => (
                    <tr key={r._id} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                      <td style={{ ...TD, fontWeight: 600, color: NAVY, minWidth: 170, whiteSpace: 'pre-line' }}>{txt(r.name)}<div style={{ marginTop: 4 }}>{catSelect(r.section, (v) => onMove(r, v))}</div></td>
                      <td style={TD}>{txt(r.status)}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{txt(r.source)}</td>
                      <td style={TD}>{txt(r.propertyType)}</td>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{txt(r.location)}</td>
                      <td style={{ ...numTD, textAlign: 'left' }}>{txt(r.yearBuilt)}</td>
                      <td style={numTD}>{num(r.units)}</td>
                      <td style={numTD}>{pct(r.occupancy)}</td>
                      <td style={numTD}>{pct(r.capRate)}</td>
                      <td style={numTD}>{num(r.sqft)}</td>
                      <td style={numTD}>{num(r.acres)}</td>
                      <td style={{ ...numTD, fontWeight: 600 }}>{money(r.price)}</td>
                      <td style={numTD}>{isNum(r.psf) ? psf(r.psf) : txt(r.psf)}</td>
                      <NoteCell text={r.notes} />
                      <td style={{ ...TD, textAlign: 'right' }}>{editBtn(() => onEdit(r))}</td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            {list.length === 0 && <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', color: '#9ca3af', padding: 24 }}>No properties{query ? ` match “${query}”` : ''}.</td></tr>}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: NAVY }}>Market &amp; Strategy Notes</summary>
        <ul style={{ margin: '12px 0 2px', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {FL_STRATEGY_NOTES.map((n, i) => <li key={i} style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>{n}</li>)}
        </ul>
      </details>
    </div>
  )
}

// =============================== ROW EDITOR ===============================
const mLbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4, display: 'block' }
const mInp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#111827' }

function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <div style={{ gridColumn: span ? '1 / -1' : undefined }}><label style={mLbl}>{label}</label>{children}</div>
}

function RowEditor({ draft, onChange, onClose, onSave, onDelete, saving }: {
  draft: Record<string, unknown>; onChange: (k: string, v: unknown) => void; onClose: () => void; onSave: () => void; onDelete: () => void; saving: boolean
}) {
  const state = draft._state as 'TX' | 'FL'
  const t = (k: string) => (draft[k] == null ? '' : String(draft[k]))
  const inp = (k: string, ph = '') => <input style={mInp} value={t(k)} placeholder={ph} onChange={(e) => onChange(k, e.target.value)} />
  const area = (k: string) => <textarea style={{ ...mInp, minHeight: 56, resize: 'vertical' }} value={t(k)} onChange={(e) => onChange(k, e.target.value)} />
  const sel = (k: string, opts: string[]) => <select style={mInp} value={t(k)} onChange={(e) => onChange(k, e.target.value)}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,45,82,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY }}>{draft._id ? 'Edit row' : 'Add row'} — {state}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>×</button>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {state === 'TX' ? (
            <>
              <Field label="Kind">{sel('kind', ['pipeline', 'market'])}</Field>
              <Field label="Status (moves the row)">{sel('status', CATEGORIES)}</Field>
              <Field label="Location">{inp('location')}</Field>
              <Field label="Owner">{inp('owner')}</Field>
              <Field label="Address" span>{inp('address')}</Field>
              <Field label="Tenant">{inp('tenant')}</Field>
              <Field label="Source">{inp('source')}</Field>
              <Field label="Price ($)">{inp('price')}</Field>
              <Field label="$ / SF">{inp('pricePsf')}</Field>
              <Field label="Yield (decimal, e.g. 0.09)">{inp('yield')}</Field>
              <Field label="Acreage">{inp('acreage')}</Field>
              <Field label="Sq. Ft.">{inp('sqft')}</Field>
              <Field label="Year Built">{inp('yearBuilt')}</Field>
              <Field label="Next Steps" span>{area('nextSteps')}</Field>
              <Field label="Notes / Comments" span>{area('notes')}</Field>
            </>
          ) : (
            <>
              <Field label="Section (moves the row)">{sel('section', CATEGORIES)}</Field>
              <Field label="Status">{inp('status')}</Field>
              <Field label="Name" span>{inp('name')}</Field>
              <Field label="Source">{inp('source')}</Field>
              <Field label="Property Type">{inp('propertyType')}</Field>
              <Field label="Location">{inp('location')}</Field>
              <Field label="Year Built">{inp('yearBuilt')}</Field>
              <Field label="Units">{inp('units')}</Field>
              <Field label="Occupancy (decimal)">{inp('occupancy')}</Field>
              <Field label="Cap Rate (decimal)">{inp('capRate')}</Field>
              <Field label="SQFT">{inp('sqft')}</Field>
              <Field label="Acres">{inp('acres')}</Field>
              <Field label="Purchase Price ($)">{inp('price')}</Field>
              <Field label="PSF / P-Acre">{inp('psf')}</Field>
              <Field label="Notes / Status" span>{area('notes')}</Field>
            </>
          )}
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>{draft._id ? <button onClick={onDelete} style={{ background: 'none', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}>Delete</button> : null}</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Numeric fields we coerce back to numbers on save (blank → null); everything else stays a string.
const TX_NUM = new Set(['price', 'pricePsf', 'yield'])
function coerce(state: 'TX' | 'FL', data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data }
  const nums = state === 'TX' ? TX_NUM : new Set<string>()
  for (const k of Object.keys(out)) {
    if (k.startsWith('_')) { delete out[k]; continue }
    if (nums.has(k)) { const s = String(out[k] ?? '').replace(/[^0-9.\-]/g, ''); out[k] = s === '' ? null : Number(s) }
    else if (out[k] === '') out[k] = state === 'TX' ? '' : null
  }
  return out
}

// =============================== SHELL ===============================
export default function DealPipelineView() {
  const [mode, setMode] = useState<'mirror' | 'live'>('mirror')
  const [stateTab, setStateTab] = useState<'TX' | 'FL'>('TX')
  const [query, setQuery] = useState('')
  const [showMarket, setShowMarket] = useState(false)
  const [txRows, setTxRows] = useState<TxRowE[]>([])
  const [flRows, setFlRows] = useState<FlRowE[]>([])
  const [loading, setLoading] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null)
  const [saving, setSaving] = useState(false)

  async function load(state: 'TX' | 'FL') {
    setLoading(true)
    try {
      const r = await fetch(`/api/deal-pipeline/mirror?state=${state}`)
      const d = await r.json()
      if (r.ok) {
        const rows = (d.items ?? []).map((it: { id: string; data: Record<string, unknown> }) => ({ _id: it.id, ...it.data }))
        if (state === 'TX') setTxRows(rows as TxRowE[]); else setFlRows(rows as FlRowE[])
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { if (mode === 'mirror') load(stateTab) }, [mode, stateTab])

  const save = async () => {
    if (!draft || saving) return
    setSaving(true)
    const state = draft._state as 'TX' | 'FL'
    const data = coerce(state, draft)
    try {
      if (draft._id) await fetch('/api/deal-pipeline/mirror', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: draft._id, data }) })
      else await fetch('/api/deal-pipeline/mirror', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, data }) })
      setDraft(null); await load(state)
    } finally { setSaving(false) }
  }
  const del = async () => {
    if (!draft?._id) return
    setSaving(true)
    try { await fetch(`/api/deal-pipeline/mirror?id=${encodeURIComponent(String(draft._id))}`, { method: 'DELETE' }); setDraft(null); await load(stateTab) }
    finally { setSaving(false) }
  }
  function exportCsv() {
    const rows: Record<string, unknown>[] = stateTab === 'TX' ? txRows : flRows
    if (!rows.length) return
    const cols = stateTab === 'TX'
      ? ['status', 'location', 'owner', 'address', 'tenant', 'source', 'price', 'pricePsf', 'yield', 'acreage', 'sqft', 'yearBuilt', 'nextSteps', 'notes', 'kind']
      : ['section', 'name', 'status', 'source', 'propertyType', 'location', 'yearBuilt', 'units', 'occupancy', 'capRate', 'sqft', 'acres', 'price', 'psf', 'notes']
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const lines = [cols.join(',')]
    rows.forEach((r) => lines.push(cols.map((c) => esc(r[c])).join(',')))
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ERP-${stateTab}-Pipeline-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  const move = async (r: TxRowE | FlRowE, field: 'status' | 'section', cat: string) => {
    const { _id, ...data } = r as Record<string, unknown> & { _id: string }
    await fetch('/api/deal-pipeline/mirror', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: _id, data: { ...data, [field]: cat } }) })
    await load(stateTab)
  }
  const openEdit = (r: TxRowE | FlRowE) => setDraft({ ...r, _state: stateTab })
  const openAdd = () => setDraft(stateTab === 'TX' ? { _state: 'TX', kind: 'pipeline', status: 'Under Review' } : { _state: 'FL', section: 'Under Review' })

  const txPipeline = txRows.filter((r) => r.kind === 'pipeline')
  const txMarket = txRows.filter((r) => r.kind === 'market')
  const txActive = txPipeline.filter((r) => ['Under Contract', 'Contract Negotiations', 'Under Review'].includes(r.status)).length
  const txPending = txPipeline.filter((r) => r.status === 'Prospects').length
  const flTargets = flRows.filter((r) => r.section === 'Under Review' || r.section === 'Prospects').length

  const asOf = stateTab === 'TX' ? TX_AS_OF : FL_AS_OF
  const meta = stateTab === 'TX'
    ? { title: 'Permian Basin', sub: 'Midland / Odessa, TX', file: 'ERP TX Pipeline & Market Analysis' }
    : { title: 'Brevard / Space Coast', sub: 'Melbourne / Palm Bay / Titusville, FL', file: 'ERP FL Pipeline & Comp Summary' }

  const kpi = (label: string, value: string, color?: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || NAVY, marginTop: 4 }}>{value}</div>
    </div>
  )
  const tab = (id: 'TX' | 'FL', label: string, sub: string) => (
    <button onClick={() => setStateTab(id)} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', border: stateTab === id ? `2px solid ${NAVY}` : '1px solid #e2e8f0', background: stateTab === id ? '#eef4ff' : '#fff' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: stateTab === id ? NAVY : '#334155' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>
    </button>
  )
  const modeBtn = (id: 'mirror' | 'live', label: string) => (
    <button onClick={() => setMode(id)} style={{ padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, border: mode === id ? `1px solid ${NAVY}` : '1px solid #e2e8f0', background: mode === id ? NAVY : '#fff', color: mode === id ? '#fff' : '#64748b' }}>{label}</button>
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Deal Pipeline</h2>
          <p>{mode === 'mirror'
            ? 'Editable acquisition pipeline (from the ERP workbooks), separated by market. Edit any row — change Status (TX) / Section (FL) to move it between groups.'
            : 'Editable, portal-managed pipeline (Sourcing → Closed) — feeds the Acquisition Economics views. Auto-add fit inbound listings, or add deals manually.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{modeBtn('mirror', '📊 Workbook')}{modeBtn('live', '✏️ Live Tracker')}</div>
      </div>

      {mode === 'live' ? <PipelineLiveTracker /> : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {tab('TX', '🛢️  Texas — Permian Basin', 'Midland / Odessa · Pipeline & Market Analysis')}
            {tab('FL', '🚀  Florida — Brevard', 'Space Coast · Pipeline & Comp Summary')}
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {stateTab === 'TX' ? (
              <>{kpi('Pipeline Deals', String(txPipeline.length))}{kpi('Under Review+', String(txActive), '#2563eb')}{kpi('Prospects', String(txPending), '#d97706')}{kpi('Submarket Inventory', String(txMarket.length), '#0e7490')}</>
            ) : (
              <>{kpi('Total Records', String(flRows.length))}{kpi('Targets + Prospects', String(flTargets), '#2563eb')}{kpi('Comparables', String(flRows.filter((r) => r.section.startsWith('Comparable')).length), '#6b7280')}</>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              <span style={{ fontWeight: 700, color: NAVY }}>{meta.title}</span> · {meta.sub}
              <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>Source: <span style={{ fontStyle: 'italic' }}>{meta.file}</span>
              <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>As of {asOf}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {stateTab === 'TX' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
                  <input type="checkbox" checked={showMarket} onChange={(e) => setShowMarket(e.target.checked)} />Show submarket inventory
                </label>
              )}
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address, owner, tenant…" style={{ fontSize: 12.5, padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: 8, width: 220, maxWidth: '100%' }} />
              <button onClick={exportCsv} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>⬇ Export</button>
              <button onClick={openAdd} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add row</button>
            </div>
          </div>

          {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
            : stateTab === 'TX' ? <TexasPipeline rows={txRows} query={query} showMarket={showMarket} onEdit={openEdit} onMove={(r, cat) => move(r, 'status', cat)} />
              : <FloridaPipeline rows={flRows} query={query} onEdit={openEdit} onMove={(r, cat) => move(r, 'section', cat)} />}
        </>
      )}

      {draft && <RowEditor draft={draft} onChange={(k, v) => setDraft((d) => (d ? { ...d, [k]: v } : d))} onClose={() => setDraft(null)} onSave={save} onDelete={del} saving={saving} />}
    </div>
  )
}
