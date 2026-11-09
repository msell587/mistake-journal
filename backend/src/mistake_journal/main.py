"""HTTP API for the mistake journal."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from grammar_agent.config import ConfigError
from grammar_agent.llm import LLMError
from grammar_agent.models import Status
from sqlalchemy import func
from sqlmodel import Session, col, select

from mistake_journal.categories import CATEGORIES, categorize, label
from mistake_journal.checking import CheckFn, get_check_fn
from mistake_journal.db import create_db, get_session
from mistake_journal.models import (
    CategoryCount,
    CheckedEntry,
    DecisionIn,
    Entry,
    EntryCreate,
    EntryRead,
    FlaggedSentence,
    Mistake,
    MistakeRead,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_db()
    yield


app = FastAPI(title="Mistake Journal", version="0.1.0", lifespan=lifespan)

SessionDep = Annotated[Session, Depends(get_session)]
CheckDep = Annotated[CheckFn, Depends(get_check_fn)]


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/categories")
def categories() -> dict[str, str]:
    return CATEGORIES


@app.post("/api/entries", response_model=CheckedEntry, status_code=201)
def create_entry(body: EntryCreate, session: SessionDep, check: CheckDep) -> CheckedEntry:
    """Check a new entry with grammar-agent and store every proposed correction."""
    try:
        results = check(body.text)
    except (ConfigError, LLMError) as exc:
        raise HTTPException(status_code=502, detail=f"Checking failed: {exc}") from exc

    entry = Entry(text=body.text)
    flagged: list[FlaggedSentence] = []
    for result in results:
        if result.status is Status.NEEDS_REVIEW:
            flagged.append(
                FlaggedSentence(sentence=result.sentence.text, reasons=result.review_reasons)
            )
            continue
        for change in result.changes:
            entry.mistakes.append(
                Mistake(
                    sentence=result.sentence.text,
                    original_span=change.original_span,
                    replacement=change.replacement,
                    explanation=change.explanation,
                    change_type=change.type,
                    category=categorize(change.type),
                )
            )
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return CheckedEntry(
        entry=EntryRead.model_validate(entry, from_attributes=True), flagged=flagged
    )


@app.get("/api/entries", response_model=list[EntryRead])
def list_entries(session: SessionDep) -> list[Entry]:
    return list(session.exec(select(Entry).order_by(col(Entry.created_at).desc())))


@app.patch("/api/mistakes/{mistake_id}", response_model=MistakeRead)
def decide(mistake_id: int, body: DecisionIn, session: SessionDep) -> Mistake:
    """Record whether the learner accepts a correction. Only accepted ones count in stats."""
    mistake = session.get(Mistake, mistake_id)
    if mistake is None:
        raise HTTPException(status_code=404, detail="Mistake not found")
    mistake.accepted = body.accepted
    session.add(mistake)
    session.commit()
    session.refresh(mistake)
    return mistake


@app.get("/api/stats", response_model=list[CategoryCount])
def stats(session: SessionDep) -> list[CategoryCount]:
    """Accepted mistakes per category, most frequent first."""
    rows = session.exec(
        select(Mistake.category, func.count())
        .where(Mistake.accepted == True)  # noqa: E712 (SQL expression)
        .group_by(Mistake.category)
        .order_by(func.count().desc())
    ).all()
    return [CategoryCount(category=c, label=label(c), count=n) for c, n in rows]
