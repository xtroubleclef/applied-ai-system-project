import crypto from 'crypto'

export interface GlossaryEntry {
  id: string
  term: string
  field: string
  definition: string
  quote: string
  confidence: number
  timestamp: string
  sessionId?: string
  alternatives_rejected?: string[]
  mode?: 'terminology' | 'decision'
}

const store: GlossaryEntry[] = []

export function getAllTerms(): GlossaryEntry[] {
  return store
}

export function addTerms(
  incoming: Omit<GlossaryEntry, 'id' | 'timestamp'>[]
): GlossaryEntry[] {
  const existing = new Set(store.map((t) => t.term.toLowerCase()))

  const added: GlossaryEntry[] = []
  for (const t of incoming) {
    if (existing.has(t.term.toLowerCase())) continue
    const entry: GlossaryEntry = {
      ...t,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    store.push(entry)
    existing.add(t.term.toLowerCase())
    added.push(entry)
  }

  return added
}

export function clearGlossary(): void {
  store.length = 0
}
