"""SQLite engine and session dependency."""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("MISTAKE_JOURNAL_DB", "sqlite:///./mistake_journal.db")

# check_same_thread=False: FastAPI runs sync endpoints in a thread pool.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def create_db() -> None:
    SQLModel.metadata.create_all(engine)
    _add_missing_columns()


def _add_missing_columns() -> None:
    """Tiny migration: add columns introduced after a database was first created."""
    existing = {c["name"] for c in inspect(engine).get_columns("mistake")}
    with engine.begin() as conn:
        if "start" not in existing:
            conn.execute(text("ALTER TABLE mistake ADD COLUMN start INTEGER"))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
