import { useState } from 'react'

/** Round up to a clean axis maximum whose half is a whole number (1, 2, 4, 6, 8, 10, 20, 50…). */
function niceMax(value: number): number {
  if (value <= 2) return Math.max(1, value)
  if (value <= 10) return value + (value % 2)
  const pow = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 5, 10]) if (step * pow >= value) return step * pow
  return 10 * pow
}

function TableToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <div className="table-toggle">
      <button className="link-btn subtle" onClick={onToggle} aria-expanded={shown}>
        {shown ? 'Hide table' : 'Show as table'}
      </button>
    </div>
  )
}

export interface BarDatum {
  key: string
  label: string
  value: number
}

/** Horizontal bars, one hue (magnitude only), value at each bar's tip. */
export function BarChart({ data, unit, caption }: { data: BarDatum[]; unit: string; caption: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(...data.map((d) => d.value), 1)
  const total = data.reduce((sum, d) => sum + d.value, 0)
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="visually-hidden">{caption}</figcaption>
      <div className="bars" role="list">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="bar-row"
            role="listitem"
            aria-label={`${d.label}: ${d.value} ${unit}`}
            onMouseEnter={() => setHover(d.key)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              <span
                className="bar"
                style={{ width: `${(d.value / max) * 85}%`, '--i': i } as React.CSSProperties}
              />
              <span className="bar-value">{d.value}</span>
            </span>
            {hover === d.key && (
              <span className="tooltip" role="tooltip">
                {d.label}: {d.value} {unit} · {Math.round((d.value / total) * 100)}% of all
              </span>
            )}
          </div>
        ))}
      </div>
      <TableToggle shown={table} onToggle={() => setTable((t) => !t)} />
      {table && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">{unit[0].toUpperCase() + unit.slice(1)}</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td className="num">{d.value}</td>
                <td className="num">{Math.round((d.value / total) * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}

export interface ColumnDatum {
  key: string
  axisLabel: string
  fullLabel: string
  value: number
  note?: string
}

/** Vertical columns over time from a single baseline, with recessive gridlines. */
export function ColumnChart({ data, unit, caption }: { data: ColumnDatum[]; unit: string; caption: string }) {
  const [hover, setHover] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const max = niceMax(Math.max(...data.map((d) => d.value), 0))
  const ticks = max <= 2 ? [max] : [max / 2, max]
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="visually-hidden">{caption}</figcaption>
      <div className="chart-body">
        <div className="columns">
          {ticks.map((t) => (
            <div key={t} className="gridline" style={{ bottom: `${(t / max) * 100}%` }} aria-hidden="true">
              <span>{t}</span>
            </div>
          ))}
          {data.map((d, i) => (
            <div
              key={d.key}
              className="col-slot"
              aria-label={`${d.fullLabel}: ${d.value} ${unit}`}
              role="img"
              onMouseEnter={() => setHover(d.key)}
              onMouseLeave={() => setHover(null)}
            >
              {d.value > 0 && (
                <div
                  className="col"
                  style={{ height: `${(d.value / max) * 100}%`, '--i': i } as React.CSSProperties}
                />
              )}
              {hover === d.key && (
                <span className="tooltip" role="tooltip">
                  <strong>{d.fullLabel}</strong>
                  <br />
                  {d.value} {unit}
                  {d.note ? ` · ${d.note}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="col-axis" aria-hidden="true">
          {data.map((d) => (
            <span key={d.key}>{d.axisLabel}</span>
          ))}
        </div>
      </div>
      <TableToggle shown={table} onToggle={() => setTable((t) => !t)} />
      {table && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th className="num">{unit[0].toUpperCase() + unit.slice(1)}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.fullLabel}</td>
                <td className="num">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </figure>
  )
}
