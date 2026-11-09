import { useEffect, useMemo, useRef, useState } from 'react'
import { api, type Entry, type FlaggedSentence, type Mistake } from '../api'
import { EntryText } from '../components/EntryText'
import {
  AlertIcon,
  CheckIcon,
  LightbulbIcon,
  PenIcon,
  RefreshIcon,
  SparkIcon,
} from '../components/Icons'
import { MistakeCard } from '../components/MistakeCard'
import {
  SECONDS_PER_SENTENCE,
  WRITING_PROMPTS,
  countSentences,
  countWords,
  plural,
} from '../lib'

interface Props {
  entries: Entry[]
  labels: Record<string, string>
  onChecked: (entry: Entry) => void
  onDecide: (mistake: Mistake, accepted: boolean) => Promise<void>
  onOpenInsights: () => void
}

const DRAFT_KEY = 'mistake-journal:draft'

function loadDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveDraft(text: string) {
  try {
    if (text) localStorage.setItem(DRAFT_KEY, text)
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable: the draft just isn't remembered */
  }
}

export function WriteView({ entries, labels, onChecked, onDecide, onOpenInsights }: Props) {
  const [text, setText] = useState(loadDraft)
  const [promptIndex, setPromptIndex] = useState(() => new Date().getDate() % WRITING_PROMPTS.length)
  const [checking, setChecking] = useState(false)
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultId, setResultId] = useState<number | null>(null)
  const [flagged, setFlagged] = useState<FlaggedSentence[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [mode, setMode] = useState<'original' | 'corrected'>('original')
  const cardRefs = useRef(new Map<number, HTMLLIElement>())
  const resultRef = useRef<HTMLElement>(null)

  useEffect(() => saveDraft(text), [text])

  const loggedCount = entries.reduce((n, e) => n + e.mistakes.filter((m) => m.accepted).length, 0)
  const words = countWords(text)
  const sentences = countSentences(text)
  const estimate = Math.max(1, Math.round(sentences * SECONDS_PER_SENTENCE))

  // Tick while checking so the progress estimate moves.
  useEffect(() => {
    if (!checking) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [checking])

  // The result is read from the shared entries list, so decisions made anywhere show here.
  const result = useMemo(() => entries.find((e) => e.id === resultId) ?? null, [entries, resultId])
  const pending = result?.mistakes.filter((m) => m.accepted === null) ?? []
  const accepted = result?.mistakes.filter((m) => m.accepted) ?? []
  const allDecided = !!result && result.mistakes.length > 0 && pending.length === 0

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!text.trim() || checking) return
    setChecking(true)
    setStartedAt(Date.now())
    setNow(Date.now())
    setError(null)
    try {
      const checked = await api.checkEntry(text)
      onChecked(checked.entry)
      setResultId(checked.entry.id)
      setFlagged(checked.flagged)
      setMode('original')
      setText('')
      requestAnimationFrame(() =>
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  function select(id: number) {
    setActiveId(id)
    cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  async function acceptAll() {
    for (const m of pending) await onDecide(m, true)
  }

  const elapsed = (now - startedAt) / 1000
  const progress = checking ? Math.min(elapsed / estimate, 0.95) : 0
  const left = Math.max(0, Math.ceil(estimate - elapsed))

  const counts = new Map<string, number>()
  for (const m of accepted) counts.set(m.category, (counts.get(m.category) ?? 0) + 1)
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

  return (
    <div className="view">
      <header className="page-head">
        <h1>What's on your mind today?</h1>
        <p className="muted">Write a few sentences in English. You'll see every mistake explained, and you decide which ones to log.</p>
      </header>

      <div className="write-grid">
        <form className="card editor" onSubmit={submit}>
          <div className="prompt-chip">
            <LightbulbIcon />
            <span>
              <strong>Need an idea?</strong> {WRITING_PROMPTS[promptIndex]}
            </span>
            <button
              type="button"
              className="link-btn"
              onClick={() => setPromptIndex((i) => (i + 1) % WRITING_PROMPTS.length)}
              aria-label="Show another writing prompt"
            >
              <RefreshIcon size={16} />
            </button>
          </div>
          <label htmlFor="entry" className="visually-hidden">
            Today's entry
          </label>
          <textarea
            id="entry"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Yesterday I go to the park with my friends…"
            disabled={checking}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
            }}
          />
          <div className="editor-foot">
            <span className="subtle">
              {plural(words, 'word')} · {plural(sentences, 'sentence')}
              {sentences > 0 && !checking && ` · about ${estimate}s to check`}
            </span>
            <button type="submit" className="btn btn-primary" disabled={checking || !text.trim()}>
              <SparkIcon size={16} />
              {checking ? 'Checking…' : 'Check my writing'}
            </button>
          </div>
          {checking && (
            <div className="progress" role="status" aria-live="polite">
              <div className="progress-track">
                <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} />
              </div>
              <div className="progress-label">
                <span>Checking each sentence carefully…</span>
                <span>{left > 0 ? `about ${left}s left` : 'almost done'}</span>
              </div>
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}
        </form>

        <aside className="card side-card">
          <h3>How it works</h3>
          <ul className="tips">
            <li>
              <PenIcon size={16} /> Write naturally. Short, simple sentences are fine.
            </li>
            <li>
              <CheckIcon size={16} /> Accept the corrections you agree with. Only those are logged.
            </li>
            <li>
              <SparkIcon size={16} /> Your insights show which mistakes you make most.
            </li>
          </ul>
          <div className="mini-stats" style={{ marginTop: 18 }}>
            <div className="mini-stat">
              <strong>{entries.length}</strong>
              <span className="subtle">{entries.length === 1 ? 'entry' : 'entries'}</span>
            </div>
            <div className="mini-stat">
              <strong>{loggedCount}</strong>
              <span className="subtle">{loggedCount === 1 ? 'mistake' : 'mistakes'} logged</span>
            </div>
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>
            Tip: press <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>Enter</kbd> to check.
          </p>
        </aside>
      </div>

      {result && (
        <section ref={resultRef} className="stack" style={{ marginTop: 28 }} aria-labelledby="results-title">
          <div className="card">
            <div className="card-head">
              <div>
                <h2 id="results-title">Your entry</h2>
                <p className="subtle" style={{ marginTop: 4 }}>
                  {result.mistakes.length === 0
                    ? 'No mistakes found.'
                    : `${plural(result.mistakes.length, 'correction')} · ${pending.length === 0 ? 'all reviewed' : `${pending.length} to review`}`}
                </p>
              </div>
              {result.mistakes.length > 0 && (
                <div className="seg" role="group" aria-label="Text view">
                  <button aria-pressed={mode === 'original'} onClick={() => setMode('original')}>
                    Highlighted
                  </button>
                  <button aria-pressed={mode === 'corrected'} onClick={() => setMode('corrected')}>
                    With accepted fixes
                  </button>
                </div>
              )}
            </div>
            <EntryText
              text={result.text}
              mistakes={result.mistakes}
              mode={mode}
              activeId={activeId}
              onSelect={select}
            />
            {flagged.length > 0 && (
              <div className="flagged">
                <strong>Some sentences couldn't be checked safely</strong>, so they were left as written:
                <ul>
                  {flagged.map((f) => (
                    <li key={f.sentence}>
                      {f.sentence} <span className="subtle">({f.reasons.join('; ')})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {result.mistakes.length === 0 ? (
            <div className="card empty">
              <div className="empty-icon">
                <CheckIcon size={26} />
              </div>
              <h3>Spotless!</h3>
              <p>No mistakes in this entry. Keep writing to build your streak.</p>
            </div>
          ) : (
            <div className="card">
              <div className="card-head">
                <h2>Corrections</h2>
                {pending.length > 1 && (
                  <button className="btn btn-ghost btn-sm" onClick={acceptAll}>
                    <CheckIcon size={16} /> Accept all {pending.length}
                  </button>
                )}
              </div>
              {allDecided && (
                <div className="done-banner" role="status" style={{ marginBottom: 14 }}>
                  <CheckIcon size={22} />
                  <div>
                    <strong>All reviewed.</strong>{' '}
                    {accepted.length > 0
                      ? `${plural(accepted.length, 'mistake')} logged${topCategory ? `. Most common here: ${labels[topCategory] ?? topCategory}` : ''}.`
                      : 'Nothing logged this time.'}
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={onOpenInsights}>
                    See insights
                  </button>
                </div>
              )}
              <ul className="mistake-list">
                {result.mistakes.map((m, i) => (
                  <MistakeCard
                    key={m.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(m.id, el)
                      else cardRefs.current.delete(m.id)
                    }}
                    mistake={m}
                    label={labels[m.category] ?? m.category}
                    index={i}
                    active={activeId === m.id}
                    onDecide={onDecide}
                    onFocus={() => setActiveId(m.id)}
                  />
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
