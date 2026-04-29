import { NextRequest, NextResponse } from 'next/server'

interface Term {
  term: string
  field: string
  definition: string
  quote: string
  confidence?: number
}

export async function POST(req: NextRequest) {
  const { terms, format } = await req.json()

  if (format === 'json') {
    return new NextResponse(JSON.stringify(terms, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="lemma-glossary.json"',
      },
    })
  }

  if (format === 'markdown') {
    const grouped: Record<string, Term[]> = {}
    for (const t of terms as Term[]) {
      if (!grouped[t.field]) grouped[t.field] = []
      grouped[t.field].push(t)
    }

    let md = '# Lemma Glossary\n\n'
    md += `*Generated ${new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}*\n\n`

    for (const [field, fieldTerms] of Object.entries(grouped)) {
      md += `## ${field.charAt(0).toUpperCase() + field.slice(1)}\n\n`
      for (const t of fieldTerms) {
        md += `### ${t.term}\n`
        md += `${t.definition}\n\n`
        if (t.quote) md += `> *"${t.quote}"*\n\n`
        if (t.confidence !== undefined) {
          md += `*Confidence: ${Math.round(t.confidence * 100)}%*\n\n`
        }
      }
    }

    return new NextResponse(md, {
      headers: {
        'Content-Type': 'text/markdown',
        'Content-Disposition': 'attachment; filename="lemma-glossary.md"',
      },
    })
  }

  return NextResponse.json({ error: 'Invalid format' }, { status: 400 })
}
