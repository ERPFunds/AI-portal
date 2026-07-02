'use client'

import React, { useState, useRef, useCallback } from 'react'

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
  const [useNews, setUseNews] = useState(false)
  const [output, setOutput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState('')
  const [outputEdited, setOutputEdited] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const currentType = DOC_TYPES.find((d) => d.id === docType)!

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
          sources: [...(useKb ? ['kb'] : []), ...(useNews ? ['news'] : [])],
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
  }, [docType, prompt, useKb, useNews, streaming])

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
        body: JSON.stringify({ content: output, docType, title: prompt.trim().slice(0, 60) }),
      })
      const data = await res.json()
      if (data.saved && data.url) {
        setSaveState('saved')
        setSavedUrl(data.url)
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
          Research, write, and edit — grounded on your knowledge base and live market data.
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

      {/* Sources */}
      <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 28, padding: '12px 20px' }}>
        <span style={{ ...s.label, marginBottom: 0 }}>Ground on</span>
        {[
          { id: 'kb', label: '📚 Knowledge Base', val: useKb, set: setUseKb },
          { id: 'news', label: '📰 Live News', val: useNews, set: setUseNews },
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
          {saveState === 'saved' && savedUrl && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a' }}>
              Saved —{' '}
              <a href={savedUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>
                Open in SharePoint
              </a>
            </div>
          )}
          {saveState === 'error' && saveError && (
            <div style={{ marginTop: 10, fontSize: 13, color: '#dc2626' }}>{saveError}</div>
          )}
        </div>
      )}
    </div>
  )
}
