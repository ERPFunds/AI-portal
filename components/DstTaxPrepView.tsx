'use client'

import React, { useState } from 'react'

// UI MOCKUP — DST Tax Prep (Finance & Admin). Grantor tax letters for the Eastgate Business Park
// DST beneficiaries — the actual document, CPA review status, and whether it's been sent to each
// beneficiary, by tax year — plus the DST's vendor/interest 1099 filings. Mirrors the DST Tax Prep
// section in the standalone fund-admin app. Sample data; uploads/sends are illustrative, never live.

type LetterStatus = 'In prep' | 'Reviewed' | 'Not started' | 'Sent'

type Beneficiary = {
  name: string
  role: string
  // 2026 (in preparation)
  file2026?: string
  // 2025 (delivered)
  file2025: string
  sent2025: string
}

const BENEFICIARIES: Beneficiary[] = [
  { name: 'ERP Industrial Fund IV', role: 'Fund beneficiary', file2025: 'Grantor-Letter_2025_ERP.pdf',     sent2025: 'Sent Mar 14, 2026' },
  { name: 'Sonoran Capital LLC',    role: 'Co-investor',      file2025: 'Grantor-Letter_2025_Sonoran.pdf', sent2025: 'Sent Mar 14, 2026' },
  { name: 'Desert Sky Trust',       role: '1031 exchanger',   file2025: 'Grantor-Letter_2025_Desert.pdf',  sent2025: 'Sent Mar 14, 2026' },
  { name: 'Agave Holdings LLC',     role: 'Co-investor',      file2025: 'Grantor-Letter_2025_Agave.pdf',   sent2025: 'Sent Mar 14, 2026' },
  { name: 'R. Marsh (IRA)',         role: 'Individual · 1031', file2025: 'Grantor-Letter_2025_R.pdf',      sent2025: 'Sent Mar 14, 2026' },
]

type Filing = {
  form: string
  recipient: string
  amount: string
  year: string
  file?: string
}

const FILINGS: Filing[] = [
  { form: '1099-INT', recipient: 'Eastgate DST Lender',    amount: '$96,000', year: '2025', file: '1099INT_Eastgate_2025.pdf' },
  { form: '1099-NEC', recipient: 'Sonoran Property Mgmt',  amount: '$54,000', year: '2025', file: '1099NEC_Sonoran_2025.pdf' },
  { form: '1099-MISC', recipient: 'Desert Title & Escrow', amount: '$18,500', year: '2025' },
]

const NAVY = '#0D2D52'

const badge = (kind: 'gray' | 'green'): React.CSSProperties =>
  kind === 'green'
    ? { fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '2px 9px', whiteSpace: 'nowrap' }
    : { fontSize: 11, fontWeight: 700, color: '#6b7280', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 9px', whiteSpace: 'nowrap' }

const th: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px', textAlign: 'left', padding: '9px 14px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }
const td: React.CSSProperties = { fontSize: 13, color: '#374151', padding: '11px 14px', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' }

function FileLink({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <button onClick={onOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: NAVY, fontSize: 12, fontWeight: 600 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h8l4 4v16H6z" /><path d="M14 2v4h4" /><path d="M9 12h6M9 16h6" /></svg>
      <span>{name}</span>
    </button>
  )
}

function ghostBtn(size: 'sm' | 'md' = 'md'): React.CSSProperties {
  return { fontSize: size === 'sm' ? 11 : 12, fontWeight: 600, padding: size === 'sm' ? '4px 11px' : '6px 14px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, whiteSpace: 'nowrap' }
}
function brandBtn(): React.CSSProperties {
  return { fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6, cursor: 'pointer', border: 'none', background: NAVY, color: '#fff', whiteSpace: 'nowrap' }
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }
const cardHead: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }

export default function DstTaxPrepView() {
  const [year, setYear] = useState<'2026' | '2025'>('2026')
  const [toast, setToast] = useState<string | null>(null)

  const flash = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(t => (t === msg ? null : t)), 3200)
  }

  const kpi = (label: string, value: string, sub: string) => (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginTop: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>
    </div>
  )

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>DST tax prep · grantor letters</div>
          <h2>DST Tax Prep</h2>
          <p>Grantor tax letters for the Eastgate Business Park DST beneficiaries — the actual document, CPA review status, and whether it&rsquo;s been sent to each beneficiary, by tax year.</p>
        </div>
        <button style={ghostBtn()} onClick={() => flash('Tax preparer upload — external CPA can upload completed grantor letters & 1099s (upload-only access)')}>Tax preparer upload</button>
      </div>

      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#4338ca' }}>
        <span>🧪</span><span><strong>UI mockup</strong> — DST Tax Prep. Sample data; uploads and sends are illustrative, never live. DST beneficiaries report their pro-rata share via a grantor tax letter (not a K-1).</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {kpi('DST beneficiaries', '5', 'Eastgate Business Park DST')}
        {kpi('2025 letters sent', '5 / 5', 'All delivered')}
        {kpi('2025 income allocated', '$520K', 'Net taxable income')}
        {kpi('1031 exchangers', '2', 'Grantor-trust reporting')}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['2026', '2025'] as const).map(y => (
          <button key={y} onClick={() => setYear(y)} style={{ fontSize: 13, fontWeight: 600, padding: '7px 18px', borderRadius: 8, cursor: 'pointer', border: year === y ? `1px solid ${NAVY}` : '1px solid #e5e7eb', background: year === y ? NAVY : '#fff', color: year === y ? '#fff' : '#6b7280' }}>{y}</button>
        ))}
      </div>

      <div style={card}>
        <div style={cardHead}><h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>Grantor Tax Letters — {year}</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Beneficiary</th>
                <th style={th}>Grantor letter</th>
                <th style={th}>Sent to CPA</th>
                <th style={th}>Client status</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {BENEFICIARIES.map(b => (
                <tr key={b.name}>
                  <td style={td}>
                    <div style={{ fontWeight: 700, color: '#111827' }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{b.role}</div>
                  </td>
                  {year === '2026' ? (
                    <>
                      <td style={td}><button style={ghostBtn('sm')} onClick={() => flash(`Upload 2026 grantor letter for ${b.name} — tax preparer`)}>Upload</button></td>
                      <td style={td}><span style={badge('gray')}>In prep</span></td>
                      <td style={td}><span style={badge('gray')}>Not started</span></td>
                      <td style={td}></td>
                    </>
                  ) : (
                    <>
                      <td style={td}><FileLink name={b.file2025} onOpen={() => flash(`Opening ${b.file2025}`)} /></td>
                      <td style={td}><span style={badge('green')}>Reviewed</span></td>
                      <td style={td}><span style={badge('green')}>{b.sent2025}</span></td>
                      <td style={{ ...td, textAlign: 'right' }}><button style={ghostBtn('sm')} onClick={() => flash(`Resend 2025 Grantor Tax Letter · ${b.name}`)}>Resend</button></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6, padding: '10px 16px 14px', margin: 0 }}>
          {year === '2026'
            ? '2026 grantor letters are in preparation. Tax preparers upload each completed letter here as it’s finalized.'
            : 'DST beneficiaries report their pro-rata share directly via a grantor tax letter (not a K-1). Every send is logged in Communications.'}
        </p>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#111827', margin: 0 }}>1099 filings</h3>
          <button style={brandBtn()} onClick={() => flash('Upload 1099 — drop a PDF or CSV; auto-tagged to recipient & tax year')}>Upload 1099s</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Form</th>
                <th style={th}>Recipient</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={th}>Tax year</th>
                <th style={th}>Document</th>
                <th style={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {FILINGS.map(f => (
                <tr key={f.form + f.recipient}>
                  <td style={{ ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{f.form}</td>
                  <td style={{ ...td, fontWeight: 700, color: '#111827' }}>{f.recipient}</td>
                  <td style={{ ...td, textAlign: 'right', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{f.amount}</td>
                  <td style={td}>{f.year}</td>
                  <td style={td}>{f.file ? <FileLink name={f.file} onOpen={() => flash(`Opening ${f.file}`)} /> : <span style={{ fontSize: 12, color: '#9ca3af' }}>Not uploaded</span>}</td>
                  <td style={td}>{f.file ? <span style={badge('green')}>Filed</span> : <button style={brandBtn()} onClick={() => flash(`Upload ${f.form} for ${f.recipient}`)}>Upload</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.6, padding: '10px 16px 14px', margin: 0 }}>
          Upload the DST&rsquo;s vendor and interest 1099s (NEC / INT / MISC). Uploaded forms file to the Document Vault and are included in the CPA handoff.
        </p>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 500, padding: '10px 16px', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 1000, maxWidth: 480 }}>
          {toast}
        </div>
      )}
    </div>
  )
}
