'use client'
import React from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

// ── Placeholder CoStar data ───────────────────────────────────────────────────
// Replace with live CoStar API response once COSTAR_API_KEY is configured

const PERMIAN_DATA = [
  { period: 'Q1 24', vacancyRate: 4.2, askingRent: 9.80,  netAbsorption: 142, underConstruction: 380, capRate: 5.8, salePricePsf: 118 },
  { period: 'Q2 24', vacancyRate: 3.8, askingRent: 10.10, netAbsorption: 178, underConstruction: 420, capRate: 5.6, salePricePsf: 124 },
  { period: 'Q3 24', vacancyRate: 3.5, askingRent: 10.45, netAbsorption: 165, underConstruction: 465, capRate: 5.5, salePricePsf: 131 },
  { period: 'Q4 24', vacancyRate: 4.1, askingRent: 10.80, netAbsorption: 98,  underConstruction: 390, capRate: 5.7, salePricePsf: 128 },
  { period: 'Q1 25', vacancyRate: 3.9, askingRent: 11.20, netAbsorption: 155, underConstruction: 340, capRate: 5.6, salePricePsf: 135 },
  { period: 'Q2 25', vacancyRate: 3.6, askingRent: 11.65, netAbsorption: 189, underConstruction: 295, capRate: 5.4, salePricePsf: 142 },
  { period: 'Q3 25', vacancyRate: 3.3, askingRent: 12.10, netAbsorption: 201, underConstruction: 250, capRate: 5.3, salePricePsf: 148 },
  { period: 'Q4 25', vacancyRate: 3.7, askingRent: 12.40, netAbsorption: 134, underConstruction: 220, capRate: 5.5, salePricePsf: 145 },
]

const BREVARD_DATA = [
  { period: 'Q1 24', vacancyRate: 6.8, askingRent: 10.20, netAbsorption: 82,  underConstruction: 180, capRate: 6.1, salePricePsf: 105 },
  { period: 'Q2 24', vacancyRate: 6.2, askingRent: 10.65, netAbsorption: 104, underConstruction: 210, capRate: 5.9, salePricePsf: 112 },
  { period: 'Q3 24', vacancyRate: 5.8, askingRent: 11.10, netAbsorption: 118, underConstruction: 240, capRate: 5.8, salePricePsf: 118 },
  { period: 'Q4 24', vacancyRate: 6.4, askingRent: 11.40, netAbsorption: 71,  underConstruction: 195, capRate: 6.0, salePricePsf: 115 },
  { period: 'Q1 25', vacancyRate: 5.9, askingRent: 11.85, netAbsorption: 96,  underConstruction: 165, capRate: 5.8, salePricePsf: 122 },
  { period: 'Q2 25', vacancyRate: 5.4, askingRent: 12.30, netAbsorption: 128, underConstruction: 142, capRate: 5.6, salePricePsf: 130 },
  { period: 'Q3 25', vacancyRate: 5.1, askingRent: 12.75, netAbsorption: 138, underConstruction: 118, capRate: 5.5, salePricePsf: 137 },
  { period: 'Q4 25', vacancyRate: 5.6, askingRent: 13.10, netAbsorption: 88,  underConstruction: 98,  capRate: 5.7, salePricePsf: 134 },
]

type DataPoint = typeof PERMIAN_DATA[0]

function downloadChartAsPng(containerId: string, filename: string) {
  const el = document.getElementById(containerId)
  if (!el) return
  const svg = el.querySelector('svg')
  if (!svg) return
  const w = svg.clientWidth || 600
  const h = svg.clientHeight || 200
  const xml = new XMLSerializer().serializeToString(svg)
  const canvas = document.createElement('canvas')
  canvas.width = w * 2
  canvas.height = h * 2
  const ctx = canvas.getContext('2d')
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(2, 2)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    const a = document.createElement('a')
    a.download = `${filename}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
  img.src = url
}

function ChartCard({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {title}
        </span>
        <button
          onClick={() => downloadChartAsPng(id, title.toLowerCase().replace(/\s+/g, '-'))}
          style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ↓ PNG
        </button>
      </div>
      <div id={id} style={{ height: 200 }}>
        {children}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1.1, marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280' }}>{sub}</div>
    </div>
  )
}

function MarketSection({ title, subtitle, data, color, idPrefix }: {
  title: string
  subtitle: string
  data: DataPoint[]
  color: string
  idPrefix: string
}) {
  const latest = data[data.length - 1]
  const prev   = data[data.length - 2]
  const rentDelta  = ((latest.askingRent - prev.askingRent) / prev.askingRent * 100).toFixed(1)
  const vacDelta   = (latest.vacancyRate - prev.vacancyRate).toFixed(1)
  const rentSign   = parseFloat(rentDelta) >= 0 ? '+' : ''
  const vacSign    = parseFloat(vacDelta)  >= 0 ? '+' : ''

  return (
    <div style={{ marginBottom: 40 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 2 }}>{title}</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <KpiCard label="Vacancy Rate"        value={`${latest.vacancyRate}%`}            sub={`${vacSign}${vacDelta}pp vs prior qtr`} />
        <KpiCard label="Asking Rent NNN"     value={`$${latest.askingRent.toFixed(2)}/sf`} sub={`${rentSign}${rentDelta}% vs prior qtr`} />
        <KpiCard label="Net Absorption"      value={`${latest.netAbsorption}k sf`}        sub="Latest quarter" />
        <KpiCard label="Under Construction"  value={`${latest.underConstruction}k sf`}    sub="Current pipeline" />
        <KpiCard label="Cap Rate"            value={`${latest.capRate}%`}                 sub="Industrial avg" />
        <KpiCard label="Sale Price / SF"     value={`$${latest.salePricePsf}`}            sub="Avg transaction" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <ChartCard id={`${idPrefix}-vacancy`} title="Vacancy Rate (%)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Vacancy']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="vacancyRate" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard id={`${idPrefix}-rent`} title="Asking Rent NNN ($/SF)">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} domain={['auto', 'auto']} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}/sf`, 'Asking Rent']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="askingRent" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard id={`${idPrefix}-absorption`} title="Net Absorption (k SF)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip formatter={(v: number) => [`${v}k sf`, 'Net Absorption']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="netAbsorption" fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard id={`${idPrefix}-pipeline`} title="Under Construction (k SF)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip formatter={(v: number) => [`${v}k sf`, 'Under Construction']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="underConstruction" fill={color} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

export default function MarketResearchView() {
  return (
    <div style={{ padding: '24px 28px', overflowY: 'auto', height: '100%' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: 0, marginBottom: 4 }}>Market Research</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Industrial CRE market metrics — Permian Basin &amp; Brevard County</p>
      </div>

      <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 24, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>⚠️</span>
        <span>CoStar not connected — charts show illustrative data. Add <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: 3 }}>COSTAR_API_KEY</code> to Settings to enable live data.</span>
      </div>

      <MarketSection
        title="Permian Basin"
        subtitle="Midland–Odessa industrial submarket · West Texas"
        data={PERMIAN_DATA}
        color="#A6C3C9"
        idPrefix="permian"
      />

      <MarketSection
        title="Brevard County"
        subtitle="Palm Bay–Melbourne–Titusville industrial submarket · Space Coast, FL"
        data={BREVARD_DATA}
        color="#6366f1"
        idPrefix="brevard"
      />
    </div>
  )
}
