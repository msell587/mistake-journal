"""Drill generation: validation of model output, retries, and the offline demo set."""

from __future__ import annotations

import json
import random

import pytest
from grammar_agent.llm import RateLimitError
from grammar_agent.ratelimit import RateLimiter

from mistake_journal.drills import (
    DRILL_SCHEMA,
    DrillError,
    DrillExample,
    demo_exercises,
    generate,
    parse_exercises,
    user_prompt,
    validate,
)

GOOD = {
    "sentence": "Yesterday she ___ to the market.",
    "options": ["went", "goes", "going"],
    "answer": "went",
    "explanation": "'Yesterday' is in the past, so use 'went'.",
}


def reply(*items: dict[str, object]) -> str:
    return json.dumps({"exercises": list(items)})


def variant(n: int) -> dict[str, object]:
    return {**GOOD, "sentence": f"Yesterday she ___ to market number {n}."}


class FakeClient:
    model_id = "fake"

    def __init__(self, *replies: str | BaseException) -> None:
        self.replies = list(replies)
        self.schemas: list[object] = []

    def complete(self, system: str, user: str, schema: dict[str, object] | None = None) -> str:
        self.schemas.append(schema)
        r = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(r, BaseException):
            raise r
        return r


def instant_limiter() -> RateLimiter:
    return RateLimiter(delay=0, attempts=1, sleep=lambda _s: None)


def test_valid_exercise_passes() -> None:
    ex = validate(GOOD)
    assert ex is not None
    assert ex.answer == "went"
    assert ex.options == ("went", "goes", "going")


@pytest.mark.parametrize(
    "change",
    [
        {"sentence": "No blank here."},
        {"sentence": "Two ___ blanks ___ here."},
        {"options": ["went", "goes"]},  # too few
        {"options": ["went", "goes", "going", "gone", "go"]},  # too many
        {"options": ["went", "Went", "going"]},  # duplicate, ignoring case
        {"answer": "gone"},  # not one of the options
        {"explanation": "  "},
        {"options": "went, goes, going"},
    ],
)
def test_invalid_exercises_are_rejected(change: dict[str, object]) -> None:
    assert validate({**GOOD, **change}) is None


def test_long_underscores_become_one_blank_and_answer_case_is_matched() -> None:
    ex = validate({**GOOD, "sentence": "Yesterday she _____ there.", "answer": "WENT"})
    assert ex is not None
    assert ex.sentence == "Yesterday she ___ there."
    assert ex.answer == "went"


def test_parse_keeps_only_valid_items() -> None:
    text = "```json\n" + reply(GOOD, {**GOOD, "answer": "nope"}) + "\n```"
    assert len(parse_exercises(text)) == 1
    assert parse_exercises("not json") == []


def test_generate_sends_drill_schema_and_shuffles() -> None:
    client = FakeClient(reply(*(variant(i) for i in range(5))))
    exercises = generate(
        client, instant_limiter(), "intermediate", "Verb tense", [], random.Random(1)
    )
    assert len(exercises) == 5
    assert client.schemas == [DRILL_SCHEMA]
    assert all(
        ex.answer == "went" and set(ex.options) == {"went", "goes", "going"} for ex in exercises
    )
    assert any(ex.options[0] != "went" for ex in exercises)  # answer isn't always first


def test_generate_asks_again_when_too_few_are_valid() -> None:
    client = FakeClient(reply(variant(1), variant(2)), reply(variant(3), variant(4), variant(5)))
    exercises = generate(
        client, instant_limiter(), "intermediate", "Verb tense", [], random.Random(1)
    )
    assert len(exercises) == 5
    assert len(client.schemas) == 2


def test_generate_fails_when_replies_stay_unusable() -> None:
    client = FakeClient(reply(variant(1)), "garbage")
    with pytest.raises(DrillError):
        generate(client, instant_limiter(), "intermediate", "Verb tense", [])


def test_generate_reports_a_busy_provider() -> None:
    client = FakeClient(RateLimitError("HTTP 503"))
    with pytest.raises(DrillError, match="busy"):
        generate(client, instant_limiter(), "intermediate", "Verb tense", [])


def test_user_prompt_includes_examples_and_topics() -> None:
    prompt = user_prompt("Verb tense", [DrillExample("I go yesterday.", "go", "went")], ["travel"])
    assert "Verb tense" in prompt and "travel" in prompt and "go -> went" in prompt


def test_demo_exercises_prefer_the_category() -> None:
    exercises = demo_exercises("prepositions", random.Random(0))
    assert len(exercises) == 5
    assert {"at"} <= {ex.answer for ex in exercises[:2]}
