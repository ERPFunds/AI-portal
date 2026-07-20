'use client'

import React, { useState, useEffect } from 'react'

// Repurpose a newsletter into a LinkedIn post draft. Reuses the existing endpoints:
// /api/drafting/newsletters for the source list (same as the Drafting Workspace) and /api/chat to
// generate. Functional — not a mockup.

type NL = { id: string; label: string; subject: string; sentAt: string; narrative: string; source?: string; path?: string }

const FORMATS = [
  { id: 'announcement', label: 'Announcement', hint: 'New deal, closing, or milestone' },
  { id: 'insight',      label: 'Market Insight', hint: 'A data/trend takeaway from the edition' },
  { id: 'listing',      label: 'Listing Highlight', hint: 'Feature an available property' },
  { id: 'thought',      label: 'Thought Leadership', hint: 'POV / perspective piece' },
]

export default function LinkedInRepurposeView() {
  const [newsletters, setNewsletters] = useState<NL[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [loadingText, setLoadingText] = useState(false)
  const [source, setSource] = useState('')
  const [format, setFormat] = useState('announcement')
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/drafting/newsletters').then(r => r.json()).then(d => setNewsletters(d.briefs ?? [])).catch(() => {}).finally(() => setLoadingList(false))
  }, [])

  async function pick(id: string) {
    setSelectedId(id)
    const n = newsletters.find(x => x.id === id)
    if (!n) return
    if (n.narrative) { setSource(n.narrative); return }
    if (n.path) {
      setLoadingText(true)
      try {
        const r = await fetch('/api/drafting/newsletters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: n.path }) })
        const d = await r.json()
        if (d.narrative) { setSource(d.narrative); setNewsletters(prev => prev.map(x => x.id === id ? { ...x, narrative: d.narrative } : x)) }
      } catch { /* leave for paste */ } finally { setLoadingText(false) }
    }
  }

  async function generate() {
    if (!source.trim() || streaming) return
    setStreaming(true); setOutput(''); setErr('')
    const fmt = FORMATS.find(f => f.id === format)!
    const prompt = `Repurpose the following ERP Funds newsletter into a single LinkedIn post with a ${fmt.label} angle. ERP Funds is an industrial commercial-real-estate fund manager focused on the Permian Basin (West Texas) and Brevard County / Space Coast (Florida). Requirements: a punchy first-line hook; 3–6 short lines or tight bullets; professional but engaging voice; end with a clear call to action; add 3–5 relevant hashtags. Keep it under ~1,300 characters. Write only the post — no preamble.\n\n--- Newsletter ---\n${source.trim()}`
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }) })
      if (!res.ok || !res.body) throw new Error('Generation failed')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        setOutput(p => p + dec.decode(value, { stream: true }))
      }
    } catch (e) { setErr(String(e)) } finally { setStreaming(false) }
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  const BLUE = '#1d4ed8'
  const card: React.CSSProperties = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px', marginBottom: 14 }
  const label: React.CSSProperties = { fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6b7280', fontWeight: 600, marginBottom: 10, display: 'block' }
  const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px', fontSize: 14, color: '#111827', fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>💼 LinkedIn Drafts</h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 0 }}>Repurpose a newsletter into a ready-to-post LinkedIn draft.</p>
      </div>

      {/* Source newsletter */}
      <div style={card}>
        <span style={label}>Source newsletter</span>
        {loadingList ? <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading newsletters…</div> : (
          <select value={selectedId} onChange={e => pick(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">— pick a newsletter, or paste below —</option>
            {newsletters.map(n => <option key={n.id} value={n.id}>{n.label}{n.source === 'sharepoint' ? ' (Research Files)' : ''} · {new Date(n.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</option>)}
          </select>
        )}
        <textarea value={source} onChange={e => setSource(e.target.value)} placeholder={loadingText ? 'Loading newsletter text…' : 'Newsletter content to repurpose — picked above or pasted here…'} rows={6} style={{ ...inp, marginTop: 10, resize: 'vertical', lineHeight: 1.6 }} />
      </div>

      {/* Format */}
      <div style={card}>
        <span style={label}>Angle</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => setFormat(f.id)} title={f.hint} style={{ padding: '6px 14px', borderRadius: 6, border: format === f.id ? 'none' : '1px solid #e5e7eb', background: format === f.id ? BLUE : '#fff', color: format === f.id ? '#fff' : '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{f.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{FORMATS.find(f => f.id === format)?.hint}</span>
          <button onClick={generate} disabled={!source.trim() || streaming} style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: !source.trim() || streaming ? '#93c5fd' : BLUE, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !source.trim() || streaming ? 'not-allowed' : 'pointer', minWidth: 130 }}>{streaming ? '⏳ Generating…' : '✦ Generate post'}</button>
        </div>
      </div>

      {err && <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 13, color: '#dc2626' }}>{err}</div>}

      {(output || (streaming && !err)) && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ ...label, marginBottom: 0 }}>LinkedIn post{output ? ` · ${output.length} chars` : ''}</span>
            {output && <button onClick={copy} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{copied ? '✓ Copied' : '⎘ Copy'}</button>}
          </div>
          <textarea value={output} onChange={e => setOutput(e.target.value)} rows={Math.max(10, output.split('\n').length + 2)} style={{ ...inp, resize: 'vertical', lineHeight: 1.75 }} />
          {streaming && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: '#6b7280' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: BLUE }} />Generating…</div>}
        </div>
      )}
    </div>
  )
}
