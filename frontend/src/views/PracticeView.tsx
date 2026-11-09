import { useCallback, useEffect, useState } from 'react'
import { api, type CategoryCount, type DrillSet, type DrillSummary, type Exercise } from '../api'
import { AlertIcon, ArrowIcon, CheckIcon, PenIcon, RefreshIcon, SparkIcon, TargetIcon, XIcon } from '../components/Icons'
import { formatDate, plural } from '../lib'

interface Props {
  stats: CategoryCount[]
  onWrite: () => void
}

type Phase =
  | { kind: 'home' }
  | { kind: 'generating'; label: string }
  | { kind: 'quiz'; drill: DrillSet; index: number }
  | { kind: 'done'; drill: DrillSet }

function score(drill: DrillSet) {
  const answered = drill.exercises.filter((e) => e.chosen !== null).length
  const correct = drill.exercises.filter((e) => e.correct).length
  return { answered, correct, total: drill.exercises.length }
}

/** The sentence with its blank shown as a slot, filled in once answered. */
function Sentence({ ex }: { ex: Exercise }) {
  const [before, after] = ex.sentence.split('___')
  let slot: React.ReactNode = <span className="blank" aria-label="blank" />
  if (ex.chosen !== null) {
    slot = ex.correct ? (
      <span className="blank filled good">{ex.answer}</span>
    ) : (
      <span className="blank filled">
        <del>{ex.chosen}</del> <ins>{ex.answer}</ins>
      </span>
    )
  }
  return (
    <p className="quiz-sentence">
      {before}
      {slot}
      {after}
    </p>
  )
}

function ScoreRing({ correct, total }: { correct: number; total: number }) {
  const r = 34
  const c = 2 * Math.PI * r
  const share = total ? correct / total : 0
  return (
    <svg width="96" height="96" viewBox="0 0 84 84" className="score-ring" role="img" aria-label={`${correct} of ${total} correct`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
      {/* A zero-length arc with round caps would still draw a dot, so skip it at 0. */}
      {correct > 0 && <circle
        cx="42"
        cy="42"
        r={r}
        fill="none"
        stroke="var(--good)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`}
        transform="rotate(-90 42 42)"
        className="ring-arc"
      />}
      <text x="42" y="47" textAnchor="middle" className="ring-text">
        {correct}/{total}
      </text>
    </svg>
  )
}

export function PracticeView({ stats, onWrite }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'home' })
  const [history, setHistory] = useState<DrillSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const refreshHistory = useCallback(() => api.listDrills().then(setHistory).catch(() => {}), [])
  useEffect(() => {
    refreshHistory()
  }, [refreshHistory])

  async function start(category: string, label: string) {
    setError(null)
    setPhase({ kind: 'generating', label })
    try {
      const drill = await api.createDrill(category)
      setPhase({ kind: 'quiz', drill, index: 0 })
      refreshHistory()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase({ kind: 'home' })
    }
  }

  async function resume(id: number) {
    setError(null)
    try {
      const drill = await api.getDrill(id)
      const next = drill.exercises.findIndex((e) => e.chosen === null)
      setPhase(next === -1 ? { kind: 'done', drill } : { kind: 'quiz', drill, index: next })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const choose = useCallback(
    async (drill: DrillSet, index: number, choice: string) => {
      const ex = drill.exercises[index]
      if (ex.chosen !== null || submitting) return
      setSubmitting(true)
      try {
        const graded = await api.answer(ex.id, choice)
        const updated = { ...drill, exercises: drill.exercises.map((e) => (e.id === graded.id ? graded : e)) }
        setPhase({ kind: 'quiz', drill: updated, index })
        refreshHistory()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setSubmitting(false)
      }
    },
    [submitting, refreshHistory],
  )

  function next(drill: DrillSet, index: number) {
    if (index + 1 < drill.exercises.length) setPhase({ kind: 'quiz', drill, index: index + 1 })
    else setPhase({ kind: 'done', drill })
  }

  // Keyboard: 1–4 picks an option, Enter moves on once answered.
  useEffect(() => {
    if (phase.kind !== 'quiz') return
    const { drill, index } = phase
    const ex = drill.exercises[index]
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select')) return
      const n = Number(e.key)
      if (ex.chosen === null && n >= 1 && n <= ex.options.length) void choose(drill, index, ex.options[n - 1])
      else if (ex.chosen !== null && e.key === 'Enter') {
        e.preventDefault()
        next(drill, index)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, choose])

  const totalAnswered = history.reduce((n, d) => n + d.answered, 0)
  const totalCorrect = history.reduce((n, d) => n + d.correct, 0)
  const accuracy = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : null

  // ---------- Generating ----------
  if (phase.kind === 'generating') {
    return (
      <div className="view">
        <div className="card quiz-card generating" role="status" aria-live="polite">
          <div className="empty-icon">
            <SparkIcon size={24} className="spin-slow" />
          </div>
          <h2>Writing exercises about {phase.label.toLowerCase()}…</h2>
          <p className="muted">They're based on your own mistakes. This usually takes 10–20 seconds.</p>
          <div className="skeleton-lines" aria-hidden="true">
            <div className="skeleton" style={{ width: '82%' }} />
            <div className="skeleton" style={{ width: '64%' }} />
            <div className="skeleton-row">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Quiz ----------
  if (phase.kind === 'quiz') {
    const { drill, index } = phase
    const ex = drill.exercises[index]
    const answered = ex.chosen !== null
    return (
      <div className="view">
        <div className="quiz-top">
          <button className="link-btn" onClick={() => setPhase({ kind: 'home' })}>
            ← Back to practice
          </button>
          <span className="chip">
            <span className="chip-dot" aria-hidden="true" />
            {drill.label}
          </span>
        </div>
        <div className="card quiz-card">
          <div className="quiz-progress">
            <span className="subtle">
              Question {index + 1} of {drill.exercises.length}
            </span>
            <span className="dots" aria-hidden="true">
              {drill.exercises.map((e, i) => (
                <span
                  key={e.id}
                  className={`dot ${e.correct === true ? 'good' : e.correct === false ? 'bad' : ''} ${i === index ? 'current' : ''}`}
                />
              ))}
            </span>
          </div>
          <div key={ex.id} className="quiz-body">
            <Sentence ex={ex} />
            <div className="options" role="group" aria-label="Answer options">
              {ex.options.map((option, i) => {
                let state = ''
                if (answered) {
                  if (option === ex.answer) state = 'correct'
                  else if (option === ex.chosen) state = 'wrong'
                  else state = 'dim'
                }
                return (
                  <button
                    key={option}
                    className={`option ${state}`}
                    onClick={() => void choose(drill, index, option)}
                    disabled={answered || submitting}
                    aria-pressed={ex.chosen === option}
                  >
                    <span className="key" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="option-text">{option}</span>
                    {state === 'correct' && <CheckIcon size={18} />}
                    {state === 'wrong' && <XIcon size={18} />}
                  </button>
                )
              })}
            </div>
            {answered && (
              <div className={`feedback ${ex.correct ? 'good' : 'bad'}`} role="status">
                <div className="feedback-title">
                  {ex.correct ? <CheckIcon size={18} /> : <XIcon size={18} />}
                  <strong>{ex.correct ? 'Correct!' : `Not quite. The answer is “${ex.answer}”.`}</strong>
                </div>
                <p className="feedback-sentence">
                  <span className="sentence-tag">Correct sentence</span>
                  <span>
                    {ex.sentence.split('___')[0]}
                    <ins>{ex.answer}</ins>
                    {ex.sentence.split('___')[1]}
                  </span>
                </p>
                <p>{ex.explanation}</p>
              </div>
            )}
          </div>
          {error && (
            <div className="error-box" role="alert">
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}
          <div className="quiz-foot">
            <span className="subtle">{answered ? 'Press Enter to continue' : 'Pick an answer, or press 1–' + ex.options.length}</span>
            <button className="btn btn-primary" onClick={() => next(drill, index)} disabled={!answered}>
              {index + 1 < drill.exercises.length ? 'Next question' : 'See results'} <ArrowIcon size={16} />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ---------- Done ----------
  if (phase.kind === 'done') {
    const { drill } = phase
    const s = score(drill)
    const perfect = s.correct === s.total
    const missed = drill.exercises.filter((e) => e.correct === false)
    return (
      <div className="view">
        <div className="card quiz-card done">
          <ScoreRing correct={s.correct} total={s.total} />
          <h2>{perfect ? 'Perfect score!' : s.correct >= s.total / 2 ? 'Nice work!' : 'Good practice!'}</h2>
          <p className="muted">
            {perfect
              ? `You got every ${drill.label.toLowerCase()} question right.`
              : `${s.correct} of ${s.total} right on ${drill.label.toLowerCase()}. Review the ones you missed below.`}
          </p>
          <div className="done-actions">
            <button className="btn btn-primary" onClick={() => start(drill.category, drill.label)}>
              <RefreshIcon size={16} /> Practise again
            </button>
            <button className="btn btn-ghost" onClick={() => setPhase({ kind: 'home' })}>
              Back to practice
            </button>
          </div>
        </div>
        {missed.length > 0 && (
          <div className="card" style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 12 }}>Review</h3>
            <ul className="review-list">
              {missed.map((e) => (
                <li key={e.id}>
                  <Sentence ex={e} />
                  <p className="subtle">{e.explanation}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ---------- Home ----------
  const [top, ...others] = stats
  return (
    <div className="view">
      <header className="page-head">
        <h1>Practice</h1>
        <p className="muted">Short quizzes written from your own mistakes. Five questions, about two minutes.</p>
      </header>

      {error && (
        <div className="error-box" role="alert" style={{ marginBottom: 18 }}>
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {!top ? (
        <div className="card empty">
          <div className="empty-icon">
            <TargetIcon size={26} />
          </div>
          <h3>Nothing to practise yet</h3>
          <p>Write an entry and accept a few corrections. Then you'll get quizzes on the mistakes you make most.</p>
          <button className="btn btn-primary" onClick={onWrite}>
            <PenIcon size={16} /> Start writing
          </button>
        </div>
      ) : (
        <>
          <section className="card hero-practice">
            <div>
              <span className="eyebrow">Recommended for you</span>
              <h2>{top.label}</h2>
              <p className="muted">
                Your most common mistake: {plural(top.count, 'time')} so far. A quick quiz helps it stick.
              </p>
            </div>
            <button className="btn btn-primary btn-lg" onClick={() => start(top.category, top.label)}>
              <SparkIcon size={18} /> Start practice
            </button>
          </section>

          {others.length > 0 && (
            <section style={{ marginTop: 24 }}>
              <h3 style={{ marginBottom: 12 }}>Or practise another type</h3>
              <div className="cat-grid">
                {others.map((s, i) => (
                  <button
                    key={s.category}
                    className="card cat-card"
                    style={{ '--i': i } as React.CSSProperties}
                    onClick={() => start(s.category, s.label)}
                  >
                    <span className="cat-name">{s.label}</span>
                    <span className="subtle">{plural(s.count, 'mistake')} logged</span>
                    <ArrowIcon size={16} className="cat-arrow" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {history.length > 0 && (
        <section className="card" style={{ marginTop: 24 }}>
          <div className="card-head">
            <h2>Your sessions</h2>
            <span className="subtle">
              {plural(totalAnswered, 'question')} answered{accuracy !== null && ` · ${accuracy}% correct`}
            </span>
          </div>
          <ul className="session-list">
            {history.slice(0, 8).map((d) => {
              const finished = d.answered === d.total
              return (
                <li key={d.id}>
                  <div className="session-main">
                    <strong>{d.label}</strong>
                    <span className="subtle">{formatDate(d.created_at, { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div className="session-score" aria-label={`${d.correct} of ${d.total} correct`}>
                    <span className="meter">
                      <span style={{ width: `${(d.correct / Math.max(d.total, 1)) * 100}%` }} />
                    </span>
                    <span className="subtle">
                      {d.correct}/{d.total}
                    </span>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => resume(d.id)}>
                    {finished ? 'Review' : 'Continue'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
