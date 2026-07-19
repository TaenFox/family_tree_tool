from __future__ import annotations

from pathlib import Path

from server.constants import (GROUP_TITLE_PATTERN, NUMBER_LINE_PATTERN,
                              PERSON_TITLE_PATTERN, PHOTO_PATTERN,
                              PLACE_TITLE_PATTERN, RESEARCH_TITLE_PATTERN,
                              SECTION_PATTERN, SOURCE_TITLE_PATTERN,
                              SUBSECTION_PATTERN)
from server.models.card import CardRecord
from server.web_server import runtime


def parse_card(card_path: Path, card_type: str) -> CardRecord:
    text = card_path.read_text(encoding="utf-8")
    number_match = NUMBER_LINE_PATTERN.search(text)
    title_pattern = (
        PERSON_TITLE_PATTERN
        if card_type == "person"
        else GROUP_TITLE_PATTERN
        if card_type == "group"
        else PLACE_TITLE_PATTERN
        if card_type == "place"
        else SOURCE_TITLE_PATTERN
        if card_type == "source"
        else RESEARCH_TITLE_PATTERN
    )
    title_match = title_pattern.search(text)
    birth_date = ""
    place_type = ""
    source_type = ""
    if card_type == "person":
        basic = table_values(section_body(text, "Основные сведения"))
        birth_date = text_value(basic.get("Дата рождения", ""))
    elif card_type == "place":
        basic = table_values(section_body(text, "Основные сведения"))
        place_type = text_value(basic.get("Тип места", ""))
    elif card_type == "source":
        basic = table_values(section_body(text, "Основные сведения"))
        source_type = text_value(basic.get("Тип источника", ""))
    photo_match = PHOTO_PATTERN.search(text)
    main_photo = image_value(photo_match.group(1) if photo_match else "")

    number = number_match.group(1).strip() if number_match else "?"
    title = title_match.group(1).strip() if title_match else "..."
    relative_path = card_path.relative_to(runtime.DOCS_DIR).as_posix()
    return CardRecord(
        card_type=card_type,
        number=number,
        title=title,
        path=relative_path,
        directory=card_path.parent.name,
        birth_date=birth_date,
        main_photo=main_photo,
        place_type=place_type,
        source_type=source_type,
    )

def section_body(text: str, title: str) -> str:
    for match in SECTION_PATTERN.finditer(text):
        if match.group(1).strip() == title:
            return match.group(2).strip()
    return ""

def subsection_body(text: str, title: str) -> str:
    for match in SUBSECTION_PATTERN.finditer(text):
        if match.group(1).strip() == title:
            return match.group(2).strip()
    return ""

def table_values(section_text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    rows_started = False
    pending_key: str | None = None

    for line in section_text.splitlines():
        if line.strip() == "|===":
            if rows_started:
                break
            rows_started = True
            continue

        if not rows_started or not line.startswith("| "):
            continue

        value = line[2:].strip()
        if value == "Поле" and pending_key is None:
            continue
        if value == "Значение" and pending_key is None:
            continue
        if pending_key is None:
            pending_key = value
        else:
            values[pending_key] = value
            pending_key = None

    return values

def bullet_values(section_text: str) -> str:
    items = [line[2:].strip() for line in section_text.splitlines() if line.startswith("* ")]
    return "\n".join(item for item in items if item and item != "...")

def parse_table_rows(section_text: str, columns: int) -> list[list[str]]:
    rows: list[list[str]] = []
    rows_started = False
    current_row: list[str] = []
    header_skipped = False

    for line in section_text.splitlines():
        if line.strip() == "|===":
            if rows_started:
                break
            rows_started = True
            continue

        if not rows_started or not line.startswith("| "):
            continue

        current_row.append(line[2:].strip())
        if len(current_row) == columns:
            if not header_skipped:
                header_skipped = True
            else:
                rows.append(current_row)
            current_row = []

    return rows

def text_value(section_text: str) -> str:
    value = section_text.strip()
    return "" if value == "..." else value

def image_value(value: str) -> str:
    raw_value = value.strip()
    return "" if raw_value in {"", "..."} else raw_value

def blank_table_rows(columns: int, count: int = 2) -> list[str]:
    lines: list[str] = []
    for _ in range(count):
        for _ in range(columns):
            lines.append("| ")
        lines.append("")
    return lines
