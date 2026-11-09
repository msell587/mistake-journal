"""Bridge to grammar-agent: turn a journal entry into checked sentence results."""

from __future__ import annotations

from collections.abc import Callable

from grammar_agent.cache import ResponseCache
from grammar_agent.checker import Checker
from grammar_agent.config import Settings, load_settings
from grammar_agent.llm import make_client
from grammar_agent.models import SentenceResult

CheckFn = Callable[[str], list[SentenceResult]]


def make_check_fn(settings: Settings) -> CheckFn:
    """Return a function that checks a whole text with the given settings.

    grammar-agent's cache holds a SQLite connection that must stay on one thread, so each
    call opens its own cache instead of sharing one across FastAPI's worker threads.
    """
    client = make_client(settings)

    def check(text: str) -> list[SentenceResult]:
        if not settings.use_cache:
            return Checker(client, settings).check_text(text)
        with ResponseCache(settings.cache_path) as cache:
            return Checker(client, settings, cache).check_text(text)

    return check


_default: CheckFn | None = None


def get_check_fn() -> CheckFn:
    """FastAPI dependency. Reads grammar-agent's normal settings (.env, provider, model)."""
    global _default
    if _default is None:
        _default = make_check_fn(load_settings())
    return _default
