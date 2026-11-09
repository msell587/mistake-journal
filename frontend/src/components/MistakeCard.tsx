import { forwardRef } from 'react'
import type { Mistake } from '../api'
import type { SentencePart } from '../lib'
import { ArrowIcon, CheckIcon, XIcon } from './Icons'

interface Props {
  mistake: Mistake
  label: string
  index: number
  /** The whole sentence with its fixes applied (see lib.correctedSentence). */
  corrected: SentencePart[]
  active?: boolean
  onDecide: (mistake: Mistake, accepted: boolean) => void
  onFocus?: () => void
}

export const MistakeCard = forwardRef<HTMLLIElement, Props>(function MistakeCard(
  { mistake: m, label, index, corrected, active, onDecide, onFocus },
  ref,
) {
  const state = m.accepted === null ? '' : m.accepted ? 'accepted' : 'rejected'
  return (
    <li
      ref={ref}
      className={`mistake ${state} ${active ? 'active' : ''}`}
      style={{ '--i': index } as React.CSSProperties}
      onMouseEnter={onFocus}
    >
      <div className="mistake-top">
        <span className="fix">
          <del>{m.original_span}</del>
          <ArrowIcon size={16} />
          <ins>{m.replacement}</ins>
        </span>
        <span className="chip">
          <span className="chip-dot" aria-hidden="true" />
          {label}
        </span>
      </div>
      <p className="explanation">{m.explanation}</p>
      <div className="sentences">
        <p>
          <span className="sentence-tag">You wrote</span>
          <span className="sentence-text">{m.sentence}</span>
        </p>
        <p className="corrected-line">
          <span className="sentence-tag">Correct sentence</span>
          <span className="sentence-text">
            {corrected.map((part, i) =>
              part.fixId === m.id ? (
                <ins key={i}>{part.text}</ins>
              ) : (
                <span key={i}>{part.text}</span>
              ),
            )}
          </span>
        </p>
      </div>
      <div className="mistake-actions">
        <button
          className="btn btn-ghost btn-sm btn-accept"
          aria-pressed={m.accepted === true}
          onClick={() => onDecide(m, true)}
        >
          <CheckIcon size={16} /> Accept
        </button>
        <button
          className="btn btn-ghost btn-sm btn-reject"
          aria-pressed={m.accepted === false}
          onClick={() => onDecide(m, false)}
        >
          <XIcon size={16} /> Reject
        </button>
        {m.accepted !== null && (
          <span className={`decision-label ${m.accepted ? 'good' : 'subtle'}`}>
            {m.accepted ? (
              <>
                <CheckIcon size={14} /> Logged to your insights
              </>
            ) : (
              'Not counted'
            )}
          </span>
        )}
      </div>
    </li>
  )
})
