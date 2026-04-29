import { NextResponse } from 'next/server'
import { getAllTerms, clearGlossary } from '@/lib/glossary-store'

export async function GET() {
  const terms = getAllTerms()
  return NextResponse.json({ terms, count: terms.length })
}

export async function DELETE() {
  clearGlossary()
  console.log('[glossary] cleared')
  return NextResponse.json({ ok: true })
}
