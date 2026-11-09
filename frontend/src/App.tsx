import { useCallback, useEffect, useState } from 'react'
import { api, type CategoryCount, type Entry, type Mistake } from './api'
import { BookIcon, ChartIcon, FlameIcon, PenIcon } from './components/Icons'
import { dayStreak, plural } from './lib'
import { HistoryView } from './views/HistoryView'
import { InsightsView } from './views/InsightsView'
import { WriteView } from './views/WriteView'

type Tab = 'write' | 'history' | 'insights'
const TABS: Tab[] = ['write', 'history', 'insights']

function tabFromHash(): Tab {
  const hash = window.location.hash.slice(1)
  return (TABS as string[]).includes(hash) ? (hash as Tab) : 'write'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [entries, setEntries] = useState<Entry[]>([])
  const [stats, setStats] = useState<CategoryCount[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshStats = useCallback(() => api.stats().then(setStats).catch(() => {}), [])

  useEffect(() => {
    Promise.all([api.listEntries(), api.categories(), api.stats()])
      .then(([e, c, s]) => {
        setEntries(e)
        setLabels(c)
        setStats(s)
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
  }, [])

  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  function go(next: Tab) {
    window.location.hash = next
    setTab(next)
    window.scrollTo({ top: 0 })
  }

  const decide = useCallback(
    async (mistake: Mistake, accepted: boolean) => {
      const updated = await api.decide(mistake.id, accepted)
      setEntries((prev) =>
        prev.map((e) => ({ ...e, mistakes: e.mistakes.map((m) => (m.id === updated.id ? updated : m)) })),
      )
      refreshStats()
    },
    [refreshStats],
  )

  async function remove(entry: Entry) {
    await api.deleteEntry(entry.id)
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    refreshStats()
  }

  const streak = dayStreak(entries)
  const toReview = entries.reduce((n, e) => n + e.mistakes.filter((m) => m.accepted === null).length, 0)

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <PenIcon size={18} />
            </span>
            <span className="brand-name">Mistake Journal</span>
          </div>
          {streak > 0 && (
            <span className="streak-pill" title="Days in a row with an entry">
              <FlameIcon size={15} /> {plural(streak, 'day')} streak
            </span>
          )}
          <nav className="tabs" role="tablist" aria-label="Sections">
            <button role="tab" className="tab" aria-selected={tab === 'write'} onClick={() => go('write')}>
              <PenIcon size={16} /> Write
            </button>
            <button role="tab" className="tab" aria-selected={tab === 'history'} onClick={() => go('history')}>
              <BookIcon size={16} /> History
              {toReview > 0 && (
                <span className="count" aria-label={`${toReview} corrections to review`}>
                  {toReview}
                </span>
              )}
            </button>
            <button role="tab" className="tab" aria-selected={tab === 'insights'} onClick={() => go('insights')}>
              <ChartIcon size={16} /> Insights
            </button>
          </nav>
        </div>
      </header>

      <main className="page">
        {loadError && (
          <div className="error-box" role="alert" style={{ marginBottom: 18 }}>
            Couldn't reach the backend ({loadError}). Is it running on port 8000?
          </div>
        )}
        {tab === 'write' && (
          <WriteView
            entries={entries}
            labels={labels}
            onChecked={(entry) => setEntries((prev) => [entry, ...prev])}
            onDecide={decide}
            onOpenInsights={() => go('insights')}
          />
        )}
        {tab === 'history' && (
          <HistoryView
            entries={entries}
            labels={labels}
            onDecide={decide}
            onDelete={remove}
            onWrite={() => go('write')}
          />
        )}
        {tab === 'insights' && <InsightsView entries={entries} stats={stats} onWrite={() => go('write')} />}
      </main>
    </>
  )
}
