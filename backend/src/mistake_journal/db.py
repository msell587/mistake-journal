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
    added = {
        "mistake": {"start": "INTEGER"},
        "entry": {"owner": "VARCHAR NOT NULL DEFAULT 'local'"},
        "drillset": {"owner": "VARCHAR NOT NULL DEFAULT 'local'"},
    }
    with engine.begin() as conn:
        for table, columns in added.items():
            existing = {c["name"] for c in inspect(conn).get_columns(table)}
            for name, ddl in columns.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
