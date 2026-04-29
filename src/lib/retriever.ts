import type { GlossaryEntry } from './glossary-store'

export interface RetrievedEntry extends GlossaryEntry {
  relevanceScore: number
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
  )
}

function score(queryTokens: Set<string>, entry: GlossaryEntry): number {
  let hits = 0

  // Bonus: query contains the full term (most important signal)
  const termWords = entry.term.toLowerCase().split(/\s+/)
  const termMatch = termWords.filter((w) => queryTokens.has(w)).length / termWords.length
  hits += termMatch * 3

  // Definition overlap
  const defTokens = tokenize(entry.definition)
  for (const t of queryTokens) {
    if (defTokens.has(t)) hits += 0.5
  }

  // Field overlap
  if (queryTokens.has(entry.field.toLowerCase())) hits += 1

  return hits / Math.max(queryTokens.size, 1)
}

export function retrieve(
  query: string,
  glossary: GlossaryEntry[],
  topK = 5
): RetrievedEntry[] {
  if (!glossary.length) return []
  const queryTokens = tokenize(query)
  if (!queryTokens.size) return []

  return glossary
    .map((entry) => ({ ...entry, relevanceScore: score(queryTokens, entry) }))
    .filter((e) => e.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, topK)
}

export function formatContextBlock(retrieved: RetrievedEntry[]): string {
  if (!retrieved.length) return ''
  const lines = retrieved.map(
    (e, i) => `[${i + 1}] ${e.term} (${e.field}): ${e.definition}${e.quote ? ` — "${e.quote}"` : ''}`
  )
  return `Relevant glossary context from this conversation:\n${lines.join('\n')}`
}
