'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { TX_AS_OF, FL_AS_OF, FL_STRATEGY_NOTES, type TxRow, type FlRow, type AiRec } from '../lib/data/dealPipelineData'
import { downloadXlsx, shapeRows } from '../lib/exportXlsx'

// Deal Pipeline — the two ERP workbooks (TX Permian, FL Space Coast), now editable and portal-managed.
// Rows live in pipeline_rows (via /api/deal-pipeline/mirror), seeded once from the generated workbook
// data. Edit a row to change any field — including Status (TX) / Section (FL), which moves it between
// groups (e.g. Target → Prospects, Active → Pending → Decline). The Live Tracker (separate table)
// still backs the Acquisition Economics views.

const NAVY = '#0D2D52'

// Unified category scheme (matches the FL spreadsheet) — groups BOTH boards: TX by `status`, FL by `section`.
// Archive is a disposition, not a stage — set a row to it to move the row into the muted Archive band.
const CATEGORIES = ['Under Review', 'Prospects', 'Comparables', 'Archive']
const CAT_COLOR: Record<string, string> = { 'Under Review': '#2563eb', 'Prospects': '#d97706', 'Comparables': '#6b7280', 'Archive': '#94a3b8' }

const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)
const money = (v: unknown) => (isNum(v) ? `$${Math.round(v).toLocaleString('en-US')}` : v ? String(v) : '—')
const psf = (v: unknown) => (isNum(v) ? `$${v.toFixed(2)}` : v ? String(v) : '—')
const pct = (v: unknown) => (isNum(v) ? `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%` : v ? String(v) : '—')
const num = (v: unknown) => (isNum(v) ? v.toLocaleString('en-US') : v ? String(v) : '—')
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

// Listing URL — a first-class clickable field. Falls back to a URL embedded in notes,
// so rows moved over before listingUrl existed still surface their link.
const URL_RE = /(https?:\/\/[^\s]+)/i
const findUrl = (r: { listingUrl?: string | null; notes?: string }): string | null => {
  if (r.listingUrl && /^https?:\/\//i.test(r.listingUrl)) return r.listingUrl
  const m = (r.notes || '').match(URL_RE)
  return m ? m[1] : null
}
const cleanNotes = (notes?: string) => (notes || '').replace(URL_RE, '').replace(/\s*[—–-]\s*$/, '').trim()
const listingLink = (url: string | null) => url
  ? <a href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', wordBreak: 'break-all' }}>🔗 Open listing ↗</a>
  : <span style={{ color: '#cbd5e1' }}>—</span>

const TH: React.CSSProperties = { position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9', color: '#334155', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px', textAlign: 'left', padding: '7px 9px', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '6px 9px', fontSize: 12, color: '#1f2937', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' }
const numTD: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

// First column stays pinned while the rest of the wide board scrolls horizontally, so the row you're
// reading never loses its identity (Location / Name). Body cells must carry the row's own background.
const STICKY_TH: React.CSSProperties = { ...TH, left: 0, zIndex: 3, boxShadow: '2px 0 0 #e2e8f0' }
const stickyTD = (bg: string): React.CSSProperties => ({ position: 'sticky', left: 0, zIndex: 1, background: bg, boxShadow: '2px 0 0 #eef2f7' })

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
// Quick archive / restore for a row — toggles its group to/from Archive without opening the editor.
const archiveBtn = (isArchived: boolean, onClick: () => void) => (
  <button onClick={(e) => { e.stopPropagation(); onClick() }} title={isArchived ? 'Restore to Under Review' : 'Archive this deal'}
    style={{ background: 'none', border: `1px solid ${isArchived ? '#cbd5e1' : '#e2e8f0'}`, borderRadius: 6, padding: '2px 9px', fontSize: 11, cursor: 'pointer', color: '#64748b', whiteSpace: 'nowrap', marginRight: 6 }}>{isArchived ? '↩ Restore' : '🗄 Archive'}</button>
)

// Inline category dropdown — changing it moves the row between groups (decline/move), no save needed.
const catSelect = (val: string | null | undefined, onChange: (v: string) => void) => (
  <select value={val ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); onChange(e.target.value) }}
    style={{ fontSize: 11, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', maxWidth: 168 }}>
    <option value="">—</option>
    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
  </select>
)

// ── AI recommendation UI ──
const REC_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Pursue: { bg: '#f0fdf4', color: '#16a34a', border: '#86efac' },
  Watch: { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  Pass: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
}
function RecBadge({ rec, loading }: { rec?: AiRec | null; loading?: boolean }) {
  if (loading) return <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>Analyzing…</span>
  if (!rec) return <span style={{ fontSize: 11, color: '#cbd5e1' }}>—</span>
  const s = REC_STYLE[rec.verdict] ?? REC_STYLE.Pass
  return <span title={rec.rationale} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>✨ {rec.verdict}</span>
}
// One label/value pair inside an expanded detail card.
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: '#1f2937', whiteSpace: 'pre-line' }}>{children}</div>
    </div>
  )
}
// The AI-recommendation panel inside an expanded card — shows the verdict + rationale and a (re)generate button.
function RecPanel({ rec, loading, onGen }: { rec?: AiRec | null; loading?: boolean; onGen: () => void }) {
  const s = rec ? (REC_STYLE[rec.verdict] ?? REC_STYLE.Pass) : null
  return (
    <div style={{ gridColumn: '1 / -1', marginTop: 4, padding: '10px 12px', borderRadius: 8, background: s ? s.bg : '#f8fafc', border: `1px solid ${s ? s.border : '#e2e8f0'}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: rec ? 6 : 0 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px' }}>✨ AI Recommendation</span>
        {rec && <span style={{ fontSize: 11.5, fontWeight: 800, color: s!.color }}>{rec.verdict}</span>}
        <button onClick={(e) => { e.stopPropagation(); onGen() }} disabled={loading}
          style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, padding: '3px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: loading ? 'default' : 'pointer', opacity: loading ? .6 : 1 }}>
          {loading ? 'Analyzing…' : rec ? '↻ Refresh' : '✨ Generate'}
        </button>
      </div>
      {rec && <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{rec.rationale}</div>}
      {!rec && !loading && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>No recommendation yet — generate one to screen this deal against the buy box.</span>}
    </div>
  )
}

// =============================== TEXAS ===============================
function TexasPipeline({ rows, query, showMarket, onEdit, onMove, onRecommend, reccing }: { rows: TxRowE[]; query: string; showMarket: boolean; onEdit: (r: TxRowE) => void; onMove: (r: TxRowE, cat: string) => void; onRecommend: (r: TxRowE) => void; reccing: string | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const match = (r: TxRow) => !q || [r.location, r.owner, r.address, r.tenant, r.source, r.notes, r.nextSteps].join(' ').toLowerCase().includes(q)
  const pipeline = useMemo(() => rows.filter((r) => r.kind === 'pipeline' && match(r)), [rows, q])
  const market = useMemo(() => rows.filter((r) => r.kind === 'market' && match(r)), [rows, q])
  // Compact row — the rest of the fields live in the expand-on-click card below each row.
  const cols = ['', 'Address', 'Price', '$ PSF', 'Listing', '']
  const rightCols = new Set(['Price', '$ PSF'])
  const marketByLoc = useMemo(() => {
    const m = new Map<string, TxRowE[]>()
    for (const r of market) { const k = r.location || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [market])

  const dataRow = (r: TxRowE, i: number) => {
    const isOpen = open === r._id
    const bg = isOpen ? '#f0f9ff' : i % 2 ? '#fbfcfe' : '#fff'
    return (
      <React.Fragment key={r._id}>
        <tr style={{ background: bg, cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r._id)}>
          <td style={{ ...TD, ...stickyTD(bg), width: 24, textAlign: 'center', color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</td>
          <td style={{ ...TD, fontWeight: 600, color: NAVY, minWidth: 210, whiteSpace: 'pre-line' }}>
            {txt(r.address)}
            <div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>{r._src === 'inbound' ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Archive · from inbound</span> : catSelect(r.status, (v) => onMove(r, v))}</div>
          </td>
          <td style={{ ...numTD, fontWeight: 600 }}>{money(r.price)}</td>
          <td style={numTD}>{psf(r.pricePsf)}</td>
          <td style={TD}>{listingLink(findUrl(r))}</td>
          <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>{r._src === 'inbound' ? null : editBtn(() => onEdit(r))}</td>
        </tr>
        {isOpen && (
          <tr style={{ background: '#f0f9ff' }}>
            <td colSpan={cols.length} style={{ padding: '14px 20px', borderBottom: '2px solid #bae6fd' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
                <Detail label="Location">{txt(r.location)}</Detail>
                <Detail label="Owner">{txt(r.owner)}</Detail>
                <Detail label="Tenant">{txt(r.tenant)}</Detail>
                <Detail label="Source">{txt(r.source)}</Detail>
                <Detail label="% Yield">{pct(r.yield)}</Detail>
                <Detail label="Acreage">{num(r.acreage)}</Detail>
                <Detail label="Sq. Ft.">{num(r.sqft)}</Detail>
                <Detail label="Year Built">{txt(r.yearBuilt)}</Detail>
                <Detail label="Next Steps">{txt(r.nextSteps)}</Detail>
                <Detail label="Notes / Comments">{txt(cleanNotes(r.notes))}</Detail>
                {r._src !== 'inbound' && <RecPanel rec={r.aiRec} loading={reccing === r._id} onGen={() => onRecommend(r)} />}
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    )
  }

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={i === 0 ? STICKY_TH : rightCols.has(c) ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr></thead>
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
function FloridaPipeline({ rows, query, onEdit, onMove, onRecommend, reccing }: { rows: FlRowE[]; query: string; onEdit: (r: FlRowE) => void; onMove: (r: FlRowE, cat: string) => void; onRecommend: (r: FlRowE) => void; reccing: string | null }) {
  const [open, setOpen] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const match = (r: FlRow) => !q || [r.name, r.status, r.source, r.propertyType, r.location, r.notes].join(' ').toLowerCase().includes(q)
  const list = useMemo(() => rows.filter(match), [rows, q])
  // Compact row — the rest of the fields live in the expand-on-click card below each row.
  const cols = ['', 'Name', 'Property Type', 'Purchase Price', 'PSF / P-Acre', 'Listing', '']
  const rightCols = new Set(['Purchase Price', 'PSF / P-Acre'])
  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 760 }}>
          <thead><tr>{cols.map((c, i) => <th key={i} style={i === 0 ? STICKY_TH : rightCols.has(c) ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr></thead>
          <tbody>
            {CATEGORIES.map((sec) => {
              const g = list.filter((r) => r.section === sec)
              if (!g.length) return null
              return (
                <React.Fragment key={sec}>
                  <tr><td colSpan={cols.length} style={{ padding: 0 }}><StatusBand label={sec} color={CAT_COLOR[sec] || '#6b7280'} count={g.length} /></td></tr>
                  {g.map((r, i) => {
                    const isOpen = open === r._id
                    const bg = isOpen ? '#f0f9ff' : i % 2 ? '#fbfcfe' : '#fff'
                    return (
                      <React.Fragment key={r._id}>
                        <tr style={{ background: bg, cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r._id)}>
                          <td style={{ ...TD, ...stickyTD(bg), width: 24, textAlign: 'center', color: '#94a3b8' }}>{isOpen ? '▲' : '▼'}</td>
                          <td style={{ ...TD, fontWeight: 600, color: NAVY, minWidth: 190, whiteSpace: 'pre-line' }}>{txt(r.name)}<div style={{ marginTop: 4 }} onClick={(e) => e.stopPropagation()}>{r._src === 'inbound' ? <span style={{ fontSize: 11, color: '#94a3b8' }}>Archive · from inbound</span> : catSelect(r.section, (v) => onMove(r, v))}</div></td>
                          <td style={TD}>{txt(r.propertyType)}</td>
                          <td style={{ ...numTD, fontWeight: 600 }}>{money(r.price)}</td>
                          <td style={numTD}>{isNum(r.psf) ? psf(r.psf) : txt(r.psf)}</td>
                          <td style={TD}>{listingLink(findUrl(r))}</td>
                          <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>{r._src === 'inbound' ? null : editBtn(() => onEdit(r))}</td>
                        </tr>
                        {isOpen && (
                          <tr style={{ background: '#f0f9ff' }}>
                            <td colSpan={cols.length} style={{ padding: '14px 20px', borderBottom: '2px solid #bae6fd' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
                                <Detail label="Status">{txt(r.status)}</Detail>
                                <Detail label="Source">{txt(r.source)}</Detail>
                                <Detail label="Location">{txt(r.location)}</Detail>
                                <Detail label="Year Built">{txt(r.yearBuilt)}</Detail>
                                <Detail label="Units">{num(r.units)}</Detail>
                                <Detail label="Occupancy">{pct(r.occupancy)}</Detail>
                                <Detail label="Cap Rate">{pct(r.capRate)}</Detail>
                                <Detail label="SQFT">{num(r.sqft)}</Detail>
                                <Detail label="Acres">{num(r.acres)}</Detail>
                                <Detail label="Notes / Status">{txt(cleanNotes(r.notes))}</Detail>
                                {r._src !== 'inbound' && <RecPanel rec={r.aiRec} loading={reccing === r._id} onGen={() => onRecommend(r)} />}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
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
              <Field label="Listing URL" span>{inp('listingUrl', 'https://…')}</Field>
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
              <Field label="Listing URL" span>{inp('listingUrl', 'https://…')}</Field>
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
  useEffect(() => { load(stateTab) }, [stateTab])

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
  const [exporting, setExporting] = useState(false)
  async function exportExcel() {
    if (exporting) return
    setExporting(true)
    try {
      // Pull both boards fresh so the workbook is complete no matter which tab is active.
      const fetchRows = async (state: 'TX' | 'FL') => {
        try { const r = await fetch(`/api/deal-pipeline/mirror?state=${state}`); const d = await r.json(); return r.ok ? (d.items ?? []).map((it: { data: Record<string, unknown> }) => it.data) : [] }
        catch { return [] }
      }
      const [tx, fl] = await Promise.all([fetchRows('TX'), fetchRows('FL')])
      const txCols: [string, string][] = [['kind', 'Board'], ['status', 'Status'], ['location', 'Location'], ['owner', 'Owner'], ['address', 'Address'], ['tenant', 'Tenant'], ['source', 'Source'], ['price', 'Price'], ['pricePsf', '$ PSF'], ['yield', '% Yield'], ['acreage', 'Acreage'], ['sqft', 'Sq Ft'], ['yearBuilt', 'Year Built'], ['nextSteps', 'Next Steps'], ['notes', 'Notes']]
      const flCols: [string, string][] = [['section', 'Section'], ['name', 'Name'], ['status', 'Status'], ['source', 'Source'], ['propertyType', 'Property Type'], ['location', 'Location'], ['yearBuilt', 'Year Built'], ['units', 'Units'], ['occupancy', 'Occupancy'], ['capRate', 'Cap Rate'], ['sqft', 'Sq Ft'], ['acres', 'Acres'], ['price', 'Price'], ['psf', 'PSF'], ['notes', 'Notes']]
      await downloadXlsx(
        [{ name: 'Texas — Permian', rows: shapeRows(tx, txCols) }, { name: 'Florida — Brevard', rows: shapeRows(fl, flCols) }],
        `ERP-Deal-Pipeline-${new Date().toISOString().slice(0, 10)}.xlsx`,
      )
    } finally { setExporting(false) }
  }
  const move = async (r: TxRowE | FlRowE, field: 'status' | 'section', cat: string) => {
    const { _id, ...data } = r as Record<string, unknown> & { _id: string }
    await fetch('/api/deal-pipeline/mirror', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: _id, data: { ...data, [field]: cat } }) })
    await load(stateTab)
  }
  const openEdit = (r: TxRowE | FlRowE) => setDraft({ ...r, _state: stateTab })
  const openAdd = () => setDraft(stateTab === 'TX' ? { _state: 'TX', kind: 'pipeline', status: 'Under Review' } : { _state: 'FL', section: 'Under Review' })

  // Generate (or refresh) an AI recommendation for a single row and cache it on the row's data.
  const [reccing, setReccing] = useState<string | null>(null)
  const recommend = async (r: TxRowE | FlRowE) => {
    if (reccing) return
    const { _id, aiRec: _drop, ...data } = r as Record<string, unknown> & { _id: string }
    setReccing(_id)
    try {
      const res = await fetch('/api/deal-pipeline/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal: data, market: stateTab }) })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.verdict) {
        const newData = { ...data, aiRec: { verdict: d.verdict, rationale: d.rationale ?? '', at: new Date().toISOString() } }
        await fetch('/api/deal-pipeline/mirror', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: _id, data: newData }) })
        await load(stateTab)
      }
    } finally { setReccing(null) }
  }

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
  return (
    <div>
      <div className="page-header">
        <h2>Deal Pipeline</h2>
        <p>Editable acquisition pipeline (from the ERP workbooks), separated by market. Edit any row — change Status (TX) / Section (FL) to move it between groups.</p>
      </div>

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
          <button onClick={exportExcel} disabled={exporting} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #0D2D52', background: '#fff', color: '#0D2D52', cursor: exporting ? 'default' : 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', opacity: exporting ? .6 : 1 }}>{exporting ? 'Exporting…' : '⬇ Export Excel'}</button>
          <button onClick={openAdd} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap' }}>+ Add row</button>
        </div>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Loading…</div>
        : stateTab === 'TX' ? <TexasPipeline rows={txRows} query={query} showMarket={showMarket} onEdit={openEdit} onMove={(r, cat) => move(r, 'status', cat)} onRecommend={recommend} reccing={reccing} />
          : <FloridaPipeline rows={flRows} query={query} onEdit={openEdit} onMove={(r, cat) => move(r, 'section', cat)} onRecommend={recommend} reccing={reccing} />}

      {draft && <RowEditor draft={draft} onChange={(k, v) => setDraft((d) => (d ? { ...d, [k]: v } : d))} onClose={() => setDraft(null)} onSave={save} onDelete={del} saving={saving} />}
    </div>
  )
}
