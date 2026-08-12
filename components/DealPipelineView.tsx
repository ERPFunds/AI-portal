'use client'

import React, { useMemo, useState } from 'react'
import {
  TX_ROWS, FL_ROWS, TX_AS_OF, FL_AS_OF, FL_STRATEGY_NOTES,
  type TxRow, type FlRow,
} from '../lib/data/dealPipelineData'
import PipelineLiveTracker from './PipelineLiveTracker'

// Deal Pipeline — mirrors the two ERP deal-pipeline workbooks kept in SharePoint (ERP Deal Pipelines/):
//   • TX — "ERP TX Pipeline & Market Analysis" (Permian Basin — Midland/Odessa)
//   • FL — "ERP FL Pipeline & Comp Summary" (Brevard / Space Coast)
// Laid out like the spreadsheets (grouped, tabular), separated by state. Data is sourced from
// lib/data/dealPipelineData.ts (auto-generated from the workbooks). Regenerate that file when the
// workbooks change. The live portal-managed tracker still lives behind /api/deal-pipeline and feeds
// the Acquisition Economics views — this section is the workbook mirror.

const NAVY = '#0D2D52'

// ---- status palette (matches the workbook legends) ----
const TX_STATUS_ORDER = ['Under Contract', 'Active', 'Pending', 'Decline']
const TX_STATUS_COLOR: Record<string, string> = {
  'Under Contract': '#059669', 'Active': '#2563eb', 'Pending': '#d97706', 'Decline': '#6b7280',
}
const TX_STATUS_DESC: Record<string, string> = {
  'Under Contract': 'Contract signed', 'Active': 'Pursuing', 'Pending': 'Investigating', 'Decline': 'Passed',
}
const FL_SECTION_ORDER = [
  'Under Contract', 'Contract Negotiations', 'Targets / Under Review', 'Prospects',
  'Comparable — Multi-Tenant', 'Comparable — Single-Tenant', 'Comparable — Vacant Land',
]
const FL_SECTION_COLOR: Record<string, string> = {
  'Under Contract': '#059669', 'Contract Negotiations': '#0ea5e9', 'Targets / Under Review': '#2563eb',
  'Prospects': '#d97706', 'Comparable — Multi-Tenant': '#6b7280', 'Comparable — Single-Tenant': '#6b7280',
  'Comparable — Vacant Land': '#6b7280',
}

// ---- formatters ----
const isNum = (v: unknown): v is number => typeof v === 'number' && !Number.isNaN(v)
const money = (v: unknown) => (isNum(v) ? `$${Math.round(v).toLocaleString('en-US')}` : v ? String(v) : '—')
const psf = (v: unknown) => (isNum(v) ? `$${v.toFixed(2)}` : v ? String(v) : '—')
const pct = (v: unknown) => (isNum(v) ? `${(v * 100).toFixed(v * 100 % 1 === 0 ? 0 : 1)}%` : v ? String(v) : '—')
const num = (v: unknown) => (isNum(v) ? v.toLocaleString('en-US') : v ? String(v) : '—')
const txt = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v))

// ---- shared cell styles ----
const TH: React.CSSProperties = {
  position: 'sticky', top: 0, zIndex: 2, background: '#f1f5f9', color: '#334155',
  fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px',
  textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #cbd5e1', whiteSpace: 'nowrap',
}
const TD: React.CSSProperties = {
  padding: '7px 10px', fontSize: 12, color: '#1f2937', borderBottom: '1px solid #eef2f7',
  verticalAlign: 'top',
}
const numTD: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

// Note/Next-Steps cell: a compact one-line preview by default (so it doesn't dominate the table),
// click to open the full text inline. Each cell owns its expanded state.
function NoteCell({ text, minWidth = 130 }: { text: string; minWidth?: number }) {
  const [open, setOpen] = useState(false)
  if (!text) return <td style={{ ...TD, color: '#cbd5e1' }}>—</td>
  return (
    <td
      onClick={() => setOpen((o) => !o)}
      title={open ? 'Click to collapse' : text}
      style={{
        ...TD, fontSize: 11.5, color: '#4b5563', cursor: 'pointer', minWidth,
        maxWidth: open ? 520 : 210,
        whiteSpace: open ? 'pre-line' : 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis',
      }}
    >
      {text}
      {!open && <span style={{ color: '#94a3b8', marginLeft: 4 }}>▸</span>}
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

// =============================== TEXAS ===============================
function TexasPipeline({ query, showMarket }: { query: string; showMarket: boolean }) {
  const q = query.trim().toLowerCase()
  const match = (r: TxRow) =>
    !q || [r.location, r.owner, r.address, r.tenant, r.source, r.notes, r.nextSteps].join(' ').toLowerCase().includes(q)

  const pipeline = useMemo(() => TX_ROWS.filter((r) => r.kind === 'pipeline' && match(r)), [q])
  const market = useMemo(() => TX_ROWS.filter((r) => r.kind === 'market' && match(r)), [q])

  const cols = ['Location', 'Owner', 'Address', 'Tenant', 'Source', 'Price', '$ PSF', '% Yield', 'Acreage', 'Sq. Ft.', 'Year Built', 'Next Steps', 'Notes / Comments']

  const marketByLoc = useMemo(() => {
    const m = new Map<string, TxRow[]>()
    for (const r of market) { const k = r.location || 'Other'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r) }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [market])

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1180 }}>
          <thead>
            <tr>{cols.map((c) => <th key={c} style={c === 'Price' || c === '$ PSF' || c === '% Yield' || c === 'Acreage' || c === 'Sq. Ft.' ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {TX_STATUS_ORDER.map((st) => {
              const rows = pipeline.filter((r) => r.status === st)
              if (!rows.length) return null
              const color = TX_STATUS_COLOR[st]
              return (
                <React.Fragment key={st}>
                  <tr><td colSpan={cols.length} style={{ padding: 0 }}><StatusBand label={st} color={color} count={rows.length} sub={TX_STATUS_DESC[st]} /></td></tr>
                  {rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                      <td style={{ ...TD, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>{txt(r.location)}</td>
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
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            {pipeline.length === 0 && (
              <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', color: '#9ca3af', padding: 24 }}>No pipeline deals match “{query}”.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Submarket inventory (the workbook's Market Analysis rows) */}
      {showMarket && marketByLoc.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Market Analysis — Submarket Inventory</div>
          <div style={{ fontSize: 11.5, color: '#64748b', marginBottom: 10 }}>
            Every industrial property tracked in the target submarkets ({market.length} rows) — untagged inventory from the workbook, not active deals.
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1000 }}>
              <thead>
                <tr>{['Owner', 'Address', 'Tenant', 'Acreage', 'Sq. Ft.', 'Year Built', 'Notes'].map((c) =>
                  <th key={c} style={c === 'Acreage' || c === 'Sq. Ft.' ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {marketByLoc.map(([loc, rows]) => (
                  <React.Fragment key={loc}>
                    <tr><td colSpan={7} style={{ padding: '7px 12px', background: '#f8fafc', fontSize: 12, fontWeight: 700, color: '#475569', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>{loc} <span style={{ fontWeight: 500, color: '#94a3b8' }}>· {rows.length}</span></td></tr>
                    {rows.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                        <td style={TD}>{txt(r.owner)}</td>
                        <td style={{ ...TD, minWidth: 170 }}>{txt(r.address)}</td>
                        <td style={TD}>{txt(r.tenant)}</td>
                        <td style={numTD}>{num(r.acreage)}</td>
                        <td style={numTD}>{num(r.sqft)}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{txt(r.yearBuilt)}</td>
                        <NoteCell text={r.notes} />
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
function FloridaPipeline({ query }: { query: string }) {
  const q = query.trim().toLowerCase()
  const match = (r: FlRow) =>
    !q || [r.name, r.status, r.source, r.propertyType, r.location, r.notes].join(' ').toLowerCase().includes(q)
  const rows = useMemo(() => FL_ROWS.filter(match), [q])

  const cols = ['Name', 'Status', 'Source', 'Property Type', 'Location', 'Year Built', 'Units', 'Occup.', 'Cap Rate', 'SQFT', 'Acres', 'Purchase Price', 'PSF / P-Acre', 'Notes / Status']
  const rightCols = new Set(['Year Built', 'Units', 'Occup.', 'Cap Rate', 'SQFT', 'Acres', 'Purchase Price', 'PSF / P-Acre'])

  return (
    <div>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1240 }}>
          <thead>
            <tr>{cols.map((c) => <th key={c} style={rightCols.has(c) ? { ...TH, textAlign: 'right' } : TH}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {FL_SECTION_ORDER.map((sec) => {
              const secRows = rows.filter((r) => r.section === sec)
              if (!secRows.length) return null
              const color = FL_SECTION_COLOR[sec] || '#6b7280'
              return (
                <React.Fragment key={sec}>
                  <tr><td colSpan={cols.length} style={{ padding: 0 }}><StatusBand label={sec} color={color} count={secRows.length} /></td></tr>
                  {secRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#fbfcfe' : '#fff' }}>
                      <td style={{ ...TD, fontWeight: 600, color: NAVY, minWidth: 170, whiteSpace: 'pre-line' }}>{txt(r.name)}</td>
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
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length} style={{ ...TD, textAlign: 'center', color: '#9ca3af', padding: 24 }}>No properties match “{query}”.</td></tr>
            )}
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

// =============================== SHELL ===============================
export default function DealPipelineView() {
  const [mode, setMode] = useState<'mirror' | 'live'>('mirror')
  const [stateTab, setStateTab] = useState<'TX' | 'FL'>('TX')
  const [query, setQuery] = useState('')
  const [showMarket, setShowMarket] = useState(false)

  const txPipeline = TX_ROWS.filter((r) => r.kind === 'pipeline')
  const txMarket = TX_ROWS.filter((r) => r.kind === 'market')
  const txActive = txPipeline.filter((r) => r.status === 'Active' || r.status === 'Under Contract').length
  const txPending = txPipeline.filter((r) => r.status === 'Pending').length
  const flTargets = FL_ROWS.filter((r) => r.section === 'Targets / Under Review' || r.section === 'Prospects').length

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
    <button onClick={() => setStateTab(id)}
      style={{
        flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
        border: stateTab === id ? `2px solid ${NAVY}` : '1px solid #e2e8f0',
        background: stateTab === id ? '#eef4ff' : '#fff',
      }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: stateTab === id ? NAVY : '#334155' }}>{label}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{sub}</div>
    </button>
  )

  const modeBtn = (id: 'mirror' | 'live', label: string) => (
    <button onClick={() => setMode(id)}
      style={{
        padding: '7px 16px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
        border: mode === id ? `1px solid ${NAVY}` : '1px solid #e2e8f0',
        background: mode === id ? NAVY : '#fff', color: mode === id ? '#fff' : '#64748b',
      }}>{label}</button>
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h2>Deal Pipeline</h2>
          <p>{mode === 'mirror'
            ? 'Acquisition pipeline mirrored from the ERP deal-pipeline workbooks, separated by market. Texas and Florida track different fields, so each is shown in its own workbook layout.'
            : 'Editable, portal-managed pipeline (Sourcing → Closed) — feeds the Acquisition Economics views. Auto-add fit inbound listings, or add deals manually.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {modeBtn('mirror', '📊 Workbook Mirror')}
          {modeBtn('live', '✏️ Live Tracker')}
        </div>
      </div>

      {mode === 'live' ? <PipelineLiveTracker /> : (
      <>
      {/* State selector */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {tab('TX', '🛢️  Texas — Permian Basin', 'Midland / Odessa · Pipeline & Market Analysis')}
        {tab('FL', '🚀  Florida — Brevard', 'Space Coast · Pipeline & Comp Summary')}
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {stateTab === 'TX' ? (
          <>
            {kpi('Pipeline Deals', String(txPipeline.length))}
            {kpi('Active / U.C.', String(txActive), '#2563eb')}
            {kpi('Pending', String(txPending), '#d97706')}
            {kpi('Submarket Inventory', String(txMarket.length), '#0e7490')}
          </>
        ) : (
          <>
            {kpi('Total Records', String(FL_ROWS.length))}
            {kpi('Targets + Prospects', String(flTargets), '#2563eb')}
            {kpi('Comparables', String(FL_ROWS.filter((r) => r.section.startsWith('Comparable')).length), '#6b7280')}
          </>
        )}
      </div>

      {/* Context bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          <span style={{ fontWeight: 700, color: NAVY }}>{meta.title}</span> · {meta.sub}
          <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
          Source: <span style={{ fontStyle: 'italic' }}>{meta.file}</span>
          <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
          As of {asOf}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {stateTab === 'TX' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
              <input type="checkbox" checked={showMarket} onChange={(e) => setShowMarket(e.target.checked)} />
              Show submarket inventory
            </label>
          )}
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search address, owner, tenant…"
            style={{ fontSize: 12.5, padding: '7px 11px', border: '1px solid #e2e8f0', borderRadius: 8, width: 240, maxWidth: '100%' }} />
        </div>
      </div>

      {stateTab === 'TX' ? <TexasPipeline query={query} showMarket={showMarket} /> : <FloridaPipeline query={query} />}
      </>
      )}
    </div>
  )
}
