'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// A reusable, configurable directory (list + search + type filter + add/edit/delete modal).
// Used for the Property Contractors and Lenders directories.

export interface DirField { key: string; label: string; kind?: 'text' | 'select' | 'textarea' | 'date'; options?: string[]; full?: boolean; placeholder?: string }
export interface DirColumn { key: string; label: string; kind?: 'name' | 'contact' | 'status' | 'text' | 'date' }
export interface DirConfig {
  eyebrow: string
  title: string
  subtitle?: string
  api: string
  addLabel: string
  accent: string
  typeKey?: string
  typeOptions?: string[]
  statusKey?: string
  columns: DirColumn[]
  fields: DirField[]
  searchKeys: string[]
  /** sessionStorage key another view can set to pre-filter this directory */
  sessionKey?: string
  defaults?: Record<string, string>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function statusStyle(s: string): { color: string; bg: string } {
  if (s === 'Preferred') return { color: '#9a6b12', bg: '#fbefd4' }
  if (s === 'Active') return { color: '#197a52', bg: '#e5f2eb' }
  return { color: '#6b7280', bg: '#f1f2f4' } // Inactive / Past / other
}
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const t = new Date(d); if (isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EntityDirectory({ config }: { config: DirConfig }) {
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [editing, setEditing] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(config.api)
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Load failed (${res.status})`); return }
      setItems(j.items ?? []); setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [config.api])
  useEffect(() => { load() }, [load])

  // Another view (e.g. the DST investor list) can hand us a name to filter on.
  useEffect(() => {
    if (!config.sessionKey) return
    try {
      const v = window.sessionStorage.getItem(config.sessionKey)
      if (v) { setSearch(v); window.sessionStorage.removeItem(config.sessionKey) }
    } catch { /* storage unavailable */ }
  }, [config.sessionKey])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(v => typeFilter === 'All' || !config.typeKey || v[config.typeKey] === typeFilter)
      .filter(v => !q || config.searchKeys.some(k => String(v[k] ?? '').toLowerCase().includes(q)))
  }, [items, search, typeFilter, config])

  async function save(draft: Row) {
    const isNew = !draft.id
    const res = await fetch(config.api, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    if (isNew) setItems(v => [...v, j.item].sort((a, b) => String(a.name).localeCompare(String(b.name))))
    else setItems(v => v.map(x => x.id === j.item.id ? j.item : x))
    setEditing(null)
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this entry?')) return
    const res = await fetch(`${config.api}?id=${id}`, { method: 'DELETE' })
    if (res.ok) setItems(v => v.filter(x => x.id !== id))
  }

  const cell = (col: DirColumn, row: Row) => {
    if (col.kind === 'status') { const ss = statusStyle(row[col.key]); return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: ss.color, background: ss.bg }}>{row[col.key]}</span> }
    if (col.kind === 'name') return <div style={{ fontWeight: 600, color: '#1a2233' }}>{row.name}</div>
    if (col.kind === 'contact') return <div><div style={{ fontSize: 13 }}>{row.contact || '—'}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{[row.email, row.phone].filter(Boolean).join(' · ')}</div></div>
    if (col.kind === 'date') return <span>{fmtDate(row[col.key])}</span>
    const v = row[col.key]
    return v ? <span style={{ fontSize: 13, color: '#374151' }}>{v}</span> : <span style={{ color: '#d1d5db' }}>—</span>
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>{config.eyebrow}</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>{config.title}</h1>
          {config.subtitle && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{config.subtitle}</div>}
        </div>
        <button onClick={() => setEditing({ ...(config.defaults ?? {}) })} style={{ border: 0, background: config.accent, color: '#fff', borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>{config.addLabel}</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        {config.typeKey && config.typeOptions && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
            <option value="All">All types</option>
            {config.typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}
      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {config.columns.map(c => <th key={c.key} style={{ padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.label}</th>)}
                  <th style={{ padding: '10px 14px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ borderTop: '1px solid #f0f1f3' }}>
                    {config.columns.map(c => <td key={c.key} style={{ padding: '11px 14px', verticalAlign: 'top' }}>{cell(c, row)}</td>)}
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => setEditing(row)} style={linkBtn}>Edit</button>
                      <button onClick={() => remove(row.id)} style={{ ...linkBtn, color: '#b91c1c' }}>Delete</button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={config.columns.length + 1} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Nothing here yet. Add your first entry.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <EntityModal config={config} draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function EntityModal({ config, draft, onCancel, onSave }: { config: DirConfig; draft: Row; onCancel: () => void; onSave: (d: Row) => void }) {
  const [d, setD] = useState<Row>(draft)
  const set = (k: string, v: string) => setD(prev => ({ ...prev, [k]: v }))
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 700, color: '#1a2233' }}>{d.id ? `Edit ${config.title.replace(/s$/, '')}` : config.addLabel}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {config.fields.map(f => (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: f.full ? '1 / -1' : undefined }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{f.label}</span>
              {f.kind === 'select'
                ? <select value={d[f.key] || (f.options?.[0] ?? '')} onChange={e => set(f.key, e.target.value)} style={inputCss}>{(f.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}</select>
                : f.kind === 'textarea'
                  ? <textarea value={d[f.key] || ''} onChange={e => set(f.key, e.target.value)} rows={2} placeholder={f.placeholder} style={inputCss} />
                  : <input type={f.kind === 'date' ? 'date' : 'text'} value={d[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} style={inputCss} />}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={() => { if (!String(d.name ?? '').trim()) { alert('Name is required'); return } onSave(d) }} style={{ border: 0, background: config.accent, color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>{d.id ? 'Save' : config.addLabel}</button>
        </div>
      </div>
    </div>
  )
}

const linkBtn: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#0e7490', padding: '0 6px' }
const inputCss: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }
