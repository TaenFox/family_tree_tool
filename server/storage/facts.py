from __future__ import annotations

import json
from typing import Any

from server.parsing import blank_table_rows, bullet_values, parse_table_rows
from server.textutil import placeholder


def facts_from_legacy_bullets(section_text: str) -> list[dict[str, str]]:
    return [
        {"date": "", "fact": item, "place": "", "source": "", "note": ""}
        for item in bullet_values(section_text).splitlines()
        if item.strip()
    ]

def normalize_fact_source_value(value: Any) -> str:
    if isinstance(value, list):
        raw_items = [str(item).strip() for item in value if str(item).strip()]
    else:
        raw_text = str(value or "").strip()
        if not raw_text:
            return ""
        raw_items = [item.strip() for item in raw_text.split(";") if item.strip()]

    normalized: list[str] = []
    seen: set[str] = set()
    for item in raw_items:
        if item in seen:
            continue
        seen.add(item)
        normalized.append(item)
    return "; ".join(normalized)

def facts_rows(section_text: str) -> str:
    rows = parse_table_rows(section_text, 5)
    if rows:
        facts = [
            {
                "date": "" if row[0] == "..." else row[0],
                "fact": "" if row[1] == "..." else row[1],
                "place": "" if row[2] == "..." else row[2],
                "source": "" if row[3] == "..." else normalize_fact_source_value(row[3]),
                "note": "" if row[4] == "..." else row[4],
            }
            for row in rows
            if any(cell.strip() and cell != "..." for cell in row)
        ]
        return json.dumps(facts, ensure_ascii=False)

    legacy_rows = parse_table_rows(section_text, 4)
    if legacy_rows:
        facts = [
            {
                "date": "" if row[0] == "..." else row[0],
                "fact": "" if row[1] == "..." else row[1],
                "place": "",
                "source": "" if row[2] == "..." else normalize_fact_source_value(row[2]),
                "note": "" if row[3] == "..." else row[3],
            }
            for row in legacy_rows
            if any(cell.strip() and cell != "..." for cell in row)
        ]
        return json.dumps(facts, ensure_ascii=False)

    legacy_facts = facts_from_legacy_bullets(section_text)
    return json.dumps(legacy_facts, ensure_ascii=False)

def parse_facts_payload(value: str) -> list[dict[str, str]]:
    raw_value = (value or "").strip()
    if not raw_value:
        return []

    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        return facts_from_legacy_bullets(raw_value)

    if not isinstance(payload, list):
        return []

    rows: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "date": str(item.get("date", "")).strip(),
                "fact": str(item.get("fact", "")).strip(),
                "place": str(item.get("place", "")).strip(),
                "source": normalize_fact_source_value(item.get("source", "")),
                "note": str(item.get("note", "")).strip(),
            }
        )
    return rows

def parse_rename_history_payload(value: str) -> list[dict[str, str]]:
    raw_value = (value or "").strip()
    if not raw_value:
        return []

    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    rows: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "date": str(item.get("date", "")).strip(),
                "name": str(item.get("name", "")).strip(),
                "note": str(item.get("note", "")).strip(),
            }
        )
    return rows

def rename_history_rows(section_text: str) -> str:
    rows = parse_table_rows(section_text, 3)
    payload = [
        {
            "date": "" if row[0] == "..." else row[0],
            "name": "" if row[1] == "..." else row[1],
            "note": "" if row[2] == "..." else row[2],
        }
        for row in rows
        if any(cell.strip() and cell != "..." for cell in row)
    ]
    return json.dumps(payload, ensure_ascii=False)

def render_facts_table(value: str) -> str:
    rows = parse_facts_payload(value)
    lines = [
        '[cols="1,3,2,2,2",options="header"]',
        "|===",
        "| Дата",
        "| Факт",
        "| Место",
        "| Источник",
        "| Примечание",
        "",
    ]

    if rows:
        for row in rows:
            lines.extend(
                [
                    f"| {placeholder(row['date'])}",
                    f"| {placeholder(row['fact'])}",
                    f"| {placeholder(row['place'])}",
                    f"| {placeholder(row['source'])}",
                    f"| {placeholder(row['note'])}",
                    "",
                ]
            )
    else:
        lines.extend(["| ...", "| ...", "| ...", "| ...", "| ...", ""])

    lines.extend(blank_table_rows(5, 2))

    lines.append("|===")
    return "\n".join(lines)

def render_rename_history_table(value: str) -> str:
    rows = parse_rename_history_payload(value)
    lines = [
        '[cols="1,3,2",options="header"]',
        "|===",
        "| Год / дата",
        "| Название",
        "| Примечание",
        "",
    ]

    if rows:
        for row in rows:
            lines.extend(
                [
                    f"| {placeholder(row['date'])}",
                    f"| {placeholder(row['name'])}",
                    f"| {placeholder(row['note'])}",
                    "",
                ]
            )
    else:
        lines.extend(["| ...", "| ...", "| ...", ""])

    lines.extend(blank_table_rows(3, 2))
    lines.append("|===")
    return "\n".join(lines)

def parse_research_journal_payload(value: str) -> list[dict[str, str]]:
    raw_value = (value or "").strip()
    if not raw_value:
        return []

    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        return []

    if not isinstance(payload, list):
        return []

    rows: list[dict[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "date": str(item.get("date", "")).strip(),
                "entry": str(item.get("entry", "")).strip(),
                "links": normalize_fact_source_value(item.get("links", "")),
            }
        )
    return rows

def research_journal_rows(section_text: str) -> str:
    rows = parse_table_rows(section_text, 3)
    payload = [
        {
            "date": "" if row[0] == "..." else row[0],
            "entry": "" if row[1] == "..." else row[1],
            "links": "" if row[2] == "..." else normalize_fact_source_value(row[2]),
        }
        for row in rows
        if any(cell.strip() and cell != "..." for cell in row)
    ]
    return json.dumps(payload, ensure_ascii=False)

def render_research_journal_table(value: str) -> str:
    rows = parse_research_journal_payload(value)
    lines = [
        '[cols="1,4,3",options="header"]',
        "|===",
        "| Дата",
        "| Запись",
        "| Связанные карточки",
        "",
    ]

    if rows:
        for row in rows:
            lines.extend(
                [
                    f"| {placeholder(row['date'])}",
                    f"| {placeholder(row['entry'])}",
                    f"| {placeholder(row['links'])}",
                    "",
                ]
            )
    else:
        lines.extend(["| ...", "| ...", "| ...", ""])

    lines.extend(blank_table_rows(3, 2))
    lines.append("|===")
    return "\n".join(lines)
