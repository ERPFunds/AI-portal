import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/prompts/systemPrompts'
import type { RoleKey } from '@/lib/data/roles'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: NextRequest) {
  // Authenticate the request
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get the user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role_key')
    .eq('id', user.id)
    .single()

  const roleKey = (profile?.role_key as RoleKey) ?? 'meghan'

  // Parse request body
  const body = await req.json()
  const { messages } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  // Build system prompt scoped to this user's role
  const systemPrompt = buildSystemPrompt(roleKey)

  // Stream the response
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  })
}
