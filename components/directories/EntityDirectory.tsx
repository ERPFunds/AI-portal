'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { downloadXlsx, shapeRows } from '@/lib/exportXlsx'

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
  /** Open a row as a full account record (like the LP Directory) instead of an edit modal. */
  accountView?: boolean
  /** Show an About line on the account, researched from the public web. */
  aboutResearch?: boolean
  /** Adds an Export button. The value is the workbook's filename stem. */
  exportName?: string
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
  const [open, setOpen] = useState<Row | null>(null)

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
  // The account view saves a field at a time, so it patches rather than posting a draft.
  async function patchOne(id: string, patch: Row) {
    const res = await fetch(config.api, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) throw new Error(j.error ?? `Save failed (${res.status})`)
    setItems(v => v.map(x => x.id === j.item.id ? j.item : x))
    setOpen(o => (o && o.id === j.item.id ? j.item : o))
    return j.item as Row
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this entry?')) return
    const res = await fetch(`${config.api}?id=${id}`, { method: 'DELETE' })
    if (res.ok) setItems(v => v.filter(x => x.id !== id))
  }

  const cell = (col: DirColumn, row: Row) => {
    if (col.kind === 'status') { const ss = statusStyle(row[col.key]); return <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: ss.color, background: ss.bg }}>{row[col.key]}</span> }
    if (col.kind === 'name') return config.accountView
      ? <button onClick={() => setOpen(row)} style={{ border: 0, background: 'none', padding: 0, font: 'inherit', fontWeight: 600, color: '#1a2233', cursor: 'pointer', textAlign: 'left' }}>{row.name}</button>
      : <div style={{ fontWeight: 600, color: '#1a2233' }}>{row.name}</div>
    if (col.kind === 'contact') return <div><div style={{ fontSize: 13 }}>{row.contact || '—'}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{[row.email, row.phone].filter(Boolean).join(' · ')}</div></div>
    if (col.kind === 'date') return <span>{fmtDate(row[col.key])}</span>
    const v = row[col.key]
    return v ? <span style={{ fontSize: 13, color: '#374151' }}>{v}</span> : <span style={{ color: '#d1d5db' }}>—</span>
  }

  // Every editable field, plus About where the directory researches one — a fuller record than
  // the on-screen columns, which are deliberately narrow.
  function exportRows() {
    const cols: [string, string][] = config.fields.map(f => [f.key, f.label])
    if (config.aboutResearch) cols.push(['about', 'About'])
    const stamp = new Date().toISOString().slice(0, 10)
    downloadXlsx([{ name: config.title.slice(0, 31), rows: shapeRows(rows, cols) }],
      `${config.exportName}-${stamp}.xlsx`)
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>{config.eyebrow}</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>{config.title}</h1>
          {config.subtitle && <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>{config.subtitle}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {config.exportName && (
            <button onClick={exportRows} title="Download the rows currently shown"
              style={{ border: '1px solid #d1d5db', background: '#fff', color: '#374151', borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>⤓ Export</button>
          )}
          <button onClick={() => setEditing({ ...(config.defaults ?? {}) })} style={{ border: 0, background: config.accent, color: '#fff', borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>{config.addLabel}</button>
        </div>
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
                      <button onClick={() => (config.accountView ? setOpen(row) : setEditing(row))} style={linkBtn}>{config.accountView ? 'Open' : 'Edit'}</button>
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
      {open && <AccountDrawer config={config} row={open} onClose={() => setOpen(null)} onPatch={patchOne} />}
    </div>
  )
}

// A record opened as a full account, laid out like the LP Directory: an About line, then
// every configured field inline-editable, then notes. Each field saves on its own so there
// is no draft to lose.
function AccountDrawer({ config, row, onClose, onPatch }: {
  config: DirConfig; row: Row; onClose: () => void; onPatch: (id: string, patch: Row) => Promise<Row>
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const [about, setAbout] = useState<string>(row.about ?? '')
  const [aboutBusy, setAboutBusy] = useState(false)
  const [aboutMsg, setAboutMsg] = useState<string | null>(null)
  const sources: string[] = Array.isArray(row.about_sources) ? row.about_sources : []

  async function saveField(patch: Row) {
    try { await onPatch(row.id, patch); setMsg('Saved'); setTimeout(() => setMsg(null), 1500) }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
  }
  // Research writes server-side, so we re-read the record rather than trusting the response.
  async function research() {
    setAboutBusy(true); setAboutMsg(null)
    try {
      const res = await fetch('/api/investor-crm/about', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'other', id: row.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setAboutMsg(`Research failed: ${j.error ?? res.status}`); return }
      const r = j.results?.[0]
      await onPatch(row.id, {})
      if (!r?.about) { setAboutMsg('Nothing specific found on the public web — add a line by hand.'); return }
      setAbout(r.about)
    } catch (e) { setAboutMsg(`Research failed: ${String(e)}`) }
    finally { setAboutBusy(false) }
  }

  const detail = config.fields.filter(f => f.key !== 'notes' && f.key !== 'name')
  const notes = config.fields.find(f => f.key === 'notes')

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 96vw)', height: '100%', background: '#eef0f4', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,.2)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>{config.title} <span style={{ color: '#c7ccd4' }}>›</span> <b style={{ color: '#1a2233' }}>{row.name}</b></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg === 'Saved' ? '#197a52' : '#b91c1c' }}>{msg}</span>}
            {row.email && <a href={`mailto:${row.email}`} style={{ border: '1px solid #2563eb', background: '#2563eb', color: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 600, textDecoration: 'none' }}>&#9993; Email</a>}
            <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Close &#10005;</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
          {config.aboutResearch && (
            <div style={dirCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ ...dirSect, marginBottom: 0 }}>About</div>
                <button onClick={research} disabled={aboutBusy}
                  style={{ border: '1px solid #c7d2da', background: aboutBusy ? '#f1f5f9' : '#fff', color: '#0f766e',
                           borderRadius: 7, padding: '5px 11px', fontSize: 12.5, fontWeight: 600,
                           cursor: aboutBusy ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                  {aboutBusy ? 'Searching the web…' : about ? 'Re-research' : 'Research from the web'}
                </button>
              </div>
              <textarea value={about} onChange={e => setAbout(e.target.value)}
                onBlur={() => { if (about !== (row.about ?? '')) saveField({ about }) }}
                placeholder="What this firm does and who they are to us. Research pulls this plus website and address from the web, then you can edit."
                rows={3}
                style={{ width: '100%', marginTop: 8, padding: '9px 11px', borderRadius: 8, border: '1px solid #e2e8f0',
                         fontSize: 14.5, color: '#374151', fontFamily: 'inherit', lineHeight: 1.55, resize: 'vertical', background: '#f8fafc' }} />
              {aboutMsg && <div style={{ fontSize: 12, color: '#b45309', marginTop: 6 }}>{aboutMsg}</div>}
              {!about && row.about_researched_at && !aboutMsg && (
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                  Searched the public web — nothing that could be confirmed as this firm. Worth filling in by hand.
                </div>
              )}
              {about && sources.length > 0 && (
                <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span>Sources:</span>
                  {sources.slice(0, 4).map((u, i) => (
                    <a key={i} href={u} target="_blank" rel="noreferrer" style={{ color: '#0f766e' }}>{hostOf(u)}</a>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={dirCard}>
            <div style={dirSect}>Account Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
              <DirEditField label="Firm / Account" value={row.name ?? ''} onSave={v => saveField({ name: v })} />
              {detail.map(f => (
                f.kind === 'select'
                  ? <DirEditSelect key={f.key} label={f.label} value={row[f.key] ?? ''} options={f.options ?? []} onSave={v => saveField({ [f.key]: v })} />
                  : <DirEditField key={f.key} label={f.label} value={row[f.key] ?? ''} full={f.full} onSave={v => saveField({ [f.key]: v })} />
              ))}
            </div>
            {notes && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f0f1f3' }}>
                <div style={dirLabel}>{notes.label}</div>
                <DirNotes value={row.notes ?? ''} onSave={v => saveField({ notes: v })} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return 'link' }
}

function DirNotes({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <textarea value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onSave(draft) }}
      placeholder="Add a note about this account…" rows={3}
      style={{ width: '100%', marginTop: 6, padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical' }} />
  )
}

function DirEditField({ label, value, onSave, full }: { label: string; value: string; onSave: (v: string) => void; full?: boolean }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={dirLabel}>{label}</div>
      <input value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== value) onSave(draft) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          if (e.key === 'Escape') { setDraft(value); e.currentTarget.blur() }
        }}
        placeholder="Add…"
        style={{ width: '100%', marginTop: 3, padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0',
                 fontSize: 15, color: '#1a2233', fontWeight: 500, fontFamily: 'inherit', background: '#f8fafc' }}
        onFocus={e => { e.currentTarget.style.borderColor = '#0f766e'; e.currentTarget.style.background = '#fff' }}
        onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f8fafc' }} />
    </div>
  )
}

function DirEditSelect({ label, value, options, onSave }: { label: string; value: string; options: string[]; onSave: (v: string) => void }) {
  const all = [...new Set([...options, value].filter(Boolean))]
  return (
    <div>
      <div style={dirLabel}>{label}</div>
      <select value={value} onChange={e => onSave(e.target.value)}
        style={{ width: '100%', marginTop: 3, padding: '6px 9px', borderRadius: 7, border: '1px solid #e2e8f0',
                 fontSize: 15, color: value ? '#1a2233' : '#9ca3af', fontWeight: 500, fontFamily: 'inherit', background: '#f8fafc', cursor: 'pointer' }}>
        <option value="">—</option>
        {all.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

const dirCard: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }
const dirSect: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 12 }
const dirLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }

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
