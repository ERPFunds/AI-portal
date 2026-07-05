'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'

// ── History constants (mirrors OutputFilesView) ────────────────────────────────

const EXCEL_EDIT_WORKFLOWS = new Set([
  'update-pipeline-comps',
  'update-buyer-list',
  'competitive-intel-xls',
  'update-commitment-schedule',
])

const EXCEL_EDIT_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  'update-pipeline-comps':      { icon: '🏭', label: 'Pipeline Comps',     color: '#0e7490' },
  'update-buyer-list':          { icon: '🤝', label: 'Buyer List',          color: '#7c3aed' },
  'competitive-intel-xls':      { icon: '📊', label: 'Competitive Intel',   color: '#b45309' },
  'update-commitment-schedule': { icon: '💼', label: 'Commitment Schedule', color: '#166534' },
}

const DOC_RUN_WORKFLOWS = new Set(['deck-builder', 'om-writer', 'om-editor'])

const DOC_RUN_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  'deck-builder': { icon: '📑', label: 'Fund Deck', color: '#c2410c' },
  'om-writer':    { icon: '📄', label: 'OM Write',  color: '#1d4ed8' },
  'om-editor':    { icon: '✏️',  label: 'OM Edit',   color: '#7c3aed' },
}

const EMAIL_DISPLAY: Record<string, string> = {
  'mparad@erpfunds.com': 'Michele P.',
  'mberry@erpfunds.com': 'Meghan',
  'wmeyer@erpfunds.com': 'William',
  'bberry@erpfunds.com': 'Brennan',
}

interface EditLogRow {
  id: number
  created_at: string
  from_email: string | null
  workflow_id: string
  output_summary: string | null
  onedrive_url: string | null
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function SenderChip({ email }: { email: string | null }) {
  if (!email) return null
  const name = EMAIL_DISPLAY[email.toLowerCase()] ?? email.split('@')[0]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, color: '#374151',
      background: '#f3f4f6', border: '1px solid #e5e7eb',
      borderRadius: 10, padding: '2px 7px',
    }}>
      <span style={{ fontSize: 11 }}>👤</span>{name}
    </span>
  )
}

type DocType = 'freeform' | 'om-section' | 'lp-memo' | 'deal-summary' | 'email-draft' | 'market-brief'

const DOC_TYPES: { id: DocType; label: string; icon: string; placeholder: string }[] = [
  {
    id: 'freeform',
    label: 'Freeform',
    icon: '💬',
    placeholder: 'Research a market, summarize a topic, draft anything...',
  },
  {
    id: 'om-section',
    label: 'OM Section',
    icon: '📄',
    placeholder: 'Write the market overview section for a 45,000 SF industrial property in Midland, TX...',
  },
  {
    id: 'lp-memo',
    label: 'LP Memo',
    icon: '📊',
    placeholder: 'Draft a Q2 LP update covering fund performance, recent acquisitions, and market conditions...',
  },
  {
    id: 'deal-summary',
    label: 'Deal Summary',
    icon: '🏭',
    placeholder: 'Summarize the 23-acre service yard acquisition in Odessa: $2.1M, 100% occupied by oil field services tenant, 7.2% cap rate...',
  },
  {
    id: 'email-draft',
    label: 'Email Draft',
    icon: '✉️',
    placeholder: 'Draft a follow-up email to an LP who attended our Q2 update and asked about our Brevard deal pipeline...',
  },
  {
    id: 'market-brief',
    label: 'Market Brief',
    icon: '📈',
    placeholder: 'Write a brief on current industrial market conditions in Brevard County, focusing on vacancy trends and aerospace demand drivers...',
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    icon: '📰',
    placeholder: 'Edit the market narrative, rewrite the intro paragraph, summarize key takeaways, or draft a follow-up edition...',
  },
]

const s = {
  card: {
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '16px 20px',
    marginBottom: 14,
  } as React.CSSProperties,
  label: {
    fontSize: 11,
    letterSpacing: '1.5px',
    textTransform: 'uppercase' as const,
    color: '#6b7280',
    fontWeight: 600,
    marginBottom: 10,
    display: 'block',
  } as React.CSSProperties,
}

export default function DraftingWorkspaceView() {
  const [docType, setDocType] = useState<DocType>('freeform')
  const [prompt, setPrompt] = useState('')
  const [useKb, setUseKb] = useState(true)
  const [useNewsletter, setUseNewsletter] = useState(false)
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [outputEdited, setOutputEdited] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [savedFolder, setSavedFolder] = useState('')
  const [saveError, setSaveError] = useState('')
  const [attachment, setAttachment] = useState<{ name: string; text: string; chars: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [editLog, setEditLog] = useState<EditLogRow[]>([])
  const [editLogLoading, setEditLogLoading] = useState(true)
  const [docLog, setDocLog] = useState<EditLogRow[]>([])
  const [docLogLoading, setDocLogLoading] = useState(true)
  const [newsletters, setNewsletters] = useState<{ id: string; label: string; subject: string; sentAt: string; narrative: string }[]>([])
  const [newslettersLoading, setNewslettersLoading] = useState(false)
  const [selectedNewsletterId, setSelectedNewsletterId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (docType !== 'newsletter') return
    if (newsletters.length > 0) return
    setNewslettersLoading(true)
    fetch('/api/drafting/newsletters')
      .then(r => r.json())
      .then(d => setNewsletters(d.briefs ?? []))
      .catch(() => {})
      .finally(() => setNewslettersLoading(false))
  }, [docType])

  useEffect(() => {
    fetch('/api/research-log')
      .then(r => r.json())
      .then(d => {
        const rows: EditLogRow[] = d.rows ?? []
        setEditLog(rows.filter(r => EXCEL_EDIT_WORKFLOWS.has(r.workflow_id)))
        setDocLog(rows.filter(r => DOC_RUN_WORKFLOWS.has(r.workflow_id)))
      })
      .catch(() => {})
      .finally(() => { setEditLogLoading(false); setDocLogLoading(false) })
  }, [])

  const currentType = DOC_TYPES.find((d) => d.id === docType)!

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError('')
    setAttachment(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('/api/drafting/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) { setUploadError(data.error ?? 'Upload failed'); return }
      setAttachment({ name: data.filename, text: data.text, chars: data.chars })
    } catch (e) {
      setUploadError(String(e))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [])

  const run = useCallback(async () => {
    if (!prompt.trim() || streaming) return
    setStreaming(true)
    setOutput('')
    setError('')
    setOutputEdited(false)
    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/drafting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType,
          prompt: prompt.trim(),
          sources: [...(useKb ? ['kb'] : []), ...(useNewsletter ? ['newsletter'] : [])],
          attachmentText: attachment?.text ?? '',
          attachmentName: attachment?.name ?? '',
          newsletterNarrative: newsletters.find(n => n.id === selectedNewsletterId)?.narrative ?? '',
          newsletterSubject: newsletters.find(n => n.id === selectedNewsletterId)?.subject ?? '',
        }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setError(err.error ?? 'Request failed')
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'text') setOutput((p) => p + evt.text)
            if (evt.type === 'error') setError(evt.message)
          } catch { /* skip */ }
        }
      }
    } catch (e: unknown) {
      if ((e as { name?: string })?.name !== 'AbortError') setError(String(e))
    } finally {
      setStreaming(false)
    }
  }, [docType, prompt, useKb, useNewsletter, attachment, streaming])

  const stop = () => abortRef.current?.abort()

  const copy = async () => {
    await navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async () => {
    if (!output.trim() || saveState === 'saving') return
    setSaveState('saving')
    setSaveError('')
    try {
      const res = await fetch('/api/drafting/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: output, docType, prompt: prompt.trim() }),
      })
      const data = await res.json()
      if (data.saved) {
        setSaveState('saved')
        setSavedUrl(data.url ?? null)
        setSavedFolder(data.resolvedFolder ?? '')
      } else {
        setSaveState('error')
        setSaveError(data.message ?? 'Save failed')
      }
    } catch (e) {
      setSaveState('error')
      setSaveError(String(e))
    }
  }

  const clear = () => {
    setOutput('')
    setPrompt('')
    setError('')
    setOutputEdited(false)
    setSaveState('idle')
    setSavedUrl(null)
    setSavedFolder('')
    setSaveError('')
  }

  const typeBtn = (active: boolean) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 6,
    border: active ? 'none' : '1px solid #e5e7eb',
    background: active ? '#1d4ed8' : '#fff',
    color: active ? '#fff' : '#374151',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.1s',
  } as React.CSSProperties)

  const actionBtn = (danger = false) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 6,
    border: `1px solid ${danger ? '#fca5a5' : '#e5e7eb'}`,
    background: '#fff',
    color: danger ? '#dc2626' : '#374151',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties)

  const outputRows = Math.max(14, output.split('\n').length + 3)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0 }}>Drafting Workspace</h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 0 }}>
          Research, write, and edit — grounded on your knowledge base.
        </p>
      </div>

      {/* Doc type */}
      <div style={s.card}>
        <span style={s.label}>Document Type</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {DOC_TYPES.map((dt) => (
            <button key={dt.id} style={typeBtn(docType === dt.id)} onClick={() => setDocType(dt.id)}>
              {dt.icon} {dt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Newsletter picker */}
      {docType === 'newsletter' && (
        <div style={s.card}>
          <span style={s.label}>Select Newsletter</span>
          {newslettersLoading && (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>Loading newsletters…</div>
          )}
          {!newslettersLoading && newsletters.length === 0 && (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>No newsletters found — they appear here after the first Monday send.</div>
          )}
          {!newslettersLoading && newsletters.length > 0 && (
            <select
              value={selectedNewsletterId}
              onChange={e => setSelectedNewsletterId(e.target.value)}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 6,
                border: '1px solid #e5e7eb', fontSize: 14, color: '#111827',
                background: '#fff', fontFamily: 'inherit', outline: 'none',
              }}
            >
              <option value=''>— pick a newsletter —</option>
              {newsletters.map(n => (
                <option key={n.id} value={n.id}>
                  {n.label} · {new Date(n.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </option>
              ))}
            </select>
          )}
          {selectedNewsletterId && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12, color: '#374151', lineHeight: 1.6, maxHeight: 120, overflow: 'hidden', position: 'relative' }}>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 32, background: 'linear-gradient(transparent, #f8fafc)' }} />
              {newsletters.find(n => n.id === selectedNewsletterId)?.narrative?.slice(0, 400)}…
            </div>
          )}
        </div>
      )}

      {/* Sources */}
      <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 28, padding: '12px 20px' }}>
        <span style={{ ...s.label, marginBottom: 0 }}>Ground on</span>
        {[
          { id: 'kb', label: '📚 Knowledge Base', val: useKb, set: setUseKb },
          { id: 'newsletter', label: '📰 Newsletter', val: useNewsletter, set: setUseNewsletter },
        ].map(({ id, label, val, set }) => (
          <label
            key={id}
            style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 13, color: '#374151' }}
          >
            <input
              type="checkbox"
              checked={val}
              onChange={(e) => set(e.target.checked)}
              style={{ accentColor: '#1d4ed8', width: 15, height: 15 }}
            />
            {label}
          </label>
        ))}
      </div>

      {/* Attachment */}
      <div style={{ ...s.card, padding: '12px 20px' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || streaming}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb',
              background: '#fff', color: '#374151', fontSize: 13, fontWeight: 500,
              cursor: uploading || streaming ? 'not-allowed' : 'pointer',
              opacity: uploading || streaming ? 0.6 : 1,
            }}
          >
            {uploading ? '⏳ Reading…' : '📎 Attach file'}
          </button>
          {attachment && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ color: '#111827', fontWeight: 500 }}>{attachment.name}</span>
              <span style={{ color: '#9ca3af' }}>({Math.round(attachment.chars / 1000)}k chars)</span>
              <button
                onClick={() => setAttachment(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 0 }}
              >
                ✕
              </button>
            </div>
          )}
          {uploadError && <span style={{ fontSize: 12, color: '#dc2626' }}>{uploadError}</span>}
          {!attachment && !uploading && (
            <span style={{ fontSize: 12, color: '#9ca3af' }}>PDF, Word, Excel, PowerPoint, or text</span>
          )}
        </div>
      </div>

      {/* Prompt */}
      <div style={s.card}>
        <span style={s.label}>Your Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run() }}
          placeholder={currentType.placeholder}
          rows={5}
          disabled={streaming}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            resize: 'vertical',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            padding: '10px 12px',
            fontSize: 14,
            color: '#111827',
            fontFamily: 'inherit',
            outline: 'none',
            lineHeight: 1.6,
            background: streaming ? '#f9fafb' : '#fff',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>⌘ + Enter to run</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {streaming && (
              <button onClick={stop} style={actionBtn(true)}>
                ⏹ Stop
              </button>
            )}
            <button
              onClick={run}
              disabled={!prompt.trim() || streaming}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: !prompt.trim() || streaming ? '#93c5fd' : '#1d4ed8',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: !prompt.trim() || streaming ? 'not-allowed' : 'pointer',
                minWidth: 110,
                justifyContent: 'center',
              }}
            >
              {streaming ? '⏳ Running…' : '▶ Generate'}
            </button>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 14,
            fontSize: 13,
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* Output */}
      {(output || (streaming && !error)) && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ ...s.label, marginBottom: 0 }}>
              Output{outputEdited ? ' · edited' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              {output && (
                <>
                  <button onClick={copy} style={actionBtn()}>
                    {copied ? '✓ Copied' : '⎘ Copy'}
                  </button>
                  <button
                    onClick={save}
                    disabled={saveState === 'saving'}
                    style={{
                      ...actionBtn(),
                      background: saveState === 'saved' ? '#f0fdf4' : '#fff',
                      borderColor: saveState === 'saved' ? '#86efac' : saveState === 'error' ? '#fca5a5' : '#e5e7eb',
                      color: saveState === 'saved' ? '#16a34a' : saveState === 'error' ? '#dc2626' : '#374151',
                      opacity: saveState === 'saving' ? 0.6 : 1,
                      cursor: saveState === 'saving' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {saveState === 'saving' ? '⏳ Saving…' : saveState === 'saved' ? '✓ Saved' : '💾 Save to SharePoint'}
                  </button>
                  <button onClick={clear} style={{ ...actionBtn(), color: '#9ca3af' }}>
                    ✕ Clear
                  </button>
                </>
              )}
            </div>
          </div>
          <textarea
            value={output}
            onChange={(e) => { setOutput(e.target.value); setOutputEdited(true) }}
            rows={outputRows}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              resize: 'vertical',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              padding: '14px 16px',
              fontSize: 14,
              color: '#111827',
              fontFamily: 'inherit',
              outline: 'none',
              lineHeight: 1.75,
              background: '#fff',
            }}
          />
          {streaming && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
              Generating…
            </div>
          )}
          {saveState === 'saved' && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a' }}>
              {savedFolder && <span style={{ color: '#6b7280' }}>{savedFolder} — </span>}
              {savedUrl
                ? <a href={savedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>Open in SharePoint</a>
                : 'Saved to SharePoint'}
            </div>
          )}
          {saveState === 'error' && saveError && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{saveError}</div>
          )}
        </div>
      )}
      {/* ── Excel Edit History ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#6b7280' }}>
            Excel Edit History
          </span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>— rows appended to existing SharePoint files</span>
        </div>
        {editLogLoading && <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Loading…</div>}
        {!editLogLoading && editLog.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>No Excel edits yet — pipeline comps, buyer list, and commitment schedule updates will appear here.</div>
        )}
        {!editLogLoading && editLog.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['When', 'Workflow / By', 'Summary', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editLog.map((row, i) => {
                const meta = EXCEL_EDIT_LABEL[row.workflow_id] ?? { icon: '📝', label: row.workflow_id, color: '#374151' }
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap' as const, verticalAlign: 'top', fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' as const }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33`, borderRadius: 4, padding: '2px 7px' }}>
                        {meta.icon} {meta.label}
                      </span>
                      <div style={{ marginTop: 5 }}><SenderChip email={row.from_email} /></div>
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#374151', maxWidth: 420 }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                        {row.output_summary ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' as const }}>
                      {row.onedrive_url
                        ? <span onClick={() => window.open(row.onedrive_url!, '_blank')} style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer' }}>Open File →</span>
                        : <span style={{ color: '#d1d5db', fontSize: 11 }}>no link</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Deck & Doc History ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 32, marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.8px', color: '#6b7280' }}>
            Deck &amp; Doc History
          </span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>— fund decks and OMs built or edited by agents</span>
        </div>
        {docLogLoading && <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Loading…</div>}
        {!docLogLoading && docLog.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>No deck or OM runs yet — fund deck builds and OM writes will appear here.</div>
        )}
        {!docLogLoading && docLog.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                {['When', 'Workflow / By', 'Summary', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#9ca3af', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {docLog.map((row, i) => {
                const meta = DOC_RUN_LABEL[row.workflow_id] ?? { icon: '📎', label: row.workflow_id, color: '#374151' }
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap' as const, verticalAlign: 'top', fontSize: 12 }}>{fmtDate(row.created_at)}</td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' as const }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: meta.color, background: `${meta.color}14`, border: `1px solid ${meta.color}33`, borderRadius: 4, padding: '2px 7px' }}>
                        {meta.icon} {meta.label}
                      </span>
                      <div style={{ marginTop: 5 }}><SenderChip email={row.from_email} /></div>
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', color: '#374151', maxWidth: 420 }}>
                      <div style={{ fontSize: 12, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                        {row.output_summary ?? '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', verticalAlign: 'top', whiteSpace: 'nowrap' as const }}>
                      {row.onedrive_url
                        ? <span onClick={() => window.open(row.onedrive_url!, '_blank')} style={{ display: 'inline-flex', alignItems: 'center', background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer' }}>Open File →</span>
                        : <span style={{ color: '#d1d5db', fontSize: 11 }}>no link</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
