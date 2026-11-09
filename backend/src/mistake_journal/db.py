"""SQLite engine and session dependency."""

from __future__ import annotations

import os
from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.environ.get("MISTAKE_JOURNAL_DB", "sqlite:///./mistake_journal.db")

# check_same_thread=False: FastAPI runs sync endpoints in a thread pool.
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def create_db() -> None:
    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
