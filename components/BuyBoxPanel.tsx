'use client'

import React, { useState, useEffect } from 'react'

// Buy Box — the firm's stored acquisition screening criteria, shown in Acquisition Research.
// The Inbound Listing Intake workflow screens broker/Crexi/LoopNet listings against this to tag
// each fit / borderline / no-fit before it becomes a prospective-deal card.

type BuyBox = {
  id?: string; name?: string; markets: string | null; asset_class: string | null;
  sf_min: number | null; sf_max: number | null; price_per_sf_min: number | null; price_per_sf_max: number | null;
  cap_rate_floor: number | null; deal_size_min: number | null; deal_size_max: number | null;
  notes: string | null; updated_by?: string | null; updated_at?: string | null
}

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`
const sf = (n: number) => n.toLocaleString('en-US')

function range(a: number | null, b: number | null, fmt: (n: number) => string, unit = '') {
  if (a == null && b == null) return null
  if (a != null && b != null) return `${fmt(a)}–${fmt(b)}${unit}`
  if (a != null) return `≥ ${fmt(a)}${unit}`
  return `≤ ${fmt(b!)}${unit}`
}

export default function BuyBoxPanel() {
  const [box, setBox] = useState<BuyBox | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<BuyBox | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = async () => {
    setLoading(true)
    try { const r = await fetch('/api/buy-box'); const d = await r.json(); if (r.ok) setBox(d.item) }
    catch { /* ignore */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!editing || saving) return
    setSaving(true); setErr('')
    try {
      const r = await fetch('/api/buy-box', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Save failed'); return }
      setEditing(null); await load()
    } catch (e) { setErr(String(e)) } finally { setSaving(false) }
  }

  const criteria: { label: string; value: string | null }[] = [
    { label: 'Target markets', value: box?.markets ?? null },
    { label: 'Asset class', value: box?.asset_class ?? null },
    { label: 'Size (SF)', value: box ? range(box.sf_min, box.sf_max, sf, ' SF') : null },
    { label: 'Price / SF', value: box ? range(box.price_per_sf_min, box.price_per_sf_max, (n) => `$${n}`) : null },
    { label: 'Cap-rate floor', value: box?.cap_rate_floor != null ? `≥ ${box.cap_rate_floor}%` : null },
    { label: 'Deal size', value: box ? range(box.deal_size_min, box.deal_size_max, usd) : null },
  ]

  const startEdit = () => setEditing(box ? { ...box } : {
    markets: null, asset_class: null, sf_min: null, sf_max: null, price_per_sf_min: null, price_per_sf_max: null,
    cap_rate_floor: null, deal_size_min: null, deal_size_max: null, notes: null,
  })

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0D2D52', display: 'flex', alignItems: 'center', gap: 6 }}>🎯 Buy Box — acquisition criteria</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Inbound listings (Crexi / LoopNet / broker email) are screened against this and tagged fit · borderline · no-fit.</div>
        </div>
        <button onClick={startEdit} style={{ flexShrink: 0, background: 'none', border: '1px solid #d1d5db', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
          {box ? 'Edit' : 'Set Buy Box'}
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {criteria.map((c) => (
            <div key={c.label} style={{ background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 8, padding: '9px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.4px' }}>{c.label}</div>
              <div style={{ fontSize: 13, color: c.value ? '#111827' : '#d1d5db', fontWeight: c.value ? 600 : 400, marginTop: 3 }}>{c.value ?? 'not set'}</div>
            </div>
          ))}
        </div>
      )}
      {box?.notes && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10, fontStyle: 'italic' }}>{box.notes}</div>}

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0D2D52', marginBottom: 16 }}>Buy Box criteria</div>
            {(() => {
              const set = (k: keyof BuyBox, v: unknown) => setEditing((p) => ({ ...(p as BuyBox), [k]: v }))
              const lbl = { fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '.4px', marginBottom: 4, display: 'block' }
              const inp = { width: '100%', boxSizing: 'border-box' as const, fontSize: 13, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#111827' }
              const half = { flex: 1 }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div><label style={lbl}>Target markets</label><input style={inp} value={editing.markets || ''} onChange={(e) => set('markets', e.target.value)} placeholder="e.g. Permian Basin (TX); Brevard / Space Coast (FL)" /></div>
                  <div><label style={lbl}>Asset class</label><input style={inp} value={editing.asset_class || ''} onChange={(e) => set('asset_class', e.target.value)} placeholder="e.g. Industrial / IOS" /></div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={half}><label style={lbl}>Min SF</label><input type="number" style={inp} value={editing.sf_min ?? ''} onChange={(e) => set('sf_min', e.target.value)} /></div>
                    <div style={half}><label style={lbl}>Max SF</label><input type="number" style={inp} value={editing.sf_max ?? ''} onChange={(e) => set('sf_max', e.target.value)} /></div>
                    <div style={half}><label style={lbl}>Cap-rate floor (%)</label><input type="number" step="0.1" style={inp} value={editing.cap_rate_floor ?? ''} onChange={(e) => set('cap_rate_floor', e.target.value)} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={half}><label style={lbl}>Min $/SF</label><input type="number" style={inp} value={editing.price_per_sf_min ?? ''} onChange={(e) => set('price_per_sf_min', e.target.value)} /></div>
                    <div style={half}><label style={lbl}>Max $/SF</label><input type="number" style={inp} value={editing.price_per_sf_max ?? ''} onChange={(e) => set('price_per_sf_max', e.target.value)} /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={half}><label style={lbl}>Min deal size ($)</label><input type="number" style={inp} value={editing.deal_size_min ?? ''} onChange={(e) => set('deal_size_min', e.target.value)} /></div>
                    <div style={half}><label style={lbl}>Max deal size ($)</label><input type="number" style={inp} value={editing.deal_size_max ?? ''} onChange={(e) => set('deal_size_max', e.target.value)} /></div>
                  </div>
                  <div><label style={lbl}>Notes</label><textarea style={{ ...inp, minHeight: 56, resize: 'vertical' as const }} value={editing.notes || ''} onChange={(e) => set('notes', e.target.value)} /></div>
                  {err && <div style={{ fontSize: 12, color: '#b91c1c' }}>{err}</div>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                    <button onClick={() => setEditing(null)} style={{ background: 'none', border: '1px solid #d1d5db', color: '#374151', borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={save} disabled={saving} style={{ border: 'none', background: '#0D2D52', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
