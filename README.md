# Mistake Journal

A daily writing journal for English learners. You write a few sentences, get each mistake corrected with a plain-English explanation, and decide which corrections to accept. The app remembers the mistakes you accept, shows which kinds you make most often, and (coming next) builds practice drills from them.

Corrections come from [grammar-agent](https://github.com/msell587/grammar-agent), my LLM grammar checker with guardrails: sentences the model can't correct safely are flagged instead of silently rewritten.

## Status

Early scaffold. Working now:

- Write an entry and get corrections with explanations
- Accept or reject each correction
- Each mistake tagged with a category (verb tense, articles, prepositions…)
- "Your most common mistakes" counts, from accepted corrections only

Next:

1. Entry history and a mistakes-over-time chart
2. Drills generated from your most common mistake type
3. Deploy a live demo

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

The backend uses grammar-agent from a local checkout at `../spelling and grammar checker app` (set in `backend/pyproject.toml`), so changes to both projects can be developed together.

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

## License

MIT
