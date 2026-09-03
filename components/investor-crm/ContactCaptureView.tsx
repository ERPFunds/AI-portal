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
  // firm = a business address, individual = gmail and the like. Service senders never
  // reach the tab. twoWay means somebody actually replied — the rest is one-way traffic.
  // firm / individual are the ones worth a look. The rest are the categories the team asked
  // to leave out — they are classified rather than deleted, so an over-reaching filter can be
  // spotted and corrected.
  kind?: 'firm' | 'individual' | 'service' | 'platform' | 'contractor' | 'legal' | 'education' | 'event' | 'research'
  sent?: number
  received?: number
  twoWay?: boolean
  // Set once someone has filed this person into a directory. The row then stays as a record.
  filedTo?: string | null
  filedAccount?: string | null
  filedAt?: string | null
}

// What the tab shows by default, and what each excluded category is called on screen.
const SHOWN_KINDS = ['firm', 'individual']
const KIND_LABEL: Record<string, string> = {
  firm: 'Firms', individual: 'Individuals', service: 'Automated / service',
  platform: 'Platform notices', contractor: 'Contractors', legal: 'Law firms',
  education: 'Schools', event: 'Conferences', research: 'Market commentary',
}

// Where a captured person can be filed. These are the directories as they appear in the
// sidebar, so the choice reads the same here as it does where the record ends up.
type Dest = {
  key: string; label: string; where: string
  kind: 'investor' | 'vendor'
  program?: 'PE' | 'DST'; isLp?: boolean; desk?: 'dst' | 'property' | 'lender'
}
const DESTINATIONS: Dest[] = [
  { key: 'pe-prospects', label: 'PE Prospects',    where: 'Investor CRM', kind: 'investor', program: 'PE',  isLp: false },
  { key: 'lp-directory', label: 'LP Directory',    where: 'Investor CRM', kind: 'investor', program: 'PE',  isLp: true },
  { key: 'dst-investors', label: 'DST Investors',  where: 'Investor CRM', kind: 'investor', program: 'DST', isLp: true },
  { key: 'dst-vendors',  label: 'DST Vendors',     where: 'Investor CRM', kind: 'vendor',   desk: 'dst' },
  { key: 'prop-vendors', label: 'Property Vendors', where: 'Property CRM', kind: 'vendor',  desk: 'property' },
  { key: 'prop-lenders', label: 'Lenders',          where: 'Property CRM', kind: 'vendor',  desk: 'lender' },
]

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
  const [kind, setKind] = useState('All')
  // The excluded categories — contractors, law firms, platform notices, conferences, schools,
  // market commentary, automated senders — are hidden unless this is on.
  const [showExcluded, setShowExcluded] = useState(false)
  // Default to people someone actually corresponded with. One inbound email that nobody
  // answered is almost always a stranger or a blast, and that is what made the list unusable.
  const [twoWayOnly, setTwoWayOnly] = useState(true)
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // The person waiting on a "file it where?" decision.
  const [filing, setFiling] = useState<Candidate | null>(null)

  // Reads the daily cron's result by default; refresh=1 walks the mailboxes live.
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setItems(null)
    setError(null)
    try {
      const res = await fetch(`/api/investor-crm/capture${refresh ? '?refresh=1' : ''}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Scan failed (${res.status})`); setItems(j.contacts ?? []); return }
      setItems(j.contacts ?? [])
      setScannedAt(j.scannedAt ?? null)
    } catch (e) { setError(String(e)); setItems([]) }
    finally { setRefreshing(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const mailboxes = useMemo(() => [...new Set((items ?? []).map(i => i.mailbox))].sort(), [items])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (items ?? [])
      .filter(i => mailbox === 'All' || i.mailbox === mailbox)
      // A person already filed always stays visible — it is a record of work done.
      .filter(i => i.filedTo || showExcluded || !i.kind || SHOWN_KINDS.includes(i.kind))
      .filter(i => kind === 'All' || i.kind === kind)
      .filter(i => i.filedTo || !twoWayOnly || i.twoWay !== false)
      .filter(i => !q || i.email.toLowerCase().includes(q) || (i.name || '').toLowerCase().includes(q) || (i.subject || '').toLowerCase().includes(q))
  }, [items, search, mailbox, kind, twoWayOnly, showExcluded])
  const hiddenOneWay = useMemo(
    () => (twoWayOnly ? (items ?? []).filter(i => !i.filedTo && i.twoWay === false).length : 0), [items, twoWayOnly])
  const hiddenExcluded = useMemo(
    () => (showExcluded ? 0 : (items ?? []).filter(i => !i.filedTo && i.kind && !SHOWN_KINDS.includes(i.kind)).length),
    [items, showExcluded])
  // Which excluded categories are actually present, so the count can say what it is hiding.
  const excludedKinds = useMemo(() => {
    const seen = new Map<string, number>()
    for (const i of items ?? []) {
      if (i.filedTo || !i.kind || SHOWN_KINDS.includes(i.kind)) continue
      seen.set(i.kind, (seen.get(i.kind) ?? 0) + 1)
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [items])
  const filedCount = useMemo(() => (items ?? []).filter(i => i.filedTo).length, [items])

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

  // File a captured person into the directory the user picked, creating the account and
  // attaching them to it as its primary contact.
  async function fileInto(c: Candidate, dest: Dest) {
    const suggested = c.name || c.email
    const account = window.prompt(
      `Add to ${dest.label}.\n\nWhat is the account called? For a company use the company name; for an individual their own name is fine.`,
      suggested)
    if (!account || !account.trim()) return
    const name = account.trim()
    setFiling(null); setBusy(c.email)
    try {
      if (dest.kind === 'investor') {
        const res = await fetch('/api/investor-crm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investor: name, program: dest.program, is_lp: dest.isLp, contact: c.name || null, email: c.email }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j.error) { setNote(`Could not add: ${j.error ?? res.status}`); return }
        await fetch('/api/investor-crm/people', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investor: name, name: c.name || c.email, email: c.email, is_primary: true }),
        }).catch(() => {})
      } else {
        const res = await fetch('/api/dst-vendors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ desk: dest.desk, name, vendor_type: 'Other' }),
        })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || j.error) { setNote(`Could not add: ${j.error ?? res.status}`); return }
        const vendorId = j.vendor?.id ?? j.item?.id ?? j.id
        if (!vendorId) { setNote(`Added ${name}, but could not attach the contact — open the account and add them.`); return }
        await fetch('/api/dst-vendors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'contact', desk: dest.desk, vendor_id: vendorId, name: c.name || c.email, email: c.email, is_primary: true }),
        }).catch(() => {})
      }
      // Record the filing so the row stays here, marked, instead of vanishing on the next
      // scan once the new account makes this person "already known".
      await fetch('/api/investor-crm/capture', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'filed', email: c.email, destination: dest.label, account: name }),
      }).catch(() => {})
      setItems(prev => (prev ?? []).map(x => x.email === c.email
        ? { ...x, filedTo: dest.label, filedAccount: name, filedAt: new Date().toISOString() }
        : x))
      setNote(`Added ${name} — find it under ${dest.where} › ${dest.label}.`)
    } catch (e) { setNote(`Could not add: ${String(e)}`) }
    finally { setBusy(null) }
  }

  return (
    <div style={{ padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: '#9ca3af' }}>Investor CRM</div>
          <h1 style={{ margin: '2px 0 0', fontSize: 24, fontWeight: 700, color: '#1a2233' }}>New Contact Capture</h1>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
            People in Meghan&apos;s and William&apos;s correspondence since July who aren&apos;t in any directory yet
            {scannedAt && <> · scanned {fmtDate(scannedAt)}</>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>NEW CONTACTS</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2233' }}>{items == null ? '·' : rows.length}</div>
          {filedCount > 0 && <div style={{ fontSize: 11.5, color: '#197a52', fontWeight: 600 }}>{filedCount} already added</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <select value={kind} onChange={e => setKind(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All kinds</option>
          <option value="firm">Firms only</option>
          <option value="individual">Individuals only</option>
          {showExcluded && excludedKinds.map(([k]) => <option key={k} value={k}>{KIND_LABEL[k] ?? k} only</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={showExcluded} onChange={e => setShowExcluded(e.target.checked)} />
          Show excluded
          {hiddenExcluded > 0 && <span style={{ color: '#9ca3af', fontWeight: 400 }}>({hiddenExcluded} hidden)</span>}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={twoWayOnly} onChange={e => setTwoWayOnly(e.target.checked)} />
          Replied to only
          {hiddenOneWay > 0 && <span style={{ color: '#9ca3af', fontWeight: 400 }}>({hiddenOneWay} hidden)</span>}
        </label>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, subject…"
          style={{ flex: 1, minWidth: 220, maxWidth: 340, padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
        <select value={mailbox} onChange={e => setMailbox(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontWeight: 600, color: '#374151' }}>
          <option value="All">All mailboxes</option>
          {mailboxes.map(m => <option key={m} value={m}>{MAILBOX_LABELS[m] ?? m}</option>)}
        </select>
        <button onClick={() => load(true)} disabled={items == null || refreshing}
          title="Walk the mailboxes now instead of using this morning's scan"
          style={{ border: '1px solid #0f766e', background: '#fff', borderRadius: 8, padding: '9px 14px', fontWeight: 600, fontSize: 13.5, color: '#0f766e', cursor: refreshing ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
          {items == null || refreshing ? '⟳ Scanning…' : '⟳ Rescan mailboxes'}
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
                      {c.kind && !SHOWN_KINDS.includes(c.kind) && (
                        <div style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#f3f4f6', color: '#6b7280' }}>
                          {KIND_LABEL[c.kind] ?? c.kind}
                        </div>
                      )}
                      {c.preview && <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 2 }}>{c.preview}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {c.filedTo ? (
                        <span title={`Added ${c.filedAt ? `on ${fmtDate(c.filedAt)}` : ''}`}
                          style={{ fontSize: 12.5, fontWeight: 600, color: '#197a52' }}>
                          ✓ {c.filedTo}
                          {c.filedAccount && <span style={{ color: '#6b7280', fontWeight: 400 }}> · {c.filedAccount}</span>}
                        </span>
                      ) : (<>
                        <button onClick={() => setFiling(c)} disabled={busy === c.email}
                          title="Choose which directory this person belongs in"
                          style={{ border: '1px solid #0f766e', background: '#f0f9f7', color: '#0f766e', borderRadius: 8, padding: '5px 11px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                          {busy === c.email ? 'Adding…' : 'Add to…'}
                        </button>
                        <button onClick={() => dismiss(c)} disabled={busy === c.email}
                          style={{ border: 0, background: 'none', color: '#9ca3af', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '0 8px' }}>
                          Dismiss
                        </button>
                      </>)}
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

      {filing && (
        <div onClick={() => setFiling(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(520px, 96vw)', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef0f2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#9ca3af' }}>Which directory?</div>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: '#1a2233', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {filing.name || filing.email}
                </div>
                {filing.name && <div style={{ fontSize: 12.5, color: '#0e7490' }}>{filing.email}</div>}
              </div>
              <button onClick={() => setFiling(null)}
                style={{ border: 0, background: 'none', fontSize: 20, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {DESTINATIONS.map(d => (
                <button key={d.key} onClick={() => fileInto(filing, d)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px',
                           border: '1px solid #e6edf1', borderRadius: 10, background: '#fff', cursor: 'pointer',
                           textAlign: 'left', fontFamily: 'inherit', width: '100%' }}>
                  <span>
                    <span style={{ display: 'block', fontWeight: 600, fontSize: 14.5, color: '#1a2233' }}>{d.label}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: '#9ca3af' }}>{d.where}</span>
                  </span>
                  <span style={{ color: '#0f766e', fontWeight: 700, fontSize: 16 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 14px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '11px 14px', verticalAlign: 'top' }
