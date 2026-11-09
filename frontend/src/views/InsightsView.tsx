import type { CategoryCount, Entry } from '../api'
import { BarChart, ColumnChart } from '../components/Charts'
import { BookIcon, ChartIcon, FlameIcon, PenIcon, TargetIcon, TextIcon } from '../components/Icons'
import { countWords, dayStreak, lastNDays, plural } from '../lib'

interface Props {
  entries: Entry[]
  stats: CategoryCount[]
  onWrite: () => void
}

export function InsightsView({ entries, stats, onWrite }: Props) {
  const words = entries.reduce((n, e) => n + countWords(e.text), 0)
  const logged = stats.reduce((n, s) => n + s.count, 0)
  const streak = dayStreak(entries)
  const perHundred = words ? (logged / words) * 100 : 0
  const days = lastNDays(entries, 14)
  const top = stats[0]

  const tiles = [
    { label: 'Entries', value: entries.length.toLocaleString(), note: 'journal entries written', icon: <BookIcon size={15} /> },
    { label: 'Words written', value: words.toLocaleString(), note: 'across all entries', icon: <TextIcon size={15} /> },
    {
      label: 'Mistakes logged',
      value: logged.toLocaleString(),
      note: words ? `${perHundred.toFixed(1)} per 100 words` : 'accepted corrections',
      icon: <TargetIcon size={15} />,
    },
    { label: 'Day streak', value: streak.toLocaleString(), note: streak ? 'days in a row' : 'write today to start one', icon: <FlameIcon size={15} /> },
  ]

  return (
    <div className="view">
      <header className="page-head">
        <h1>Your insights</h1>
        <p className="muted">Patterns from the corrections you accepted. The more you write, the clearer they get.</p>
      </header>

      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card tile">
            <div className="tile-label">
              {t.icon}
              {t.label}
            </div>
            <div className="tile-value">{t.value}</div>
            <div className="tile-note">{t.note}</div>
          </div>
        ))}
      </div>

      {logged === 0 ? (
        <div className="card empty" style={{ marginTop: 18 }}>
          <div className="empty-icon">
            <ChartIcon size={26} />
          </div>
          <h3>No patterns yet</h3>
          <p>Write an entry and accept a few corrections. Your most common mistakes will appear here.</p>
          <button className="btn btn-primary" onClick={onWrite}>
            <PenIcon size={16} /> Start writing
          </button>
        </div>
      ) : (
        <>
          {top && (
            <div className="callout">
              <TargetIcon />
              <div>
                <strong>Focus area: {top.label}.</strong>{' '}
                {plural(top.count, 'mistake')} so far, {Math.round((top.count / logged) * 100)}% of everything you've
                logged. Keep an eye on it in your next entry.
              </div>
            </div>
          )}
          <div className="insight-grid">
            <section className="card" aria-labelledby="by-category">
              <div className="card-head">
                <h2 id="by-category">Mistakes by type</h2>
                <span className="subtle">all time</span>
              </div>
              <BarChart
                data={stats.map((s) => ({ key: s.category, label: s.label, value: s.count }))}
                unit="mistakes"
                caption="Accepted mistakes per category, most frequent first"
              />
            </section>
            <section className="card" aria-labelledby="over-time">
              <div className="card-head">
                <h2 id="over-time">Last 14 days</h2>
                <span className="subtle">mistakes logged per day</span>
              </div>
              <ColumnChart
                data={days.map((d) => ({
                  key: d.day,
                  axisLabel: d.date.getDate() % 2 === 0 ? String(d.date.getDate()) : '',
                  fullLabel: d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                  value: d.mistakes,
                  note: plural(d.entries, 'entry', 'entries'),
                }))}
                unit="mistakes"
                caption="Accepted mistakes per day over the last 14 days"
              />
            </section>
          </div>
        </>
      )}
    </div>
  )
}
