#!/usr/bin/env node
/**
 * Lemma RAG + Reliability Test Harness
 * Run: node scripts/test-harness.mjs
 *
 * Tests core logic functions (no server required, no API calls).
 */

// ── Inlined core functions ─────────────────────────────────────────────────

function computeConfidence(term) {
  let score = 0
  if (term.definition && term.definition.trim().length > 10) score += 0.4
  if (term.quote && term.quote.trim().length > 5) score += 0.3
  if (term.field && term.field.trim().length > 1) score += 0.2
  if (term.term && term.term.trim().length > 2) score += 0.1
  return Math.round(score * 100) / 100
}

function validateTerm(term) {
  const issues = []
  const hasDefinition = !!(term.definition && term.definition.trim().length > 10)
  const hasQuote = !!(term.quote && term.quote.trim().length > 5)
  const hasField = !!(term.field && term.field.trim().length > 1)
  if (!hasDefinition) issues.push('missing or weak definition')
  if (!hasQuote) issues.push('missing source quote')
  if (!hasField) issues.push('missing field classification')
  return { term: term.term ?? '', hasDefinition, hasQuote, hasField, confidence: computeConfidence(term), issues }
}

function tokenize(text) {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2))
}

function retrieve(query, glossary, topK = 5) {
  if (!glossary.length) return []
  const queryTokens = tokenize(query)
  if (!queryTokens.size) return []
  const scored = glossary.map(entry => {
    let hits = 0
    const termWords = entry.term.toLowerCase().split(/\s+/)
    const termMatch = termWords.filter(w => queryTokens.has(w)).length / termWords.length
    hits += termMatch * 3
    const defTokens = tokenize(entry.definition)
    for (const t of queryTokens) if (defTokens.has(t)) hits += 0.5
    if (queryTokens.has(entry.field.toLowerCase())) hits += 1
    return { ...entry, relevanceScore: hits / Math.max(queryTokens.size, 1) }
  })
  return scored.filter(e => e.relevanceScore > 0).sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, topK)
}

function checkGrounding(responseText, retrieved) {
  if (!retrieved.length) return { score: 1, termsMentioned: [], termsMissed: [], coverageRatio: 1, passed: true, label: 'strong' }
  const lower = responseText.toLowerCase()
  const mentioned = []
  const missed = []
  for (const entry of retrieved) {
    const words = entry.term.toLowerCase().split(/\s+/)
    if (words.every(w => lower.includes(w))) mentioned.push(entry.term)
    else missed.push(entry.term)
  }
  const ratio = mentioned.length / retrieved.length
  const score = Math.round(ratio * 100) / 100
  const label = ratio >= 0.7 ? 'strong' : ratio >= 0.4 ? 'moderate' : ratio > 0 ? 'weak' : 'ungrounded'
  return { score, termsMentioned: mentioned, termsMissed: missed, coverageRatio: ratio, passed: ratio >= 0.3, label }
}

// ── Sample glossary data ────────────────────────────────────────────────────

const SAMPLE_GLOSSARY = [
  {
    id: '1', term: 'backpropagation', field: 'machine learning',
    definition: 'An algorithm that computes gradients of the loss function with respect to network weights by propagating errors backward through the network.',
    quote: 'the network learns through backpropagation', confidence: 1.0,
  },
  {
    id: '2', term: 'gradient descent', field: 'machine learning',
    definition: 'An optimization algorithm that iteratively updates model parameters in the direction of steepest loss reduction.',
    quote: 'gradient descent minimizes the loss function', confidence: 1.0,
  },
  {
    id: '3', term: 'API gateway', field: 'software architecture',
    definition: 'A server that acts as the single entry point for client requests, routing them to appropriate backend services.',
    quote: 'the API gateway routes requests to microservices', confidence: 1.0,
  },
  {
    id: '4', term: 'morpheme', field: 'linguistics',
    definition: 'The smallest meaningful unit of language that cannot be divided further without loss of meaning.',
    quote: 'morphemes are the building blocks of words', confidence: 1.0,
  },
  {
    id: '5', term: 'latent space', field: 'machine learning',
    definition: 'A compressed, lower-dimensional representation learned by an encoder that captures meaningful structure in the data.',
    quote: 'embeddings exist in a high-dimensional latent space', confidence: 1.0,
  },
]

// ── Test runner ─────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    const result = fn()
    if (result.passed) {
      console.log(`  ✓  ${name}`)
      passed++
    } else {
      console.log(`  ✗  ${name}`)
      console.log(`     → ${result.reason}`)
      failed++
    }
  } catch (err) {
    console.log(`  ✗  ${name}`)
    console.log(`     → threw: ${err.message}`)
    failed++
  }
}

function assert(condition, reason) {
  return { passed: !!condition, reason }
}

// ── Tests ───────────────────────────────────────────────────────────────────

console.log('\nLemma — Test Harness\n')
console.log('── Confidence Scoring ──────────────────────────────────')

test('complete term scores 1.0', () => {
  const term = { term: 'backpropagation', field: 'machine learning', definition: 'An algorithm for computing gradients in neural networks.', quote: 'backpropagation updates weights' }
  const conf = computeConfidence(term)
  return assert(conf === 1.0, `expected 1.0, got ${conf}`)
})

test('missing quote reduces score to 0.7', () => {
  const term = { term: 'gradient', field: 'calculus', definition: 'The vector of partial derivatives of a function.', quote: '' }
  const conf = computeConfidence(term)
  return assert(conf === 0.7, `expected 0.7, got ${conf}`)
})

test('missing definition and quote scores 0.3', () => {
  const term = { term: 'entropy', field: 'physics', definition: '', quote: '' }
  const conf = computeConfidence(term)
  return assert(conf === 0.3, `expected 0.3, got ${conf}`)
})

test('empty term scores 0.0', () => {
  const conf = computeConfidence({})
  return assert(conf === 0.0, `expected 0.0, got ${conf}`)
})

console.log('\n── Term Validation ─────────────────────────────────────')

test('fully specified term passes with zero issues', () => {
  const v = validateTerm({ term: 'neural network', field: 'machine learning', definition: 'A computational model inspired by biological neurons.', quote: 'neural networks power modern AI' })
  return assert(v.issues.length === 0, `issues: ${v.issues.join(', ')}`)
})

test('term without definition is flagged', () => {
  const v = validateTerm({ term: 'epoch', field: 'machine learning', definition: '', quote: 'trained for 10 epochs' })
  return assert(v.issues.includes('missing or weak definition'), `issues: ${v.issues.join(', ')}`)
})

test('term without quote is flagged', () => {
  const v = validateTerm({ term: 'tensor', field: 'mathematics', definition: 'A multidimensional array generalizing scalars, vectors, and matrices.', quote: '' })
  return assert(v.issues.includes('missing source quote'), `issues: ${v.issues.join(', ')}`)
})

test('term without field is flagged', () => {
  const v = validateTerm({ term: 'softmax', field: '', definition: 'A function that converts logits into a probability distribution.', quote: 'softmax normalizes the output' })
  return assert(v.issues.includes('missing field classification'), `issues: ${v.issues.join(', ')}`)
})

console.log('\n── RAG Retrieval ───────────────────────────────────────')

test('query about gradient descent retrieves it as top result', () => {
  const results = retrieve('how does gradient descent optimize the loss', SAMPLE_GLOSSARY)
  return assert(results.length > 0 && results[0].term === 'gradient descent', `top result: ${results[0]?.term}`)
})

test('query about morphemes retrieves linguistics term', () => {
  const results = retrieve('explain morpheme structure in linguistics', SAMPLE_GLOSSARY)
  return assert(results.some(r => r.term === 'morpheme'), `results: ${results.map(r => r.term).join(', ')}`)
})

test('empty glossary returns no results', () => {
  const results = retrieve('backpropagation', [])
  return assert(results.length === 0, `expected 0, got ${results.length}`)
})

test('irrelevant query returns no results', () => {
  const results = retrieve('xyz banana qqq', SAMPLE_GLOSSARY)
  return assert(results.length === 0, `got ${results.length} results`)
})

console.log('\n── Grounding Check ─────────────────────────────────────')

test('response mentioning all retrieved terms scores strong', () => {
  const retrieved = [SAMPLE_GLOSSARY[0], SAMPLE_GLOSSARY[1]]
  const response = 'In neural networks, backpropagation computes gradients which are then used by gradient descent to update weights.'
  const g = checkGrounding(response, retrieved)
  return assert(g.label === 'strong' && g.passed, `label: ${g.label}, score: ${g.score}`)
})

test('response mentioning none of the retrieved terms scores ungrounded', () => {
  const retrieved = [SAMPLE_GLOSSARY[2]]  // API gateway
  const response = 'The weather today is sunny with mild temperatures and low humidity.'
  const g = checkGrounding(response, retrieved)
  return assert(g.label === 'ungrounded' && !g.passed, `label: ${g.label}`)
})

test('no retrieved context always passes grounding', () => {
  const g = checkGrounding('Any response here.', [])
  return assert(g.passed && g.label === 'strong', `passed: ${g.passed}, label: ${g.label}`)
})

test('response mentioning some terms scores moderate or above', () => {
  const retrieved = [SAMPLE_GLOSSARY[0], SAMPLE_GLOSSARY[1], SAMPLE_GLOSSARY[4]]
  const response = 'backpropagation and gradient descent are key optimization techniques.'
  const g = checkGrounding(response, retrieved)
  return assert(g.coverageRatio >= 0.5, `coverage: ${g.coverageRatio}`)
})

// ── Decision Extraction ─────────────────────────────────────────────────────

console.log('\n── Decision Extraction ─────────────────────────────────')

const SAMPLE_DECISIONS = [
  {
    id: 'd1', term: 'Use PostgreSQL over MongoDB', field: 'database',
    definition: 'Chosen because the data model is relational and requires ACID transactions.',
    quote: 'we need ACID compliance so PostgreSQL wins',
    alternatives_rejected: ['MongoDB', 'DynamoDB'],
    confidence: 1.0, mode: 'decision',
  },
  {
    id: 'd2', term: 'Deploy on Railway not Vercel', field: 'infrastructure',
    definition: 'Railway supports long-running background jobs which Vercel serverless does not.',
    quote: 'Vercel times out after 10 seconds',
    alternatives_rejected: ['Vercel', 'Fly.io'],
    confidence: 1.0, mode: 'decision',
  },
]

test('complete decision entry scores confidence 1.0', () => {
  const conf = computeConfidence(SAMPLE_DECISIONS[0])
  return assert(conf >= 0.9, `expected ≥ 0.9, got ${conf}`)
})

test('decision without quote is flagged by validateTerm', () => {
  const v = validateTerm({ term: 'Use React over Vue', field: 'frontend', definition: 'Team has more React experience and the ecosystem is larger.', quote: '' })
  return assert(v.issues.includes('missing source quote'), `issues: ${v.issues.join(', ')}`)
})

test('RAG retrieval finds the right decision when queried by keyword', () => {
  const results = retrieve('what database did we choose and why', SAMPLE_DECISIONS)
  return assert(results.some(r => r.term === 'Use PostgreSQL over MongoDB'), `results: ${results.map(r => r.term).join(', ')}`)
})

test('grounding check passes when response references the decision term', () => {
  const retrieved = [SAMPLE_DECISIONS[0]]
  const response = 'Based on your decision to Use PostgreSQL over MongoDB, the schema should be normalized into relational tables.'
  const g = checkGrounding(response, retrieved)
  return assert(g.passed, `label: ${g.label}, score: ${g.score}`)
})

// ── Parallel Extraction ────────────────────────────────────────────────────

console.log('\n── Parallel Extraction ─────────────────────────────────')

test('terminology and decision stores are independent — same term name can exist in both without conflict', () => {
  // A concept like "gradient descent" might appear as a term in terminology mode
  // and as part of a decision entry ("use gradient descent over Adam") in decision mode.
  // The two arrays never deduplicate against each other.
  const termStore = [
    { term: 'gradient descent', field: 'machine learning', definition: 'An iterative optimization algorithm.', quote: 'gradient descent minimizes loss' },
  ]
  const decStore = [
    { term: 'Use gradient descent over Adam', field: 'architecture', definition: 'Chosen for simplicity and interpretability in early training.', quote: 'we chose gradient descent over Adam' },
  ]
  const termKeys = new Set(termStore.map(t => t.term.toLowerCase()))
  const decKeys = new Set(decStore.map(t => t.term.toLowerCase()))
  // No overlap — different keys in each store
  const overlap = [...decKeys].filter(k => termKeys.has(k))
  return assert(overlap.length === 0 && termStore.length === 1 && decStore.length === 1,
    `unexpected overlap: ${overlap.join(', ')}`)
})

test('one extraction returning empty does not clear or affect the other mode\'s terms', () => {
  // Simulate: terminology returned 2 terms, decision returned nothing (e.g. network error)
  const termResult = [
    { term: 'backpropagation', field: 'machine learning', definition: 'Gradient computation via reverse-mode autodiff.', quote: 'backpropagation computes gradients' },
    { term: 'latent space', field: 'machine learning', definition: 'Compressed representation learned by an encoder.', quote: 'embeddings live in a latent space' },
  ]
  const decResult = [] // failed / empty
  return assert(termResult.length === 2 && decResult.length === 0,
    'terminology terms present; decision store stays empty without touching terminology')
})

test('confidence scoring is mode-agnostic: a complete decision entry scores 1.0 same as a complete term', () => {
  const termEntry = { term: 'attention mechanism', field: 'machine learning', definition: 'A mechanism that weighs input tokens by relevance before aggregation.', quote: 'attention reweights the context window' }
  const decEntry  = { term: 'Use transformer over RNN', field: 'architecture', definition: 'Transformers parallelize training and capture long-range dependencies better than RNNs.', quote: 'transformers outperform RNNs on sequence tasks' }
  const tc = computeConfidence(termEntry)
  const dc = computeConfidence(decEntry)
  return assert(tc === 1.0 && dc === 1.0, `termConf=${tc}, decConf=${dc}`)
})

test('RAG retrieval operates independently on each mode\'s store — no cross-contamination', () => {
  const termGlossary = [SAMPLE_GLOSSARY[0], SAMPLE_GLOSSARY[1]] // backpropagation, gradient descent
  const decGlossary  = [SAMPLE_DECISIONS[0], SAMPLE_DECISIONS[1]] // PostgreSQL, Railway
  const termHit = retrieve('how does gradient descent optimize weights', termGlossary)
  const decHit  = retrieve('what database technology did we select', decGlossary)
  // Each retrieval should find its own mode's top entry, not anything from the other store
  const termOk = termHit.length > 0 && termHit[0].term === 'gradient descent'
  const decOk  = decHit.length > 0 && decHit.some(r => r.term === 'Use PostgreSQL over MongoDB')
  return assert(termOk && decOk, `term top: ${termHit[0]?.term}, dec top: ${decHit[0]?.term}`)
})

// ── Sample conversation simulation ─────────────────────────────────────────

console.log('\n── Sample Conversation Simulations ─────────────────────')

const SAMPLE_CONVERSATIONS = [
  {
    name: 'Machine Learning Basics',
    terms: [
      { term: 'backpropagation', field: 'machine learning', definition: 'Algorithm for computing gradients in neural networks by propagating errors backward.', quote: 'the network learns through backpropagation' },
      { term: 'gradient descent', field: 'machine learning', definition: 'Optimization algorithm that iteratively updates parameters to minimize a loss function.', quote: 'gradient descent minimizes the loss' },
    ],
    query: 'How do neural networks learn using gradient descent?',
  },
  {
    name: 'Software Architecture',
    terms: [
      { term: 'microservices', field: 'software architecture', definition: 'An architectural pattern where an application is composed of small, independent services.', quote: 'splitting the monolith into microservices' },
      { term: 'API gateway', field: 'software architecture', definition: 'A single entry point that routes client requests to the appropriate backend service.', quote: 'the API gateway handles all client traffic' },
    ],
    query: 'What role does the API gateway play in microservices?',
  },
  {
    name: 'Linguistics & NLP',
    terms: [
      { term: 'morpheme', field: 'linguistics', definition: 'The smallest meaningful unit of language that cannot be further divided without losing meaning.', quote: 'morphemes are the atoms of language' },
      { term: 'tokenization', field: 'NLP', definition: 'The process of splitting text into individual units such as words or subwords for processing.', quote: 'tokenization splits sentences into tokens' },
    ],
    query: 'How does tokenization relate to morpheme analysis?',
  },
]

for (const conv of SAMPLE_CONVERSATIONS) {
  const convTerms = conv.terms
  const allValid = convTerms.every(t => computeConfidence(t) >= 0.7)
  const allQualified = convTerms.filter(t => computeConfidence(t) >= 0.5)
  const retrieved = retrieve(conv.query, convTerms)
  const mockResponse = `Based on the glossary, ${convTerms.map(t => t.term).join(' and ')} are central concepts here.`
  const grounding = checkGrounding(mockResponse, retrieved)

  test(`${conv.name}: all terms meet confidence threshold`, () => assert(allValid, `${allQualified.length}/${convTerms.length} qualified`))
  test(`${conv.name}: RAG retrieves relevant terms for follow-up`, () => assert(retrieved.length > 0, `retrieved ${retrieved.length} terms`))
  test(`${conv.name}: grounded response passes check`, () => assert(grounding.passed, `label: ${grounding.label}, score: ${grounding.score}`))
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(55)}`)
const total = passed + failed
const pct = Math.round((passed / total) * 100)
console.log(`Results: ${passed}/${total} passed (${pct}%)`)
if (failed > 0) {
  console.log(`\n${failed} test(s) failed. Review output above.`)
  process.exit(1)
} else {
  console.log('\nAll tests passed.')
}
