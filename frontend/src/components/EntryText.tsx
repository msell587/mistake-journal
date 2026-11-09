import type { Mistake } from '../api'
import { segmentText } from '../lib'

interface Props {
  text: string
  mistakes: Mistake[]
  /** "original" marks each mistake; "corrected" shows accepted fixes in place. */
  mode?: 'original' | 'corrected'
  activeId?: number | null
  onSelect?: (id: number) => void
}

/** The entry with every mistake highlighted, or with accepted fixes applied. */
export function EntryText({ text, mistakes, mode = 'original', activeId, onSelect }: Props) {
  const segments = segmentText(text, mistakes)
  return (
    <p className="entry-text">
      {segments.map((seg, i) => {
        if (seg.kind === 'text') return <span key={i}>{seg.text}</span>
        const m = seg.mistake
        if (mode === 'corrected') {
          return m.accepted ? <ins key={i}>{m.replacement}</ins> : <span key={i}>{seg.text}</span>
        }
        const state = m.accepted === null ? '' : m.accepted ? 'accepted' : 'rejected'
        return (
          <mark
            key={i}
            className={`${state} ${activeId === m.id ? 'active' : ''}`}
            title={`${m.original_span} → ${m.replacement}`}
            tabIndex={onSelect ? 0 : undefined}
            role={onSelect ? 'button' : undefined}
            onClick={() => onSelect?.(m.id)}
            onKeyDown={(e) => {
              if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                onSelect(m.id)
              }
            }}
          >
            {seg.text}
          </mark>
        )
      })}
    </p>
  )
}
