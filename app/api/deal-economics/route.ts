import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Deal Economics: captures finalized underwriting model headline outputs per deal.
// Feeds IC Memo Drafter, Deal Pipeline Status Board, and deal charts (Agent 3 WF1).

const COLS = [
  'id', 'deal_id', 'deal_name',
  'purchase_price', 'going_in_cap', 'exit_cap',
  'levered_irr', 'unlevered_irr', 'equity_multiple',
  'cash_on_cash', 'hold_period',
  'sources_uses', 'key_assumptions', 'analyst_notes',
  'confirmed_by', 'confirmed_at', 'created_at', 'updated_at',
].join(', ')

function num(v: unknown): number | null {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clean(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  if (typeof body.deal_name === 'string') out.deal_name = body.deal_name.trim()
  if (body.deal_id != null) out.deal_id = String(body.deal_id) || null
  if ('purchase_price'  in body) out.purchase_price  = num(body.purchase_price)
  if ('going_in_cap'    in body) out.going_in_cap    = num(body.going_in_cap)
  if ('exit_cap'        in body) out.exit_cap        = num(body.exit_cap)
  if ('levered_irr'     in body) out.levered_irr     = num(body.levered_irr)
  if ('unlevered_irr'   in body) out.unlevered_irr   = num(body.unlevered_irr)
  if ('equity_multiple' in body) out.equity_multiple = num(body.equity_multiple)
  if ('cash_on_cash'    in body) out.cash_on_cash    = num(body.cash_on_cash)
  if ('hold_period'     in body) out.hold_period     = num(body.hold_period)
  if (body.sources_uses    != null) out.sources_uses    = body.sources_uses
  if (body.key_assumptions != null) out.key_assumptions = String(body.key_assumptions).trim() || null
  if (body.analyst_notes   != null) out.analyst_notes   = String(body.analyst_notes).trim() || null
  if (body.confirmed_by    != null) out.confirmed_by    = String(body.confirmed_by).trim() || null
  if (body.confirmed_at    != null) out.confirmed_at    = String(body.confirmed_at) || null
  return out
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { data, error } = await supabase
    .from('deal_economics')
    .select(COLS)
    .order('updated_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const row = clean(body)
  if (!row.deal_name) return NextResponse.json({ error: 'deal_name required' }, { status: 400 })

  const { data, error } = await supabase
    .from('deal_economics')
    .insert({ ...row, created_by: user.email ?? user.id })
    .select(COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const row = clean(rest)

  const { data, error } = await supabase
    .from('deal_economics')
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('deal_economics').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
