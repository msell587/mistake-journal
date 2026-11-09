"""The fixed list of mistake categories that statistics and drills are grouped by.

A fixed list (rather than free text from the model) keeps the dashboard counts stable.
"""

from __future__ import annotations

CATEGORIES: dict[str, str] = {
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
    "uncategorized": "Other",
}

# grammar-agent currently reports only a coarse change type. Until it returns one of the
# categories above, map what we can and file the rest under "uncategorized".
_FROM_CHANGE_TYPE = {"spelling": "spelling", "punctuation": "punctuation"}


def categorize(change_type: str) -> str:
    return _FROM_CHANGE_TYPE.get(change_type, "uncategorized")


def label(category: str) -> str:
    return CATEGORIES.get(category, CATEGORIES["uncategorized"])
