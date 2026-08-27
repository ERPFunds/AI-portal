'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── DST Vendors ───────────────────────────────────────────────────────────────
// Directory of operational service vendors for DST/1031 offerings — Qualified
// Intermediaries, title/escrow, property managers, lenders, legal, etc. Separate
// from investors and from the Admin/Broker vendor desks.

const VENDOR_TYPES = ['Qualified Intermediary', 'Title/Escrow', 'Property Manager', 'Lender', 'Legal/Counsel', 'Insurance', 'Inspection/Appraisal', 'Other']
const STATUSES = ['Preferred', 'Active', 'Inactive']

interface Vendor {
  id: string
  name: string
  vendor_type: string | null
  contact: string | null
  email: string | null
  phone: string | null
  status: string
  offerings: string | null
  website: string | null
  notes: string | null
}
type Draft = Partial<Vendor>

function statusStyle(s: string): { color: string; bg: string } {
  if (s === 'Preferred') return { color: '#9a6b12', bg: '#fbefd4' }
  if (s === 'Active') return { color: '#197a52', bg: '#e5f2eb' }
  return { color: '#6b7280', bg: '#f1f2f4' }
}

export default function DstVendorsView() {
  const [items, setItems] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [editing, setEditing] = useState<Draft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/dst-vendors')
      const j = await res.json()
      if (!res.ok || j.error) { setError(j.error ?? `Load failed (${res.status})`); return }
      setItems(j.items ?? []); setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(v => typeFilter === 'All' || v.vendor_type === typeFilter)
      .filter(v => !q || v.name.toLowerCase().includes(q) || (v.contact || '').toLowerCase().includes(q) || (v.offerings || '').toLowerCase().includes(q))
  }, [items, search, typeFilter])

  async function save(draft: Draft) {
    const isNew = !draft.id
    const res = await fetch('/api/dst-vendors', {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    const j = await res.json()
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    if (isNew) setItems(v => [...v, j.item].sort((a, b) => a.name.localeCompare(b.name)))
    else setItems(v => v.map(x => x.id === j.item.id ? j.item : x))
    setEditing(null)
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this vendor?')) return
    const res = await fetch(`/api/dst-vendors?id=${id}`, { method: 'DELETE' })
    if (res.ok) setItems(v => v.filter(x => x.id !== id))
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Investor CRM</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>DST Vendors</h1>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Service providers for DST / 1031 offerings</div>
        </div>
        <button onClick={() => setEditing({ status: 'Active', vendor_type: 'Qualified Intermediary' })} style={{ border: 0, background: '#26324a', color: '#fff', borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>+ Add Vendor</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors, contacts, offerings…" style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All types</option>
          {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading vendors…</div>}
      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <th style={thCss}>Vendor</th>
                  <th style={thCss}>Type</th>
                  <th style={thCss}>Contact</th>
                  <th style={thCss}>Status</th>
                  <th style={thCss}>Offerings</th>
                  <th style={thCss}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(v => {
                  const ss = statusStyle(v.status)
                  return (
                    <tr key={v.id} style={{ borderTop: '1px solid #f0f1f3' }}>
                      <td style={tdCss}>
                        <div style={{ fontWeight: 600, color: '#1a2233' }}>{v.name}</div>
                        {v.website && <a href={v.website.startsWith('http') ? v.website : `https://${v.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#0e7490' }}>{v.website}</a>}
                      </td>
                      <td style={tdCss}>{v.vendor_type || '—'}</td>
                      <td style={tdCss}>
                        <div style={{ fontSize: 13 }}>{v.contact || '—'}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af' }}>{[v.email, v.phone].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td style={tdCss}><span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: ss.color, background: ss.bg }}>{v.status}</span></td>
                      <td style={{ ...tdCss, maxWidth: 220, fontSize: 13, color: '#6b7280' }}>{v.offerings || '—'}</td>
                      <td style={{ ...tdCss, whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button onClick={() => setEditing(v)} style={linkBtn}>Edit</button>
                        <button onClick={() => remove(v.id)} style={{ ...linkBtn, color: '#b91c1c' }}>Delete</button>
                      </td>
                    </tr>
                  )
                })}
                {rows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No vendors yet. Add your first DST service vendor.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && <VendorModal draft={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  )
}

function VendorModal({ draft, onCancel, onSave }: { draft: Draft; onCancel: () => void; onSave: (d: Draft) => void }) {
  const [d, setD] = useState<Draft>(draft)
  const set = (k: keyof Vendor, v: string) => setD(prev => ({ ...prev, [k]: v }))
  const field = (label: string, k: keyof Vendor, opts?: { area?: boolean; ph?: string }) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      {opts?.area
        ? <textarea value={(d[k] as string) || ''} onChange={e => set(k, e.target.value)} rows={2} placeholder={opts.ph} style={inputCss} />
        : <input value={(d[k] as string) || ''} onChange={e => set(k, e.target.value)} placeholder={opts?.ph} style={inputCss} />}
    </label>
  )

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 19, fontWeight: 700, color: '#1a2233' }}>{d.id ? 'Edit Vendor' : 'Add DST Vendor'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>{field('Vendor Name', 'name', { ph: 'Company name' })}</div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Type</span>
            <select value={d.vendor_type || 'Qualified Intermediary'} onChange={e => set('vendor_type', e.target.value)} style={inputCss}>
              {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Status</span>
            <select value={d.status || 'Active'} onChange={e => set('status', e.target.value)} style={inputCss}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          {field('Primary Contact', 'contact')}
          {field('Phone', 'phone')}
          {field('Email', 'email')}
          {field('Website', 'website', { ph: 'example.com' })}
          <div style={{ gridColumn: '1 / -1' }}>{field('Associated Offerings', 'offerings', { area: true, ph: 'DST properties / deals this vendor serves' })}</div>
          <div style={{ gridColumn: '1 / -1' }}>{field('Notes', 'notes', { area: true })}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>Cancel</button>
          <button onClick={() => { if (!(d.name || '').trim()) { alert('Vendor name is required'); return } onSave(d) }} style={{ border: 0, background: '#26324a', color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}>{d.id ? 'Save' : 'Add Vendor'}</button>
        </div>
      </div>
    </div>
  )
}

const thCss: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const tdCss: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }
const linkBtn: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#0e7490', padding: '0 6px' }
const inputCss: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }
