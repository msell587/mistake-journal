"""HTTP API for the mistake journal."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from grammar_agent.config import ConfigError
from grammar_agent.llm import LLMError
from grammar_agent.models import SentenceResult, Status
from sqlalchemy import func
from sqlmodel import Session, col, select

from mistake_journal.categories import CATEGORIES, categorize, label
from mistake_journal.checking import CheckFn, get_check_fn
from mistake_journal.db import create_db, get_session
from mistake_journal.drills import DrillError, DrillExample, DrillFn, get_drill_fn
from mistake_journal.models import (
    AnswerIn,
    CategoryCount,
    CheckedEntry,
    DecisionIn,
    DrillCreate,
    DrillSet,
    DrillSetRead,
    DrillSummary,
    Entry,
    EntryCreate,
    EntryRead,
    Exercise,
    ExerciseRead,
    FlaggedSentence,
    Mistake,
    MistakeRead,
    RecheckIn,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_db()
    yield


app = FastAPI(title="Mistake Journal", version="0.1.0", lifespan=lifespan)

SessionDep = Annotated[Session, Depends(get_session)]
CheckDep = Annotated[CheckFn, Depends(get_check_fn)]
DrillDep = Annotated[DrillFn, Depends(get_drill_fn)]


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
    flagged = _store_results(entry, results)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return CheckedEntry(
        entry=EntryRead.model_validate(entry, from_attributes=True), flagged=flagged
    )


def _store_results(
    entry: Entry, results: list[SentenceResult], base: int = 0
) -> list[FlaggedSentence]:
    """Add each proposed change to ``entry``; return the sentences that could not be checked.

    ``base`` is where the checked text starts inside the entry (non-zero for a recheck).
    """
    existing = {(m.start, m.original_span) for m in entry.mistakes}
    flagged: list[FlaggedSentence] = []
    for result in results:
        if result.status is Status.NEEDS_REVIEW:
            flagged.append(
                FlaggedSentence(sentence=result.sentence.text, reasons=result.review_reasons)
            )
            continue
        for change in result.changes:
            start = base + result.sentence.start + change.offset
            if (start, change.original_span) in existing:
                continue
            entry.mistakes.append(
                Mistake(
                    sentence=result.sentence.text,
                    original_span=change.original_span,
                    replacement=change.replacement,
                    explanation=change.explanation,
                    change_type=change.type,
                    category=categorize(change.category),
                    start=start,
                )
            )
    return flagged


@app.post("/api/entries/{entry_id}/recheck", response_model=CheckedEntry)
def recheck(entry_id: int, body: RecheckIn, session: SessionDep, check: CheckDep) -> CheckedEntry:
    """Check again only the sentences that could not be checked the first time."""
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    flagged: list[FlaggedSentence] = []
    for sentence in dict.fromkeys(body.sentences):  # de-duplicate, keep order
        base = entry.text.find(sentence)
        if base == -1:
            flagged.append(FlaggedSentence(sentence=sentence, reasons=["not found in this entry"]))
            continue
        try:
            results = check(sentence)
        except (ConfigError, LLMError) as exc:
            raise HTTPException(status_code=502, detail=f"Checking failed: {exc}") from exc
        flagged += _store_results(entry, results, base)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return CheckedEntry(
        entry=EntryRead.model_validate(entry, from_attributes=True), flagged=flagged
    )


@app.get("/api/entries", response_model=list[EntryRead])
def list_entries(session: SessionDep) -> list[Entry]:
    return list(session.exec(select(Entry).order_by(col(Entry.created_at).desc())))


@app.delete("/api/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: int, session: SessionDep) -> None:
    entry = session.get(Entry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    session.delete(entry)
    session.commit()


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


# --- Practice drills ----------------------------------------------------------------------


def _exercise_read(ex: Exercise) -> ExerciseRead:
    answered = ex.chosen is not None
    return ExerciseRead(
        id=ex.id or 0,
        position=ex.position,
        sentence=ex.sentence,
        options=json.loads(ex.options_json),
        chosen=ex.chosen,
        correct=ex.correct,
        answer=ex.answer if answered else None,
        explanation=ex.explanation if answered else None,
    )


def _drill_read(drill: DrillSet) -> DrillSetRead:
    return DrillSetRead(
        id=drill.id or 0,
        category=drill.category,
        label=label(drill.category),
        created_at=drill.created_at,
        exercises=[_exercise_read(e) for e in drill.exercises],
    )


@app.post("/api/drills", response_model=DrillSetRead, status_code=201)
def create_drill(body: DrillCreate, session: SessionDep, make_drills: DrillDep) -> DrillSetRead:
    """Generate a set of exercises for one mistake type (default: the most common one)."""
    category = body.category
    if category is None:
        top = session.exec(
            select(Mistake.category)
            .where(Mistake.accepted == True)  # noqa: E712 (SQL expression)
            .group_by(Mistake.category)
            .order_by(func.count().desc())
        ).first()
        if top is None:
            raise HTTPException(
                status_code=400,
                detail="Accept a few corrections first, so there is something to practise.",
            )
        category = top
    if category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"Unknown category {category!r}")

    recent = session.exec(
        select(Mistake)
        .where(Mistake.category == category, Mistake.accepted == True)  # noqa: E712
        .order_by(col(Mistake.id).desc())
        .limit(5)
    ).all()
    examples = [DrillExample(m.sentence, m.original_span, m.replacement) for m in recent]
    try:
        generated = make_drills(category, label(category), examples)
    except DrillError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ConfigError, LLMError) as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't create exercises: {exc}") from exc

    drill = DrillSet(category=category)
    for i, ex in enumerate(generated):
        drill.exercises.append(
            Exercise(
                position=i,
                sentence=ex.sentence,
                options_json=json.dumps(list(ex.options)),
                answer=ex.answer,
                explanation=ex.explanation,
            )
        )
    session.add(drill)
    session.commit()
    session.refresh(drill)
    return _drill_read(drill)


@app.get("/api/drills", response_model=list[DrillSummary])
def list_drills(session: SessionDep) -> list[DrillSummary]:
    drills = session.exec(select(DrillSet).order_by(col(DrillSet.created_at).desc())).all()
    return [
        DrillSummary(
            id=d.id or 0,
            category=d.category,
            label=label(d.category),
            created_at=d.created_at,
            total=len(d.exercises),
            answered=sum(e.chosen is not None for e in d.exercises),
            correct=sum(bool(e.correct) for e in d.exercises),
        )
        for d in drills
    ]


@app.get("/api/drills/{drill_id}", response_model=DrillSetRead)
def get_drill(drill_id: int, session: SessionDep) -> DrillSetRead:
    drill = session.get(DrillSet, drill_id)
    if drill is None:
        raise HTTPException(status_code=404, detail="Practice set not found")
    return _drill_read(drill)


@app.post("/api/exercises/{exercise_id}/answer", response_model=ExerciseRead)
def answer_exercise(exercise_id: int, body: AnswerIn, session: SessionDep) -> ExerciseRead:
    """Grade one answer. Each exercise can be answered once."""
    exercise = session.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="Exercise not found")
    if exercise.chosen is not None:
        raise HTTPException(status_code=409, detail="This exercise was already answered")
    if body.choice not in json.loads(exercise.options_json):
        raise HTTPException(status_code=422, detail="That is not one of the options")
    exercise.chosen = body.choice
    exercise.correct = body.choice == exercise.answer
    session.add(exercise)
    session.commit()
    session.refresh(exercise)
    return _exercise_read(exercise)
