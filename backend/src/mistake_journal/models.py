"""Database tables and API schemas."""

from datetime import UTC, datetime

from pydantic import field_validator
from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


# --- Tables -------------------------------------------------------------------------------


class Entry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner: str = Field(default="local", index=True)  # see visitors.py
    text: str
    created_at: datetime = Field(default_factory=utcnow, index=True)

    mistakes: list["Mistake"] = Relationship(
        back_populates="entry", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Mistake(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    entry_id: int = Field(foreign_key="entry.id", index=True)
    sentence: str
    original_span: str
    replacement: str
    explanation: str
    change_type: str  # grammar-agent's coarse type: spelling, grammar, punctuation, other
    category: str = Field(index=True)  # one of categories.CATEGORIES
    accepted: bool | None = None  # None until the learner decides
    start: int | None = None  # where original_span starts in the entry text (None: older rows)

    entry: Entry | None = Relationship(back_populates="mistakes")


class DrillSet(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    owner: str = Field(default="local", index=True)
    category: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow, index=True)

    exercises: list["Exercise"] = Relationship(
        back_populates="drill_set",
        sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "Exercise.position"},
    )


class Exercise(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    drill_set_id: int = Field(foreign_key="drillset.id", index=True)
    position: int
    sentence: str  # contains one "___" blank
    options_json: str  # JSON list of the answer options, in display order
    answer: str
    explanation: str
    chosen: str | None = None
    correct: bool | None = None

    drill_set: DrillSet | None = Relationship(back_populates="exercises")


# --- API schemas --------------------------------------------------------------------------


class EntryCreate(SQLModel):
    text: str = Field(min_length=1, max_length=5000)


class MistakeRead(SQLModel):
    id: int
    sentence: str
    original_span: str
    replacement: str
    explanation: str
    change_type: str
    category: str
    accepted: bool | None
    start: int | None


class EntryRead(SQLModel):
    id: int
    text: str
    created_at: datetime
    mistakes: list[MistakeRead]

    @field_validator("created_at")
    @classmethod
    def _as_utc(cls, value: datetime) -> datetime:
        # SQLite drops the time zone; times are stored in UTC, so say so in the API.
        return value if value.tzinfo else value.replace(tzinfo=UTC)


class FlaggedSentence(SQLModel):
    sentence: str
    reasons: list[str]


class CheckedEntry(SQLModel):
    entry: EntryRead
    flagged: list[FlaggedSentence]  # sentences the guardrails could not safely correct


class DecisionIn(SQLModel):
    accepted: bool


class CategoryCount(SQLModel):
    category: str
    label: str
    count: int


class RecheckIn(SQLModel):
    sentences: list[str] = Field(min_length=1, max_length=50)


class DrillCreate(SQLModel):
    category: str | None = None  # None: practise the learner's most common mistake type


class ExerciseRead(SQLModel):
    id: int
    position: int
    sentence: str
    options: list[str]
    chosen: str | None
    correct: bool | None
    # Revealed only once the exercise has been answered.
    answer: str | None
    explanation: str | None


class DrillSetRead(SQLModel):
    id: int
    category: str
    label: str
    created_at: datetime
    exercises: list[ExerciseRead]

    @field_validator("created_at")
    @classmethod
    def _as_utc(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=UTC)


class DrillSummary(SQLModel):
    id: int
    category: str
    label: str
    created_at: datetime
    total: int
    answered: int
    correct: int

    @field_validator("created_at")
    @classmethod
    def _as_utc(cls, value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=UTC)


class AnswerIn(SQLModel):
    choice: str = Field(min_length=1, max_length=200)
