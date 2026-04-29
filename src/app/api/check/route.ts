import { NextRequest, NextResponse } from 'next/server'
import { validateTerm } from '@/lib/grounding'

export async function POST(req: NextRequest) {
  const { terms } = await req.json().catch(() => ({ terms: [] }))

  if (!Array.isArray(terms)) {
    return NextResponse.json({ error: 'terms array required' }, { status: 400 })
  }

  const validations = terms.map((t) => validateTerm(t))
  const passed = validations.filter((v) => v.issues.length === 0).length

  return NextResponse.json({
    validations,
    summary: {
      total: validations.length,
      passed,
      failed: validations.length - passed,
      passRate: validations.length > 0 ? Math.round((passed / validations.length) * 100) / 100 : 0,
    },
  })
}
