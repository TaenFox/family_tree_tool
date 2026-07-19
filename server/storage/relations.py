from __future__ import annotations

import json
import re
from pathlib import Path, PurePosixPath
from typing import Any

from server.constants import XREF_PATTERN
from server.models.card import CardDetails
from server.parsing import blank_table_rows, parse_table_rows
from server.textutil import split_lines
from server.web_server import runtime


def relation_prefix(field_name: str) -> str:
    return {
        "siblings": "С",
        "children": "Р",
        "partners": "П",
        "groups": "Г",
        "participants": "У",
    }.get(field_name, "")

def relation_entries_json(entries: list[dict[str, Any]]) -> str:
    return json.dumps(entries, ensure_ascii=False)

def parse_relation_payload(value: str, field_name: str) -> list[dict[str, Any]]:
    raw_value = (value or "").strip()
    if not raw_value:
        return []

    entries: list[dict[str, Any]] = []
    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        payload = None

    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            index = str(item.get("index", "")).strip()
            if not re.fullmatch(r"\d{2}", index):
                index = ""
            value_text = str(item.get("value", "")).strip()
            if not value_text:
                continue
            entries.append(
                {
                    "index": index,
                    "value": value_text,
                    "native": bool(item.get("native", False)),
                }
            )
    else:
        legacy_lines = [line.strip() for line in raw_value.splitlines() if line.strip()]
        for raw_index, line in enumerate(legacy_lines, start=1):
            entries.append(
                {
                    "index": f"{raw_index:02d}",
                    "value": re.sub(r"\s*\{род\}\s*$", "", line).strip(),
                    "native": field_name == "parents" and "{род}" in line,
                }
            )

    normalized: list[dict[str, Any]] = []
    seen_targets: set[str] = set()
    next_fallback = 1
    for item in entries:
        index = item["index"] if re.fullmatch(r"\d{2}", item["index"]) else f"{next_fallback:02d}"
        next_fallback = max(next_fallback, int(index) + 1)
        value_text = item["value"].strip()
        if not value_text or value_text in seen_targets:
            continue
        seen_targets.add(value_text)
        normalized.append(
            {
                "index": index,
                "value": value_text,
                "native": bool(item.get("native", False)) if field_name == "parents" else False,
            }
        )

    normalized.sort(key=lambda item: int(item["index"]))
    return normalized

def next_relation_index(entries: list[dict[str, Any]]) -> str:
    highest = max((int(item["index"]) for item in entries if re.fullmatch(r"\d{2}", item.get("index", ""))), default=0)
    return f"{highest + 1:02d}"

def renumber_relation_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = sorted(entries, key=lambda item: int(item["index"]))
    return [
        {
            **entry,
            "index": f"{position:02d}",
        }
        for position, entry in enumerate(ordered, start=1)
    ]

def append_relation_entry(entries: list[dict[str, Any]], field_name: str, value: str, native: bool = False) -> list[dict[str, Any]]:
    normalized = parse_relation_payload(relation_entries_json(entries), field_name)
    normalized.append(
        {
            "index": next_relation_index(normalized),
            "value": value.strip(),
            "native": native if field_name == "parents" else False,
        }
    )
    return renumber_relation_entries(normalized)

def render_relation_table(field_name: str, value: str) -> str:
    entries = parse_relation_payload(value, field_name)
    include_native = field_name == "parents"
    headers = ["| Индекс", "| Карточка"]
    if include_native:
        headers.append("| Характеристика")
    lines = [
        '[cols="1,4,1",options="header"]' if include_native else '[cols="1,4",options="header"]',
        "|===",
        *headers,
        "",
    ]

    prefix = relation_prefix(field_name)
    if entries:
        for entry in entries:
            index_label = f"{prefix}{entry['index']}" if prefix else entry["index"]
            lines.extend(
                [
                    f"| {index_label}",
                    f"| {entry['value']}",
                ]
            )
            if include_native:
                lines.append(f"| {'род' if entry.get('native') else '...'}")
            lines.append("")
    else:
        lines.extend(["| ...", "| ..."])
        if include_native:
            lines.append("| ...")
        lines.append("")

    lines.extend(blank_table_rows(3 if include_native else 2, 2))

    lines.append("|===")
    return "\n".join(lines)

def parse_relation_table(section_text: str, field_name: str) -> list[dict[str, Any]]:
    column_count = 3 if field_name == "parents" else 2
    rows = parse_table_rows(section_text, column_count)
    entries: list[dict[str, Any]] = []
    prefix = relation_prefix(field_name)

    for row in rows:
        raw_index = row[0].strip()
        if raw_index == "...":
            continue
        if prefix and raw_index.startswith(prefix):
            raw_index = raw_index[len(prefix):]
        if not re.fullmatch(r"\d{2}", raw_index):
            continue
        raw_value = row[1].strip()
        if raw_value == "...":
            continue
        entries.append(
            {
                "index": raw_index,
                "value": raw_value,
                "native": column_count == 3 and row[2].strip() == "род",
            }
        )

    return entries

def resolve_xref_target(source_card_dir: Path, entry: str) -> Path | None:
    match = XREF_PATTERN.match(entry.strip())
    if not match:
        return None
    ref_path = match.group(1)
    return (source_card_dir.resolve() / PurePosixPath(ref_path)).resolve()

def relation_target_directory(entry: str, source_card_dir: Path, target_type: str) -> str | None:
    target_path = resolve_xref_target(source_card_dir, entry)
    if target_path is None or not target_path.exists():
        return None
    root = runtime.PEOPLE_DIR.resolve() if target_type == "person" else runtime.GROUPS_DIR.resolve()
    try:
        relative = target_path.relative_to(root)
    except ValueError:
        return None
    parts = relative.parts
    if len(parts) != 2 or parts[1] != "card.adoc":
        return None
    return parts[0]

def relation_lines(value: str) -> list[str]:
    return split_lines(value)

def set_relation_lines(details: CardDetails, field_name: str, lines: list[str]) -> None:
    setattr(details, field_name, "\n".join(lines))
