'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── DST Vendors ───────────────────────────────────────────────────────────────
// Directory of DST/1031 vendor accounts: broker dealers, the brokerages that sit
// under them, and the other operational providers (QIs, title/escrow, property
// managers, lenders, legal). A brokerage's affiliation names the broker dealer it
// is listed under. Contacts belong to an account and open in a popout.

// One component serves both vendor desks; only the vocabulary and headings differ.
const DESK = {
  dst: {
    eyebrow: 'Investor CRM', title: 'DST Vendors',
    subtitle: 'Broker dealers, brokerages and service providers',
    affiliationLabel: 'Affiliation — broker dealer this account is listed under',
    parentType: 'Broker Dealer',
    columns: ['account', 'description', 'affiliation', 'contacts', 'website', 'notes', 'nextSteps'] as string[],
    types: ['Broker Dealer', 'Brokerage', 'RIA', 'Advisor', 'Qualified Intermediary',
      'Title/Escrow', 'Property Manager', 'Lender', 'Legal/Counsel', 'Insurance', 'Inspection/Appraisal', 'Other'],
  },
  property: {
    eyebrow: 'Property CRM', title: 'Vendors',
    subtitle: 'Contractors, lenders, brokers and service providers',
    affiliationLabel: 'Affiliation — parent company this account sits under',
    parentType: '',
    columns: ['account', 'descNotes', 'contacts', 'address', 'website'] as string[],
    types: ['Contractor', 'Lender', 'Broker', 'Property Manager', 'Title/Escrow',
      'Insurance', 'Legal/Counsel', 'Utility', 'Inspection/Appraisal', 'Other'],
  },
} as const
type DeskKey = keyof typeof DESK

interface VContact {
  id: string; vendor_id: string; name: string; title: string | null; email: string | null
  phone_office: string | null; phone_cell: string | null; address: string | null
  linkedin_url: string | null; notes: string | null; is_primary: boolean
}
interface Vendor {
  id: string; name: string; description: string | null; vendor_type: string | null
  parent_id: string | null; website: string | null; notes: string | null; next_steps: string | null
  address: string | null
  contacts: VContact[]
}
type Draft = Partial<Vendor>
type CDraft = Partial<VContact>

const LABELS: Record<string, string> = {
  account: 'Company', description: 'Description', descNotes: 'Description / Notes',
  affiliation: 'Affiliation', contacts: 'Contact(s)', address: 'Address',
  website: 'Website', notes: 'Notes', nextSteps: 'Next Steps',
}

const thCss: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#9ca3af', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
}
const tdCss: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f0f1f3', fontSize: 14, verticalAlign: 'top' }
const inputCss: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db',
  fontSize: 14, fontFamily: 'inherit',
}

export default function DstVendorsView({ desk = 'dst' }: { desk?: DeskKey } = {}) {
  const cfg = DESK[desk]
  const VENDOR_TYPES = cfg.types
  const [items, setItems] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [people, setPeople] = useState<Vendor | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/dst-vendors?desk=${desk}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Load failed (${res.status})`); return }
      setItems(j.items ?? []); setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [desk])
  useEffect(() => { load() }, [load])

  // Keep the open popout in step with the list after a contact is added or removed.
  useEffect(() => {
    if (!people) return
    const fresh = items.find(v => v.id === people.id)
    if (fresh && fresh !== people) setPeople(fresh)
  }, [items, people])

  const byId = useMemo(() => new Map(items.map(v => [v.id, v])), [items])
  // On the DST desk only broker dealers can be a parent; elsewhere any account can.
  const parents = useMemo(
    () => (cfg.parentType ? items.filter(v => v.vendor_type === cfg.parentType) : items),
    [items, cfg.parentType])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(v => typeFilter === 'All' || v.vendor_type === typeFilter)
      .filter(v => !q
        || v.name.toLowerCase().includes(q)
        || (v.description || '').toLowerCase().includes(q)
        || v.contacts.some(c => c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)))
  }, [items, search, typeFilter])

  async function save(draft: Draft) {
    const editingExisting = !!draft.id
    const res = await fetch('/api/dst-vendors', {
      method: editingExisting ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, desk }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditing(null); load()
  }

  async function removeAccount(v: Vendor) {
    const kids = items.filter(x => x.parent_id === v.id).length
    const msg = kids
      ? `Delete ${v.name}? ${kids} brokerage${kids > 1 ? 's' : ''} listed under it will remain, without an affiliation.`
      : `Delete ${v.name} and its contacts?`
    if (!window.confirm(msg)) return
    const res = await fetch(`/api/dst-vendors?desk=${desk}&id=${v.id}`, { method: 'DELETE' })
    if (res.ok) { setPeople(null); load() } else alert('Delete failed')
  }

  const primaryOf = (v: Vendor) => v.contacts.find(c => c.is_primary) ?? v.contacts[0]

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af' }}>{cfg.eyebrow}</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: '#1a2233', margin: '2px 0 2px' }}>{cfg.title}</h1>
        <div style={{ color: '#6b7280', fontSize: 14 }}>{cfg.subtitle}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts, contacts…"
          style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All types</option>
          {VENDOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={() => setEditing({ vendor_type: VENDOR_TYPES[0] })}
          style={{ border: 0, background: '#1a2233', color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>+ Add Account</button>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
      {loading ? <div style={{ color: '#9ca3af', padding: 30 }}>Loading…</div> : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>
                {cfg.columns.map(c => <th key={c} style={thCss}>{LABELS[c]}</th>)}
                <th style={thCss}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(v => {
                const p = primaryOf(v)
                const parent = v.parent_id ? byId.get(v.parent_id) : undefined
                const dash = <span style={{ color: '#d1d5db' }}>—</span>
                return (
                  <tr key={v.id}>
                    {cfg.columns.map(col => {
                      if (col === 'account') return (
                        <td key={col} style={{ ...tdCss, fontWeight: 600, color: '#1a2233' }}>
                          {v.name}
                          {v.vendor_type && v.vendor_type !== 'Other' && (
                            <div style={{ marginTop: 3 }}>
                              <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#eceff9', color: '#3b4a86' }}>{v.vendor_type}</span>
                            </div>
                          )}
                        </td>
                      )
                      if (col === 'description') return <td key={col} style={{ ...tdCss, color: '#4b5563', maxWidth: 260 }}>{v.description || dash}</td>
                      // The property desk keeps description and notes in a single column.
                      if (col === 'descNotes') {
                        const both = [v.description, v.notes].filter(Boolean).join(' — ')
                        return <td key={col} style={{ ...tdCss, color: '#4b5563', maxWidth: 300, fontSize: 13 }}>{both || dash}</td>
                      }
                      if (col === 'affiliation') return <td key={col} style={{ ...tdCss, color: '#6b7280' }}>{parent ? parent.name : dash}</td>
                      if (col === 'contacts') return (
                        <td key={col} style={tdCss}>
                          {v.contacts.length === 0 ? dash : (
                            <button onClick={() => setPeople(v)}
                              style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: '#0e7490' }}>{p?.name}</span>
                              {v.contacts.length > 1 && <span style={{ fontSize: 12.5, color: '#0f766e', marginLeft: 6 }}>+{v.contacts.length - 1} more</span>}
                            </button>
                          )}
                        </td>
                      )
                      if (col === 'address') return <td key={col} style={{ ...tdCss, maxWidth: 190, fontSize: 13, color: '#4b5563' }}>{v.address || dash}</td>
                      if (col === 'website') return (
                        <td key={col} style={tdCss}>
                          {v.website
                            ? <a href={v.website.startsWith('http') ? v.website : `https://${v.website}`} target="_blank" rel="noreferrer"
                                style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none', fontSize: 13.5 }}>{v.website.replace(/^https?:\/\//, '')} ↗</a>
                            : dash}
                        </td>
                      )
                      if (col === 'notes') return <td key={col} style={{ ...tdCss, color: '#6b7280', maxWidth: 220, fontSize: 13 }}>{v.notes || dash}</td>
                      if (col === 'nextSteps') return <td key={col} style={{ ...tdCss, color: '#6b7280', maxWidth: 220, fontSize: 13 }}>{v.next_steps || dash}</td>
                      return <td key={col} style={tdCss} />
                    })}
                    <td style={{ ...tdCss, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <a href={p?.email ? `mailto:${p.email}` : undefined}
                        style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 7, fontWeight: 600, fontSize: 13, textDecoration: 'none',
                                 background: p?.email ? '#2563eb' : '#f1f2f4', color: p?.email ? '#fff' : '#b6bcc6',
                                 pointerEvents: p?.email ? 'auto' : 'none' }}>Email</a>
                      <button onClick={() => setEditing(v)}
                        style={{ marginLeft: 6, border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, padding: '6px 12px', fontWeight: 600, fontSize: 13, color: '#374151', cursor: 'pointer' }}>Edit</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={cfg.columns.length + 1} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No vendor accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AccountModal draft={editing} parents={parents} types={VENDOR_TYPES} affiliationLabel={cfg.affiliationLabel} columns={cfg.columns}
          onCancel={() => setEditing(null)} onSave={save}
          onDelete={editing.id ? () => removeAccount(editing as Vendor) : undefined} />
      )}
      {people && <ContactsModal vendor={people} desk={desk} onClose={() => setPeople(null)} onChanged={load} />}
    </div>
  )
}

// ── Account add / edit ────────────────────────────────────────────────────────
function AccountModal({ draft, parents, types, affiliationLabel, columns, onCancel, onSave, onDelete }: {
  draft: Draft; parents: Vendor[]; types: readonly string[]; affiliationLabel: string
  columns: string[]; onCancel: () => void; onSave: (d: Draft) => void; onDelete?: () => void
}) {
  const showAffiliation = columns.includes('affiliation')
  const showAddress = columns.includes('address')
  const showNextSteps = columns.includes('nextSteps')
  const [d, setD] = useState<Draft>(draft)
  const set = (k: keyof Vendor, v: unknown) => setD(p => ({ ...p, [k]: v }))
  const fld = (label: string, k: keyof Vendor, area?: boolean) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: area ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      {area
        ? <textarea value={(d[k] as string) ?? ''} onChange={e => set(k, e.target.value)} rows={3} style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }} />
        : <input value={(d[k] as string) ?? ''} onChange={e => set(k, e.target.value)} style={inputCss} />}
    </label>
  )

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(680px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2233', marginBottom: 16 }}>{d.id ? 'Edit account' : 'New account'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {fld('Account', 'name')}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Type</span>
            <select value={d.vendor_type ?? types[0]} onChange={e => set('vendor_type', e.target.value)} style={inputCss}>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {fld('Description', 'description', true)}
          {showAffiliation && <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{affiliationLabel}</span>
            <select value={d.parent_id ?? ''} onChange={e => set('parent_id', e.target.value)} style={inputCss}>
              <option value="">— none —</option>
              {parents.filter(b => b.id !== d.id).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>}
          {showAddress && fld('Address', 'address', true)}
          {fld('Website', 'website')}
          <div />
          {fld('Notes', 'notes', true)}
          {showNextSteps && fld('Next Steps', 'next_steps', true)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20 }}>
          <div>
            {onDelete && <button onClick={onDelete}
              style={{ border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' }}>Delete account</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 16px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onSave(d)} disabled={!d.name?.trim()}
              style={{ border: 0, background: d.name?.trim() ? '#1a2233' : '#d1d5db', color: '#fff', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: d.name?.trim() ? 'pointer' : 'not-allowed' }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Contacts popout ───────────────────────────────────────────────────────────
function ContactsModal({ vendor, desk, onClose, onChanged }: { vendor: Vendor; desk: DeskKey; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<CDraft | null>(null)

  async function saveContact(c: CDraft) {
    const res = await fetch('/api/dst-vendors', {
      method: c.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, kind: 'contact', desk, vendor_id: vendor.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditing(null); onChanged()
  }
  async function removeContact(c: VContact) {
    if (!window.confirm(`Remove ${c.name}?`)) return
    const res = await fetch(`/api/dst-vendors?desk=${desk}&kind=contact&id=${c.id}`, { method: 'DELETE' })
    if (res.ok) onChanged(); else alert('Delete failed')
  }

  const bit = (label: string, value: string | null, href?: string) => (
    <div style={{ fontSize: 12.5, color: '#6b7280' }}>
      <span style={{ color: '#b6bcc6', fontWeight: 600 }}>{label}: </span>
      {!value ? <span style={{ color: '#d1d5db' }}>—</span>
        : href ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>{value}</a>
        : value}
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(720px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2233' }}>{vendor.name}</div>
          <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Close ✕</button>
        </div>
        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>Contacts</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {vendor.contacts.map(c => (
            <div key={c.id} style={{ padding: '11px 13px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</span>
                    {c.is_primary && <span style={{ fontSize: 10, fontWeight: 700, color: '#9a6b12' }}>★ PRIMARY</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '2px 16px', marginTop: 6 }}>
                    {bit('Title', c.title)}
                    {bit('Email', c.email, c.email ? `mailto:${c.email}` : undefined)}
                    {bit('Office', c.phone_office)}
                    {bit('Cell', c.phone_cell)}
                    {bit('Address', c.address)}
                    {bit('LinkedIn', c.linkedin_url ? 'profile ↗' : null, c.linkedin_url ?? undefined)}
                  </div>
                  {c.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{c.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setEditing(c)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#0e7490' }}>Edit</button>
                  <button onClick={() => removeContact(c)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#b91c1c' }}>✕</button>
                </div>
              </div>
            </div>
          ))}
          {vendor.contacts.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13.5 }}>No contacts yet.</div>}
        </div>

        <button onClick={() => setEditing({})}
          style={{ marginTop: 14, border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, color: '#374151', cursor: 'pointer' }}>+ Add contact</button>

        {editing && <ContactModal draft={editing} onCancel={() => setEditing(null)} onSave={saveContact} />}
      </div>
    </div>
  )
}

function ContactModal({ draft, onCancel, onSave }: { draft: CDraft; onCancel: () => void; onSave: (c: CDraft) => void }) {
  const [c, setC] = useState<CDraft>(draft)
  const set = (k: keyof VContact, v: unknown) => setC(p => ({ ...p, [k]: v }))
  const fld = (label: string, k: keyof VContact, full?: boolean) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: full ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      <input value={(c[k] as string) ?? ''} onChange={e => set(k, e.target.value)} style={inputCss} />
    </label>
  )
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.55)', zIndex: 1100, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: '#1a2233', marginBottom: 16 }}>{c.id ? 'Edit contact' : 'New contact'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {fld('Name', 'name')}
          {fld('Title', 'title')}
          {fld('Email', 'email')}
          {fld('Phone (office)', 'phone_office')}
          {fld('Phone (cell)', 'phone_cell')}
          {fld('LinkedIn URL', 'linkedin_url')}
          {fld('Address', 'address', true)}
          {fld('Notes', 'notes', true)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1', fontSize: 13.5, color: '#374151' }}>
            <input type="checkbox" checked={!!c.is_primary} onChange={e => set('is_primary', e.target.checked)} />
            Primary contact for this account
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 16px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(c)} disabled={!c.name?.trim()}
            style={{ border: 0, background: c.name?.trim() ? '#1a2233' : '#d1d5db', color: '#fff', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: c.name?.trim() ? 'pointer' : 'not-allowed' }}>Save</button>
        </div>
      </div>
    </div>
  )
}
