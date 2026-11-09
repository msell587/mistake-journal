"""API tests. They use grammar-agent's offline mock provider, so no API key or network."""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from grammar_agent.config import Settings
from grammar_agent.llm import MockClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from mistake_journal import checking
from mistake_journal.db import get_session
from mistake_journal.main import app

SCRIPT = {
    "She go to school every day.": json.dumps(
        {
            "original": "She go to school every day.",
            "corrected": "She goes to school every day.",
            "meaning_preserved": True,
            "changes": [
                {
                    "original_span": "go",
                    "replacement": "goes",
                    "type": "grammar",
                    "explanation": "With he, she or it, add -s to the verb in the present simple.",
                }
            ],
        }
    ),
    "I like reeding.": json.dumps(
        {
            "original": "I like reeding.",
            "corrected": "I like reading.",
            "meaning_preserved": True,
            "changes": [
                {
                    "original_span": "reeding",
                    "replacement": "reading",
                    "type": "spelling",
                    "explanation": "'Reading' is spelled with 'ea'.",
                }
            ],
        }
    ),
}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    SQLModel.metadata.create_all(engine)

    def session_override() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    settings = Settings(provider="mock", request_delay=0, use_cache=False)
    monkeypatch.setattr(checking, "make_client", lambda _settings: MockClient(SCRIPT))
    check_fn = checking.make_check_fn(settings)

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[checking.get_check_fn] = lambda: check_fn
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_create_entry_stores_mistakes(client: TestClient) -> None:
    resp = client.post("/api/entries", json={"text": "She go to school every day. I like reeding."})
    assert resp.status_code == 201
    mistakes = resp.json()["entry"]["mistakes"]
    assert [(m["original_span"], m["replacement"]) for m in mistakes] == [
        ("go", "goes"),
        ("reeding", "reading"),
    ]
    assert {m["category"] for m in mistakes} == {"uncategorized", "spelling"}
    assert all(m["accepted"] is None for m in mistakes)
    assert resp.json()["flagged"] == []


def test_empty_entry_rejected(client: TestClient) -> None:
    assert client.post("/api/entries", json={"text": ""}).status_code == 422


def test_stats_count_only_accepted(client: TestClient) -> None:
    mistakes = client.post(
        "/api/entries", json={"text": "She go to school every day. I like reeding."}
    ).json()["entry"]["mistakes"]
    assert client.get("/api/stats").json() == []

    client.patch(f"/api/mistakes/{mistakes[0]['id']}", json={"accepted": False})
    client.patch(f"/api/mistakes/{mistakes[1]['id']}", json={"accepted": True})

    assert client.get("/api/stats").json() == [
        {"category": "spelling", "label": "Spelling", "count": 1}
    ]


def test_decide_unknown_mistake(client: TestClient) -> None:
    assert client.patch("/api/mistakes/999", json={"accepted": True}).status_code == 404


def test_entries_listed(client: TestClient) -> None:
    client.post("/api/entries", json={"text": "I like reeding."})
    entries = client.get("/api/entries").json()
    assert len(entries) == 1
    assert entries[0]["mistakes"][0]["replacement"] == "reading"
