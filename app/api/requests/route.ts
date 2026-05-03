import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { ROLES } from '@/lib/data/roles'
import type { RoleKey } from '@/lib/data/roles'

const NOTION_TOKEN   = process.env.NOTION_TOKEN
const NOTION_DB_ID   = process.env.NOTION_REQUESTS_DB_ID
const NOTION_VERSION = '2022-06-28'
const NOTION_BASE    = 'https://api.notion.com/v1'

function notionHeaders() {
  return {
    Authorization: `Bearer ${NOTION_TOKEN}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  }
}

// ── POST /api/requests — create a new request in Notion ──────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role_key').eq('id', user.id).single()
  const roleKey = (profile?.role_key as RoleKey) ?? 'meghan'
  const role    = ROLES[roleKey]

  const body = await req.json()
  const { title, category, description, priority } = body as {
    title: string
    category: string
    description: string
    priority: string
  }

  if (!title || !description) {
    return NextResponse.json({ error: 'Title and description are required' }, { status: 400 })
  }

  // ── Notion not configured — return 503 with clear message ────────────────
  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    return NextResponse.json(
      { error: 'Notion not configured', setup: true },
      { status: 503 }
    )
  }

  const page = {
    parent: { database_id: NOTION_DB_ID },
    properties: {
      Name: {
        title: [{ text: { content: title } }],
      },
      Category: {
        select: { name: category || 'Other' },
      },
      Priority: {
        select: { name: priority || 'Medium' },
      },
      Status: {
        select: { name: 'Submitted' },
      },
      'Submitted By': {
        rich_text: [{ text: { content: role.name } }],
      },
      Role: {
        rich_text: [{ text: { content: role.title } }],
      },
      Description: {
        rich_text: [{ text: { content: description } }],
      },
      Date: {
        date: { start: new Date().toISOString().split('T')[0] },
      },
    },
  }

  const res = await fetch(`${NOTION_BASE}/pages`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify(page),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('Notion create page error:', err)
    return NextResponse.json({ error: 'Failed to create Notion record' }, { status: 500 })
  }

  const created = await res.json()
  return NextResponse.json({ id: created.id, url: created.url })
}

// ── GET /api/requests — list requests from Notion ────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role_key').eq('id', user.id).single()
  const roleKey  = (profile?.role_key as RoleKey) ?? 'meghan'
  const role     = ROLES[roleKey]
  const isAdmin  = role.access === 'Admin'

  if (!NOTION_TOKEN || !NOTION_DB_ID) {
    return NextResponse.json({ requests: [], setup: true })
  }

  // Admins see all; others see only their own
  const filter = isAdmin
    ? {}
    : {
        filter: {
          property: 'Submitted By',
          rich_text: { equals: role.name },
        },
      }

  const res = await fetch(`${NOTION_BASE}/databases/${NOTION_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify({
      ...filter,
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 50,
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ requests: [] })
  }

  const data = await res.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requests = (data.results ?? []).map((page: any) => ({
    id:          page.id,
    url:         page.url,
    title:       page.properties?.Name?.title?.[0]?.text?.content ?? '(untitled)',
    category:    page.properties?.Category?.select?.name ?? '',
    priority:    page.properties?.Priority?.select?.name ?? '',
    status:      page.properties?.Status?.select?.name ?? 'Submitted',
    submittedBy: page.properties?.['Submitted By']?.rich_text?.[0]?.text?.content ?? '',
    role:        page.properties?.Role?.rich_text?.[0]?.text?.content ?? '',
    date:        page.properties?.Date?.date?.start ?? '',
    description: page.properties?.Description?.rich_text?.[0]?.text?.content ?? '',
  }))

  return NextResponse.json({ requests })
}
