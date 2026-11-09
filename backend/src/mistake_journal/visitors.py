"""Who owns the data in a request.

Locally there is one learner, "local". In demo mode every browser sends a random
X-Visitor-Id (kept in its localStorage), so visitors never see each other's entries.
"""

from __future__ import annotations

import re
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from mistake_journal.config import DEMO_MODE

LOCAL = "local"
_VISITOR_ID = re.compile(r"[A-Za-z0-9-]{8,64}")


def get_owner(x_visitor_id: Annotated[str | None, Header()] = None) -> str:
    if not DEMO_MODE:
        return LOCAL
    if x_visitor_id is None or not _VISITOR_ID.fullmatch(x_visitor_id):
        raise HTTPException(status_code=400, detail="Missing or invalid X-Visitor-Id header")
    return f"v:{x_visitor_id}"


OwnerDep = Annotated[str, Depends(get_owner)]
