'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import styles from './page.module.css'

type ExtractionMode = 'terminology' | 'decision'
type PanelTab = 'cards' | 'file'
type FileFormat = 'md' | 'json'

interface Message {
  role: 'user' | 'assistant'
  content: string
  retrievedTerms?: RetrievedTerm[]
  grounding?: {
    score: number
    label: 'strong' | 'moderate' | 'weak' | 'ungrounded'
    passed: boolean
    termsMentioned: string[]
    termsMissed: string[]
  }
}

interface Term {
  term: string
  field: string
  definition: string
  quote: string
  confidence?: number
  validation?: { issues: string[] }
  alternatives_rejected?: string[]
  mode?: ExtractionMode
}

interface RetrievedTerm {
  id: string
  term: string
  field: string
  definition: string
  quote: string
  confidence: number
  relevanceScore: number
}

function buildMarkdown(terms: Term[], docName: string, mode: ExtractionMode): string {
  if (!terms.length) return ''
  const grouped: Record<string, Term[]> = {}
  for (const t of terms) {
    const key = t.field || 'general'
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(t)
  }
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  let md = `# ${docName}\n\n*Generated ${date}*\n\n`
  for (const [field, ft] of Object.entries(grouped)) {
    md += `## ${field.charAt(0).toUpperCase() + field.slice(1)}\n\n`
    for (const t of ft) {
      md += `### ${t.term}\n${t.definition}\n\n`
      if (t.quote) md += `> *"${t.quote}"*\n\n`
      if (t.confidence !== undefined) md += `*Confidence: ${Math.round(t.confidence * 100)}%*\n\n`
      if (mode === 'decision' && t.alternatives_rejected?.length) {
        md += `**Rejected alternatives:** ${t.alternatives_rejected.join(', ')}\n\n`
      }
    }
  }
  return md
}

function buildJSON(terms: Term[]): string {
  const clean = terms.map(({ validation, ...rest }) => rest)
  return JSON.stringify(clean, null, 2)
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  // Separate terms and loading state per extraction mode
  const [terminologyTerms, setTerminologyTerms] = useState<Term[]>([])
  const [decisionTerms, setDecisionTerms] = useState<Term[]>([])
  const [extractingTerminology, setExtractingTerminology] = useState(false)
  const [extractingDecision, setExtractingDecision] = useState(false)

  // View state — switching modes never clears data or triggers extraction
  const [activeView, setActiveView] = useState<ExtractionMode>('terminology')
  const [selectedField, setSelectedField] = useState<string>('all')
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null)
  const [terminologyDocName, setTerminologyDocName] = useState('lemma-glossary')
  const [decisionDocName, setDecisionDocName] = useState('lemma-decisions')
  const [panelTab, setPanelTab] = useState<PanelTab>('cards')
  const [fileFormat, setFileFormat] = useState<FileFormat>('md')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Derived values for the currently active view
  const activeTerms = activeView === 'terminology' ? terminologyTerms : decisionTerms
  const activeDocName = activeView === 'terminology' ? terminologyDocName : decisionDocName

  const glossaryCount = useMemo(
    () => [...terminologyTerms, ...decisionTerms].filter((t) => (t.confidence ?? 0) >= 0.5).length,
    [terminologyTerms, decisionTerms]
  )

  const mdPreview = useMemo(
    () => buildMarkdown(activeTerms, activeDocName || (activeView === 'terminology' ? 'lemma-glossary' : 'lemma-decisions'), activeView),
    [activeTerms, activeDocName, activeView]
  )
  const jsonPreview = useMemo(() => buildJSON(activeTerms), [activeTerms])

  // Run both extractions in parallel after every chat exchange.
  // Each mode's loading and error state is independent — one failure doesn't affect the other.
  const extractBoth = useCallback(async (conversation: Message[]) => {
    if (conversation.length < 2) return

    setExtractingTerminology(true)
    setExtractingDecision(true)

    const extractOne = async (mode: ExtractionMode): Promise<Term[]> => {
      try {
        const res = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation: conversation.map((m) => ({ role: m.role, content: m.content })),
            mode,
          }),
        })
        const data = await res.json()
        console.log(`[extract:${mode}] received`, data.terms?.length ?? 0, 'terms')
        return data.terms ?? []
      } catch (err) {
        console.error(`[extract:${mode}] failed:`, err)
        return []
      } finally {
        if (mode === 'terminology') setExtractingTerminology(false)
        else setExtractingDecision(false)
      }
    }

    // Both calls are issued simultaneously; neither waits for the other
    const [termResult, decResult] = await Promise.all([
      extractOne('terminology'),
      extractOne('decision'),
    ])

    if (termResult.length > 0) {
      setTerminologyTerms((prev) => {
        const existing = new Set(prev.map((t) => t.term.toLowerCase().trim()))
        const incoming = termResult.filter((t) => t.term && !existing.has(t.term.toLowerCase().trim()))
        console.log('[extract:terminology] adding', incoming.length, 'new terms (prev:', prev.length, ')')
        return [...prev, ...incoming]
      })
    }

    if (decResult.length > 0) {
      setDecisionTerms((prev) => {
        const existing = new Set(prev.map((t) => t.term.toLowerCase().trim()))
        const incoming = decResult.filter((t) => t.term && !existing.has(t.term.toLowerCase().trim()))
        console.log('[extract:decision] adding', incoming.length, 'new entries (prev:', prev.length, ')')
        return [...prev, ...incoming]
      })
    }
  }, [])

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'API error')
      }
      const data = await res.json()
      const assistantMsg: Message = {
        role: 'assistant',
        content: data.text,
        retrievedTerms: data.retrieved_terms ?? [],
        grounding: data.grounding,
      }
      const finalMessages = [...newMessages, assistantMsg]
      setMessages(finalMessages)
      extractBoth(finalMessages)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${msg} Please try again.` },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const handleDownload = (format: FileFormat) => {
    if (!activeTerms.length) return
    const name = (activeDocName.trim() || 'lemma').replace(/[^a-z0-9_-]/gi, '-')
    if (format === 'md') downloadBlob(mdPreview, `${name}.md`, 'text/markdown')
    else downloadBlob(jsonPreview, `${name}.json`, 'application/json')
  }

  const clearGlossary = async () => {
    await fetch('/api/glossary', { method: 'DELETE' })
    setTerminologyTerms([])
    setDecisionTerms([])
    setPanelTab('cards')
  }

  // View switch: no extraction triggered, no data cleared
  const handleViewSwitch = (mode: ExtractionMode) => {
    setActiveView(mode)
    setSelectedField('all')
    setExpandedTerm(null)
  }

  const fields = ['all', ...Array.from(new Set(activeTerms.map((t) => t.field).filter(Boolean))).sort()]
  const filteredTerms = selectedField === 'all' ? activeTerms : activeTerms.filter((t) => t.field === selectedField)

  const groundingColor = (label?: string) => {
    if (label === 'strong') return styles.groundingStrong
    if (label === 'moderate') return styles.groundingModerate
    if (label === 'weak') return styles.groundingWeak
    if (label === 'ungrounded') return styles.groundingUngrounded
    return ''
  }

  const confidenceClass = (conf?: number) => {
    if (conf === undefined) return ''
    if (conf >= 0.7) return styles.confidenceHigh
    if (conf >= 0.4) return styles.confidenceMid
    return styles.confidenceLow
  }

  const panelTitle = activeView === 'decision' ? 'Decision Log' : 'Glossary'
  const emptyMessage = activeView === 'decision'
    ? 'Decisions will appear here as you discuss options and trade-offs.'
    : 'Terms will appear here as you converse.'
  const tabLabel = activeView === 'decision' ? 'Decisions' : 'Terms'

  const anyExtractingActive = extractingTerminology || extractingDecision

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.logo}>Lemma</h1>
          <span className={styles.logoSub}>terminology + decision memory · RAG</span>
        </div>
        <div className={styles.headerRight}>
          {glossaryCount > 0 && (
            <span className={styles.termCount}>
              {glossaryCount} stored {glossaryCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {/* ── Chat panel ── */}
        <main className={styles.chatPanel}>
          <div className={styles.messages}>
            {messages.length === 0 && (
              <div className={styles.empty}>
                <p className={styles.emptyTitle}>Start a conversation.</p>
                <p className={styles.emptySubtitle}>
                  Lemma extracts domain terms and decisions in parallel as you chat —
                  switch between Terminology and Decision Memory views at any time without losing either log.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.message} ${msg.role === 'user' ? styles.messageUser : styles.messageAssistant}`}
              >
                <div className={styles.messageBubble}>{msg.content}</div>
                {msg.role === 'assistant' && msg.retrievedTerms && msg.retrievedTerms.length > 0 && (
                  <div className={styles.ragContext}>
                    <div className={styles.ragHeader}>
                      <span className={styles.ragLabel}>retrieved context</span>
                      {msg.grounding && (
                        <span className={`${styles.groundingBadge} ${groundingColor(msg.grounding.label)}`}>
                          {msg.grounding.label} · {Math.round(msg.grounding.score * 100)}%
                        </span>
                      )}
                    </div>
                    {msg.retrievedTerms.map((t, j) => (
                      <div key={j} className={styles.ragTerm}>
                        <span className={styles.ragTermName}>{t.term}</span>
                        <span className={styles.ragTermField}>{t.field}</span>
                        <span className={styles.ragTermScore}>{Math.round(t.relevanceScore * 100)}%</span>
                      </div>
                    ))}
                    {msg.grounding && msg.grounding.termsMissed.length > 0 && (
                      <div className={styles.ragMissed}>not referenced: {msg.grounding.termsMissed.join(', ')}</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className={`${styles.message} ${styles.messageAssistant}`}>
                <div className={`${styles.messageBubble} ${styles.thinking}`}>
                  <span className={styles.dot} /><span className={styles.dot} /><span className={styles.dot} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputArea}>
            {/* Mode toggle — switches the right-panel view only, no extraction restart */}
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${activeView === 'terminology' ? styles.modeBtnActive : ''}`}
                onClick={() => handleViewSwitch('terminology')}
              >
                Terminology
                {terminologyTerms.length > 0 && (
                  <span className={styles.modeBadge}>{terminologyTerms.length}</span>
                )}
              </button>
              <button
                className={`${styles.modeBtn} ${activeView === 'decision' ? styles.modeBtnActive : ''}`}
                onClick={() => handleViewSwitch('decision')}
              >
                Decision Memory
                {decisionTerms.length > 0 && (
                  <span className={styles.modeBadge}>{decisionTerms.length}</span>
                )}
              </button>
            </div>

            {/* Per-mode extraction indicators */}
            {anyExtractingActive && (
              <div className={styles.extractingRow}>
                {extractingTerminology && (
                  <span className={styles.extractingBadge}>extracting terms…</span>
                )}
                {extractingDecision && (
                  <span className={styles.extractingBadge}>logging decisions…</span>
                )}
              </div>
            )}

            <div className={styles.inputRow}>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={input}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything…"
                rows={1}
                disabled={loading}
              />
              <button className={styles.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8L2 2L5.5 8L2 14L14 8Z" fill="currentColor" />
                </svg>
              </button>
            </div>
            <p className={styles.hint}>Enter to send · Shift+Enter for newline</p>
          </div>
        </main>

        {/* ── Glossary / Decision Log panel ── */}
        <aside className={styles.glossaryPanel}>
          <div className={styles.glossaryHeader}>
            <span className={styles.glossaryTitle}>{panelTitle}</span>
          </div>

          {/* Filename + export buttons — operate on the active view's terms */}
          <div className={styles.exportRow}>
            <input
              className={styles.docNameInput}
              value={activeDocName}
              onChange={(e) => {
                if (activeView === 'terminology') setTerminologyDocName(e.target.value)
                else setDecisionDocName(e.target.value)
              }}
              placeholder="document name"
              spellCheck={false}
            />
            <div className={styles.glossaryActions}>
              <button
                className={styles.exportBtn}
                onClick={() => handleDownload('md')}
                disabled={!activeTerms.length}
                title="Download as Markdown"
              >
                .md
              </button>
              <button
                className={styles.exportBtn}
                onClick={() => handleDownload('json')}
                disabled={!activeTerms.length}
                title="Download as JSON"
              >
                .json
              </button>
              <button
                className={`${styles.exportBtn} ${styles.clearBtn}`}
                onClick={clearGlossary}
                disabled={!terminologyTerms.length && !decisionTerms.length}
              >
                clear
              </button>
            </div>
          </div>

          {/* 2 tabs: cards | file */}
          <div className={styles.viewTabs}>
            <button
              className={`${styles.viewTab} ${panelTab === 'cards' ? styles.viewTabActive : ''}`}
              onClick={() => setPanelTab('cards')}
            >
              {tabLabel}
            </button>
            <button
              className={`${styles.viewTab} ${panelTab === 'file' ? styles.viewTabActive : ''}`}
              onClick={() => setPanelTab('file')}
            >
              File
            </button>
          </div>

          {/* ── Cards tab ── */}
          {panelTab === 'cards' && (
            <div className={styles.cardsContainer}>
              {fields.length > 1 && (
                <div className={styles.fieldTabs}>
                  {fields.map((f) => (
                    <button
                      key={f}
                      className={`${styles.fieldTab} ${selectedField === f ? styles.fieldTabActive : ''}`}
                      onClick={() => setSelectedField(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
              <div className={styles.termsList}>
                {filteredTerms.length === 0 ? (
                  <div className={styles.glossaryEmpty}>{emptyMessage}</div>
                ) : (
                  filteredTerms.map((t, i) => (
                    <div
                      key={`${t.term}-${i}`}
                      className={`${styles.termCard} ${expandedTerm === t.term ? styles.termCardExpanded : ''}`}
                      onClick={() => setExpandedTerm(expandedTerm === t.term ? null : t.term)}
                    >
                      <div className={styles.termHeader}>
                        <span className={styles.termName}>{t.term}</span>
                        <div className={styles.termMeta}>
                          <span className={styles.termField}>{t.field}</span>
                          {t.confidence !== undefined && (
                            <span className={`${styles.confidence} ${confidenceClass(t.confidence)}`}>
                              {Math.round(t.confidence * 100)}%
                            </span>
                          )}
                        </div>
                      </div>
                      {expandedTerm === t.term && (
                        <div className={styles.termBody}>
                          <p className={styles.termDefinition}>{t.definition}</p>
                          {t.quote && <blockquote className={styles.termQuote}>"{t.quote}"</blockquote>}
                          {t.alternatives_rejected && t.alternatives_rejected.length > 0 && (
                            <div className={styles.alternatives}>
                              <span className={styles.alternativesLabel}>Rejected alternatives:</span>
                              <div className={styles.alternativesList}>
                                {t.alternatives_rejected.map((alt, j) => (
                                  <span key={j} className={styles.alternativeTag}>{alt}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {t.validation?.issues && t.validation.issues.length > 0 && (
                            <div className={styles.termIssues}>
                              {t.validation.issues.map((issue, j) => (
                                <span key={j} className={styles.termIssue}>{issue}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* ── File tab ── */}
          {panelTab === 'file' && (
            <div className={styles.fileTabContainer}>
              <div className={styles.fileFormatToggle}>
                <button
                  className={`${styles.fileFormatBtn} ${fileFormat === 'md' ? styles.fileFormatBtnActive : ''}`}
                  onClick={() => setFileFormat('md')}
                >
                  .md
                </button>
                <button
                  className={`${styles.fileFormatBtn} ${fileFormat === 'json' ? styles.fileFormatBtnActive : ''}`}
                  onClick={() => setFileFormat('json')}
                >
                  .json
                </button>
              </div>
              <div className={styles.previewPane}>
                {activeTerms.length === 0 ? (
                  <div className={styles.glossaryEmpty}>{emptyMessage}</div>
                ) : (
                  <pre className={styles.previewContent}>
                    {fileFormat === 'md' ? mdPreview : jsonPreview}
                  </pre>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
