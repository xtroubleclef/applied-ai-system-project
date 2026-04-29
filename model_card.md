# Model Card — Lemma

## Model Details

| Field | Value |
|-------|-------|
| Model used | `claude-haiku-4-5-20251001` |
| Provider | Anthropic |
| Task 1 | Conversational assistant (chat) |
| Task 2 | Structured terminology extraction |
| Input | Natural language conversation text |
| Output | Chat: free-form text. Extract: JSON array of terms |
| Context window | 200K tokens |

---

## System Roles

### Chat route
```
System: You are a helpful, knowledgeable assistant. You have access to a live glossary
built from this conversation. Ground your answers in these terms when relevant.

[Relevant glossary context from this conversation:]
[1] backpropagation (machine learning): An algorithm for computing gradients...
[2] gradient descent (machine learning): An optimization algorithm...
```

The system prompt is constructed dynamically. If no glossary context is retrieved, Claude receives a simple assistant prompt with no RAG injection.

### Extract route — Terminology mode
```
System: You are a terminology extraction system. Return structured JSON only.
No preamble, no markdown fences.

User: Extract all domain-specific terms... Return a JSON array with: term, field,
definition (1-2 sentences), quote (exact phrase under 15 words).
```

### Extract route — Decision Memory mode
```
System: You are a decision extraction system. Return structured JSON only.
No preamble, no markdown fences.

User: Extract all decisions, rationales, and rejected alternatives...
      { term, field, definition, quote, alternatives_rejected[] }
```

---

## Intended Use

Lemma is designed for:
- Students and researchers reviewing new domain material
- Technical practitioners building a personal vocabulary in an unfamiliar field
- Instructors generating glossaries from recorded discussion material
- Anyone who wants to turn exploratory conversations into structured reference documents

- Technical leads and product managers capturing architectural and product decisions from meetings and design reviews

**Not intended for**: Medical diagnosis, legal advice, safety-critical decision support, or any context where incorrect term definitions could cause harm.

---

## Capabilities and Limitations

### What works well
- Extraction is reliable for clearly domain-specific terminology in technical fields (ML, software, linguistics, chemistry, etc.)
- RAG grounding visibly improves answer consistency across a long conversation
- Confidence scoring reliably flags incomplete extractions (missing quote or definition)

### Known limitations
- **Term conflation**: Claude may define the same concept differently across two exchanges and fail to deduplicate
- **Hallucinated quotes**: Extraction occasionally produces a plausible-sounding quote that doesn't appear verbatim in the conversation. The source quote field is informative, not a verified citation
- **Retrieval misses for paraphrases**: The token-overlap retriever scores exact keyword matches; semantic rephrasing is not detected. ("learning rate" won't retrieve "step size")
- **Decision extraction language dependency**: Decision extraction works best on structured discussions with explicit decision language ("we decided", "we chose", "we rejected"). Implicit decisions or decisions made by omission are not reliably captured.
- **Context window effects**: Extraction quality decreases on very long conversations (>50 exchanges) as earlier turns receive less attention
- **Language limitation**: English only — the extraction prompt and retriever are tuned for English text

---

## Reliability Mechanisms

| Mechanism | Implementation |
|-----------|---------------|
| Input validation | `/api/chat` rejects requests without a messages array; `/api/check` validates term structure |
| Confidence scoring | `computeConfidence()` in `src/lib/grounding.ts` — scores 0–1 based on field, definition, and quote presence |
| Quality gate | Terms with confidence < 0.5 are shown in the UI but not persisted to the glossary |
| Grounding checker | `checkGrounding()` measures what fraction of retrieved terms appear in Claude's response |
| Grounding badge | UI shows strong/moderate/weak/ungrounded label on every RAG-assisted response |
| Issue flags | UI shows specific validation issues (e.g., "missing source quote") on expanded term cards |
| Structured JSON output | Extraction route uses explicit JSON-only system prompt; parses and catches malformed output |
| Logging | All routes log key metrics: terms extracted, grounding score, API errors |
| Error surfacing | API failures return structured `{ error: string }` responses surfaced in the chat UI |

---

## Evaluation

The test harness (`scripts/test-harness.mjs`) covers:
- **Confidence scoring**: 4 unit tests with known expected values
- **Term validation**: 4 tests for specific field-level issue detection
- **RAG retrieval**: 4 tests including edge cases (empty glossary, irrelevant query)
- **Grounding check**: 4 tests covering strong, moderate, weak, and ungrounded cases
- **End-to-end simulation**: 6 tests across 3 sample conversation domains

All 22 tests pass on the current implementation.

### Grounding score observations
In informal testing with the 3 sample conversations:
- ML conversation: grounding score 0.85–1.0 on follow-up questions
- Architecture conversation: grounding score 0.70–0.90
- Linguistics conversation: grounding score 0.60–0.85 (lower because linguistic terms have synonyms that the overlap scorer doesn't catch)

---

## AI Collaboration Reflection

### How AI was used in development
Claude Code (claude-sonnet-4-6) was used throughout development for:
- Designing the three-layer architecture (retriever, confidence scorer, grounding checker) and working through tradeoffs
- Writing the CSS module styles and TypeScript types
- Debugging a subtle issue with Next.js API routes and `fs` module (resolved by ensuring file I/O only runs server-side)
- Reviewing the test harness for edge case coverage

### Helpful AI suggestion
When I described the retrieval approach, the AI suggested using token-overlap scoring rather than a full embeddings call. The reasoning was sound: for a glossary built from the same conversation Claude is having, vocabulary overlap is a strong signal and costs nothing. This became the core retriever design.

### Flawed AI suggestion
The AI initially suggested using `process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY` to expose the key to the client, which would be a serious security vulnerability (leaking credentials to the browser). This was caught and corrected: the key stays in `process.env.ANTHROPIC_API_KEY`, only accessible server-side in API routes.

### What this taught me about AI system design
Adding RAG and a grounding checker changed how I think about AI reliability. A confidence score of 0.9 on the extracted term still doesn't mean the response *used* that term correctly — grounding must be measured separately from extraction quality. These are two different failure modes. The most useful insight from building this: visibility into what context the model received is as important as the model's output itself.

---

## Ethical Considerations

- **Attribution**: Lemma surfaces source quotes alongside definitions. Users should treat these as conversational references, not verified citations
- **Data retention**: Glossary data is stored locally in `data/glossary.json` and never sent to any third party other than Anthropic for generation. The `clear` button gives users full control
- **Scope**: This is a personal knowledge tool, not a publishing or knowledge-base system. The intended output is private reference material
- **Bias**: Claude's definitions reflect its training data. Highly specialized or emerging terminology may be defined through a mainstream lens that misses domain-specific nuance
