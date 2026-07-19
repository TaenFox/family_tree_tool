from __future__ import annotations

import json
from typing import Any

from server.constants import GUI_DIR
from server.storage.cards import collect_cards

PLACES_DATA_PATH = GUI_DIR / "data" / "places.json"

_places_dataset_cache: list[dict[str, Any]] | None = None

def load_places_dataset() -> list[dict[str, Any]]:
    """Локальный оффлайн-справочник населённых пунктов (без внешних вызовов)."""
    global _places_dataset_cache
    if _places_dataset_cache is not None:
        return _places_dataset_cache
    entries: list[dict[str, Any]] = []
    try:
        raw = json.loads(PLACES_DATA_PATH.read_text(encoding="utf-8"))
        for item in raw.get("places", []):
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            entries.append(
                {
                    "name": name,
                    "region": str(item.get("region", "")).strip(),
                    "country": str(item.get("country", "")).strip(),
                    "type": str(item.get("type", "")).strip(),
                    "aliases": [str(alias).strip() for alias in item.get("aliases", []) if str(alias).strip()],
                }
            )
    except (OSError, json.JSONDecodeError):
        entries = []
    _places_dataset_cache = entries
    return entries

def place_reference_value(entry: dict[str, Any]) -> str:
    """Обогащённый текст для хранения: «Город, Регион, Страна» без дублей."""
    parts: list[str] = []
    for value in (entry.get("name", ""), entry.get("region", ""), entry.get("country", "")):
        value = str(value).strip()
        if value and value not in parts:
            parts.append(value)
    return ", ".join(parts)

def search_place_suggestions(query: str, limit: int = 8) -> list[dict[str, Any]]:
    needle = query.strip().lower()
    suggestions: list[dict[str, Any]] = []

    # 1. Существующие карточки мест — приоритетнее справочника (гибридное хранение).
    for record in collect_cards("place"):
        title = record.title.strip()
        if not title:
            continue
        haystack = f"{title} {record.number}".lower()
        if needle and needle not in haystack:
            continue
        suggestions.append(
            {
                "kind": "card",
                "label": title,
                "meta": " · ".join(part for part in [record.number, record.place_type] if part),
                "path": record.path,
                "value": record.path,
            }
        )

    # 2. Локальный справочник населённых пунктов.
    for entry in load_places_dataset():
        matched_alias = ""
        if needle:
            if needle in entry["name"].lower():
                rank_source = entry["name"].lower()
            else:
                matched_alias = next(
                    (alias for alias in entry["aliases"] if needle in alias.lower()),
                    "",
                )
                if not matched_alias:
                    continue
                rank_source = matched_alias.lower()
        else:
            rank_source = entry["name"].lower()
        meta_parts = [part for part in [entry["region"], entry["country"]] if part]
        if matched_alias:
            meta_parts.append(f"ранее: {matched_alias}")
        suggestions.append(
            {
                "kind": "reference",
                "label": entry["name"],
                "meta": " · ".join(meta_parts),
                "value": place_reference_value(entry),
                "region": entry["region"],
                "country": entry["country"],
                "place_type": entry["type"],
                "_rank": 0 if rank_source.startswith(needle) else 1,
            }
        )

    def sort_key(item: dict[str, Any]) -> tuple[int, int, str]:
        kind_rank = 0 if item["kind"] == "card" else 1
        return (kind_rank, item.get("_rank", 0), item["label"].lower())

    suggestions.sort(key=sort_key)
    for item in suggestions:
        item.pop("_rank", None)
    return suggestions[:limit]
