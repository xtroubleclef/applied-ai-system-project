import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { getAllTerms } from '@/lib/glossary-store'
import { retrieve, formatContextBlock } from '@/lib/retriever'
import { checkGrounding } from '@/lib/grounding'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.messages?.length) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  const { messages } = body

  // Strip UI-only fields before sending to Anthropic
  const cleanMessages = messages.map((m: { role: string; content: string }) => ({
    role: m.role,
    content: m.content,
  }))

  const lastUserMessage = [...cleanMessages].reverse().find((m: { role: string }) => m.role === 'user')
  const userQuery: string = lastUserMessage?.content ?? ''

  // RAG: retrieve relevant glossary entries for this query
  const glossary = getAllTerms()
  const retrieved = retrieve(userQuery, glossary, 5)
  const contextBlock = formatContextBlock(retrieved)

  const systemPrompt = contextBlock
    ? `You are a helpful, knowledgeable assistant. Respond in plain prose — no markdown headers, no bullet symbols, no bold formatting. You have access to a live glossary built from this conversation. Ground your answers in these terms when relevant.\n\n${contextBlock}`
    : "You are a helpful, knowledgeable assistant. Respond in plain prose — no markdown headers, no bullet symbols, no bold formatting. Engage thoughtfully with the user's questions and topics."

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: cleanMessages,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    const grounding = checkGrounding(text, retrieved)

    console.log(
      `[chat] retrieved=${retrieved.length} terms, grounding=${grounding.label} (${grounding.score})`
    )

    return NextResponse.json({ text, retrieved_terms: retrieved, grounding })
  } catch (err) {
    console.error('[chat] Anthropic API error:', err)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 502 })
  }
}
