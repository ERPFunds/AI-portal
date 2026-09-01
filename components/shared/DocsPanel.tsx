'use client'

import { useState, useEffect, useCallback } from 'react'

// ── DocsPanel ─────────────────────────────────────────────────────────────────
// Company overview files attached to a record — a tenant, a vendor account, an
// investor. Files live in the shared uploaded_files store keyed by a project tag,
// the same mechanism the investor drawer already uses, so anything uploaded here
// is reachable from the knowledge base too.

interface Doc {
  id: string; file_id: string; filename: string
  size_bytes: number | null; created_at: string; uploaded_by: string | null
}

export default function DocsPanel({ tag, category, label, uploadedBy }: {
  tag: string           // e.g. tenant:<id>, vendor:dst:<id>
  category: string      // grouping in the knowledge base
  label?: string
  uploadedBy?: string
}) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/files/list?project_tag=${encodeURIComponent(tag)}`)
      const j = await r.json().catch(() => ({}))
      setDocs(j.files ?? [])
    } catch { setDocs([]) }
  }, [tag])
  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true); setMsg(null)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('projectTag', tag)
        fd.append('category', category)
        if (uploadedBy) fd.append('uploadedBy', uploadedBy)
        const res = await fetch('/api/files/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setMsg(`${file.name}: ${j.error ?? res.status}`)
        }
      }
      await load()
    } finally { setUploading(false) }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Delete ${d.filename}?`)) return
    const res = await fetch(`/api/files/${d.id}`, { method: 'DELETE' })
    if (res.ok) load(); else setMsg('Delete failed')
  }

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid #eef0f2' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#9ca3af' }}>
          {label ?? 'Documents'}
          {docs && docs.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#0f766e', background: '#e4f2ef', padding: '2px 7px', borderRadius: 5, marginLeft: 6 }}>{docs.length}</span>
          )}
        </div>
        <label style={{ border: '1px solid #0f766e', background: uploading ? '#f0f9f7' : '#fff', color: '#0f766e',
                        borderRadius: 8, padding: '5px 12px', cursor: uploading ? 'wait' : 'pointer', fontWeight: 600, fontSize: 12.5 }}>
          {uploading ? 'Uploading…' : '⤒ Upload'}
          <input type="file" multiple style={{ display: 'none' }} disabled={uploading}
            onChange={e => { upload(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      {msg && <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>{msg}</div>}
      {docs == null && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
      {docs && docs.length === 0 && (
        <div style={{ color: '#9ca3af', fontSize: 13 }}>No documents yet — company overviews and other files can be uploaded here.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {docs?.map(d => (
          <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', border: '1px solid #eef0f2', borderRadius: 9, background: '#fbfcfd' }}>
            <span style={{ fontSize: 15 }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.filename}</div>
              <div style={{ fontSize: 11.5, color: '#9ca3af' }}>
                {Math.max(1, Math.round((d.size_bytes ?? 0) / 1024))} KB · {new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <button onClick={() => remove(d)}
              style={{ border: 0, background: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12.5, color: '#b91c1c' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
