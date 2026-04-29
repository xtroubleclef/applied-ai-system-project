# Lemma

> AI-powered terminology extraction with live RAG grounding.

**CodePath Applied AI System — Project 4**

Lemma is a Claude-powered chat interface that extracts domain-specific terminology from conversations in real time, builds a persistent live glossary, and uses that glossary to ground follow-up AI answers via Retrieval-Augmented Generation (RAG).

---

## Base Project (Modules 1–3)

The original Lemma (built in Modules 1–3) is a Next.js chat interface using the Anthropic API that:
- Lets users chat with Claude Haiku as normal
- Automatically extracts domain-specific terms after each exchange
- Displays terms in a side panel with definitions, field classification, and source quotes
- Exports the glossary as Markdown or JSON

**Original goal:** turn a casual conversation into a structured, reusable reference glossary — no manual note-taking required.

---


## Project 4 Extension: RAG + Reliability Harness

This extension adds four substantial AI system features on top of the base:

### 1. Persistent Structured Glossary
Terms extracted during a session are stored in `data/glossary.json`. On subsequent questions, the system retrieves from this accumulated context — meaning Lemma gets smarter the longer you use it.

### 2. RAG (Retrieval-Augmented Generation)
When a user sends a message, Lemma retrieves the most relevant glossary entries using token-overlap scoring and injects them directly into Claude's system prompt. Claude's response is grounded in your own established terminology — not generic world knowledge.

### 3. Visible Grounding in the UI
Every AI response that used glossary context shows:
- A "retrieved context" block listing which terms were injected and their relevance scores
- A grounding badge (`strong · 87%`, `moderate · 55%`, `weak · 20%`, `ungrounded · 0%`)
- A "not referenced" line listing any retrieved terms the response didn't actually use

This makes the AI's behavior transparent and auditable.

### 5. Parallel Extraction — Terminology + Decision Memory
Every conversation turn runs **both** extraction modes simultaneously. A single `Promise.all` call fires `/api/extract` for `terminology` and `/api/extract` for `decision` at the same time, then stores results in two independent arrays. Neither mode's failure affects the other.

The **Terminology** view captures domain vocabulary with definitions, field tags, and source quotes. The **Decision Memory** view captures decisions, rationale, and rejected alternatives. Switching between the two buttons in the UI is a pure view toggle — it does not restart extraction, clear data, or cost any additional API call.

**Use case:** run a planning or design discussion. By the end you have two independently searchable logs: a glossary of domain concepts and an auditable record of every architectural decision made, including what was rejected and why. Both logs are RAG-grounded — follow-up questions can draw on either.

### 4. Reliability Harness
- **Confidence scoring**: every extracted term gets a 0–1 score based on whether it has a definition, source quote, and field classification
- **Term validation**: terms with missing fields are flagged with specific issue labels in the glossary UI
- **Quality gate**: only terms with confidence ≥ 0.5 are persisted to the glossary
- **Grounding checker**: after each RAG response, the system checks whether Claude actually referenced the retrieved terms
- **Logging**: all routes log to console with extraction counts, grounding scores, and errors
- **Error handling**: API failures return structured error responses and are surfaced in the UI

---

## System Architecture

See [`diagrams/architecture.md`](diagrams/architecture.md) for the full Mermaid diagram. Summary:

```
User → Chat Panel → POST /api/chat
                         ↓
                    retrieve() ← Glossary Store (data/glossary.json)
                         ↓
                    Claude Haiku (grounded system prompt)
                         ↓
                    checkGrounding()
                         ↓
                    { text, retrieved_terms, grounding } → UI

User response → Promise.all([
                    POST /api/extract { mode: 'terminology' }   ← parallel
                    POST /api/extract { mode: 'decision'    }   ← parallel
                ])
                    ↓ (each independently)
               Claude Haiku (extraction prompt per mode)
                    ↓
               computeConfidence() + validateTerm()
                    ↓
               qualified terms → Glossary Store (shared)
               terminologyTerms state ←→ decisionTerms state (separate)
                    ↓
               Glossary Panel — Terminology or Decision view (toggle, no re-extraction)
```

---

## Setup

### Prerequisites
- Node.js 18+
- An Anthropic API key ([get one here](https://console.anthropic.com))

### Install

```bash
# Clone / enter the project
cd applied-ai-system-project

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY=your_key_here

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running the Test Harness

No server required:

```bash
node scripts/test-harness.mjs
```

Expected output:
```
Lemma — Test Harness

── Confidence Scoring ──────────────────────────────────
  ✓  complete term scores 1.0
  ✓  missing quote reduces score to 0.7
  ✓  missing definition and quote scores 0.3
  ✓  empty term scores 0.0

── Term Validation ─────────────────────────────────────
  ✓  fully specified term passes with zero issues
  ✓  term without definition is flagged
  ✓  term without quote is flagged
  ✓  term without field is flagged

── RAG Retrieval ───────────────────────────────────────
  ✓  query about gradient descent retrieves it as top result
  ✓  query about morphemes retrieves linguistics term
  ✓  empty glossary returns no results
  ✓  irrelevant query returns no results

── Grounding Check ─────────────────────────────────────
  ✓  response mentioning all retrieved terms scores strong
  ✓  response mentioning none of the retrieved terms scores ungrounded
  ✓  no retrieved context always passes grounding
  ✓  response mentioning some terms scores moderate or above

── Sample Conversation Simulations ─────────────────────
  ✓  Machine Learning Basics: all terms meet confidence threshold
  ✓  Machine Learning Basics: RAG retrieves relevant terms for follow-up
  ✓  Machine Learning Basics: grounded response passes check
  ...

Results: 22/22 passed (100%)
```

---

## Sample Interactions

### Example 1 — RAG in action

After chatting about machine learning (terms like `backpropagation`, `gradient descent`, `latent space` accumulate in the glossary), ask a follow-up:

> **User:** How does backpropagation use the gradient to update weights?

The system retrieves `backpropagation` and `gradient descent` from the glossary and injects them as context. The response will show:

```
retrieved context           strong · 100%
backpropagation   machine learning   92%
gradient descent  machine learning   87%
```

### Example 2 — Grounding check catches drift

If Claude's response doesn't reference the retrieved terms (e.g., it generalizes away from your glossary), the badge shows:

```
retrieved context           weak · 25%
backpropagation   machine learning   92%

not referenced: backpropagation
```

### Example 3 — Confidence scoring

A term extracted without a source quote gets flagged:

```
backpropagation   machine learning   [70%]
▶ expand
  An algorithm for computing gradients...
  [missing source quote]   ← issue badge
```

---

## Project Structure

```
.
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main UI (chat + glossary)
│   │   ├── page.module.css       # All styles
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── chat/route.ts     # RAG-injected chat
│   │       ├── extract/route.ts  # Term extraction + confidence
│   │       ├── export/route.ts   # JSON / Markdown export
│   │       ├── glossary/route.ts # Persistent glossary CRUD
│   │       └── check/route.ts    # Batch term validation
│   └── lib/
│       ├── glossary-store.ts     # File-based glossary I/O
│       ├── retriever.ts          # Token-overlap RAG retrieval
│       └── grounding.ts          # Confidence + guardrail logic
├── data/
│   └── glossary.json             # Persistent glossary (git-ignored)
├── samples/
│   ├── sample_01_ml_conversation.txt
│   ├── sample_02_architecture_conversation.txt
│   └── sample_03_linguistics_conversation.txt
├── scripts/
│   └── test-harness.mjs          # Reliability test suite
├── diagrams/
│   └── architecture.md           # System diagram (Mermaid)
├── .env.local.example
└── README.md
```

---

## Design Decisions

**Token-overlap retrieval instead of embeddings**: I chose a simple, zero-dependency term/definition scoring function rather than calling an embeddings API. This avoids extra API cost, works offline, and is fully transparent — you can see exactly why a term was retrieved.

**JSON file over a database**: For a demo project, file-based persistence is correct. It's portable, inspectable, and zero-setup. A real production system would use a vector DB and a proper embedding model.

**Async extraction**: Term extraction runs after Claude responds, so it never blocks the chat. The glossary builds in the background. This keeps UX fast.

**Confidence threshold of 0.5**: Terms without both a definition and a field classification don't make it into the persistent store. This prevents the RAG context from being polluted with low-quality entries.

**Parallel extraction with independent stores**: Both extraction modes run concurrently via `Promise.all` on every turn. Results land in separate React state arrays (`terminologyTerms`, `decisionTerms`), so one mode's failure never corrupts the other's data, and switching the view tab costs zero additional API calls.

---

## Testing Summary

The test harness (`scripts/test-harness.mjs`) covers 33 test cases across six categories:
- Confidence scoring: verified against known inputs (4 tests)
- Term validation: field-level issue detection (4 tests)
- RAG retrieval: relevance ranking and edge cases (4 tests)
- Grounding check: coverage measurement (4 tests)
- Decision extraction: confidence, validation, retrieval, grounding (4 tests)
- Parallel extraction: store independence, failure isolation, mode-agnostic scoring (4 tests)
- Sample conversations: end-to-end simulation across 3 domains (9 tests)

All 33 tests pass. The system correctly:
- Flags terms missing definitions, quotes, or field classifications
- Retrieves relevant glossary entries by keyword overlap
- Scores AI responses as strong/moderate/weak/ungrounded
- Rejects glossary poisoning from low-quality extractions
- Keeps terminology and decision stores independent under parallel extraction

---

## Demo Walkthrough

*Loom link: [add after recording]*

The demo shows:
1. Normal chat exchange about a domain topic
2. Terms appearing in the glossary panel with confidence scores
3. A follow-up question triggering RAG retrieval
4. The retrieved context block and grounding badge below the AI response
5. A response that fails the grounding check (weak/ungrounded badge)
6. The test harness running and printing results

---

## Reflection
This project taught me that good AI systems are less about model output quality and more about system reliability. A strong interface is not enough if users cannot inspect what was retrieved, why an answer was generated, or whether the response was grounded in actual context. I learned that trust comes from visibility: confidence scoring, validation, and grounding checks mattered more than making the UI look impressive. The biggest lesson was that AI products are often systems problems, not prompt problems. Designing what the model is allowed to trust was more important than trying to make the model sound smarter.

## Stack

- **Next.js 14** App Router + TypeScript
- **Anthropic SDK** (`@anthropic-ai/sdk`) — Claude Haiku 4.5
- **CSS Modules** — no external UI library
- **Node.js `fs`** — glossary persistence (zero external DB dependency)
