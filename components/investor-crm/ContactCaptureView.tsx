'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'

// ── New investor contact capture ──────────────────────────────────────────────
// People the IR mailboxes have corresponded with who aren't in any portal directory yet.
// Each can be added as a portal investor (with the contact attached) or dismissed.

interface Candidate {
  email: string
  name: string
  lastDate: string
  subject: string
  mailbox: string
  direction: 'sent' | 'received'
  preview: string
}

const MAILBOX_LABELS: Record<string, string> = {
  'mberry@erpfunds.com': 'Meghan',
  'wmeyer@erpfunds.com': 'William',
  'team@erpfunds.com': 'Team',
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const t = new Date(d)
  if (isNaN(t.getTime())) return d
  return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ContactCaptureView() {
  const [items, setItems] = useState<Candidate[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mailbox, setMailbox] = useState('All')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    setItems(null); setError(null)
    try {
      const res = await fetch('/api/investor-crm/capture')
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Scan failed (${res.status})`); setItems([]); return }
      setItems(j.contacts ?? [])
    } catch (e) { setError(String(e)); setItems([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const mailboxes = useMemo(() => [...new Set((items ?? []).map(i => i.mailbox))].sort(), [items])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (items ?? [])
      .filter(i => mailbox === 'All' || i.mailbox === mailbox)
      .filter(i => !q || i.email.toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q) || (i.subject || '').toLowerCase().includes(q))
  }, [items, search, mailbox])

  async function dismiss(c: Candidate) {
    setBusy(c.email)
    try {
      await fetch('/api/investor-crm/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email }),
      })
      setItems(prev => (prev ?? []).filter(x => x.email !== c.email))
    } finally { setBusy(null) }
  }

  async function addAsInvestor(c: Candidate) {
    const suggested = c.name || c.email
    const investor = window.prompt('Add as investor — entity / investor name:', suggested)
    if (!investor || !investor.trim()) return
    setBusy(c.email)
    try {
      const res = await fetch('/api/investor-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor: investor.trim(), program: 'PE', contact: c.name || null, email: c.email }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setNote(`Could not add: ${j.error ?? res.status}`); return }
      // Attach the person to the new account as its primary contact.
      await fetch('/api/investor-crm/people', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor: investor.trim(), name: c.name || c.email, email: c.email, is_primary: true }),
      }).catch(() => {})
      setItems(prev => (prev ?? []).filter(x => x.email !== c.email))
      setNote(`Added ${investor.trim()} — find it under PE Prospects.`)
    } catch (e) { setNote(`Could not add: ${String(e)}`) }
    finally { setBusy(null) }
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Investor CRM</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>New Contact Capture</h1>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>People in Meghan&apos;s and William&apos;s correspondence who aren&apos;t in any directory yet</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>NEW CONTACTS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233' }}>{items == null ? '·' : rows.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, subject…"
          style={{ flex: 1, minWidth: 220, maxWidth: 340, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        <select value={mailbox} onChange={e => setMailbox(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All mailboxes</option>
          {mailboxes.map(m => <option key={m} value={m}>{MAILBOX_LABELS[m] ?? m}</option>)}
        </select>
        <button onClick={load} disabled={items == null}
          style={{ border: '1px solid #0f766e', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#0f766e', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {items == null ? '⟳ Scanning…' : '⟳ Rescan mailboxes'}
        </button>
      </div>

      {note && <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: '#197a52' }}>{note}</div>}
      {items == null && <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Scanning the IR mailboxes — this can take up to a minute.</div>}
      {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 12 }}>{error}</div>}

      {items != null && !error && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8f9fb', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <th style={th}>Contact</th>
                  <th style={th}>Mailbox</th>
                  <th style={th}>Last Email</th>
                  <th style={th}>Subject</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(c => (
                  <tr key={c.email} style={{ borderTop: '1px solid #f0f1f3' }}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#1a2233' }}>{c.name || c.email}</div>
                      {c.name && <div style={{ fontSize: 12, color: '#9ca3af' }}>{c.email}</div>}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: '#eceff9', color: '#3b4a86' }}>
                        {MAILBOX_LABELS[c.mailbox] ?? c.mailbox}
                      </span>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{c.direction === 'sent' ? 'we emailed' : 'they emailed'}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(c.lastDate)}</td>
                    <td style={{ ...td, maxWidth: 300 }}>
                      <div style={{ fontSize: 13, color: '#374151' }}>{c.subject || '—'}</div>
                      {c.preview && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{c.preview}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button onClick={() => addAsInvestor(c)} disabled={busy === c.email}
                        style={{ border: '1px solid #0f766e', background: '#f0f9f7', color: '#0f766e', borderRadius: 8, padding: '5px 11px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                        Add as investor
                      </button>
                      <button onClick={() => dismiss(c)} disabled={busy === c.email}
                        style={{ border: 0, background: 'none', color: '#9ca3af', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '0 8px' }}>
                        Dismiss
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                    No new contacts — everyone in recent correspondence is already in a directory.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }
