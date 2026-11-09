import { useState } from 'react'
import type { Entry, Mistake } from '../api'
import { EntryText } from '../components/EntryText'
import { BookIcon, ChevronIcon, PenIcon, TrashIcon } from '../components/Icons'
import { MistakeCard } from '../components/MistakeCard'
import { correctedSentence, countWords, formatDate, plural } from '../lib'

interface Props {
  entries: Entry[]
  labels: Record<string, string>
  onDecide: (mistake: Mistake, accepted: boolean) => Promise<void>
  onDelete: (entry: Entry) => Promise<void>
  onWrite: () => void
}

export function HistoryView({ entries, labels, onDecide, onDelete, onWrite }: Props) {
  // undefined = the user hasn't chosen yet, so show the newest entry open.
  const [chosenId, setOpenId] = useState<number | null | undefined>(undefined)
  const openId = chosenId === undefined ? (entries[0]?.id ?? null) : chosenId
  const [category, setCategory] = useState('all')

  const usedCategories = [...new Set(entries.flatMap((e) => e.mistakes.map((m) => m.category)))]
  const shown =
    category === 'all' ? entries : entries.filter((e) => e.mistakes.some((m) => m.category === category))

  if (entries.length === 0) {
    return (
      <div className="view">
        <header className="page-head">
          <h1>Your journal</h1>
        </header>
        <div className="card empty">
          <div className="empty-icon">
            <BookIcon size={26} />
          </div>
          <h3>No entries yet</h3>
          <p>Your past entries and their corrections will be collected here.</p>
          <button className="btn btn-primary" onClick={onWrite}>
            <PenIcon size={16} /> Write your first entry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="view">
      <header className="page-head">
        <h1>Your journal</h1>
        <p className="muted">
          {plural(entries.length, 'entry', 'entries')}, newest first. Open one to review its corrections again.
        </p>
      </header>

      <div className="history-tools">
        <div className="filter-row">
          <label className="visually-hidden" htmlFor="cat-filter">
            Filter by mistake type
          </label>
          <select id="cat-filter" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All mistake types</option>
            {usedCategories.map((c) => (
              <option key={c} value={c}>
                {labels[c] ?? c}
              </option>
            ))}
          </select>
        </div>
        <span className="subtle">{plural(shown.length, 'entry', 'entries')} shown</span>
      </div>

      <div className="history-list">
        {shown.map((entry, i) => {
          const open = openId === entry.id
          const pending = entry.mistakes.filter((m) => m.accepted === null).length
          const byCat = new Map<string, number>()
          for (const m of entry.mistakes) byCat.set(m.category, (byCat.get(m.category) ?? 0) + 1)
          return (
            <article
              key={entry.id}
              className={`card history-item ${open ? 'open' : ''}`}
              style={{ '--i': i } as React.CSSProperties}
            >
              <button
                className="history-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : entry.id)}
              >
                <span className="date-badge" aria-hidden="true">
                  <div className="mon">{formatDate(entry.created_at, { month: 'short' })}</div>
                  <div className="day">{formatDate(entry.created_at, { day: 'numeric' })}</div>
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="history-excerpt">{entry.text}</span>
                  <span className="history-meta">
                    <span className="chip">{plural(countWords(entry.text), 'word')}</span>
                    <span className="chip">
                      <span className="chip-dot" aria-hidden="true" />
                      {plural(entry.mistakes.length, 'correction')}
                    </span>
                    {pending > 0 && <span className="chip">{pending} to review</span>}
                    {[...byCat.entries()].slice(0, 3).map(([c, n]) => (
                      <span key={c} className="chip">
                        {labels[c] ?? c} ×{n}
                      </span>
                    ))}
                  </span>
                </span>
                <ChevronIcon className="chevron" />
              </button>
              {open && (
                <div className="history-body">
                  <p className="subtle" style={{ marginTop: 14 }}>
                    {formatDate(entry.created_at, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <EntryText text={entry.text} mistakes={entry.mistakes} />
                  {entry.mistakes.length > 0 && (
                    <ul className="mistake-list">
                      {entry.mistakes.map((m, j) => (
                        <MistakeCard
                          key={m.id}
                          mistake={m}
                          label={labels[m.category] ?? m.category}
                    corrected={correctedSentence(m.sentence, entry.mistakes)}
                          index={j}
                          onDecide={onDecide}
                        />
                      ))}
                    </ul>
                  )}
                  <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        if (window.confirm('Delete this entry and its logged mistakes? This cannot be undone.')) {
                          void onDelete(entry)
                        }
                      }}
                    >
                      <TrashIcon size={15} /> Delete entry
                    </button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}
