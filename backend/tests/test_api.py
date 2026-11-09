"""API tests. They use grammar-agent's offline mock provider, so no API key or network."""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from grammar_agent.config import Settings
from grammar_agent.llm import MockClient
from grammar_agent.models import SentenceResult, Status
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from mistake_journal import checking, drills
from mistake_journal.db import get_session
from mistake_journal.drills import DrillError, GeneratedExercise
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
                    "category": "subject_verb_agreement",
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
                    "category": "spelling",
                    "explanation": "'Reading' is spelled with 'ea'.",
                }
            ],
        }
    ),
}


DRILL_CALLS: list[tuple[str, int]] = []


def fake_drills(category: str, _label: str, examples: object) -> list[GeneratedExercise]:
    DRILL_CALLS.append((category, len(examples)))  # type: ignore[arg-type]
    if category == "word_order":
        raise DrillError("The AI provider is busy right now.")
    return [
        GeneratedExercise(
            f"She ___ to school, day {i}.", ("goes", "go", "going"), "goes", "Add -s."
        )
        for i in range(3)
    ]


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
    app.dependency_overrides[drills.get_drill_fn] = lambda: fake_drills
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
    assert [m["category"] for m in mistakes] == ["subject_verb_agreement", "spelling"]
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


def test_categories_match_grammar_agent(client: TestClient) -> None:
    categories = client.get("/api/categories").json()
    assert categories["verb_tense"] == "Verb tense"
    assert categories["other"] == "Other"


def test_decide_unknown_mistake(client: TestClient) -> None:
    assert client.patch("/api/mistakes/999", json={"accepted": True}).status_code == 404


def test_entries_listed(client: TestClient) -> None:
    client.post("/api/entries", json={"text": "I like reeding."})
    entries = client.get("/api/entries").json()
    assert len(entries) == 1
    assert entries[0]["mistakes"][0]["replacement"] == "reading"


def test_mistake_positions_point_into_the_entry(client: TestClient) -> None:
    text = "She go to school every day. I like reeding."
    mistakes = client.post("/api/entries", json={"text": text}).json()["entry"]["mistakes"]
    for m in mistakes:
        assert text[m["start"] : m["start"] + len(m["original_span"])] == m["original_span"]


def test_created_at_is_utc(client: TestClient) -> None:
    client.post("/api/entries", json={"text": "I like reeding."})
    created = client.get("/api/entries").json()[0]["created_at"]
    assert created.endswith(("Z", "+00:00"))


def test_delete_entry_removes_its_mistakes(client: TestClient) -> None:
    entry = client.post("/api/entries", json={"text": "I like reeding."}).json()["entry"]
    client.patch(f"/api/mistakes/{entry['mistakes'][0]['id']}", json={"accepted": True})
    assert client.delete(f"/api/entries/{entry['id']}").status_code == 204
    assert client.get("/api/entries").json() == []
    assert client.get("/api/stats").json() == []
    assert client.delete(f"/api/entries/{entry['id']}").status_code == 404


def accept_all(client: TestClient, text: str) -> None:
    for m in client.post("/api/entries", json={"text": text}).json()["entry"]["mistakes"]:
        client.patch(f"/api/mistakes/{m['id']}", json={"accepted": True})


def test_drill_needs_logged_mistakes(client: TestClient) -> None:
    assert client.post("/api/drills", json={}).status_code == 400


def test_drill_defaults_to_most_common_category_and_hides_answers(client: TestClient) -> None:
    DRILL_CALLS.clear()
    accept_all(client, "She go to school every day. I like reeding.")
    accept_all(client, "I like reeding.")
    drill = client.post("/api/drills", json={}).json()
    assert drill["category"] == "spelling" and drill["label"] == "Spelling"
    assert DRILL_CALLS == [("spelling", 2)]
    assert len(drill["exercises"]) == 3
    first = drill["exercises"][0]
    assert first["answer"] is None and first["explanation"] is None and first["chosen"] is None


def test_answering_grades_once_and_reveals_the_answer(client: TestClient) -> None:
    drill = client.post("/api/drills", json={"category": "verb_tense"}).json()
    ex = drill["exercises"][0]
    graded = client.post(f"/api/exercises/{ex['id']}/answer", json={"choice": "go"}).json()
    assert graded["correct"] is False and graded["answer"] == "goes" and graded["explanation"]
    again = client.post(f"/api/exercises/{ex['id']}/answer", json={"choice": "goes"})
    assert again.status_code == 409
    bad = client.post(f"/api/exercises/{drill['exercises'][1]['id']}/answer", json={"choice": "x"})
    assert bad.status_code == 422
    summary = client.get("/api/drills").json()[0]
    assert (summary["total"], summary["answered"], summary["correct"]) == (3, 1, 0)
    assert client.get(f"/api/drills/{drill['id']}").json()["exercises"][0]["chosen"] == "go"


def test_drill_errors_are_reported(client: TestClient) -> None:
    resp = client.post("/api/drills", json={"category": "word_order"})
    assert resp.status_code == 503 and "busy" in resp.json()["detail"]
    assert client.post("/api/drills", json={"category": "nonsense"}).status_code == 422


def test_recheck_adds_mistakes_for_flagged_sentences(client: TestClient) -> None:
    entry = client.post("/api/entries", json={"text": "Hello there. I like reeding."}).json()[
        "entry"
    ]
    assert len(entry["mistakes"]) == 1
    rechecked = client.post(
        f"/api/entries/{entry['id']}/recheck",
        json={"sentences": ["She go to school every day.", "I like reeding."]},
    ).json()
    # The first sentence isn't in this entry; the second is, but its mistake is already stored.
    assert [f["sentence"] for f in rechecked["flagged"]] == ["She go to school every day."]
    assert len(rechecked["entry"]["mistakes"]) == 1


def test_recheck_fills_in_a_sentence_that_failed(client: TestClient) -> None:
    real_check = app.dependency_overrides[checking.get_check_fn]()
    first_time = True

    def flaky_check(text: str) -> list[SentenceResult]:
        nonlocal first_time
        results = real_check(text)
        if first_time:  # the provider "fails" on every sentence of the first request
            first_time = False
            return [
                SentenceResult(r.sentence, Status.NEEDS_REVIEW, r.sentence.text, [], ["HTTP 503"])
                for r in results
            ]
        return results

    app.dependency_overrides[checking.get_check_fn] = lambda: flaky_check
    text = "Hello there. She go to school every day."
    created = client.post("/api/entries", json={"text": text}).json()
    assert created["entry"]["mistakes"] == []
    flagged = [f["sentence"] for f in created["flagged"]]
    assert flagged == ["Hello there.", "She go to school every day."]

    rechecked = client.post(
        f"/api/entries/{created['entry']['id']}/recheck", json={"sentences": flagged}
    ).json()
    assert rechecked["flagged"] == []
    [m] = rechecked["entry"]["mistakes"]
    assert (m["original_span"], m["replacement"]) == ("go", "goes")
    assert text[m["start"] : m["start"] + 2] == "go"
