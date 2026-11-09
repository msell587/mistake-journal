"""Database tables and API schemas."""

from datetime import UTC, datetime

from sqlmodel import Field, Relationship, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


# --- Tables -------------------------------------------------------------------------------


class Entry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
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

    entry: Entry | None = Relationship(back_populates="mistakes")


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


class EntryRead(SQLModel):
    id: int
    text: str
    created_at: datetime
    mistakes: list[MistakeRead]


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
