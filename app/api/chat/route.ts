import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createSupabaseServer } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/prompts/systemPrompts'
import { TOOLS, TOOL_LABELS, executeTool } from '@/lib/tools/agentTools'
import type { RoleKey } from '@/lib/data/roles'
import type {
  MessageParam,
  ContentBlock,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// SSE helper — each event is a JSON line prefixed with "data: "
function sseEvent(enc: TextEncoder, data: object): Uint8Array {
  return enc.encode('data: ' + JSON.stringify(data) + '\n\n')
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role_key')
    .eq('id', user.id)
    .single()

  const roleKey = (profile?.role_key as RoleKey) ?? 'meghan'
  const system = buildSystemPrompt(roleKey)

  // ── Parse body ────────────────────────────────────────────────────────────
  const body = await req.json()
  const { messages: rawMessages } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
  }

  if (!rawMessages?.length) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
  }

  const enc = new TextEncoder()

  // ── Agentic streaming response ────────────────────────────────────────────
  const readable = new ReadableStream({
    async start(controller) {
      try {
        // Convert chat history to Anthropic MessageParam format
        let messages: MessageParam[] = rawMessages.map((m) => ({
          role: m.role,
          content: m.content,
        }))

        // Agentic loop — runs until model stops calling tools
        while (true) {
          // Non-streaming pass to resolve any tool calls
          const response = await anthropic.messages.create({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            system,
            messages,
            tools: TOOLS,
          })

          if (response.stop_reason === 'tool_use') {
            const toolUseBlocks = response.content.filter(
              (b): b is ToolUseBlock => b.type === 'tool_use'
            )
            const toolResults: ContentBlock[] = []

            for (const tu of toolUseBlocks) {
              // Tell client a tool is running
              controller.enqueue(
                sseEvent(enc, {
                  type: 'tool_start',
                  name: tu.name,
                  label: TOOL_LABELS[tu.name] ?? `Running ${tu.name}…`,
                })
              )

              const result = await executeTool(
                tu.name,
                tu.input as Record<string, string>
              )

              // Tell client the tool is done
              controller.enqueue(sseEvent(enc, { type: 'tool_done', name: tu.name }))

              toolResults.push({
                type: 'tool_result',
                tool_use_id: tu.id,
                content: JSON.stringify(result),
              } as unknown as ContentBlock)
            }

            // Append tool results and loop again
            messages = [
              ...messages,
              { role: 'assistant', content: response.content },
              { role: 'user', content: toolResults },
            ]
            continue
          }

          // No more tool calls — stream the final text response
          const textStream = anthropic.messages.stream({
            model: 'claude-opus-4-5',
            max_tokens: 2048,
            system,
            messages,
          })

          for await (const chunk of textStream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(
                sseEvent(enc, { type: 'text', text: chunk.delta.text })
              )
            }
          }

          controller.enqueue(sseEvent(enc, { type: 'done' }))
          break
        }
      } catch (err) {
        controller.enqueue(sseEvent(enc, { type: 'error', message: String(err) }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
