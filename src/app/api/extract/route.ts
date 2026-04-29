import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'
import { addTerms } from '@/lib/glossary-store'
import { computeConfidence, validateTerm } from '@/lib/grounding'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ExtractionMode = 'terminology' | 'decision'

interface RawTerm {
  term: string
  field: string
  definition: string
  quote: string
  alternatives_rejected?: string[]
}

const TERMINOLOGY_PROMPT = (text: string) => `Extract all domain-specific, technical, or specialized terms from this conversation. For each term provide:
- term: base form of the word or phrase
- field: domain it belongs to (e.g. "machine learning", "statistics", "linguistics")
- definition: clear 1-2 sentence definition in context
- quote: exact short phrase from the conversation (under 15 words)

Return a JSON array only. Skip common words. Only include genuinely domain-specific terms.

CONVERSATION:
${text}`

const DECISION_PROMPT = (text: string) => `Extract all decisions, rationales, and rejected alternatives from this conversation. For each decision provide:
- term: the decision made (concise noun phrase, e.g. "Use PostgreSQL over MongoDB")
- field: domain of the decision (e.g. "database", "architecture", "product", "hiring")
- definition: the rationale — why this decision was made (1-2 sentences)
- quote: exact short phrase from the conversation that confirms the decision (under 15 words)
- alternatives_rejected: array of strings — alternatives explicitly considered and not chosen (empty array if none mentioned)

Return a JSON array only. Only extract actual decisions with clear rationale. Skip opinions, questions, and hypotheticals.

CONVERSATION:
${text}`

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.conversation || body.conversation.length < 2) {
    return NextResponse.json({ terms: [] })
  }

  const { conversation, mode = 'terminology' } = body as { conversation: { role: string; content: string }[]; mode: ExtractionMode }

  const conversationText = conversation
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n')

  const userPrompt = mode === 'decision'
    ? DECISION_PROMPT(conversationText)
    : TERMINOLOGY_PROMPT(conversationText)

  try {
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: `You are a ${mode === 'decision' ? 'decision' : 'terminology'} extraction system. Return structured JSON only. No preamble, no markdown fences.`,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('')

    const clean = raw.replace(/```json|```/g, '').trim()
    const rawTerms: RawTerm[] = JSON.parse(clean)

    const enriched = rawTerms.map((t) => ({
      ...t,
      alternatives_rejected: t.alternatives_rejected ?? [],
      mode,
      confidence: computeConfidence(t),
      validation: validateTerm(t),
    }))

    const qualified = enriched.filter((t) => t.confidence >= 0.5)
    if (qualified.length > 0) {
      addTerms(
        qualified.map((t) => ({
          term: t.term,
          field: t.field,
          definition: t.definition,
          quote: t.quote,
          confidence: t.confidence,
          alternatives_rejected: t.alternatives_rejected,
          mode: t.mode,
        }))
      )
      console.log(`[extract:${mode}] stored ${qualified.length}/${enriched.length} qualified entries`)
    }

    return NextResponse.json({ terms: enriched })
  } catch (err) {
    console.error('[extract] error:', err)
    return NextResponse.json({ terms: [] })
  }
}
