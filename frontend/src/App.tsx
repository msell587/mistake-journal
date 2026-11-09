import { useEffect, useState } from 'react'
import { api, type CategoryCount, type CheckedEntry, type Mistake } from './api'

export default function App() {
  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckedEntry | null>(null)
  const [stats, setStats] = useState<CategoryCount[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})

  const refreshStats = () => api.stats().then(setStats).catch(() => {})
  useEffect(() => {
    refreshStats()
    api.categories().then(setLabels).catch(() => {})
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setChecking(true)
    setError(null)
    try {
      setResult(await api.checkEntry(text))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setChecking(false)
    }
  }

  async function decide(mistake: Mistake, accepted: boolean) {
    try {
      const updated = await api.decide(mistake.id, accepted)
      setResult((prev) =>
        prev && {
          ...prev,
          entry: {
            ...prev.entry,
            mistakes: prev.entry.mistakes.map((m) => (m.id === updated.id ? updated : m)),
          },
        },
      )
      refreshStats()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <main className="page">
      <header>
        <h1>Mistake Journal</h1>
        <p className="muted">Write a few sentences in English. Learn from your own mistakes.</p>
      </header>

      <form onSubmit={submit} className="card">
        <label htmlFor="entry">Today's entry</label>
        <textarea
          id="entry"
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Yesterday I go to the park with my friends…"
        />
        <button type="submit" disabled={checking || !text.trim()}>
          {checking ? 'Checking…' : 'Check my writing'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && (
        <section className="card">
          <h2>Corrections</h2>
          {result.entry.mistakes.length === 0 && <p>No mistakes found. Nice work!</p>}
          <ul className="mistakes">
            {result.entry.mistakes.map((m) => (
              <li key={m.id} className={m.accepted === null ? '' : m.accepted ? 'accepted' : 'rejected'}>
                <p className="sentence">{m.sentence}</p>
                <p>
                  <del>{m.original_span}</del> → <ins>{m.replacement}</ins>{' '}
                  <span className="tag">{labels[m.category] ?? m.category}</span>
                </p>
                <p className="muted">{m.explanation}</p>
                <div className="actions">
                  <button onClick={() => decide(m, true)} disabled={m.accepted === true}>
                    Accept
                  </button>
                  <button
                    className="secondary"
                    onClick={() => decide(m, false)}
                    disabled={m.accepted === false}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {result.flagged.length > 0 && (
            <>
              <h3>Couldn't check safely</h3>
              <ul>
                {result.flagged.map((f) => (
                  <li key={f.sentence}>
                    {f.sentence} <span className="muted">({f.reasons.join('; ')})</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="card">
        <h2>Your most common mistakes</h2>
        {stats.length === 0 ? (
          <p className="muted">Accept some corrections to see your patterns here.</p>
        ) : (
          <ol>
            {stats.map((s) => (
              <li key={s.category}>
                {s.label}: <strong>{s.count}</strong>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  )
}
