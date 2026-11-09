"""App settings read from the environment (grammar-agent reads its own)."""

from __future__ import annotations

import os
from pathlib import Path

# Public demo: each browser gets its own private journal, and limits apply.
DEMO_MODE = os.environ.get("MISTAKE_JOURNAL_DEMO", "").strip().lower() in ("1", "true", "yes")
DEMO_MAX_ENTRIES = 50
DEMO_MAX_DRILLS = 50

# Built frontend to serve from the same server (used by the Docker image). Optional.
FRONTEND_DIST = Path(
    os.environ.get(
        "MISTAKE_JOURNAL_FRONTEND", Path(__file__).resolve().parents[3] / "frontend" / "dist"
    )
)

# Sample entries for demo mode. The offline mock provider has scripted corrections for
# these sentences (demo/demo_replies.json); one reply is deliberately bad, to show the
# guardrails flagging it instead of applying it.
DEMO_SAMPLES = [
    "Their going to the libary tomorow. The results was better then we expected.",
    "Its a good idea, isnt it? Me and him has finished the report, but we forgot to sent it.",
]
