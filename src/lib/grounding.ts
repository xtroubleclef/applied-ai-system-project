import type { GlossaryEntry } from './glossary-store'
import type { RetrievedEntry } from './retriever'

export interface TermValidation {
  term: string
  hasDefinition: boolean
  hasQuote: boolean
  hasField: boolean
  confidence: number
  issues: string[]
}

export interface GroundingResult {
  score: number
  termsMentioned: string[]
  termsMissed: string[]
  coverageRatio: number
  passed: boolean
  label: 'strong' | 'moderate' | 'weak' | 'ungrounded'
}

export function computeConfidence(term: Partial<GlossaryEntry>): number {
  let score = 0
  if (term.definition && term.definition.trim().length > 10) score += 0.4
  if (term.quote && term.quote.trim().length > 5) score += 0.3
  if (term.field && term.field.trim().length > 1) score += 0.2
  if (term.term && term.term.trim().length > 2) score += 0.1
  return Math.round(score * 100) / 100
}

export function validateTerm(term: Partial<GlossaryEntry>): TermValidation {
  const issues: string[] = []
  const hasDefinition = !!(term.definition && term.definition.trim().length > 10)
  const hasQuote = !!(term.quote && term.quote.trim().length > 5)
  const hasField = !!(term.field && term.field.trim().length > 1)

  if (!hasDefinition) issues.push('missing or weak definition')
  if (!hasQuote) issues.push('missing source quote')
  if (!hasField) issues.push('missing field classification')

  return {
    term: term.term ?? '',
    hasDefinition,
    hasQuote,
    hasField,
    confidence: computeConfidence(term),
    issues,
  }
}

export function checkGrounding(
  responseText: string,
  retrieved: RetrievedEntry[]
): GroundingResult {
  // No retrieved context means RAG wasn't used — not an error
  if (!retrieved.length) {
    return {
      score: 1,
      termsMentioned: [],
      termsMissed: [],
      coverageRatio: 1,
      passed: true,
      label: 'strong',
    }
  }

  const lower = responseText.toLowerCase()
  const mentioned: string[] = []
  const missed: string[] = []

  for (const entry of retrieved) {
    // Term is "mentioned" if all its words appear somewhere in the response
    const words = entry.term.toLowerCase().split(/\s+/)
    if (words.every((w) => lower.includes(w))) {
      mentioned.push(entry.term)
    } else {
      missed.push(entry.term)
    }
  }

  const ratio = mentioned.length / retrieved.length
  const score = Math.round(ratio * 100) / 100

  const label: GroundingResult['label'] =
    ratio >= 0.7 ? 'strong' : ratio >= 0.4 ? 'moderate' : ratio > 0 ? 'weak' : 'ungrounded'

  return {
    score,
    termsMentioned: mentioned,
    termsMissed: missed,
    coverageRatio: ratio,
    passed: ratio >= 0.3,
    label,
  }
}
