"""Generate multiple-choice practice exercises that target one kind of mistake.

The model is asked for a fixed JSON shape, and every exercise is validated before it is
shown: one blank, three or four distinct options, and exactly one of them the answer.
Exercises that fail are dropped; if too few survive, the model is asked again.
"""

from __future__ import annotations

import json
import random
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from grammar_agent.config import Settings, load_settings
from grammar_agent.llm import LLMClient, RateLimitError, make_client
from grammar_agent.parsing import ParseError, extract_json_object
from grammar_agent.prompts import LEVEL_GUIDANCE
from grammar_agent.ratelimit import RateLimiter

BLANK = "___"
EXERCISES_PER_SET = 5
MIN_VALID = 3
MAX_ATTEMPTS = 2
DEMO_FILE = Path(__file__).resolve().parents[2] / "demo" / "demo_drills.json"

DRILL_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "exercises": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sentence": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "string"},
                    "explanation": {"type": "string"},
                },
                "required": ["sentence", "options", "answer", "explanation"],
            },
        }
    },
    "required": ["exercises"],
}

TOPICS = (
    "work",
    "school",
    "cooking",
    "travel",
    "shopping",
    "sports",
    "family",
    "weekend plans",
    "the weather",
    "a birthday",
    "public transport",
    "a doctor's visit",
    "a new hobby",
    "pets",
    "moving house",
    "a film",
)

_SYSTEM = """\
You write short grammar practice exercises for English learners.

Each exercise is one natural, everyday English sentence with exactly one blank written as \
"___", plus answer options. Rules:
1. Every exercise practises the mistake type you are given, and nothing else.
2. Exactly one option is correct. The other options are mistakes a learner really makes \
with this mistake type, and each is clearly wrong in this sentence.
3. Give 3 or 4 options. Each option is the exact text that fills the blank. "answer" is \
copied exactly from "options".
4. Write new sentences. Never copy the learner's own sentences.
5. "explanation" is one or two sentences saying why the answer is right. {level_guidance}
6. Keep sentences under 20 words. Vary the sentences and the options.

Reply with a single JSON object that matches this JSON schema, and nothing else:
{schema}"""


class DrillError(RuntimeError):
    """Exercises could not be generated (provider busy, or the replies were unusable)."""


@dataclass(frozen=True)
class DrillExample:
    """One of the learner's own accepted mistakes, shown to the model as context."""

    sentence: str
    original_span: str
    replacement: str


@dataclass(frozen=True)
class GeneratedExercise:
    sentence: str
    options: tuple[str, ...]
    answer: str
    explanation: str


DrillFn = Callable[[str, str, Sequence[DrillExample]], list[GeneratedExercise]]


def system_prompt(level: str) -> str:
    return _SYSTEM.format(
        level_guidance=LEVEL_GUIDANCE.get(level, LEVEL_GUIDANCE["intermediate"]),
        schema=json.dumps(DRILL_SCHEMA),
    )


def user_prompt(label: str, examples: Sequence[DrillExample], topics: Sequence[str]) -> str:
    lines = [
        f"Mistake type: {label}.",
        f"Write {EXERCISES_PER_SET} exercises. Set them in these situations: {', '.join(topics)}.",
    ]
    if examples:
        lines.append("For context, these are mistakes of this type the learner made:")
        lines += [f'- "{e.sentence}" ({e.original_span} -> {e.replacement})' for e in examples]
    return "\n".join(lines)


def _clean(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def validate(item: Any) -> GeneratedExercise | None:
    """Return a clean exercise, or None if it breaks any rule."""
    if not isinstance(item, dict):
        return None
    sentence = _clean(item.get("sentence"))
    answer = _clean(item.get("answer"))
    explanation = _clean(item.get("explanation"))
    raw_options = item.get("options")
    if not (sentence and answer and explanation and isinstance(raw_options, list)):
        return None
    sentence = re.sub(r"_{3,}", BLANK, sentence)
    if sentence.count(BLANK) != 1 or len(sentence) > 220:
        return None
    options: list[str] = []
    for raw in raw_options:
        option = _clean(raw)
        if option is None or option.lower() in (o.lower() for o in options):
            return None
        options.append(option)
    if not 3 <= len(options) <= 4:
        return None
    matches = [o for o in options if o.lower() == answer.lower()]
    if len(matches) != 1:
        return None
    return GeneratedExercise(sentence, tuple(options), matches[0], explanation)


def parse_exercises(text: str) -> list[GeneratedExercise]:
    try:
        data = extract_json_object(text)
    except ParseError:
        return []
    items = data.get("exercises")
    if not isinstance(items, list):
        return []
    return [ex for ex in (validate(item) for item in items) if ex is not None]


def generate(
    client: LLMClient,
    limiter: RateLimiter,
    level: str,
    label: str,
    examples: Sequence[DrillExample],
    rng: random.Random | None = None,
) -> list[GeneratedExercise]:
    rng = rng or random.Random()
    system = system_prompt(level)
    valid: list[GeneratedExercise] = []
    for _ in range(MAX_ATTEMPTS):
        prompt = user_prompt(label, examples, rng.sample(TOPICS, 3))
        try:
            reply = limiter.call(lambda p=prompt: client.complete(system, p, schema=DRILL_SCHEMA))
        except RateLimitError as exc:
            raise DrillError(
                f"The AI provider is busy right now ({exc}). Please try again in a minute."
            ) from exc
        seen = {ex.sentence for ex in valid}
        valid += [ex for ex in parse_exercises(reply) if ex.sentence not in seen]
        if len(valid) >= EXERCISES_PER_SET:
            break
    if len(valid) < MIN_VALID:
        raise DrillError("The AI couldn't write usable exercises this time. Please try again.")
    return [shuffled(ex, rng) for ex in valid[:EXERCISES_PER_SET]]


def shuffled(exercise: GeneratedExercise, rng: random.Random) -> GeneratedExercise:
    """Models tend to list the answer first; shuffle so its position gives nothing away."""
    options = list(exercise.options)
    rng.shuffle(options)
    return GeneratedExercise(
        exercise.sentence, tuple(options), exercise.answer, exercise.explanation
    )


def demo_exercises(category: str, rng: random.Random | None = None) -> list[GeneratedExercise]:
    """Offline drills for the mock provider: the category's own, topped up from others."""
    rng = rng or random.Random()
    items = json.loads(DEMO_FILE.read_text(encoding="utf-8"))
    own = [i for i in items if i.get("category") == category]
    rest = [i for i in items if i.get("category") != category]
    rng.shuffle(rest)
    picked = [validate(i) for i in (own + rest)[:EXERCISES_PER_SET]]
    return [shuffled(ex, rng) for ex in picked if ex is not None]


def make_drill_fn(settings: Settings) -> DrillFn:
    if settings.provider == "mock":
        return lambda category, _label, _examples: demo_exercises(category)

    client = make_client(settings)
    limiter = RateLimiter(
        delay=0,
        backoff_initial=settings.backoff_initial,
        backoff_max=settings.backoff_max,
        attempts=settings.rate_limit_attempts,
    )

    def drill(
        category: str, label: str, examples: Sequence[DrillExample]
    ) -> list[GeneratedExercise]:
        return generate(client, limiter, settings.level, label, examples)

    return drill


_default: DrillFn | None = None


def get_drill_fn() -> DrillFn:
    """FastAPI dependency, configured from grammar-agent's normal settings."""
    global _default
    if _default is None:
        _default = make_drill_fn(load_settings())
    return _default
