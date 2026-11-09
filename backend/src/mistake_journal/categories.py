"""Display names for grammar-agent's fixed list of mistake categories.

A fixed list (rather than free text from the model) keeps the dashboard counts stable.
"""

from __future__ import annotations

from grammar_agent.models import MISTAKE_CATEGORIES

_LABELS = {
    "verb_tense": "Verb tense",
    "subject_verb_agreement": "Subject-verb agreement",
    "articles": "Articles (a / an / the)",
    "prepositions": "Prepositions",
    "plurals": "Plurals",
    "word_order": "Word order",
    "word_choice": "Word choice",
    "pronouns": "Pronouns",
    "spelling": "Spelling",
    "punctuation": "Punctuation",
    "capitalization": "Capitalization",
    "other": "Other",
}

# Same order as grammar-agent; a category it adds later still shows, with a readable name.
CATEGORIES: dict[str, str] = {
    c: _LABELS.get(c, c.replace("_", " ").capitalize()) for c in MISTAKE_CATEGORIES
}


def categorize(category: str) -> str:
    return category if category in CATEGORIES else "other"


def label(category: str) -> str:
    return CATEGORIES.get(category, CATEGORIES["other"])
