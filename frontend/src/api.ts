// Typed client for the FastAPI backend (see backend/src/mistake_journal/main.py).

export interface Mistake {
  id: number
  sentence: string
  original_span: string
  replacement: string
  explanation: string
  change_type: string
  category: string
  accepted: boolean | null
  /** Character offset of original_span in the entry text (null for older entries). */
  start: number | null
}

export interface Entry {
  id: number
  text: string
  created_at: string
  mistakes: Mistake[]
}

export interface FlaggedSentence {
  sentence: string
  reasons: string[]
}

export interface CheckedEntry {
  entry: Entry
  flagged: FlaggedSentence[]
}

export interface CategoryCount {
  category: string
  label: string
  count: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    const body = await resp.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${resp.status})`)
  }
  if (resp.status === 204) return null as T
  return resp.json() as Promise<T>
}

export const api = {
  checkEntry: (text: string) =>
    request<CheckedEntry>('/entries', { method: 'POST', body: JSON.stringify({ text }) }),
  listEntries: () => request<Entry[]>('/entries'),
  deleteEntry: (entryId: number) => request<null>(`/entries/${entryId}`, { method: 'DELETE' }),
  decide: (mistakeId: number, accepted: boolean) =>
    request<Mistake>(`/mistakes/${mistakeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ accepted }),
    }),
  stats: () => request<CategoryCount[]>('/stats'),
  categories: () => request<Record<string, string>>('/categories'),
  recheck: (entryId: number, sentences: string[]) =>
    request<CheckedEntry>(`/entries/${entryId}/recheck`, {
      method: 'POST',
      body: JSON.stringify({ sentences }),
    }),
  createDrill: (category?: string) =>
    request<DrillSet>('/drills', { method: 'POST', body: JSON.stringify({ category: category ?? null }) }),
  listDrills: () => request<DrillSummary[]>('/drills'),
  getDrill: (drillId: number) => request<DrillSet>(`/drills/${drillId}`),
  answer: (exerciseId: number, choice: string) =>
    request<Exercise>(`/exercises/${exerciseId}/answer`, {
      method: 'POST',
      body: JSON.stringify({ choice }),
    }),
}

export interface Exercise {
  id: number
  position: number
  /** Contains one "___" blank. */
  sentence: string
  options: string[]
  chosen: string | null
  correct: boolean | null
  /** Revealed once answered. */
  answer: string | null
  explanation: string | null
}

export interface DrillSet {
  id: number
  category: string
  label: string
  created_at: string
  exercises: Exercise[]
}

export interface DrillSummary {
  id: number
  category: string
  label: string
  created_at: string
  total: number
  answered: number
  correct: number
}
