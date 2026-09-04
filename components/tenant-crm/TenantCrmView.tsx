'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import DocsPanel from '../shared/DocsPanel'
import { downloadCsv, exportBtnCss, type CsvColumn } from '@/lib/csv'

// ── Tenant CRM ────────────────────────────────────────────────────────────────
// Companies at ERP properties — current tenants, prospects and prior tenants —
// listed like the investor directories, with each company's people behind a
// popout. Each contact carries a type (Billing, Onsite, Leasing, All) so the
// team knows who to reach for what.

const DESCRIPTIONS = ['Tenant', 'Prospect', 'Prior Tenant']
const CONTACT_TYPES = ['Billing', 'Onsite', 'Leasing', 'All']

interface TContact {
  id: string; tenant_id: string; contact_name: string; contact_type: string
  title: string | null; email: string | null; phone_office: string | null
  phone_cell: string | null; phone: string | null; address: string | null
  linkedin_url: string | null; notes: string | null; is_primary: boolean
}
interface Tenant {
  id: string; name: string; description: string; erp_entity: string | null
  property_address: string | null; website: string | null; linkedin_url: string | null
  notes: string | null; contacts: TContact[]
}
type Draft = Partial<Tenant>
type CDraft = Partial<TContact>

const thCss: React.CSSProperties = {
  textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 700, letterSpacing: '.06em',
  textTransform: 'uppercase', color: '#9ca3af', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap',
}
const tdCss: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f0f1f3', fontSize: 14, verticalAlign: 'top' }
const inputCss: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
}

function descStyle(d: string): { bg: string; color: string } {
  if (d === 'Tenant') return { bg: '#e5f2eb', color: '#197a52' }
  if (d === 'Prospect') return { bg: '#eceff9', color: '#3b4a86' }
  return { bg: '#f1f2f4', color: '#6b7280' }   // Prior Tenant
}
function typeStyle(t: string): { bg: string; color: string } {
  if (t === 'Billing') return { bg: '#fbefd4', color: '#9a6b12' }
  if (t === 'Onsite') return { bg: '#e4f2ef', color: '#0f766e' }
  if (t === 'Leasing') return { bg: '#eceff9', color: '#3b4a86' }
  return { bg: '#f1f2f4', color: '#6b7280' }   // All
}

export default function TenantCrmView() {
  const [items, setItems] = useState<Tenant[]>([])
  const [entities, setEntities] = useState<string[]>([])
  const [addresses, setAddresses] = useState<{ address: string; entity: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [descFilter, setDescFilter] = useState('All')
  const [entityFilter, setEntityFilter] = useState('All')
  const [editing, setEditing] = useState<Draft | null>(null)
  const [people, setPeople] = useState<Tenant | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tenant-crm')
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Load failed (${res.status})`); return }
      setItems(j.items ?? []); setEntities(j.entities ?? []); setAddresses(j.addresses ?? [])
      setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Keep an open popout in step with the list after a contact changes.
  useEffect(() => {
    if (!people) return
    const fresh = items.find(t => t.id === people.id)
    if (fresh && fresh !== people) setPeople(fresh)
  }, [items, people])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items
      .filter(t => descFilter === 'All' || t.description === descFilter)
      .filter(t => entityFilter === 'All' || t.erp_entity === entityFilter)
      .filter(t => !q || t.name.toLowerCase().includes(q)
        || (t.property_address || '').toLowerCase().includes(q)
        || t.contacts.some(c => c.contact_name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)))
  }, [items, search, descFilter, entityFilter])

  // One line per CONTACT, since that is what the list gets used for. A company with no
  // contacts on file still gets a row rather than disappearing from the export.
  const exportRows = useMemo(() => rows.flatMap(t => (
    t.contacts.length ? t.contacts.map(c => ({ t, c })) : [{ t, c: null as TContact | null }]
  )), [rows])

  function exportCsv() {
    const cols: CsvColumn<{ t: Tenant; c: TContact | null }>[] = [
      ['Company', r => r.t.name],
      ['Description', r => r.t.description],
      ['ERP Entity', r => r.t.erp_entity],
      ['Property Address', r => r.t.property_address],
      ['Contact', r => r.c?.contact_name],
      ['Role', r => r.c?.contact_type],
      ['Title', r => r.c?.title],
      ['Primary', r => (r.c?.is_primary ? 'Yes' : '')],
      ['Email', r => r.c?.email],
      ['Office Phone', r => r.c?.phone_office ?? r.c?.phone],
      ['Cell', r => r.c?.phone_cell],
      ['Contact Address', r => r.c?.address],
      ['Contact LinkedIn', r => r.c?.linkedin_url],
      ['Contact Notes', r => r.c?.notes],
      ['Website', r => r.t.website],
      ['Company LinkedIn', r => r.t.linkedin_url],
      ['Company Notes', r => r.t.notes],
    ]
    downloadCsv('Tenant CRM', cols, exportRows)
  }

  async function save(draft: Draft) {
    const res = await fetch('/api/tenant-crm', {
      method: draft.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditing(null); load()
  }
  async function removeCompany(t: Tenant) {
    if (!window.confirm(`Delete ${t.name}${t.contacts.length ? ` and its ${t.contacts.length} contact(s)` : ''}?`)) return
    const res = await fetch(`/api/tenant-crm?id=${t.id}`, { method: 'DELETE' })
    if (res.ok) { setPeople(null); load() } else alert('Delete failed')
  }

  const primaryOf = (t: Tenant) => t.contacts.find(c => c.is_primary) ?? t.contacts[0]

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af' }}>Property CRM</div>
        <h1 style={{ fontSize: 30, fontWeight: 700, color: '#1a2233', margin: '2px 0 2px' }}>Tenants</h1>
        <div style={{ color: '#6b7280', fontSize: 14 }}>Tenants, prospects and prior tenants at ERP properties</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={exportCsv} disabled={loading || exportRows.length === 0}
          title="Download the rows currently on screen, one line per contact"
          style={{ ...exportBtnCss, cursor: exportRows.length ? 'pointer' : 'not-allowed' }}>⤓ Export to Excel</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies, contacts, addresses…"
          style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        <select value={descFilter} onChange={e => setDescFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All descriptions</option>
          {DESCRIPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={entityFilter} onChange={e => setEntityFilter(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All ERP entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <button onClick={() => setEditing({ description: 'Tenant' })}
          style={{ border: 0, background: '#1a2233', color: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>+ Add Company</button>
      </div>

      {error && <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}
      {loading ? <div style={{ color: '#9ca3af', padding: 30 }}>Loading…</div> : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1080 }}>
            <thead>
              <tr>
                {/* Description is not a column: it reads "Tenant" on nearly every row. The
                    exceptions ride as a badge next to the company name instead. */}
                <th style={thCss}>Company</th>
                <th style={thCss}>ERP Entity</th>
                <th style={thCss}>Contact(s)</th>
                <th style={{ ...thCss, maxWidth: 190 }}>ERP Property Address</th>
                <th style={thCss}>Website / LinkedIn</th>
                <th style={thCss}>Notes</th>
                <th style={thCss}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(t => {
                const p = primaryOf(t)
                const ds = descStyle(t.description)
                return (
                  <tr key={t.id}>
                    <td style={{ ...tdCss, fontWeight: 600, color: '#1a2233' }}>
                      {t.name}
                      {t.description && t.description !== 'Tenant' && (
                        <span style={{ fontSize: 10.5, fontWeight: 700, marginLeft: 7, padding: '2px 7px', borderRadius: 20, background: ds.bg, color: ds.color, whiteSpace: 'nowrap', verticalAlign: '1px' }}>{t.description}</span>
                      )}
                    </td>
                    <td style={{ ...tdCss, color: '#6b7280', fontWeight: 600 }}>{t.erp_entity || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={tdCss}>
                      {t.contacts.length === 0 ? <span style={{ color: '#d1d5db' }}>—</span> : (
                        <button onClick={() => setPeople(t)}
                          style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: '#0e7490' }}>{p?.contact_name}</span>
                          {p?.contact_type && (
                            <span style={{ fontSize: 10, fontWeight: 700, marginLeft: 6, padding: '2px 6px', borderRadius: 20,
                                           background: typeStyle(p.contact_type).bg, color: typeStyle(p.contact_type).color }}>{p.contact_type}</span>
                          )}
                          {t.contacts.length > 1 && <span style={{ fontSize: 12.5, color: '#0f766e', marginLeft: 6 }}>+{t.contacts.length - 1} more</span>}
                        </button>
                      )}
                    </td>
                    <td style={{ ...tdCss, maxWidth: 190, fontSize: 13, color: '#4b5563' }}>{t.property_address || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ ...tdCss, fontSize: 13 }}>
                      {t.website && (
                        <div><a href={t.website.startsWith('http') ? t.website : `https://${t.website}`} target="_blank" rel="noreferrer"
                          style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>{t.website.replace(/^https?:\/\//, '')} ↗</a></div>
                      )}
                      {t.linkedin_url && (
                        <div style={{ marginTop: t.website ? 3 : 0 }}><a href={t.linkedin_url} target="_blank" rel="noreferrer"
                          style={{ color: '#0a66c2', fontWeight: 600, textDecoration: 'none' }}>in · LinkedIn ↗</a></div>
                      )}
                      {!t.website && !t.linkedin_url && <span style={{ color: '#d1d5db' }}>—</span>}
                    </td>
                    <td style={{ ...tdCss, maxWidth: 220, fontSize: 13, color: '#6b7280' }}>{t.notes || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ ...tdCss, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <a href={p?.email ? `mailto:${p.email}` : undefined}
                        style={{ display: 'inline-block', padding: '6px 12px', borderRadius: 7, fontWeight: 600, fontSize: 13, textDecoration: 'none',
                                 background: p?.email ? '#2563eb' : '#f1f2f4', color: p?.email ? '#fff' : '#b6bcc6',
                                 pointerEvents: p?.email ? 'auto' : 'none' }}>Email</a>
                      <button onClick={() => setEditing(t)}
                        style={{ marginLeft: 6, border: '1px solid #d1d5db', background: '#fff', borderRadius: 7, padding: '6px 12px', fontWeight: 600, fontSize: 13, color: '#374151', cursor: 'pointer' }}>Edit</button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No companies yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CompanyModal draft={editing} entities={entities} addresses={addresses}
          onCancel={() => setEditing(null)} onSave={save}
          onDelete={editing.id ? () => removeCompany(editing as Tenant) : undefined} />
      )}
      {people && <ContactsModal tenant={people} onClose={() => setPeople(null)} onChanged={load} />}
    </div>
  )
}

// ── Company add / edit ────────────────────────────────────────────────────────
function CompanyModal({ draft, entities, addresses, onCancel, onSave, onDelete }: {
  draft: Draft; entities: string[]; addresses: { address: string; entity: string }[]
  onCancel: () => void; onSave: (d: Draft) => void; onDelete?: () => void
}) {
  const [d, setD] = useState<Draft>(draft)
  const set = (k: keyof Tenant, v: unknown) => setD(p => ({ ...p, [k]: v }))
  // Narrow the address list to the chosen entity, since a company sits at one ERP property.
  const addrOptions = useMemo(
    () => (d.erp_entity ? addresses.filter(a => a.entity === d.erp_entity) : addresses),
    [addresses, d.erp_entity])

  const fld = (label: string, k: keyof Tenant, area?: boolean) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: area ? '1 / -1' : undefined }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>
      {area
        ? <textarea value={(d[k] as string) ?? ''} onChange={e => set(k, e.target.value)} rows={3} style={{ ...inputCss, resize: 'vertical', lineHeight: 1.5 }} />
        : <input value={(d[k] as string) ?? ''} onChange={e => set(k, e.target.value)} style={inputCss} />}
    </label>
  )

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(700px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2233', marginBottom: 16 }}>{d.id ? 'Edit company' : 'New company'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Description</span>
            <select value={d.description ?? 'Tenant'} onChange={e => set('description', e.target.value)} style={inputCss}>
              {DESCRIPTIONS.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>ERP Entity</span>
            <select value={d.erp_entity ?? ''} onChange={e => set('erp_entity', e.target.value)} style={inputCss}>
              <option value="">— none —</option>
              {entities.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          {fld('Company', 'name')}
          <div />
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>ERP Property Address</span>
            <select value={d.property_address ?? ''} onChange={e => set('property_address', e.target.value)} style={inputCss}>
              <option value="">— none —</option>
              {addrOptions.map(a => <option key={a.address} value={a.address}>{a.address}</option>)}
            </select>
          </label>
          {fld('Website', 'website')}
          {fld('LinkedIn URL', 'linkedin_url')}
          {fld('Notes', 'notes', true)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 20 }}>
          <div>
            {onDelete && <button onClick={onDelete}
              style={{ border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '9px 14px', fontWeight: 600, cursor: 'pointer' }}>Delete company</button>}
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
function ContactsModal({ tenant, onClose, onChanged }: { tenant: Tenant; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState<CDraft | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function saveContact(c: CDraft) {
    const res = await fetch('/api/tenant-crm', {
      method: c.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, kind: 'contact', tenant_id: tenant.id }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditing(null); onChanged()
  }
  // The type dropdown sits on the row itself, so it can be changed without opening the form.
  async function setType(c: TContact, contact_type: string) {
    setBusy(c.id)
    await fetch('/api/tenant-crm', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'contact', id: c.id, contact_type }),
    })
    setBusy(null); onChanged()
  }
  async function removeContact(c: TContact) {
    if (!window.confirm(`Remove ${c.contact_name}?`)) return
    const res = await fetch(`/api/tenant-crm?kind=contact&id=${c.id}`, { method: 'DELETE' })
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
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 'min(740px, 96vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1a2233' }}>{tenant.name}</div>
          <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Close ✕</button>
        </div>
        <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>
          {tenant.description}{tenant.erp_entity ? ` · ${tenant.erp_entity}` : ''}{tenant.property_address ? ` · ${tenant.property_address}` : ''}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tenant.contacts.map(c => (
            <div key={c.id} style={{ padding: '11px 13px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.contact_name}</span>
                    {c.is_primary && <span style={{ fontSize: 10, fontWeight: 700, color: '#9a6b12' }}>★ PRIMARY</span>}
                    <select value={c.contact_type ?? 'All'} disabled={busy === c.id}
                      onChange={e => setType(c, e.target.value)}
                      title="Contact type"
                      style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 6px', borderRadius: 20, cursor: 'pointer',
                               border: '1px solid #e2e8f0', fontFamily: 'inherit',
                               background: typeStyle(c.contact_type ?? 'All').bg, color: typeStyle(c.contact_type ?? 'All').color }}>
                      {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '2px 16px', marginTop: 6 }}>
                    {bit('Title', c.title)}
                    {bit('Email', c.email, c.email ? `mailto:${c.email}` : undefined)}
                    {bit('Office', c.phone_office ?? c.phone)}
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
          {tenant.contacts.length === 0 && <div style={{ color: '#9ca3af', fontSize: 13.5 }}>No contacts yet.</div>}
        </div>

        <button onClick={() => setEditing({ contact_type: 'All' })}
          style={{ marginTop: 14, border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 600, fontSize: 13, color: '#374151', cursor: 'pointer' }}>+ Add contact</button>

        <DocsPanel tag={`tenant:${tenant.id}`} category="Tenant Docs" uploadedBy={tenant.name} />

        {editing && <ContactModal draft={editing} onCancel={() => setEditing(null)} onSave={saveContact} />}
      </div>
    </div>
  )
}

function ContactModal({ draft, onCancel, onSave }: { draft: CDraft; onCancel: () => void; onSave: (c: CDraft) => void }) {
  const [c, setC] = useState<CDraft>(draft)
  const set = (k: keyof TContact, v: unknown) => setC(p => ({ ...p, [k]: v }))
  const fld = (label: string, k: keyof TContact, full?: boolean) => (
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
          {fld('Name', 'contact_name')}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Contact Type</span>
            <select value={c.contact_type ?? 'All'} onChange={e => set('contact_type', e.target.value)} style={inputCss}>
              {CONTACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          {fld('Title', 'title')}
          {fld('Email', 'email')}
          {fld('Phone (office)', 'phone_office')}
          {fld('Phone (cell)', 'phone_cell')}
          {fld('LinkedIn URL', 'linkedin_url')}
          <div />
          {fld('Address', 'address', true)}
          {fld('Notes', 'notes', true)}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: '1 / -1', fontSize: 13.5, color: '#374151' }}>
            <input type="checkbox" checked={!!c.is_primary} onChange={e => set('is_primary', e.target.checked)} />
            Primary contact for this company
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '9px 16px', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancel</button>
          <button onClick={() => onSave(c)} disabled={!c.contact_name?.trim()}
            style={{ border: 0, background: c.contact_name?.trim() ? '#1a2233' : '#d1d5db', color: '#fff', borderRadius: 8, padding: '9px 18px', fontWeight: 600, cursor: c.contact_name?.trim() ? 'pointer' : 'not-allowed' }}>Save</button>
        </div>
      </div>
    </div>
  )
}
