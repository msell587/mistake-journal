# One image that serves the API and the built React app (used for the live demo).

# --- Build the frontend ------------------------------------------------------------------
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Python app ----------------------------------------------------------------------------
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.16 /uv /usr/local/bin/uv

# git is needed to install grammar-agent from GitHub.
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first, so code changes don't reinstall them.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/ ./
RUN uv sync --frozen --no-dev

COPY --from=web /web/dist /app/frontend/dist

# Demo defaults: offline sample corrections, a private journal per browser, and a
# throwaway database. Override these to run with a real provider.
ENV PATH="/app/backend/.venv/bin:$PATH" \
    MISTAKE_JOURNAL_DEMO=1 \
    MISTAKE_JOURNAL_FRONTEND=/app/frontend/dist \
    MISTAKE_JOURNAL_DB=sqlite:////tmp/mistake_journal.db \
    GRAMMAR_AGENT_PROVIDER=mock \
    GRAMMAR_AGENT_MOCK_SCRIPT=/app/backend/demo/demo_replies.json \
    GRAMMAR_AGENT_REQUEST_DELAY=0 \
    GRAMMAR_AGENT_CACHE=/tmp/grammar-agent-cache.sqlite

RUN useradd --create-home app
USER app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn mistake_journal.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
