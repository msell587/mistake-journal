import type { Entry, Mistake } from './api'

/** Seconds grammar-agent waits between model calls on the free tier (GRAMMAR_AGENT_REQUEST_DELAY). */
export const SECONDS_PER_SENTENCE = 6.5

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function countSentences(text: string): number {
  const parts = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
  return parts.length
}

export function localDay(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Consecutive days with at least one entry, ending today (or yesterday, if today is still open). */
export function dayStreak(entries: Entry[], now = new Date()): number {
  const days = new Set(entries.map((e) => localDay(new Date(e.created_at))))
  const cursor = new Date(now)
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (days.has(localDay(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface DayBucket {
  day: string
  date: Date
  mistakes: number
  entries: number
}

/** Accepted mistakes per day for the last `n` days, oldest first. */
export function lastNDays(entries: Entry[], n: number, now = new Date()): DayBucket[] {
  const buckets: DayBucket[] = []
  const index = new Map<string, DayBucket>()
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const bucket = { day: localDay(date), date, mistakes: 0, entries: 0 }
    buckets.push(bucket)
    index.set(bucket.day, bucket)
  }
  for (const entry of entries) {
    const bucket = index.get(localDay(new Date(entry.created_at)))
    if (!bucket) continue
    bucket.entries += 1
    bucket.mistakes += entry.mistakes.filter((m) => m.accepted).length
  }
  return buckets
}

/** Where a mistake sits in the entry text. Older rows have no stored offset, so search for it. */
export function locate(text: string, mistake: Mistake): number | null {
  if (mistake.start != null && text.startsWith(mistake.original_span, mistake.start)) {
    return mistake.start
  }
  const sentenceAt = text.indexOf(mistake.sentence)
  if (sentenceAt === -1) return null
  const inSentence = mistake.sentence.indexOf(mistake.original_span)
  return inSentence === -1 ? null : sentenceAt + inSentence
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'mistake'; text: string; mistake: Mistake }

/** Split the entry into plain text and mistake spans (non-overlapping, in order). */
export function segmentText(text: string, mistakes: Mistake[]): Segment[] {
  const placed = mistakes
    .map((m) => ({ m, at: locate(text, m) }))
    .filter((p): p is { m: Mistake; at: number } => p.at !== null)
    .sort((a, b) => a.at - b.at)
  const segments: Segment[] = []
  let cursor = 0
  for (const { m, at } of placed) {
    if (at < cursor) continue // overlapping span; skip rather than garble the text
    if (at > cursor) segments.push({ kind: 'text', text: text.slice(cursor, at) })
    segments.push({ kind: 'mistake', text: m.original_span, mistake: m })
    cursor = at + m.original_span.length
  }
  if (cursor < text.length) segments.push({ kind: 'text', text: text.slice(cursor) })
  return segments
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleDateString(undefined, opts)
}

export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : many}`
}

export const WRITING_PROMPTS = [
  'Describe your morning routine. What did you do first today?',
  'Write about a meal you enjoyed recently. Where were you, and who were you with?',
  'What is something new you learned this week?',
  'Describe a place you would like to visit and explain why.',
  'Tell the story of a small problem you solved recently.',
  'What are your plans for the weekend?',
  'Describe a person who has influenced you.',
  'What did you do yesterday evening?',
  'Write about a book, film or series you like. What happens in it?',
  'If you could change one thing about your city, what would it be?',
]
