import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const GLOSSARY_PATH = path.join(process.cwd(), 'data', 'glossary.json')

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

interface GlossaryFile {
  version: number
  terms: GlossaryEntry[]
}

function load(): GlossaryFile {
  try {
    if (!fs.existsSync(GLOSSARY_PATH)) return { version: 1, terms: [] }
    return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8')) as GlossaryFile
  } catch {
    return { version: 1, terms: [] }
  }
}

function save(store: GlossaryFile): void {
  const dir = path.dirname(GLOSSARY_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(GLOSSARY_PATH, JSON.stringify(store, null, 2), 'utf-8')
}

export function getAllTerms(): GlossaryEntry[] {
  return load().terms
}

export function addTerms(
  incoming: Omit<GlossaryEntry, 'id' | 'timestamp'>[]
): GlossaryEntry[] {
  const store = load()
  const existing = new Set(store.terms.map((t) => t.term.toLowerCase()))

  const added: GlossaryEntry[] = []
  for (const t of incoming) {
    if (existing.has(t.term.toLowerCase())) continue
    const entry: GlossaryEntry = {
      ...t,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    }
    store.terms.push(entry)
    existing.add(t.term.toLowerCase())
    added.push(entry)
  }

  if (added.length > 0) save(store)
  return added
}

export function clearGlossary(): void {
  save({ version: 1, terms: [] })
}
