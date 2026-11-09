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
  return resp.json() as Promise<T>
}

export const api = {
  checkEntry: (text: string) =>
    request<CheckedEntry>('/entries', { method: 'POST', body: JSON.stringify({ text }) }),
  listEntries: () => request<Entry[]>('/entries'),
  decide: (mistakeId: number, accepted: boolean) =>
    request<Mistake>(`/mistakes/${mistakeId}`, {
      method: 'PATCH',
      body: JSON.stringify({ accepted }),
    }),
  stats: () => request<CategoryCount[]>('/stats'),
}
