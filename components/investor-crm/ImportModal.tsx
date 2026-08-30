'use client'

import { useState } from 'react'

// ── Investor workbook import ──────────────────────────────────────────────────
// Parses an .xls/.xlsx in the browser and maps its columns to investors + contacts.
// Handles the two shapes we get today:
//  • LP directory  — Investor | Primary Contact | Commitment | Lead | Notes, grouped by close
//  • Prospect export — Account Name | Lead | Notes | Next Steps | First/Last | Title | Phone |
//                      Mobile | Email | Mailing Street/City/State/Zip
// Re-importing an updated file refreshes records rather than duplicating them.

interface InvestorRow {
  investor: string; fund?: string | null; committed_usd?: number | null
  contact?: string | null; notes?: string | null; owner?: string | null; expected_close?: string | null
}
interface ContactRow {
  investor: string; name: string; title?: string | null; email?: string | null
  phone_office?: string | null; phone_cell?: string | null; address?: string | null
  notes?: string | null; is_primary?: boolean
}
interface OtherRow {
  name: string; category: string; contact?: string | null; title?: string | null; email?: string | null
  phone?: string | null; phone_cell?: string | null; address?: string | null
  owner?: string | null; notes?: string | null
}
interface Parsed { investors: InvestorRow[]; contacts: ContactRow[]; others: OtherRow[]; sheet: string; shape: string }

// Exports mix record types in a "Description" column; only investor rows belong in the CRM lists.
const OTHER_CATEGORIES: Record<string, string> = {
  lender: 'Lender', 'law firm': 'Law Firm', lawfirm: 'Law Firm', vendor: 'Vendor',
}

const T = (v: unknown) => String(v ?? '').trim()
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

// "1st Close (September 18, 2017)" -> 2017-09-18
function closeDate(label: string): string | null {
  const m = label.match(/\(([A-Z][a-z]+ \d{1,2}, \d{4})\)/)
  if (!m) return null
  const d = new Date(m[1])
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// Find the header row and map the columns we care about by name.
function findHeader(rows: unknown[][]): { idx: number; col: Record<string, number> } | null {
  const want: Record<string, RegExp> = {
    investor: /^(investor|accountname|account|entity|lpname|name)$/,
    contact: /^(primarycontact|contact)$/,
    commitment: /^(commitment|committed|amount)$/,
    lead: /^(lead|owner|relationshipowner)$/,
    notes: /^(notes|note)$/,
    nextsteps: /^nextsteps$/,
    first: /^(firstname|first)$/,
    last: /^(lastname|last)$/,
    title: /^title$/,
    kind: /^(description|recordtype|type)$/,
    phone: /^(phone|officephone|work)$/,
    mobile: /^(mobile|cell|cellphone)$/,
    email: /^(email|emailaddress)$/,
    street: /^(mailingstreet|street|address)$/,
    city: /^(mailingcity|city)$/,
    state: /^(mailingstateprovince|state|stateprovince)$/,
    zip: /^(mailingzippostalcode|zip|postalcode)$/,
  }
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = (rows[i] ?? []).map(c => clean(T(c)))
    const col: Record<string, number> = {}
    for (const [key, re] of Object.entries(want)) {
      const at = cells.findIndex(c => c && re.test(c))
      if (at >= 0 && col[key] === undefined) col[key] = at
    }
    // A usable header names the entity and at least one other field we understand.
    if (col.investor !== undefined && Object.keys(col).length >= 2) return { idx: i, col }
  }
  return null
}

async function parseWorkbook(file: File): Promise<Parsed> {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  // Use the first sheet that yields a header we understand.
  for (const sheet of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet], { header: 1, defval: '', blankrows: false })
    const head = findHeader(rows)
    if (!head) continue
    const { idx, col } = head
    const at = (r: unknown[], k: string) => (col[k] === undefined ? '' : T(r[col[k]]))

    const investors = new Map<string, InvestorRow>()
    const contacts: ContactRow[] = []
    const others: OtherRow[] = []
    const hasPeople = col.first !== undefined || col.last !== undefined || col.email !== undefined
    let sectionDate: string | null = null

    for (let i = idx + 1; i < rows.length; i++) {
      const r = rows[i] ?? []
      const investor = at(r, 'investor')
      if (!investor || /^(grand\s+|sub\s*)?total\b/i.test(investor)) continue

      // Route non-investor records (lenders, law firms, vendors) to the Other directory.
      const kind = OTHER_CATEGORIES[at(r, 'kind').toLowerCase()]
      if (kind) {
        const person = [at(r, 'first'), at(r, 'last')].filter(Boolean).join(' ').trim() || at(r, 'contact')
        const addr = [at(r, 'street'), at(r, 'city'), [at(r, 'state'), at(r, 'zip')].filter(Boolean).join(' ')]
          .filter(Boolean).join(', ')
        others.push({
          name: investor, category: kind, contact: person || null, title: at(r, 'title') || null,
          email: at(r, 'email') || null, phone: at(r, 'phone') || null, phone_cell: at(r, 'mobile') || null,
          address: addr || null, owner: at(r, 'lead') || null,
          notes: [at(r, 'notes'), at(r, 'nextsteps')].filter(Boolean).join(' | ') || null,
        })
        continue
      }

      const contactName = at(r, 'contact')
      const rawAmount = col.commitment === undefined ? '' : T(r[col.commitment])
      const amount = Number(rawAmount.replace(/[$,]/g, '')) || 0

      // A row with only a name is a section header (e.g. a close cohort) in LP directories.
      if (!hasPeople && !contactName && !amount) { sectionDate = closeDate(investor); continue }

      const notes = [at(r, 'notes'), at(r, 'nextsteps')].filter(Boolean).join(' | ')
      if (!investors.has(investor)) {
        investors.set(investor, {
          investor,
          committed_usd: amount || null,
          contact: contactName || null,
          notes: notes || null,
          owner: at(r, 'lead') || null,
          expected_close: sectionDate,
        })
      } else if (notes) {
        const ex = investors.get(investor)!
        if (!ex.notes) ex.notes = notes
      }

      if (hasPeople) {
        const name = [at(r, 'first'), at(r, 'last')].filter(Boolean).join(' ').trim()
        const email = at(r, 'email')
        if (name || email) {
          const address = [at(r, 'street'), at(r, 'city'), [at(r, 'state'), at(r, 'zip')].filter(Boolean).join(' ')]
            .filter(Boolean).join(', ')
          contacts.push({
            investor, name: name || email, title: at(r, 'title') || null, email: email || null,
            phone_office: at(r, 'phone') || null, phone_cell: at(r, 'mobile') || null,
            address: address || null, is_primary: false,
          })
        }
      } else if (contactName) {
        // LP-directory shape: one primary contact, with any "(Windstar)" affiliation split out.
        const m = contactName.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
        contacts.push({
          investor, name: (m ? m[1] : contactName).trim(),
          notes: m ? `Via ${m[2].trim()}` : null, is_primary: true,
        })
      }
    }

    if (investors.size || others.length) {
      return {
        investors: [...investors.values()], contacts, others, sheet,
        shape: hasPeople ? 'prospect export (multiple contacts per account)' : 'LP directory (one primary contact)',
      }
    }
  }
  throw new Error('No recognizable investor columns found. Expected an "Investor" or "Account Name" column.')
}

export default function ImportModal({ program, defaultFund, onClose, onDone }: {
  program: 'PE' | 'DST'; defaultFund?: string; onClose: () => void; onDone: () => void
}) {
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [fund, setFund] = useState(defaultFund ?? '')
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null); setResult(null); setParsed(null); setFileName(file.name)
    setBusy(true)
    try { setParsed(await parseWorkbook(file)) }
    catch (e) { setError(String(e instanceof Error ? e.message : e)) }
    finally { setBusy(false) }
  }

  async function run() {
    if (!parsed) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/investor-crm/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: fileName.replace(/\.[^.]+$/, '').slice(0, 40),
          program,
          investors: parsed.investors.map(v => ({ ...v, fund: fund || null, program })),
          contacts: parsed.contacts,
          others: parsed.others,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error ?? `Import failed (${res.status})`); return }
      setResult(`Imported ${j.investors} investors, ${j.contacts} contacts${j.others ? ` and ${j.others} records into Other` : ''}.`)
      onDone()
    } catch (e) { setError(String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,20,32,.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(600px, 96vw)', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 14, padding: 24 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 700, color: '#1a2233' }}>Import investors</h2>
        <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 16 }}>
          Upload an LP directory or prospect export (.xls / .xlsx). Columns are detected automatically,
          and re-importing an updated file refreshes existing records rather than duplicating them.
        </div>

        <label style={{ display: 'block', border: '1px dashed #cbd5e1', borderRadius: 10, padding: 18, textAlign: 'center', cursor: 'pointer', background: '#f8fafc' }}>
          <input type="file" accept=".xls,.xlsx,.csv" style={{ display: 'none' }}
            onChange={e => pick(e.target.files?.[0])} />
          <div style={{ fontWeight: 600, color: '#374151' }}>{fileName || 'Choose a spreadsheet…'}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>.xls, .xlsx or .csv</div>
        </label>

        {busy && !parsed && <div style={{ marginTop: 14, color: '#9ca3af', fontSize: 13.5 }}>Reading the workbook…</div>}
        {error && <div style={{ marginTop: 14, padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13.5 }}>{error}</div>}

        {parsed && (
          <div style={{ marginTop: 16 }}>
            <div style={{ padding: 12, background: '#f0f9f7', border: '1px solid #cfe9e3', borderRadius: 8, fontSize: 13.5, color: '#134e4a' }}>
              Found <b>{parsed.investors.length}</b> investors and <b>{parsed.contacts.length}</b> contacts
              in <b>{parsed.sheet}</b> — {parsed.shape}.
              {parsed.others.length > 0 && <> Plus <b>{parsed.others.length}</b> non-investor records
              (lenders, law firms, vendors) which go to the <b>Other</b> directory.</>}
            </div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#9ca3af' }}>Tag these investors with a fund</span>
              <input value={fund} onChange={e => setFund(e.target.value)} placeholder="e.g. Fund II — leave blank for none"
                style={{ padding: '9px 11px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14 }} />
            </label>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
              Imported as {program === 'DST' ? 'DST' : 'PE'} records. Those with a commitment appear in
              the LP Directory; those without appear in Prospects.
            </div>
          </div>
        )}

        {result && <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600, color: '#197a52' }}>{result}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button onClick={onClose} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 9, padding: '9px 16px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
            {result ? 'Done' : 'Cancel'}
          </button>
          <button onClick={run} disabled={!parsed || busy || !!result}
            style={{ border: 0, background: '#0f766e', color: '#fff', borderRadius: 9, padding: '9px 18px', fontWeight: 600, cursor: parsed && !busy && !result ? 'pointer' : 'not-allowed', opacity: parsed && !busy && !result ? 1 : 0.55 }}>
            {busy && parsed ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  )
}
