from __future__ import annotations

from typing import Any

from server.storage.cards import collect_cards


def state_payload() -> dict[str, Any]:
    return {
        "people": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("person")
        ],
        "groups": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("group")
        ],
        "places": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("place")
        ],
        "sources": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("source")
        ],
        "researches": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("research")
        ],
    }
