'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── Tenant CRM ────────────────────────────────────────────────────────────────
// Three populations under Leasing: Current Tenants + Former Tenants (the standalone
// `tenants` entity, split by status) and Tenant Prospects (the live leasing_inquiries
// feed, reused read-only with a "convert to tenant" action). Each tenant has contacts
// whose function/role is scoped per property.

const ROLES = ['Primary', 'Billing/AP', 'Facilities', 'Lease Signatory', 'Operations', 'Emergency', 'Other']

interface Tenant { id: string; name: string; status: string; industry: string | null; market: string | null; owner: string | null; notes: string | null }
interface Contact { id: string; tenant_id: string; property_id: string | null; property_label: string | null; contact_name: string; role: string | null; email: string | null; phone: string | null; is_primary: boolean; notes: string | null }
interface PropertyOpt { id: string; address: string }
interface Prospect {
  id: string; contact_name: string | null; contact_company: string | null; contact_email: string | null; contact_phone: string | null
  inquiry_type: string | null; sf_needed: string | number | null; market: string | null; submarket: string | null
  timeline: string | null; matched_address: string | null; status: string | null; received_at: string | null; summary: string | null
}

function roleStyle(role?: string | null): { color: string; bg: string } {
  switch (role) {
    case 'Primary': return { color: '#0f766e', bg: '#e4f2ef' }
    case 'Billing/AP': return { color: '#9a5b12', bg: '#fbeed7' }
    case 'Lease Signatory': return { color: '#3b4a86', bg: '#eceff9' }
    case 'Facilities': return { color: '#6b21a8', bg: '#f2e9fb' }
    case 'Emergency': return { color: '#b91c1c', bg: '#fdeaea' }
    default: return { color: '#6b7280', bg: '#f1f2f4' }
  }
}
function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const t = new Date(d); if (isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TenantCrmView() {
  const [tab, setTab] = useState<'current' | 'prospects' | 'former'>('current')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [properties, setProperties] = useState<PropertyOpt[]>([])
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [contactCounts, setContactCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Tenant | null>(null)
  const [editingTenant, setEditingTenant] = useState<Partial<Tenant> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, pRes] = await Promise.all([fetch('/api/tenant-crm'), fetch('/api/leasing-inquiries')])
      const tJson = await tRes.json()
      if (!tRes.ok || tJson.error) { setError(tJson.error ?? `Load failed (${tRes.status})`); return }
      setTenants(tJson.tenants ?? [])
      setProperties(tJson.properties ?? [])
      const pJson = await pRes.json().catch(() => ({}))
      setProspects(pJson.items ?? [])
      setError(null)
    } catch (e) { setError(String(e)) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // Lightweight contact counts for the list (one call per tenant would be heavy; fetch lazily is
  // fine, but a single roll-up keeps the list informative). We count via the contacts we hold.
  useEffect(() => {
    let cancelled = false
    async function counts() {
      const entries = await Promise.all(tenants.map(async t => {
        try { const r = await fetch(`/api/tenant-crm/contacts?tenant_id=${t.id}`); const j = await r.json(); return [t.id, (j.contacts ?? []).length] as const }
        catch { return [t.id, 0] as const }
      }))
      if (!cancelled) setContactCounts(Object.fromEntries(entries))
    }
    if (tenants.length) counts()
    return () => { cancelled = true }
  }, [tenants])

  const q = search.trim().toLowerCase()
  const currentRows = useMemo(() => tenants.filter(t => t.status === 'Current').filter(t => !q || t.name.toLowerCase().includes(q) || (t.industry || '').toLowerCase().includes(q)), [tenants, q])
  const formerRows = useMemo(() => tenants.filter(t => t.status === 'Former').filter(t => !q || t.name.toLowerCase().includes(q)), [tenants, q])
  const prospectRows = useMemo(() => prospects.filter(p => !q || (p.contact_company || '').toLowerCase().includes(q) || (p.contact_name || '').toLowerCase().includes(q)), [prospects, q])

  async function saveTenant(draft: Partial<Tenant>) {
    const isNew = !draft.id
    const res = await fetch('/api/tenant-crm', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) })
    const j = await res.json()
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    if (isNew) setTenants(ts => [...ts, j.tenant].sort((a, b) => a.name.localeCompare(b.name)))
    else setTenants(ts => ts.map(t => t.id === j.tenant.id ? j.tenant : t))
    setEditingTenant(null)
    if (selected?.id === j.tenant.id) setSelected(j.tenant)
  }
  async function deleteTenant(id: string) {
    if (!window.confirm('Delete this tenant and all its contacts?')) return
    const res = await fetch(`/api/tenant-crm?id=${id}`, { method: 'DELETE' })
    if (res.ok) { setTenants(ts => ts.filter(t => t.id !== id)); setSelected(null) }
  }
  async function convertProspect(p: Prospect) {
    const name = (p.contact_company || p.contact_name || '').trim()
    if (!name) { alert('This prospect has no company/contact name to convert.'); return }
    if (!window.confirm(`Create a Current tenant "${name}" from this prospect?`)) return
    const res = await fetch('/api/tenant-crm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, status: 'Current', market: p.market }) })
    const j = await res.json()
    if (!res.ok || j.error) { alert(`Convert failed: ${j.error ?? res.status}`); return }
    // Seed a primary contact from the prospect's contact info.
    if (p.contact_name || p.contact_email || p.contact_phone) {
      await fetch('/api/tenant-crm/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenant_id: j.tenant.id, contact_name: p.contact_name || name, role: 'Primary', email: p.contact_email, phone: p.contact_phone, is_primary: true, property_label: p.matched_address }) })
    }
    setTenants(ts => [...ts, j.tenant].sort((a, b) => a.name.localeCompare(b.name)))
    setTab('current'); setSelected(j.tenant)
  }

  const rows = tab === 'current' ? currentRows : tab === 'former' ? formerRows : []
  const tabs = [['current', `Current Tenants (${currentRows.length})`], ['prospects', `Tenant Prospects (${prospectRows.length})`], ['former', `Former Tenants (${formerRows.length})`]] as const

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Leasing</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>Tenant CRM</h1>
        </div>
        {tab !== 'prospects' && <button onClick={() => setEditingTenant({ status: tab === 'former' ? 'Former' : 'Current' })} style={{ border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, padding: '10px 16px', fontWeight: 600, cursor: 'pointer' }}>+ Add Tenant</button>}
      </div>

      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid #e5e7eb', marginBottom: 14 }}>
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14.5, color: tab === k ? '#1a2233' : '#9ca3af', padding: '10px 15px', borderBottom: tab === k ? '2px solid #0f766e' : '2px solid transparent', marginBottom: -1 }}>{label}</button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', maxWidth: 340, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 14 }} />

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Loading…</div>}
      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {!loading && !error && tab !== 'prospects' && (
        <div style={cardCss}>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableCss}>
              <thead><tr style={theadRow}>
                <th style={thCss}>Tenant</th><th style={thCss}>Industry</th><th style={thCss}>Market</th><th style={thCss}>Contacts</th><th style={thCss}>Owner</th>
              </tr></thead>
              <tbody>
                {rows.map(t => (
                  <tr key={t.id} onClick={() => setSelected(t)} style={{ borderTop: '1px solid #f0f1f3', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <td style={tdCss}><div style={{ fontWeight: 600, color: '#1a2233' }}>{t.name}</div></td>
                    <td style={tdCss}>{t.industry || '—'}</td>
                    <td style={tdCss}>{t.market || '—'}</td>
                    <td style={tdCss}>{contactCounts[t.id] ?? '·'}</td>
                    <td style={tdCss}>{t.owner || '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>{tab === 'former' ? 'No former tenants. Flip a current tenant to Former from its record.' : 'No tenants yet. Add one, or convert a prospect.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !error && tab === 'prospects' && (
        <div style={cardCss}>
          <div style={{ padding: '10px 14px', fontSize: 12.5, color: '#9ca3af', borderBottom: '1px solid #f0f1f3' }}>Live from Inbound Leasing — prospective tenants inquiring about space.</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={tableCss}>
              <thead><tr style={theadRow}>
                <th style={thCss}>Prospect</th><th style={thCss}>Needs</th><th style={thCss}>Market</th><th style={thCss}>Timeline</th><th style={thCss}>Matched</th><th style={thCss}></th>
              </tr></thead>
              <tbody>
                {prospectRows.map(p => (
                  <tr key={p.id} style={{ borderTop: '1px solid #f0f1f3' }}>
                    <td style={tdCss}><div style={{ fontWeight: 600, color: '#1a2233' }}>{p.contact_company || p.contact_name || '—'}</div><div style={{ fontSize: 12, color: '#9ca3af' }}>{[p.contact_name, p.contact_email].filter(Boolean).join(' · ')}</div></td>
                    <td style={tdCss}>{[p.inquiry_type, p.sf_needed ? `${p.sf_needed} SF` : null].filter(Boolean).join(' · ') || '—'}</td>
                    <td style={tdCss}>{[p.market, p.submarket].filter(Boolean).join(' / ') || '—'}</td>
                    <td style={tdCss}>{p.timeline || '—'}</td>
                    <td style={tdCss}>{p.matched_address || <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ ...tdCss, textAlign: 'right', whiteSpace: 'nowrap' }}><button onClick={() => convertProspect(p)} style={{ border: '1px solid #0f766e', background: '#f0f9f7', color: '#0f766e', borderRadius: 8, padding: '5px 11px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Convert to Tenant</button></td>
                  </tr>
                ))}
                {prospectRows.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>No active prospects in Inbound Leasing.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <TenantDrawer tenant={selected} properties={properties} onClose={() => setSelected(null)} onEdit={() => setEditingTenant(selected)} onDelete={() => deleteTenant(selected.id)} onStatus={(s) => saveTenant({ id: selected.id, status: s })} onContactsChanged={(n) => setContactCounts(c => ({ ...c, [selected.id]: n }))} />}
      {editingTenant && <TenantModal draft={editingTenant} onCancel={() => setEditingTenant(null)} onSave={saveTenant} />}
    </div>
  )
}

// ── Tenant drawer ─────────────────────────────────────────────────────────────

function TenantDrawer({ tenant, properties, onClose, onEdit, onDelete, onStatus, onContactsChanged }: {
  tenant: Tenant; properties: PropertyOpt[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onStatus: (s: string) => void; onContactsChanged: (n: number) => void
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [editingContact, setEditingContact] = useState<Partial<Contact> | null>(null)

  const loadContacts = useCallback(async () => {
    try { const r = await fetch(`/api/tenant-crm/contacts?tenant_id=${tenant.id}`); const j = await r.json(); setContacts(j.contacts ?? []); onContactsChanged((j.contacts ?? []).length) }
    catch { setContacts([]) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id])
  useEffect(() => { loadContacts() }, [loadContacts])

  async function saveContact(draft: Partial<Contact>) {
    const isNew = !draft.id
    const res = await fetch('/api/tenant-crm/contacts', { method: isNew ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, tenant_id: tenant.id }) })
    const j = await res.json()
    if (!res.ok || j.error) { alert(`Save failed: ${j.error ?? res.status}`); return }
    setEditingContact(null); loadContacts()
  }
  async function deleteContact(id: string) {
    if (!window.confirm('Remove this contact?')) return
    const res = await fetch(`/api/tenant-crm/contacts?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadContacts()
  }

  // Group contacts by property (null → tenant-wide).
  const groups = useMemo(() => {
    const m = new Map<string, Contact[]>()
    for (const c of contacts ?? []) { const k = c.property_label || 'Tenant-wide'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(c) }
    return [...m.entries()]
  }, [contacts])

  const initials = tenant.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(880px, 96vw)', height: '100%', background: '#eef0f4', overflowY: 'auto', boxShadow: '-8px 0 30px rgba(0,0,0,.2)' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Tenant CRM <span style={{ color: '#c7ccd4' }}>›</span> <b style={{ color: '#1a2233' }}>{tenant.name}</b></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onEdit} style={ghostBtn}>Edit</button>
            <button onClick={onDelete} style={{ ...ghostBtn, color: '#b91c1c' }}>Delete</button>
            <button onClick={onClose} style={ghostBtn}>Close ✕</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, padding: 16, alignItems: 'start' }}>
          <aside style={{ ...cardCss, padding: 20, textAlign: 'center' }}>
            <div style={{ width: 70, height: 70, borderRadius: 14, margin: '0 auto 12px', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 23, background: 'linear-gradient(150deg,#0f766e,#1a2233)' }}>{initials}</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: '#1a2233' }}>{tenant.name}</div>
            <div style={{ marginTop: 12, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <RailField label="Status">
                <select value={tenant.status} onChange={e => onStatus(e.target.value)} style={selCss}>
                  <option value="Current">Current</option><option value="Former">Former</option>
                </select>
              </RailField>
              <RailField label="Industry"><div style={railVal}>{tenant.industry || '—'}</div></RailField>
              <RailField label="Market"><div style={railVal}>{tenant.market || '—'}</div></RailField>
              <RailField label="Relationship Owner"><div style={railVal}>{tenant.owner || '—'}</div></RailField>
              {tenant.notes && <RailField label="Notes"><div style={{ fontSize: 13, color: '#6b7280' }}>{tenant.notes}</div></RailField>}
            </div>
          </aside>

          <div style={{ ...cardCss, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={sectTitle}>Contacts &amp; Functions</div>
              <button onClick={() => setEditingContact({ role: 'Primary' })} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 13, color: '#374151' }}>+ Add contact</button>
            </div>
            {contacts == null && <div style={{ color: '#9ca3af' }}>Loading…</div>}
            {contacts && contacts.length === 0 && <div style={{ color: '#9ca3af', fontSize: 14, padding: '10px 0' }}>No contacts yet. Add the tenant&apos;s people and their function at each property.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {groups.map(([label, cs]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>🏢 {label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cs.map(c => {
                      const rs = roleStyle(c.role)
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', border: '1px solid #eef0f2', borderRadius: 10, background: '#fbfcfd' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 600, fontSize: 14.5 }}>{c.contact_name}</span>
                              {c.role && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, color: rs.color, background: rs.bg }}>{c.role}</span>}
                              {c.is_primary && <span style={{ fontSize: 10, fontWeight: 700, color: '#9a6b12' }}>★ PRIMARY</span>}
                            </div>
                            <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>{[c.email, c.phone].filter(Boolean).join(' · ') || '—'}</div>
                            {c.notes && <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{c.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => setEditingContact(c)} style={miniBtn}>Edit</button>
                            <button onClick={() => deleteContact(c.id)} style={{ ...miniBtn, color: '#b91c1c' }}>✕</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editingContact && <ContactModal draft={editingContact} properties={properties} onCancel={() => setEditingContact(null)} onSave={saveContact} />}
    </div>
  )
}

// ── Modals ────────────────────────────────────────────────────────────────────

function TenantModal({ draft, onCancel, onSave }: { draft: Partial<Tenant>; onCancel: () => void; onSave: (d: Partial<Tenant>) => void }) {
  const [d, setD] = useState<Partial<Tenant>>(draft)
  const set = (k: keyof Tenant, v: string) => setD(p => ({ ...p, [k]: v }))
  return (
    <div onClick={onCancel} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={modalCard}>
        <h2 style={modalTitle}>{d.id ? 'Edit Tenant' : 'Add Tenant'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}><ModalField label="Tenant Name"><input value={d.name || ''} onChange={e => set('name', e.target.value)} style={inputCss} /></ModalField></div>
          <ModalField label="Status"><select value={d.status || 'Current'} onChange={e => set('status', e.target.value)} style={inputCss}><option value="Current">Current</option><option value="Former">Former</option></select></ModalField>
          <ModalField label="Market"><input value={d.market || ''} onChange={e => set('market', e.target.value)} style={inputCss} /></ModalField>
          <ModalField label="Industry"><input value={d.industry || ''} onChange={e => set('industry', e.target.value)} style={inputCss} /></ModalField>
          <ModalField label="Relationship Owner"><input value={d.owner || ''} onChange={e => set('owner', e.target.value)} style={inputCss} /></ModalField>
          <div style={{ gridColumn: '1 / -1' }}><ModalField label="Notes"><textarea value={d.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} style={inputCss} /></ModalField></div>
        </div>
        <div style={modalActions}>
          <button onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button onClick={() => { if (!(d.name || '').trim()) { alert('Tenant name is required'); return } onSave(d) }} style={primaryBtn}>{d.id ? 'Save' : 'Add Tenant'}</button>
        </div>
      </div>
    </div>
  )
}

function ContactModal({ draft, properties, onCancel, onSave }: { draft: Partial<Contact>; properties: PropertyOpt[]; onCancel: () => void; onSave: (d: Partial<Contact>) => void }) {
  const [d, setD] = useState<Partial<Contact>>(draft)
  const set = (k: keyof Contact, v: string | boolean) => setD(p => ({ ...p, [k]: v }))
  return (
    <div onClick={onCancel} style={modalBackdrop}>
      <div onClick={e => e.stopPropagation()} style={modalCard}>
        <h2 style={modalTitle}>{d.id ? 'Edit Contact' : 'Add Contact'}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <ModalField label="Name"><input value={d.contact_name || ''} onChange={e => set('contact_name', e.target.value)} style={inputCss} /></ModalField>
          <ModalField label="Function / Role"><select value={d.role || 'Primary'} onChange={e => set('role', e.target.value)} style={inputCss}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></ModalField>
          <div style={{ gridColumn: '1 / -1' }}><ModalField label="Property (function applies at)">
            <select value={d.property_id || ''} onChange={e => { const opt = properties.find(p => p.id === e.target.value); setD(p => ({ ...p, property_id: e.target.value || null, property_label: opt?.address || null })) }} style={inputCss}>
              <option value="">Tenant-wide (all properties)</option>
              {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
          </ModalField></div>
          <ModalField label="Email"><input value={d.email || ''} onChange={e => set('email', e.target.value)} style={inputCss} /></ModalField>
          <ModalField label="Phone"><input value={d.phone || ''} onChange={e => set('phone', e.target.value)} style={inputCss} /></ModalField>
          <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151', fontWeight: 600 }}><input type="checkbox" checked={!!d.is_primary} onChange={e => set('is_primary', e.target.checked)} /> Primary contact for this tenant</label></div>
          <div style={{ gridColumn: '1 / -1' }}><ModalField label="Notes"><textarea value={d.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} style={inputCss} /></ModalField></div>
        </div>
        <div style={modalActions}>
          <button onClick={onCancel} style={ghostBtn}>Cancel</button>
          <button onClick={() => { if (!(d.contact_name || '').trim()) { alert('Contact name is required'); return } onSave(d) }} style={primaryBtn}>{d.id ? 'Save' : 'Add Contact'}</button>
        </div>
      </div>
    </div>
  )
}

// ── shared bits ───────────────────────────────────────────────────────────────
function RailField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f1f3' }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</div>{children}</div>
}
function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>{label}</span>{children}</label>
}

const cardCss: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(20,28,45,.05)' }
const tableCss: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 14 }
const theadRow: React.CSSProperties = { background: '#f8f9fb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }
const thCss: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const tdCss: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }
const sectTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6b7280' }
const selCss: React.CSSProperties = { width: '100%', marginTop: 3, background: '#f8f9fb', border: '1px solid #d1d5db', borderRadius: 8, padding: '7px 10px', fontSize: 13.5, fontWeight: 600, color: '#1a2233', cursor: 'pointer' }
const railVal: React.CSSProperties = { fontSize: 14, color: '#1a2233', fontWeight: 500, marginTop: 3 }
const inputCss: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit' }
const ghostBtn: React.CSSProperties = { border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }
const miniBtn: React.CSSProperties = { border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#0e7490', padding: '2px 4px' }
const primaryBtn: React.CSSProperties = { border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }
const modalBackdrop: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(15,20,32,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const modalCard: React.CSSProperties = { width: 'min(560px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }
const modalTitle: React.CSSProperties = { margin: '0 0 16px', fontSize: 19, fontWeight: 700, color: '#1a2233' }
const modalActions: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }
