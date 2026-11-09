# Mistake Journal

A daily writing journal for English learners. You write a few sentences, get each mistake corrected with a plain-English explanation, and decide which corrections to accept. The app remembers the mistakes you accept, shows which kinds you make most often, and writes short practice quizzes from them.

Corrections come from [grammar-agent](https://github.com/msell587/grammar-agent), my LLM grammar checker with guardrails: sentences the model can't correct safely are flagged instead of silently rewritten.

## Features

- **Write:** a daily writing prompt, live word and sentence counts, a progress estimate while the entry is checked, and your draft is kept if you close the tab.
- **Review:** your entry with every mistake highlighted. Click a highlight to jump to its correction, accept or reject each one (or all at once), and flip to a view with your accepted fixes applied.
- **Correct sentence:** every correction shows what you wrote next to the whole sentence with its fixes applied.
- **Try again:** if the AI service is busy and a sentence can't be checked, one click rechecks just that sentence.
- **Practice:** five-question multiple-choice quizzes on your most common mistake type (or any type you pick), written by the AI from your own mistakes. Each answer is graded with an explanation and the correct sentence, and past sessions keep their scores. Every exercise is validated before it is shown: one blank, 3–4 distinct options, exactly one correct.
- **Categories:** each mistake is tagged (verb tense, articles, prepositions, subject-verb agreement…). Only accepted corrections are counted.
- **History:** every past entry, filterable by mistake type, with its corrections. Entries can be deleted.
- **Insights:** entries, words written, mistakes per 100 words, your day streak, a "focus area", mistakes by type, and mistakes per day over the last 14 days. Charts have hover details and a table view.
- Light and dark mode, works on a phone, keyboard accessible, and respects reduced-motion settings.

## Next

1. Deploy a live demo

## Stack

| Part | Tech |
|---|---|
| Backend | Python 3.12, FastAPI, SQLModel + SQLite |
| Checking | grammar-agent (Gemini free tier, Groq, Ollama, or an offline mock) |
| Frontend | React 19 + TypeScript, Vite |

```
backend/   FastAPI app (src/mistake_journal) and tests
frontend/  React app; the dev server proxies /api to the backend on :8000
```

## Run it locally

You need Python 3.11+, [uv](https://docs.astral.sh/uv/) and Node 20+.

### Backend

The backend installs grammar-agent from GitHub. To change both projects together, point it at a local checkout instead (see the comment in `backend/pyproject.toml`).

```bash
cd backend && uv sync && cp .env.example .env
```

Edit `backend/.env`: paste a free Gemini key, or switch to the offline `mock` provider to try the app without one.

```bash
uv run uvicorn mistake_journal.main:app --reload --env-file .env
```

API docs are at http://localhost:8000/docs.

### Frontend

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173.

## Tests

```bash
cd backend && uv run pytest
```

The tests use grammar-agent's mock provider, so they need no API key or network.

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/entries` | Check a new entry and store its corrections |
| `GET` | `/api/entries` | List entries, newest first |
| `PATCH` | `/api/mistakes/{id}` | Accept or reject a correction |
| `GET` | `/api/stats` | Accepted mistakes per category |
| `GET` | `/api/categories` | The fixed category list |
| `POST` | `/api/entries/{id}/recheck` | Recheck sentences that couldn't be checked |
| `POST` | `/api/drills` | Generate a practice set (default: most common mistake type) |
| `GET` | `/api/drills` | Past practice sets with scores |
| `GET` | `/api/drills/{id}` | One practice set |
| `POST` | `/api/exercises/{id}/answer` | Grade an answer and reveal the explanation |

## License

MIT
