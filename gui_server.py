#!/usr/bin/env python3
from __future__ import annotations

import cgi
import json
import re
import shutil
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from html import escape
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import parse_qs, urlparse


APP_DIR = Path(__file__).resolve().parent
GUI_DIR = APP_DIR / "gui"
CONFIG_PATH = APP_DIR / "config.json"
TEMPLATE_DOCS_DIR = APP_DIR / "template-data" / "docs"
LEGACY_DOCS_DIR = APP_DIR.parent / "docs"
DEFAULT_WORKSPACE_DIR = APP_DIR / "workspace"
APP_HOST = "127.0.0.1"
APP_PORT = 8765
DOCS_DIR = LEGACY_DOCS_DIR if LEGACY_DOCS_DIR.exists() else DEFAULT_WORKSPACE_DIR / "docs"
PEOPLE_DIR = DOCS_DIR / "03-people"
GROUPS_DIR = DOCS_DIR / "04-groups"
PLACES_DIR = DOCS_DIR / "05-places"
SOURCES_DIR = DOCS_DIR / "06-sources"
RESEARCH_DIR = DOCS_DIR / "07-research"
PEOPLE_INDEX = PEOPLE_DIR / "index.adoc"
GROUPS_INDEX = GROUPS_DIR / "index.adoc"
PLACES_INDEX = PLACES_DIR / "index.adoc"
SOURCES_INDEX = SOURCES_DIR / "index.adoc"
RESEARCH_INDEX = RESEARCH_DIR / "index.adoc"
REGISTER_INDEX = DOCS_DIR / "02-register" / "index.adoc"
DOCS_WRITE_LOCK = threading.Lock()

CARD_NUMBER_PATTERN = re.compile(r"^\s*([КкKkCСcсГгGgМмMmИиSsВвVv])\s*-\s*(\d{3})\s*$")
NUMBER_LINE_PATTERN = re.compile(r"^Номер карточки:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)
PERSON_TITLE_PATTERN = re.compile(r"^Имя при рождении:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)
GROUP_TITLE_PATTERN = re.compile(
    r"^Название / обозначение группы:\s*`?([^`\n]+)`?\s*$",
    re.MULTILINE,
)
PLACE_TITLE_PATTERN = re.compile(r"^Актуальное название:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)
SOURCE_TITLE_PATTERN = re.compile(r"^Краткое название:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)
RESEARCH_TITLE_PATTERN = re.compile(r"^Название карточки:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)
PHOTO_PATTERN = re.compile(r"^image::images/([^\[]+)\[.*\]\s*$", re.MULTILINE)
SECTION_PATTERN = re.compile(r"^==\s+(.+?)\n\n(.*?)(?=^==\s+|\Z)", re.MULTILINE | re.DOTALL)
SUBSECTION_PATTERN = re.compile(r"^===\s+(.+?)\n\n(.*?)(?=^===\s+|\Z)", re.MULTILINE | re.DOTALL)
XREF_PATTERN = re.compile(r"^xref:([^\[]+)\[(.+)\]")


@dataclass
class CardRecord:
    card_type: str
    number: str
    title: str
    path: str
    directory: str
    birth_date: str = ""
    main_photo: str = ""
    place_type: str = ""
    source_type: str = ""

    @property
    def sort_key(self) -> tuple[int, str]:
        numeric = int(self.number.split("-")[1])
        return numeric, self.number

    @property
    def display_label(self) -> str:
        parts = [self.number, self.title]
        if self.birth_date:
            parts.append(self.birth_date)
        return " ".join(part for part in parts if part)


@dataclass
class CardDetails:
    card_type: str
    directory: str
    number: str
    primary_name: str
    main_photo: str = ""
    birth_date: str = ""
    sex: str = ""
    birth_place: str = ""
    death_date: str = ""
    death_place: str = ""
    parents: str = ""
    siblings: str = ""
    children: str = ""
    partners: str = ""
    groups: str = ""
    navigation_code: str = ""
    group_description: str = ""
    participants: str = ""
    place_type: str = ""
    rename_history: str = ""
    source_type: str = ""
    source_date: str = ""
    source_origin: str = ""
    source_storage: str = ""
    source_people: str = ""
    source_groups: str = ""
    source_places: str = ""
    source_summary: str = ""
    source_extracts: str = ""
    research_question: str = ""
    research_solution: str = ""
    research_journal: str = ""
    facts: str = ""
    notes: str = ""


@dataclass
class AppConfig:
    workspace_dir: Path
    host: str = APP_HOST
    port: int = APP_PORT


def placeholder(value: str) -> str:
    return value.strip() or "..."


def split_lines(value: str) -> list[str]:
    return [item.strip() for item in value.splitlines() if item.strip()]


def inline_items(value: str) -> str:
    items = split_lines(value)
    return "; ".join(items) if items else "..."


def expand_inline_items(value: str) -> str:
    raw_value = value.strip()
    if raw_value == "...":
        return ""
    return "\n".join(item.strip() for item in raw_value.split(";") if item.strip())


def bullet_items(value: str) -> str:
    items = split_lines(value)
    if not items:
        return "* ..."
    return "\n".join(f"* {item}" for item in items)


def normalize_card_number(raw_value: str, card_type: str) -> tuple[str, str]:
    match = CARD_NUMBER_PATTERN.match(raw_value or "")
    if not match:
        raise ValueError("Номер карточки должен быть в формате К-001, Г-001, М-001, И-001 или В-001.")

    raw_prefix, digits = match.groups()
    upper_prefix = raw_prefix.upper()
    if upper_prefix in {"Г", "G"}:
        normalized_type = "group"
    elif upper_prefix in {"М", "M"}:
        normalized_type = "place"
    elif upper_prefix in {"И", "S"}:
        normalized_type = "source"
    elif upper_prefix in {"В", "V"}:
        normalized_type = "research"
    else:
        normalized_type = "person"
    if normalized_type != card_type:
        expected = "Г-001" if card_type == "group" else "М-001" if card_type == "place" else "И-001" if card_type == "source" else "В-001" if card_type == "research" else "К-001"
        raise ValueError(f"Для этого типа карточки ожидается номер вида {expected}.")

    normalized_number = f"{'Г' if card_type == 'group' else 'М' if card_type == 'place' else 'И' if card_type == 'source' else 'В' if card_type == 'research' else 'К'}-{digits}"
    directory_name = f"{'G' if card_type == 'group' else 'M' if card_type == 'place' else 'S' if card_type == 'source' else 'R' if card_type == 'research' else 'C'}-{digits}"
    return normalized_number, directory_name


def card_root(card_type: str) -> Path:
    if card_type == "person":
        return PEOPLE_DIR
    if card_type == "group":
        return GROUPS_DIR
    if card_type == "place":
        return PLACES_DIR
    if card_type == "source":
        return SOURCES_DIR
    if card_type == "research":
        return RESEARCH_DIR
    raise ValueError("Неизвестный тип карточки.")


def configure_docs_root(root: Path) -> None:
    global DOCS_DIR, PEOPLE_DIR, GROUPS_DIR, PLACES_DIR, SOURCES_DIR, RESEARCH_DIR, PEOPLE_INDEX, GROUPS_INDEX, PLACES_INDEX, SOURCES_INDEX, RESEARCH_INDEX, REGISTER_INDEX
    DOCS_DIR = root
    PEOPLE_DIR = DOCS_DIR / "03-people"
    GROUPS_DIR = DOCS_DIR / "04-groups"
    PLACES_DIR = DOCS_DIR / "05-places"
    SOURCES_DIR = DOCS_DIR / "06-sources"
    RESEARCH_DIR = DOCS_DIR / "07-research"
    PEOPLE_INDEX = PEOPLE_DIR / "index.adoc"
    GROUPS_INDEX = GROUPS_DIR / "index.adoc"
    PLACES_INDEX = PLACES_DIR / "index.adoc"
    SOURCES_INDEX = SOURCES_DIR / "index.adoc"
    RESEARCH_INDEX = RESEARCH_DIR / "index.adoc"
    REGISTER_INDEX = DOCS_DIR / "02-register" / "index.adoc"


def resolve_config_path(config_path: Path | None = None) -> Path:
    return (config_path or CONFIG_PATH).resolve()


def load_app_config(config_path: Path | None = None) -> AppConfig:
    resolved_config_path = resolve_config_path(config_path)
    if not resolved_config_path.exists():
        if LEGACY_DOCS_DIR.exists():
            return AppConfig(workspace_dir=LEGACY_DOCS_DIR.parent)
        return AppConfig(workspace_dir=DEFAULT_WORKSPACE_DIR)

    payload = json.loads(resolved_config_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Конфигурационный файл должен содержать JSON-объект.")

    workspace_raw = str(payload.get("workspace_dir", "")).strip()
    if not workspace_raw:
        raise ValueError("В конфигурационном файле нужно указать workspace_dir.")

    workspace_dir = Path(workspace_raw)
    if not workspace_dir.is_absolute():
        workspace_dir = (resolved_config_path.parent / workspace_dir).resolve()

    host = str(payload.get("host", APP_HOST)).strip() or APP_HOST
    port_raw = payload.get("port", APP_PORT)
    try:
        port = int(port_raw)
    except (TypeError, ValueError) as error:
        raise ValueError("Поле port должно быть целым числом.") from error
    if port <= 0 or port > 65535:
        raise ValueError("Поле port должно быть в диапазоне 1..65535.")

    return AppConfig(workspace_dir=workspace_dir, host=host, port=port)


def bootstrap_workspace(workspace_dir: Path) -> None:
    docs_dir = workspace_dir / "docs"
    if docs_dir.exists() or not TEMPLATE_DOCS_DIR.exists():
        return

    workspace_dir.mkdir(parents=True, exist_ok=True)
    shutil.copytree(TEMPLATE_DOCS_DIR, docs_dir)


@contextmanager
def docs_override(root: Path):
    previous = (DOCS_DIR, PEOPLE_DIR, GROUPS_DIR, PLACES_DIR, SOURCES_DIR, RESEARCH_DIR, PEOPLE_INDEX, GROUPS_INDEX, PLACES_INDEX, SOURCES_INDEX, RESEARCH_INDEX, REGISTER_INDEX)
    configure_docs_root(root)
    try:
        yield
    finally:
        configure_docs_root(previous[0])


def safe_image_name(filename: str) -> str:
    candidate = Path(filename or "").name.strip()
    if not candidate or candidate in {".", ".."}:
        raise ValueError("Не удалось определить имя файла изображения.")
    if candidate.startswith("."):
        raise ValueError("Скрытые файлы изображений не поддерживаются.")
    return re.sub(r"[^0-9A-Za-zА-Яа-яЁё._-]+", "-", candidate)


def unique_image_name(images_dir: Path, filename: str) -> str:
    candidate = safe_image_name(filename)
    suffix = Path(candidate).suffix or ".png"
    tag = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    next_candidate = f"photo-{tag}{suffix}"
    if not (images_dir / next_candidate).exists():
        return next_candidate

    counter = 1
    while True:
        numbered = f"photo-{tag}-{counter}{suffix}"
        if not (images_dir / numbered).exists():
            return numbered
        counter += 1


def ensure_structure() -> None:
    for path in (PEOPLE_DIR, GROUPS_DIR, PLACES_DIR, SOURCES_DIR, RESEARCH_DIR, REGISTER_INDEX.parent):
        path.mkdir(parents=True, exist_ok=True)

    if not PEOPLE_INDEX.exists():
        PEOPLE_INDEX.write_text("== Карточки людей\n", encoding="utf-8")
    if not GROUPS_INDEX.exists():
        GROUPS_INDEX.write_text("== Карточки групп\n", encoding="utf-8")
    if not PLACES_INDEX.exists():
        PLACES_INDEX.write_text("== Карточки мест\n", encoding="utf-8")
    if not SOURCES_INDEX.exists():
        SOURCES_INDEX.write_text("== Карточки источников\n", encoding="utf-8")
    if not RESEARCH_INDEX.exists():
        RESEARCH_INDEX.write_text("== Карточки исследований\n", encoding="utf-8")
    if not REGISTER_INDEX.exists():
        REGISTER_INDEX.write_text("== Реестр карточек\n", encoding="utf-8")


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
    relative_path = card_path.relative_to(DOCS_DIR).as_posix()
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


def blank_table_rows(columns: int, count: int = 2) -> list[str]:
    lines: list[str] = []
    for _ in range(count):
        for _ in range(columns):
            lines.append("| ")
        lines.append("")
    return lines


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


def read_card_details(card_type: str, directory_name: str) -> CardDetails:
    if card_type not in {"person", "group", "place", "source", "research"}:
        raise ValueError("Неизвестный тип карточки.")

    root = card_root(card_type)
    card_path = root / directory_name / "card.adoc"
    if not card_path.exists():
        raise FileNotFoundError("Карточка не найдена.")

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

    details = CardDetails(
        card_type=card_type,
        directory=directory_name,
        number=number_match.group(1).strip() if number_match else "",
        primary_name=title_match.group(1).strip() if title_match else "",
    )
    photo_match = PHOTO_PATTERN.search(text)
    details.main_photo = image_value(photo_match.group(1) if photo_match else "")

    if card_type == "person":
        basic = table_values(section_body(text, "Основные сведения"))
        relations_section = section_body(text, "Родственные связи")
        details.birth_date = text_value(basic.get("Дата рождения", ""))
        details.sex = text_value(basic.get("Пол", ""))
        details.birth_place = text_value(basic.get("Место рождения", ""))
        details.death_date = text_value(basic.get("Дата смерти", ""))
        details.death_place = text_value(basic.get("Место смерти", ""))

        if "=== " in relations_section:
            details.parents = relation_entries_json(parse_relation_table(subsection_body(relations_section, "Родители"), "parents"))
            details.siblings = relation_entries_json(parse_relation_table(subsection_body(relations_section, "Братья / сестры"), "siblings"))
            details.children = relation_entries_json(parse_relation_table(subsection_body(relations_section, "Дети"), "children"))
            details.partners = relation_entries_json(parse_relation_table(subsection_body(relations_section, "Партнёры"), "partners"))
            details.groups = relation_entries_json(parse_relation_table(subsection_body(relations_section, "Группы"), "groups"))
        else:
            relations = table_values(relations_section)
            details.parents = relation_entries_json(parse_relation_payload(expand_inline_items(relations.get("Родители", "")), "parents"))
            details.siblings = relation_entries_json(parse_relation_payload(expand_inline_items(relations.get("Братья / сестры", "")), "siblings"))
            details.children = relation_entries_json(parse_relation_payload(expand_inline_items(relations.get("Дети", "")), "children"))
            details.partners = relation_entries_json(parse_relation_payload(expand_inline_items(relations.get("Партнёры", "")), "partners"))
            details.groups = relation_entries_json(parse_relation_payload(expand_inline_items(relations.get("Группы", "")), "groups"))
        details.navigation_code = text_value(section_body(text, "Навигационный шифр"))
    elif card_type == "group":
        basic = table_values(section_body(text, "Основные сведения"))
        details.group_description = text_value(basic.get("Описание / причина группировки", ""))
        participants_section = section_body(text, "Состав группы")
        if participants_section:
            details.participants = relation_entries_json(parse_relation_table(participants_section, "participants"))
        else:
            details.participants = relation_entries_json(parse_relation_payload(expand_inline_items(basic.get("Участники", "")), "participants"))
    elif card_type == "place":
        basic = table_values(section_body(text, "Основные сведения"))
        details.place_type = text_value(basic.get("Тип места", ""))
        details.rename_history = rename_history_rows(section_body(text, "Переименования"))
    elif card_type == "source":
        basic = table_values(section_body(text, "Основные сведения"))
        related_section = section_body(text, "Связанные карточки")
        details.source_type = text_value(basic.get("Тип источника", ""))
        details.source_date = text_value(basic.get("Дата / период", ""))
        details.source_origin = text_value(basic.get("Откуда получен", ""))
        details.source_storage = text_value(basic.get("Где хранится", ""))
        details.source_summary = text_value(section_body(text, "Краткое содержание"))
        details.source_extracts = text_value(section_body(text, "Извлечённые факты"))

        if "=== " in related_section:
            details.source_people = relation_entries_json(parse_relation_table(subsection_body(related_section, "Люди"), "sourcePeople"))
            details.source_groups = relation_entries_json(parse_relation_table(subsection_body(related_section, "Группы"), "sourceGroups"))
            details.source_places = relation_entries_json(parse_relation_table(subsection_body(related_section, "Места"), "sourcePlaces"))
        else:
            related = table_values(related_section)
            details.source_people = relation_entries_json(parse_relation_payload(expand_inline_items(related.get("Люди", "")), "sourcePeople"))
            details.source_groups = relation_entries_json(parse_relation_payload(expand_inline_items(related.get("Группы", "")), "sourceGroups"))
            details.source_places = relation_entries_json(parse_relation_payload(expand_inline_items(related.get("Места", "")), "sourcePlaces"))
    else:
        details.research_question = text_value(section_body(text, "Вопрос"))
        details.research_solution = text_value(section_body(text, "Решение"))
        details.research_journal = research_journal_rows(section_body(text, "Дневник"))

    if card_type in {"person", "group"}:
        details.facts = facts_rows(section_body(text, "Исторические факты"))
    if card_type != "research":
        details.notes = text_value(section_body(text, "Примечания"))
    return details


def collect_cards(card_type: str) -> list[CardRecord]:
    root = card_root(card_type)
    cards: list[CardRecord] = []
    for card_path in sorted(root.glob("*/card.adoc")):
        cards.append(parse_card(card_path, card_type))
    return sorted(cards, key=lambda item: item.sort_key)


def details_to_payload(details: CardDetails) -> dict[str, str]:
    return {
        "cardType": details.card_type,
        "editDirectory": details.directory,
        "cardNumber": details.number,
        "primaryName": details.primary_name,
        "mainPhoto": details.main_photo,
        "birthDate": details.birth_date,
        "sex": details.sex,
        "birthPlace": details.birth_place,
        "deathDate": details.death_date,
        "deathPlace": details.death_place,
        "parents": details.parents,
        "siblings": details.siblings,
        "children": details.children,
        "partners": details.partners,
        "groups": details.groups,
        "navigationCode": details.navigation_code,
        "groupDescription": details.group_description,
        "participants": details.participants,
        "placeType": details.place_type,
        "renameHistory": details.rename_history,
        "sourceType": details.source_type,
        "sourceDate": details.source_date,
        "sourceOrigin": details.source_origin,
        "sourceStorage": details.source_storage,
        "sourcePeople": details.source_people,
        "sourceGroups": details.source_groups,
        "sourcePlaces": details.source_places,
        "sourceSummary": details.source_summary,
        "sourceExtracts": details.source_extracts,
        "researchQuestion": details.research_question,
        "researchSolution": details.research_solution,
        "researchJournal": details.research_journal,
        "facts": details.facts,
        "notes": details.notes,
    }


def normalize_payload_relations(payload: dict[str, str], card_type: str) -> None:
    if card_type == "person":
        for field_name in ("parents", "siblings", "children", "partners", "groups"):
            payload[field_name] = relation_entries_json(renumber_relation_entries(parse_relation_payload(payload.get(field_name, ""), field_name)))
    elif card_type == "group":
        payload["participants"] = relation_entries_json(
            renumber_relation_entries(parse_relation_payload(payload.get("participants", ""), "participants"))
        )
    elif card_type == "source":
        for field_name in ("sourcePeople", "sourceGroups", "sourcePlaces"):
            payload[field_name] = relation_entries_json(
                renumber_relation_entries(parse_relation_payload(payload.get(field_name, ""), field_name))
            )


def write_card_details(details: CardDetails) -> None:
    root = card_root(details.card_type)
    card_path = root / details.directory / "card.adoc"
    renderer = (
        render_person_card
        if details.card_type == "person"
        else render_group_card
        if details.card_type == "group"
        else render_place_card
        if details.card_type == "place"
        else render_source_card
        if details.card_type == "source"
        else render_research_card
    )
    card_path.write_text(renderer(details_to_payload(details), details.number, details.directory), encoding="utf-8")


def person_display_label(number: str, primary_name: str, birth_date: str) -> str:
    parts = [number, primary_name]
    if birth_date.strip():
        parts.append(birth_date.strip())
    return " ".join(part for part in parts if part)


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
    root = PEOPLE_DIR.resolve() if target_type == "person" else GROUPS_DIR.resolve()
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


def reciprocal_xref(
    source_type: str,
    target_type: str,
    current_directory: str,
    number: str,
    primary_name: str,
    birth_date: str = "",
) -> str:
    label = person_display_label(number, primary_name, birth_date) if source_type == "person" else " ".join(
        part for part in [number, primary_name] if part
    )

    if target_type == "person" and source_type == "person":
        path = f"../{current_directory}/card.adoc"
    elif target_type == "person" and source_type == "group":
        path = f"../../04-groups/{current_directory}/card.adoc"
    elif target_type == "group" and source_type == "person":
        path = f"../../03-people/{current_directory}/card.adoc"
    else:
        path = f"../{current_directory}/card.adoc"

    return f"xref:{path}[{label}]"


def sync_person_relationships(
    current_directory: str,
    payload: dict[str, str],
    previous_details: CardDetails | None,
) -> None:
    reciprocal_fields = {
        "parents": "children",
        "children": "parents",
        "siblings": "siblings",
        "partners": "partners",
    }

    current_ref = reciprocal_xref(
        "person",
        "person",
        current_directory,
        payload.get("cardNumber", "").strip(),
        payload.get("primaryName", "").strip(),
        payload.get("birthDate", "").strip(),
    )

    current_card_dir = PEOPLE_DIR / current_directory

    old_values = {
        "parents": previous_details.parents if previous_details else "",
        "children": previous_details.children if previous_details else "",
        "siblings": previous_details.siblings if previous_details else "",
        "partners": previous_details.partners if previous_details else "",
    }
    new_values = {
        "parents": payload.get("parents", ""),
        "children": payload.get("children", ""),
        "siblings": payload.get("siblings", ""),
        "partners": payload.get("partners", ""),
    }

    for field_name, reciprocal_field in reciprocal_fields.items():
        old_entries = parse_relation_payload(old_values[field_name], field_name)
        new_entries = parse_relation_payload(new_values[field_name], field_name)
        old_dirs = {
            target_dir
            for entry in old_entries
            if (target_dir := relation_target_directory(entry["value"], current_card_dir, "person")) is not None
        }
        new_dirs = {
            target_dir
            for entry in new_entries
            if (target_dir := relation_target_directory(entry["value"], current_card_dir, "person")) is not None
        }

        for target_dir in old_dirs | new_dirs:
            target_details = read_card_details("person", target_dir)
            target_card_dir = PEOPLE_DIR / target_dir
            existing_entries = parse_relation_payload(getattr(target_details, reciprocal_field), reciprocal_field)
            existing_entries = [
                entry
                for entry in existing_entries
                if relation_target_directory(entry["value"], target_card_dir, "person") != current_directory
            ]

            if target_dir in new_dirs:
                existing_entries = append_relation_entry(existing_entries, reciprocal_field, current_ref)

            setattr(target_details, reciprocal_field, relation_entries_json(renumber_relation_entries(existing_entries)))
            write_card_details(target_details)


def sync_person_group_relationships(
    current_type: str,
    current_directory: str,
    payload: dict[str, str],
    previous_details: CardDetails | None,
) -> None:
    current_card_dir = (PEOPLE_DIR if current_type == "person" else GROUPS_DIR) / current_directory
    target_type = "group" if current_type == "person" else "person"
    source_field = "groups" if current_type == "person" else "participants"
    reciprocal_field = "participants" if current_type == "person" else "groups"

    old_entries = parse_relation_payload(getattr(previous_details, source_field, "") if previous_details else "", source_field)
    new_entries = parse_relation_payload(payload.get(source_field, ""), source_field)

    old_dirs = {
        target_dir
        for entry in old_entries
        if (target_dir := relation_target_directory(entry["value"], current_card_dir, target_type)) is not None
    }
    new_dirs = {
        target_dir
        for entry in new_entries
        if (target_dir := relation_target_directory(entry["value"], current_card_dir, target_type)) is not None
    }

    current_ref = reciprocal_xref(
        current_type,
        target_type,
        current_directory,
        payload.get("cardNumber", "").strip(),
        payload.get("primaryName", "").strip(),
        payload.get("birthDate", "").strip(),
    )

    for target_dir in old_dirs | new_dirs:
        target_details = read_card_details(target_type, target_dir)
        target_card_dir = (PEOPLE_DIR if target_type == "person" else GROUPS_DIR) / target_dir
        existing_entries = parse_relation_payload(getattr(target_details, reciprocal_field), reciprocal_field)
        existing_entries = [
            entry
            for entry in existing_entries
            if relation_target_directory(entry["value"], target_card_dir, current_type) != current_directory
        ]

        if target_dir in new_dirs:
            existing_entries = append_relation_entry(existing_entries, reciprocal_field, current_ref)

        setattr(target_details, reciprocal_field, relation_entries_json(renumber_relation_entries(existing_entries)))
        write_card_details(target_details)


def render_photo_block(card_type: str, directory_name: str, photo_name: str) -> str:
    normalized = image_value(photo_name)
    if not normalized:
        return ""
    root_dir = "03-people" if card_type == "person" else "04-groups" if card_type == "group" else "05-places" if card_type == "place" else "06-sources"
    book_path = f"{root_dir}/{directory_name}/images/{normalized}"
    local_path = f"images/{normalized}"
    return (
        'ifeval::["{doctype}" == "book"]\n'
        f"image::{book_path}[pdfwidth=35mm,width=160,align=center]\n"
        "endif::[]\n"
        'ifeval::["{doctype}" != "book"]\n'
        f"image::{local_path}[pdfwidth=35mm,width=160,align=center]\n"
        "endif::[]"
    )


def render_card_anchor(directory_name: str) -> str:
    return f"[#card-{directory_name.lower()}]"


def render_person_card(data: dict[str, str], number: str, directory_name: str) -> str:
    photo_name = image_value(data.get("mainPhoto", ""))
    photo_cell = render_photo_block("person", directory_name, photo_name)
    title = placeholder(data.get("primaryName", "").strip()) or "..."
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

[cols="3,1",frame=none,grid=none]
|===
a|
Номер карточки: `{number}`

Имя при рождении: `{placeholder(data.get("primaryName", ""))}`
a|
{photo_cell}
|===

== Основные сведения

[cols="1,3",options="header"]
|===
| Поле
| Значение

| Дата рождения
| {placeholder(data.get("birthDate", ""))}

| Пол
| {placeholder(data.get("sex", ""))}

| Место рождения
| {placeholder(data.get("birthPlace", ""))}

| Дата смерти
| {placeholder(data.get("deathDate", ""))}

| Место смерти
| {placeholder(data.get("deathPlace", ""))}

| 
| 

| 
| 
|===

== Родственные связи

=== Родители

{render_relation_table("parents", data.get("parents", ""))}

=== Братья / сестры

{render_relation_table("siblings", data.get("siblings", ""))}

=== Дети

{render_relation_table("children", data.get("children", ""))}

=== Партнёры

{render_relation_table("partners", data.get("partners", ""))}

=== Группы

{render_relation_table("groups", data.get("groups", ""))}

== Навигационный шифр

{placeholder(data.get("navigationCode", ""))}

== Исторические факты

{render_facts_table(data.get("facts", ""))}

== Примечания

{placeholder(data.get("notes", ""))}
"""


def render_group_card(data: dict[str, str], number: str, directory_name: str) -> str:
    photo_name = image_value(data.get("mainPhoto", ""))
    photo_cell = render_photo_block("group", directory_name, photo_name)
    title = placeholder(data.get("primaryName", "").strip()) or "..."
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

[cols="3,1",frame=none,grid=none]
|===
a|
Номер карточки: `{number}`

Название / обозначение группы: `{placeholder(data.get("primaryName", ""))}`
a|
{photo_cell}
|===

== Основные сведения

[cols="1,3",options="header"]
|===
| Поле
| Значение

| Описание / причина группировки
| {placeholder(data.get("groupDescription", ""))}

| 
| 

| 
| 
|===

== Состав группы

=== Участники

{render_relation_table("participants", data.get("participants", ""))}

== Исторические факты

{render_facts_table(data.get("facts", ""))}

== Примечания

{placeholder(data.get("notes", ""))}
"""


def render_place_card(data: dict[str, str], number: str, directory_name: str) -> str:
    photo_name = image_value(data.get("mainPhoto", ""))
    photo_cell = render_photo_block("place", directory_name, photo_name)
    title = placeholder(data.get("primaryName", "").strip()) or "..."
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

[cols="3,1",frame=none,grid=none]
|===
a|
Номер карточки: `{number}`

Актуальное название: `{placeholder(data.get("primaryName", ""))}`
a|
{photo_cell}
|===

== Основные сведения

[cols="1,3",options="header"]
|===
| Поле
| Значение

| Тип места
| {placeholder(data.get("placeType", ""))}

| 
| 

| 
| 
|===

== Переименования

{render_rename_history_table(data.get("renameHistory", ""))}

== Примечания

{placeholder(data.get("notes", ""))}
"""


def render_source_card(data: dict[str, str], number: str, directory_name: str) -> str:
    photo_name = image_value(data.get("mainPhoto", ""))
    photo_cell = render_photo_block("source", directory_name, photo_name)
    title = placeholder(data.get("primaryName", "").strip()) or "..."
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

[cols="3,1",frame=none,grid=none]
|===
a|
Номер карточки: `{number}`

Краткое название: `{placeholder(data.get("primaryName", ""))}`
a|
{photo_cell}
|===

== Основные сведения

[cols="1,3",options="header"]
|===
| Поле
| Значение

| Тип источника
| {placeholder(data.get("sourceType", ""))}

| Дата / период
| {placeholder(data.get("sourceDate", ""))}

| Откуда получен
| {placeholder(data.get("sourceOrigin", ""))}

| Где хранится
| {placeholder(data.get("sourceStorage", ""))}

| 
| 

| 
| 
|===

== Связанные карточки

=== Люди

{render_relation_table("sourcePeople", data.get("sourcePeople", ""))}

=== Группы

{render_relation_table("sourceGroups", data.get("sourceGroups", ""))}

=== Места

{render_relation_table("sourcePlaces", data.get("sourcePlaces", ""))}

== Краткое содержание

{placeholder(data.get("sourceSummary", ""))}

== Извлечённые факты

{placeholder(data.get("sourceExtracts", ""))}

== Примечания

{placeholder(data.get("notes", ""))}
"""


def render_research_card(data: dict[str, str], number: str, directory_name: str) -> str:
    title = placeholder(data.get("primaryName", "").strip()) or "..."
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

Номер карточки: `{number}`

Название карточки: `{placeholder(data.get("primaryName", ""))}`

== Вопрос

{placeholder(data.get("researchQuestion", ""))}

== Решение

{placeholder(data.get("researchSolution", ""))}

== Дневник

{render_research_journal_table(data.get("researchJournal", ""))}
"""


def render_section_index(title: str, cards: list[CardRecord]) -> str:
    lines = [f"== {title}", ""]
    for card in cards:
        lines.extend(
            [
                f"include::{card.directory}/card.adoc[leveloffset=+2]",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def render_register(
    people_cards: list[CardRecord],
    group_cards: list[CardRecord],
    place_cards: list[CardRecord],
    source_cards: list[CardRecord],
    research_cards: list[CardRecord],
) -> str:
    lines = [
        "== Реестр карточек",
        "",
        "Реестр содержит краткий указатель по всем карточкам картотеки.",
        "",
        "=== Карточки людей",
        "",
        '[cols="1,4",options="header"]',
        "|===",
        "| Номер",
        "| Имя при рождении",
        "",
    ]

    if people_cards:
        for card in people_cards:
            lines.extend(
                [
                    f"| xref:../03-people/{card.directory}/card.adoc[{card.number}]",
                    f"| {card.title}",
                    "",
                ]
            )
    else:
        lines.extend(["|", "|", ""])

    lines.extend(
        [
            "|===",
            "",
            "=== Карточки групп",
            "",
            '[cols="1,4",options="header"]',
            "|===",
            "| Номер",
            "| Краткое описание",
            "",
        ]
    )

    if group_cards:
        for card in group_cards:
            lines.extend(
                [
                    f"| xref:../04-groups/{card.directory}/card.adoc[{card.number}]",
                    f"| {card.title}",
                    "",
                ]
            )
    else:
        lines.extend(["|", "|", ""])

    lines.extend(
        [
            "|===",
            "",
            "=== Карточки мест",
            "",
            '[cols="1,4",options="header"]',
            "|===",
            "| Номер",
            "| Актуальное название",
            "",
        ]
    )

    if place_cards:
        for card in place_cards:
            lines.extend(
                [
                    f"| xref:../05-places/{card.directory}/card.adoc[{card.number}]",
                    f"| {card.title}",
                    "",
                ]
            )
    else:
        lines.extend(["|", "|", ""])

    lines.extend(
        [
            "|===",
            "",
            "=== Карточки источников",
            "",
            '[cols="1,4",options="header"]',
            "|===",
            "| Номер",
            "| Краткое название",
            "",
        ]
    )

    if source_cards:
        for card in source_cards:
            lines.extend(
                [
                    f"| xref:../06-sources/{card.directory}/card.adoc[{card.number}]",
                    f"| {card.title}",
                    "",
                ]
            )
    else:
        lines.extend(["|", "|", ""])

    lines.extend(
        [
            "|===",
            "",
            "=== Карточки исследований",
            "",
            '[cols="1,4",options="header"]',
            "|===",
            "| Номер",
            "| Название карточки",
            "",
        ]
    )

    if research_cards:
        for card in research_cards:
            lines.extend(
                [
                    f"| xref:../07-research/{card.directory}/card.adoc[{card.number}]",
                    f"| {card.title}",
                    "",
                ]
            )
    else:
        lines.extend(["|", "|", ""])

    lines.extend(["|===", ""])
    return "\n".join(lines)


def rebuild_indexes() -> None:
    people_cards = collect_cards("person")
    group_cards = collect_cards("group")
    place_cards = collect_cards("place")
    source_cards = collect_cards("source")
    research_cards = collect_cards("research")
    PEOPLE_INDEX.write_text(render_section_index("Карточки людей", people_cards), encoding="utf-8")
    GROUPS_INDEX.write_text(render_section_index("Карточки групп", group_cards), encoding="utf-8")
    PLACES_INDEX.write_text(render_section_index("Карточки мест", place_cards), encoding="utf-8")
    SOURCES_INDEX.write_text(render_section_index("Карточки источников", source_cards), encoding="utf-8")
    RESEARCH_INDEX.write_text(render_section_index("Карточки исследований", research_cards), encoding="utf-8")
    REGISTER_INDEX.write_text(render_register(people_cards, group_cards, place_cards, source_cards, research_cards), encoding="utf-8")


def create_card(payload: dict[str, str]) -> str:
    card_type = payload.get("cardType", "").strip()
    if card_type not in {"person", "group", "place", "source", "research"}:
        raise ValueError("Неизвестный тип карточки.")

    normalize_payload_relations(payload, card_type)
    normalized_number, directory_name = normalize_card_number(payload.get("cardNumber", ""), card_type)
    root = card_root(card_type)
    card_dir = root / directory_name
    card_path = card_dir / "card.adoc"
    if card_path.exists():
        raise FileExistsError(f"Карточка {normalized_number} уже существует.")

    card_dir.mkdir(parents=True, exist_ok=False)
    (card_dir / "images").mkdir()
    (card_dir / "images" / ".gitkeep").write_text("", encoding="utf-8")

    renderer = (
        render_person_card
        if card_type == "person"
        else render_group_card
        if card_type == "group"
        else render_place_card
        if card_type == "place"
        else render_source_card
        if card_type == "source"
        else render_research_card
    )
    card_path.write_text(renderer(payload, normalized_number, directory_name), encoding="utf-8")
    if card_type == "person":
        sync_person_relationships(directory_name, payload, None)
    if card_type in {"person", "group"}:
        sync_person_group_relationships(card_type, directory_name, payload, None)
    rebuild_indexes()
    return card_path.relative_to(DOCS_DIR).as_posix()


def update_card(payload: dict[str, str]) -> str:
    card_type = payload.get("cardType", "").strip()
    if card_type not in {"person", "group", "place", "source", "research"}:
        raise ValueError("Неизвестный тип карточки.")

    normalize_payload_relations(payload, card_type)
    directory_name = payload.get("editDirectory", "").strip()
    if not directory_name:
        raise ValueError("Не указан каталог редактируемой карточки.")

    normalized_number, expected_directory = normalize_card_number(payload.get("cardNumber", ""), card_type)
    if directory_name != expected_directory:
        raise ValueError("Изменение номера карточки через режим редактирования не поддерживается.")

    root = card_root(card_type)
    card_path = root / directory_name / "card.adoc"
    if not card_path.exists():
        raise FileNotFoundError(f"Карточка {normalized_number} не найдена.")

    previous_details = read_card_details(card_type, directory_name)
    renderer = (
        render_person_card
        if card_type == "person"
        else render_group_card
        if card_type == "group"
        else render_place_card
        if card_type == "place"
        else render_source_card
        if card_type == "source"
        else render_research_card
    )
    card_path.write_text(renderer(payload, normalized_number, directory_name), encoding="utf-8")
    if card_type == "person":
        sync_person_relationships(directory_name, payload, previous_details)
    if card_type in {"person", "group"}:
        sync_person_group_relationships(card_type, directory_name, payload, previous_details)
    rebuild_indexes()
    return card_path.relative_to(DOCS_DIR).as_posix()


def upload_image(card_type: str, directory_name: str, filename: str, fileobj: Any) -> str:
    root = card_root(card_type)
    card_dir = root / directory_name
    if not (card_dir / "card.adoc").exists():
        raise FileNotFoundError("Карточка не найдена.")

    images_dir = card_dir / "images"
    image_name = unique_image_name(images_dir, filename)
    image_path = card_dir / "images" / image_name
    with image_path.open("wb") as handle:
        shutil.copyfileobj(fileobj, handle)
    return image_name


def list_images(card_type: str, directory_name: str) -> list[dict[str, Any]]:
    card_dir = card_root(card_type) / directory_name
    if not (card_dir / "card.adoc").exists():
        raise FileNotFoundError("Карточка не найдена.")

    images_dir = card_dir / "images"
    images: list[dict[str, Any]] = []
    for path in images_dir.iterdir():
        if not path.is_file() or path.name == ".gitkeep" or path.name.startswith("."):
            continue
        stat = path.stat()
        added_at = getattr(stat, "st_birthtime", stat.st_mtime)
        images.append({"name": path.name, "added_at": added_at})

    return sorted(images, key=lambda item: item["added_at"])


def delete_image(card_type: str, directory_name: str, filename: str) -> None:
    card_dir = card_root(card_type) / directory_name
    card_path = card_dir / "card.adoc"
    if not card_path.exists():
        raise FileNotFoundError("Карточка не найдена.")

    image_name = safe_image_name(filename)
    image_path = card_dir / "images" / image_name
    if not image_path.exists() or not image_path.is_file():
        raise FileNotFoundError("Изображение не найдено.")

    image_path.unlink()

    details = read_card_details(card_type, directory_name)
    if details.main_photo == image_name:
        details.main_photo = ""
        write_card_details(details)
        rebuild_indexes()


def preview_asset_url(card_type: str, directory_name: str, target: str) -> str:
    candidate = target.strip()
    if not candidate:
        return ""

    pure_path = PurePosixPath(candidate)
    if pure_path.parts[:1] == ("images",) and len(pure_path.parts) >= 2:
        image_name = safe_image_name(pure_path.name)
        return (
            f"/api/image?type={card_type}&directory={directory_name}&name={image_name}"
        )
    return ""


def render_inline_preview(text: str, card_type: str, directory_name: str) -> str:
    escaped = escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*([^*\n]+)\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"_([^_\n]+)_", r"<em>\1</em>", escaped)

    def replace_xref(match: re.Match[str]) -> str:
        path, label = match.groups()
        return f'<span class="preview-link">{escape(label)}</span>'

    def replace_link(match: re.Match[str]) -> str:
        url, label = match.groups()
        return f'<a href="{escape(url)}" target="_blank" rel="noreferrer">{escape(label)}</a>'

    escaped = re.sub(r"xref:([^\[]+)\[([^\]]+)\]", replace_xref, escaped)
    escaped = re.sub(r"link:([^\[]+)\[([^\]]+)\]", replace_link, escaped)
    return escaped


def render_notes_preview(text: str, card_type: str, directory_name: str) -> str:
    blocks = re.split(r"\n\s*\n", text.strip())
    html_blocks: list[str] = []

    for block in blocks:
        if not block.strip():
            continue

        stripped = block.strip()
        image_match = re.fullmatch(r"image::([^\[]+)\[([^\]]*)\]", stripped)
        if image_match:
            path, alt = image_match.groups()
            asset_url = preview_asset_url(card_type, directory_name, path)
            if asset_url:
                figure = [
                    '<figure class="notes-preview-image">',
                    f'<img src="{asset_url}" alt="{escape(alt or path)}" />',
                ]
                if alt:
                    figure.append(f"<figcaption>{escape(alt)}</figcaption>")
                figure.append("</figure>")
                html_blocks.append("".join(figure))
            else:
                html_blocks.append(f'<p class="notes-preview-raw">{escape(stripped)}</p>')
            continue

        if all(line.startswith("* ") for line in stripped.splitlines()):
            items = "".join(
                f"<li>{render_inline_preview(line[2:].strip(), card_type, directory_name)}</li>"
                for line in stripped.splitlines()
            )
            html_blocks.append(f"<ul>{items}</ul>")
            continue

        if all(line.startswith(". ") for line in stripped.splitlines()):
            items = "".join(
                f"<li>{render_inline_preview(line[2:].strip(), card_type, directory_name)}</li>"
                for line in stripped.splitlines()
            )
            html_blocks.append(f"<ol>{items}</ol>")
            continue

        lines = "<br />".join(
            render_inline_preview(line, card_type, directory_name)
            for line in stripped.splitlines()
        )
        html_blocks.append(f"<p>{lines}</p>")

    if not html_blocks:
        return '<p class="notes-preview-empty">Предпросмотр появится здесь.</p>'
    return "".join(html_blocks)


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


def birth_sort_key(value: str) -> tuple[int, Any]:
    raw_value = value.strip()
    if not raw_value:
        return (2, "")
    for fmt in ("%d.%m.%Y", "%d.%m.%y"):
        try:
            return (0, datetime.strptime(raw_value, fmt))
        except ValueError:
            continue
    return (1, raw_value)


def person_relation_directories(value: str, source_directory: str) -> list[str]:
    source_card_dir = PEOPLE_DIR / source_directory
    directories: list[str] = []
    field_name = "siblings"
    if '"native"' in value or value.strip().startswith("["):
        field_name = "siblings"
    for entry in parse_relation_payload(value, field_name):
        target_directory = relation_target_directory(entry["value"], source_card_dir, "person")
        if target_directory is not None:
            directories.append(target_directory)
    return directories


def parent_relation_entries(value: str, source_directory: str) -> list[dict[str, Any]]:
    source_card_dir = PEOPLE_DIR / source_directory
    entries: list[dict[str, Any]] = []
    for entry in parse_relation_payload(value, "parents"):
        target_directory = relation_target_directory(entry["value"], source_card_dir, "person")
        if target_directory is None:
            continue
        entries.append(
            {
                "index": entry["index"],
                "directory": target_directory,
                "is_native": bool(entry.get("native")),
            }
        )
    entries.sort(key=lambda item: int(item["index"]))
    return entries


def parent_token_candidates(
    current_directory: str,
    token: str,
    details_index: dict[str, CardDetails],
    records_index: dict[str, CardRecord],
) -> tuple[list[str], str]:
    current_details = details_index[current_directory]
    parent_entries = parent_relation_entries(current_details.parents, current_directory)
    sex_filter = "женский" if token == "М" else "мужской"

    sex_matched = [
        entry["directory"]
        for entry in parent_entries
        if details_index.get(entry["directory"]) is not None
        and details_index[entry["directory"]].sex == sex_filter
    ]
    native_sex_matched = [
        entry["directory"]
        for entry in parent_entries
        if entry["is_native"]
        and details_index.get(entry["directory"]) is not None
        and details_index[entry["directory"]].sex == sex_filter
    ]

    if native_sex_matched:
        return list(dict.fromkeys(native_sex_matched)), ""
    if sex_matched:
        return list(dict.fromkeys(sex_matched)), "Точного признака родства нет, выбран кандидат только по полу."

    fallback_native = [entry["directory"] for entry in parent_entries if entry["is_native"]]
    if fallback_native:
        return list(dict.fromkeys(fallback_native)), "Не хватает данных о поле, использован только признак родства."

    return [], "По текущим данным родитель не определяется."


def sorted_person_directories(
    directories: list[str],
    records: dict[tuple[str, str], CardRecord],
) -> list[str]:
    return sorted(
        directories,
        key=lambda directory: (
            birth_sort_key(records[("person", directory)].birth_date) if ("person", directory) in records else (2, ""),
            records[("person", directory)].sort_key if ("person", directory) in records else (9999, directory),
        ),
    )


def person_graph_details() -> tuple[dict[str, CardRecord], dict[str, CardDetails]]:
    records = {
        record.directory: record
        for record in collect_cards("person")
    }
    details = {
        directory: read_card_details("person", directory)
        for directory in records
    }
    return records, details


def child_code_token(
    current_directory: str,
    target_directory: str,
    details_index: dict[str, CardDetails],
    records_index: dict[str, CardRecord],
) -> str | None:
    current_details = details_index.get(current_directory)
    if current_details is None:
        return None
    source_card_dir = PEOPLE_DIR / current_directory
    for entry in parse_relation_payload(current_details.children, "children"):
        if relation_target_directory(entry["value"], source_card_dir, "person") == target_directory:
            return f"Р{entry['index']}"
    return None


def sibling_code_token(
    current_directory: str,
    target_directory: str,
    details_index: dict[str, CardDetails],
    records_index: dict[str, CardRecord],
) -> str | None:
    current_details = details_index.get(current_directory)
    if current_details is None:
        return None
    source_card_dir = PEOPLE_DIR / current_directory
    for entry in parse_relation_payload(current_details.siblings, "siblings"):
        if relation_target_directory(entry["value"], source_card_dir, "person") == target_directory:
            return f"С{entry['index']}"
    return None


def partner_code_token(
    current_directory: str,
    target_directory: str,
    details_index: dict[str, CardDetails],
    records_index: dict[str, CardRecord],
) -> str | None:
    current_details = details_index.get(current_directory)
    if current_details is None:
        return None
    source_card_dir = PEOPLE_DIR / current_directory
    for entry in parse_relation_payload(current_details.partners, "partners"):
        if relation_target_directory(entry["value"], source_card_dir, "person") == target_directory:
            return f"П{entry['index']}"
    return None


def navigation_variants(source_directory: str, target_directory: str) -> dict[str, Any]:
    records_index, details_index = person_graph_details()
    if source_directory not in records_index or target_directory not in records_index:
        raise FileNotFoundError("Карточка не найдена.")

    if source_directory == target_directory:
        source_number = records_index[source_directory].number
        return {
            "status": "resolved",
            "variants": [{"code": source_number, "steps": 0}],
            "message": "Опорная и целевая карточки совпадают.",
        }

    def adjacency(directory: str) -> list[tuple[str, str]]:
        details = details_index[directory]
        neighbors: list[tuple[str, str]] = []
        for parent_directory in person_relation_directories(details.parents, directory):
            neighbors.append((parent_directory, "parent"))
        for child_directory in person_relation_directories(details.children, directory):
            neighbors.append((child_directory, "child"))
        for sibling_directory in person_relation_directories(details.siblings, directory):
            neighbors.append((sibling_directory, "sibling"))
        for partner_directory in person_relation_directories(details.partners, directory):
            neighbors.append((partner_directory, "partner"))
        return sorted(
            list(dict.fromkeys(neighbors)),
            key=lambda item: (
                {"parent": 0, "sibling": 1, "partner": 2, "child": 3}.get(item[1], 9),
                records_index[item[0]].sort_key,
            ),
        )

    queue: list[tuple[str, list[tuple[str, str]], set[str]]] = [(source_directory, [], {source_directory})]
    found_paths: list[list[tuple[str, str]]] = []
    shortest_length: int | None = None

    while queue:
        current_directory, path, visited = queue.pop(0)
        if shortest_length is not None and len(path) >= shortest_length:
            continue

        for neighbor_directory, relation_kind in adjacency(current_directory):
            if neighbor_directory in visited:
                continue

            next_path = path + [(neighbor_directory, relation_kind)]
            if neighbor_directory == target_directory:
                shortest_length = len(next_path)
                found_paths.append(next_path)
                continue

            queue.append((neighbor_directory, next_path, visited | {neighbor_directory}))

    if not found_paths:
        return {
            "status": "unreachable",
            "variants": [],
            "message": "Путь по текущим связям не найден.",
        }

    source_number = records_index[source_directory].number
    variants: list[dict[str, Any]] = []
    seen_codes: set[str] = set()

    for path in found_paths:
        code_parts = [[source_number]]
        current_directory = source_directory

        for next_directory, relation_kind in path:
            if relation_kind == "parent":
                next_options = []
                mother_dirs, _ = parent_token_candidates(current_directory, "М", details_index, records_index)
                father_dirs, _ = parent_token_candidates(current_directory, "О", details_index, records_index)
                if next_directory in mother_dirs:
                    next_options.append("М")
                if next_directory in father_dirs:
                    next_options.append("О")
            elif relation_kind == "child":
                token = child_code_token(current_directory, next_directory, details_index, records_index)
                next_options = [token] if token else []
            elif relation_kind == "partner":
                token = partner_code_token(current_directory, next_directory, details_index, records_index)
                next_options = [token] if token else []
            else:
                token = sibling_code_token(current_directory, next_directory, details_index, records_index)
                next_options = [token] if token else []

            if not next_options:
                code_parts = []
                break

            updated_parts: list[list[str]] = []
            for prefix in code_parts:
                for option in next_options:
                    updated_parts.append(prefix + [option])
            code_parts = updated_parts
            current_directory = next_directory

        for parts in code_parts[:16]:
            code = "-".join(parts)
            if code in seen_codes:
                continue
            seen_codes.add(code)
            variants.append({"code": code, "steps": len(path)})

    variants.sort(key=lambda item: (item["steps"], item["code"]))
    return {
        "status": "resolved",
        "variants": variants[:24],
        "message": "Найденные варианты построены по текущим связям карточек.",
    }


def navigation_card_payload(record: CardRecord) -> dict[str, str]:
    return {
        "directory": record.directory,
        "number": record.number,
        "title": record.title,
        "display_label": record.display_label,
        "path": record.path,
    }


def parse_navigation_code_segments(code: str) -> tuple[str, list[str]]:
    raw_value = code.strip()
    if not raw_value:
        return "", []

    match = re.match(r"^([^-]+-\d{3})(?:-(.+))?$", raw_value)
    if not match:
        raise ValueError("Не удалось разобрать навигационный шифр.")

    base = match.group(1).strip()
    tokens = match.group(2).split("-") if match.group(2) else []
    cleaned = [token.strip() for token in tokens if token.strip()]
    for token in cleaned:
        if token in {"М", "О"}:
            continue
        if re.match(r"^[СРП]\d{2}$", token):
            continue
        raise ValueError(f"Недопустимый сегмент шифра: {token}")
    return base, cleaned


def resolve_navigation_segments(anchor_directory: str, code: str) -> dict[str, Any]:
    records_index, details_index = person_graph_details()
    if anchor_directory not in records_index:
        raise FileNotFoundError("Опорная карточка не найдена.")

    base, tokens = parse_navigation_code_segments(code)
    anchor_record = records_index[anchor_directory]
    if base and base != anchor_record.number:
        raise ValueError("База шифра не совпадает с выбранной опорной карточкой.")

    current_directories = [anchor_directory]
    steps: list[dict[str, Any]] = []

    for token in tokens:
        next_directories: list[str] = []
        message = ""

        if token in {"М", "О"}:
            for current_directory in current_directories:
                matched_directories, note = parent_token_candidates(current_directory, token, details_index, records_index)
                next_directories.extend(matched_directories)
                if note and not message:
                    message = note
            next_directories = list(dict.fromkeys(next_directories))
            if len(next_directories) > 1 and not message:
                message = "Текущие данные не позволяют однозначно определить родителя."
        elif token.startswith("Р"):
            expected_index = token[1:]
            for current_directory in current_directories:
                source_card_dir = PEOPLE_DIR / current_directory
                for entry in parse_relation_payload(details_index[current_directory].children, "children"):
                    if entry["index"] != expected_index:
                        continue
                    target_directory = relation_target_directory(entry["value"], source_card_dir, "person")
                    if target_directory is not None:
                        next_directories.append(target_directory)
            next_directories = list(dict.fromkeys(next_directories))
        elif token.startswith("С"):
            expected_index = token[1:]
            for current_directory in current_directories:
                source_card_dir = PEOPLE_DIR / current_directory
                for entry in parse_relation_payload(details_index[current_directory].siblings, "siblings"):
                    if entry["index"] != expected_index:
                        continue
                    target_directory = relation_target_directory(entry["value"], source_card_dir, "person")
                    if target_directory is not None:
                        next_directories.append(target_directory)
            next_directories = list(dict.fromkeys(next_directories))
        elif token.startswith("П"):
            expected_index = token[1:]
            for current_directory in current_directories:
                source_card_dir = PEOPLE_DIR / current_directory
                for entry in parse_relation_payload(details_index[current_directory].partners, "partners"):
                    if entry["index"] != expected_index:
                        continue
                    target_directory = relation_target_directory(entry["value"], source_card_dir, "person")
                    if target_directory is not None:
                        next_directories.append(target_directory)
            next_directories = list(dict.fromkeys(next_directories))
        else:
            steps.append(
                {
                    "segment": token,
                    "status": "unresolved",
                    "candidates": [],
                    "message": "Неизвестный тип перехода.",
                }
            )
            break

        if not next_directories:
            steps.append(
                {
                    "segment": token,
                    "status": "unresolved",
                    "candidates": [],
                    "message": "По текущим связям переход не найден.",
                }
            )
            break

        candidates = [navigation_card_payload(records_index[directory]) for directory in next_directories]
        if len(candidates) == 1:
            steps.append(
                {
                    "segment": token,
                    "status": "resolved",
                    "primary": candidates[0],
                    "candidates": candidates,
                    "message": "",
                }
            )
        else:
            steps.append(
                {
                    "segment": token,
                    "status": "ambiguous",
                    "primary": candidates[0],
                    "candidates": candidates,
                    "message": message or "Найдено несколько возможных карточек.",
                }
            )

        current_directories = next_directories

    return {
        "anchor": navigation_card_payload(anchor_record),
        "steps": steps,
    }


def resolve_navigation_target(anchor_directory: str, code: str) -> tuple[str | None, str]:
    try:
        _, tokens = parse_navigation_code_segments(code)
        payload = resolve_navigation_segments(anchor_directory, code)
    except (FileNotFoundError, ValueError) as error:
        return None, str(error)

    if not tokens:
        return anchor_directory, ""

    steps = payload.get("steps", [])
    if len(steps) != len(tokens):
        return None, "Шифр не удалось разрешить полностью."
    if any(step.get("status") != "resolved" for step in steps):
        return None, "Шифр разрешается неоднозначно или содержит разрыв."

    final_step = steps[-1]
    primary = final_step.get("primary") or {}
    return primary.get("directory"), ""


def navigation_code_anchor_directory(code: str, records_index: dict[str, CardRecord]) -> str | None:
    try:
        base, _ = parse_navigation_code_segments(code)
    except ValueError:
        return None

    for directory, record in records_index.items():
        if record.number == base:
            return directory
    return None


def collect_navigation_intents(exclude_directory: str | None = None) -> list[dict[str, str]]:
    records_index, details_index = person_graph_details()
    intents: list[dict[str, str]] = []

    for directory, details in details_index.items():
        if directory == exclude_directory:
            continue
        code = details.navigation_code.strip()
        if not code:
            continue
        anchor_directory = navigation_code_anchor_directory(code, records_index)
        if not anchor_directory:
            continue
        target_directory, error = resolve_navigation_target(anchor_directory, code)
        if not target_directory:
            continue
        intents.append(
            {
                "directory": directory,
                "anchor_directory": anchor_directory,
                "target_directory": target_directory,
                "old_code": code,
                "error": error,
            }
        )

    return intents


def cascade_navigation_codes(intents: list[dict[str, str]]) -> dict[str, Any]:
    records_index, _ = person_graph_details()
    updates: list[dict[str, str]] = []
    conflicts: list[dict[str, str]] = []

    for intent in intents:
        target_directory = intent["target_directory"]
        anchor_directory = intent["anchor_directory"]
        try:
            variants_payload = navigation_variants(anchor_directory, target_directory)
        except FileNotFoundError:
            conflicts.append(
                {
                    "directory": intent["directory"],
                    "old_code": intent["old_code"],
                    "reason": "Не удалось определить новую цель шифра.",
                }
            )
            continue

        variants = variants_payload.get("variants", [])
        if variants_payload.get("status") != "resolved" or not variants:
            conflicts.append(
                {
                    "directory": intent["directory"],
                    "old_code": intent["old_code"],
                    "reason": variants_payload.get("message", "Путь по текущим связям не найден."),
                }
            )
            continue

        old_code = intent["old_code"]
        variant_codes = [item["code"] for item in variants]
        if len(variants) == 1:
            new_code = variants[0]["code"]
        elif old_code in variant_codes:
            new_code = old_code
        else:
            conflicts.append(
                {
                    "directory": intent["directory"],
                    "old_code": old_code,
                    "reason": "После изменения связей для цели найдено несколько шифров.",
                }
            )
            continue

        if new_code == old_code:
            continue

        details = read_card_details("person", intent["directory"])
        details.navigation_code = new_code
        write_card_details(details)
        record = records_index.get(intent["directory"])
        updates.append(
            {
                "directory": intent["directory"],
                "number": record.number if record else intent["directory"],
                "title": record.title if record else "",
                "old_code": old_code,
                "new_code": new_code,
            }
        )

    return {"navigation_updates": updates, "navigation_conflicts": conflicts}


def save_card_with_navigation_updates(payload: dict[str, str], mode: str, preview: bool = False) -> dict[str, Any]:
    card_type = payload.get("cardType", "").strip()
    edit_directory = payload.get("editDirectory", "").strip()
    exclude_directory = edit_directory if card_type == "person" and edit_directory else None

    intents = collect_navigation_intents(exclude_directory=exclude_directory)

    def apply_save() -> dict[str, Any]:
        path = create_card(payload) if mode == "create" else update_card(payload)
        summary = {"navigation_updates": [], "navigation_conflicts": []}
        if card_type == "person":
            summary = cascade_navigation_codes(intents)
            rebuild_indexes()
        return {"path": path, **summary}

    if not preview:
        if card_type == "person":
            preview_result = save_card_with_navigation_updates(payload, mode, preview=True)
            if preview_result.get("navigation_conflicts"):
                return preview_result
        return apply_save()

    with tempfile.TemporaryDirectory(prefix="family-tree-preview-") as temp_dir:
        temp_docs = Path(temp_dir) / "docs"
        shutil.copytree(DOCS_DIR, temp_docs)
        with docs_override(temp_docs):
            ensure_structure()
            return apply_save()


def record_index() -> dict[tuple[str, str], CardRecord]:
    records: dict[tuple[str, str], CardRecord] = {}
    for card_type in ("person", "group", "place", "source", "research"):
        for record in collect_cards(card_type):
            records[(card_type, record.directory)] = record
    return records


def build_graph_node(record: CardRecord, center_id: str) -> dict[str, str]:
    node_id = f"{record.card_type}:{record.directory}"
    return {
        "id": node_id,
        "card_type": record.card_type,
        "directory": record.directory,
        "number": record.number,
        "title": record.title,
        "birth_date": record.birth_date,
        "main_photo": record.main_photo,
        "path": record.path,
        "display_label": record.display_label,
        "is_center": node_id == center_id,
    }


def append_graph_relation(
    lanes: dict[str, list[str]],
    lane_name: str,
    source_type: str,
    source_directory: str,
    target_type: str,
    raw_value: str,
    center_id: str,
    records: dict[tuple[str, str], CardRecord],
    nodes: dict[str, dict[str, str]],
    edges: set[tuple[str, str, str]],
) -> None:
    source_card_dir = (PEOPLE_DIR if source_type == "person" else GROUPS_DIR) / source_directory
    target_directory = relation_target_directory(raw_value, source_card_dir, target_type)
    if target_directory is None:
        return

    record = records.get((target_type, target_directory))
    if record is None:
        return

    node = build_graph_node(record, center_id)
    nodes[node["id"]] = node
    lanes[lane_name].append(node["id"])
    edges.add((center_id, node["id"], lane_name))


def graph_payload(card_type: str, directory_name: str) -> dict[str, Any]:
    details = read_card_details(card_type, directory_name)
    records = record_index()
    center_record = records.get((card_type, directory_name))
    if center_record is None:
        raise FileNotFoundError("Карточка не найдена.")

    center_id = f"{card_type}:{directory_name}"
    nodes: dict[str, dict[str, str]] = {center_id: build_graph_node(center_record, center_id)}
    edges: set[tuple[str, str, str]] = set()

    if card_type == "person":
        lanes = {
            "parents": [],
            "siblings": [],
            "children": [],
            "partners": [],
            "groups": [],
        }
        for entry in parse_relation_payload(details.parents, "parents"):
            append_graph_relation(
                lanes, "parents", "person", directory_name, "person", entry["value"], center_id, records, nodes, edges
            )
        for entry in parse_relation_payload(details.siblings, "siblings"):
            append_graph_relation(
                lanes, "siblings", "person", directory_name, "person", entry["value"], center_id, records, nodes, edges
            )
        for entry in parse_relation_payload(details.children, "children"):
            append_graph_relation(
                lanes, "children", "person", directory_name, "person", entry["value"], center_id, records, nodes, edges
            )
        for entry in parse_relation_payload(details.partners, "partners"):
            append_graph_relation(
                lanes, "partners", "person", directory_name, "person", entry["value"], center_id, records, nodes, edges
            )
        for entry in parse_relation_payload(details.groups, "groups"):
            append_graph_relation(
                lanes, "groups", "person", directory_name, "group", entry["value"], center_id, records, nodes, edges
            )
    else:
        participants: list[str] = []
        for entry in parse_relation_payload(details.participants, "participants"):
            target_directory = relation_target_directory(entry["value"], GROUPS_DIR / directory_name, "person")
            if target_directory is None:
                continue
            record = records.get(("person", target_directory))
            if record is None:
                continue
            node = build_graph_node(record, center_id)
            nodes[node["id"]] = node
            participants.append(node["id"])

        lanes = {
            "participants_top": participants[: (len(participants) + 1) // 2],
            "participants_bottom": participants[(len(participants) + 1) // 2 :],
        }
        for participant_id in participants:
            edges.add((center_id, participant_id, "participants"))

    unique_lanes = {name: list(dict.fromkeys(values)) for name, values in lanes.items()}
    return {
        "center": center_id,
        "graph_type": "focus",
        "card_type": card_type,
        "directory": directory_name,
        "nodes": sorted(nodes.values(), key=lambda item: item["id"]),
        "edges": [
            {"from": source_id, "to": target_id, "kind": kind}
            for source_id, target_id, kind in sorted(edges)
        ],
        "lanes": unique_lanes,
    }


def graph_overview_payload() -> dict[str, Any]:
    records, details_index = person_graph_details()
    nodes = [build_graph_node(record, "") for record in records.values()]
    edges: set[tuple[str, str, str]] = set()

    for directory, details in details_index.items():
        source_id = f"person:{directory}"
        source_dir_path = PEOPLE_DIR / directory

        for entry in parse_relation_payload(details.parents, "parents"):
            target_directory = relation_target_directory(entry["value"], source_dir_path, "person")
            if target_directory is None or target_directory not in records:
                continue
            parent_id = f"person:{target_directory}"
            edges.add((parent_id, source_id, "parent"))

    normalized_edges = []
    for left, right, kind in sorted(edges):
        normalized_edges.append({"from": left, "to": right, "kind": kind})

    return {
        "graph_type": "overview",
        "card_type": "person",
        "scope": "people",
        "nodes": sorted(nodes, key=lambda item: item["number"]),
        "edges": normalized_edges,
    }


class GuiHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(GUI_DIR), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/cards":
            self.send_json(HTTPStatus.OK, state_payload())
            return

        if parsed.path == "/api/card":
            params = parse_qs(parsed.query)
            card_type = params.get("type", [""])[0]
            directory = params.get("directory", [""])[0]
            try:
                details = read_card_details(card_type, directory)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, details.__dict__)
            return

        if parsed.path == "/api/image":
            params = parse_qs(parsed.query)
            card_type = params.get("type", [""])[0]
            directory = params.get("directory", [""])[0]
            filename = params.get("name", [""])[0]
            try:
                image_name = safe_image_name(filename)
                image_path = card_root(card_type) / directory / "images" / image_name
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            if not image_path.exists() or not image_path.is_file():
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Изображение не найдено."})
                return

            content = image_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", self.guess_type(str(image_path)))
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if parsed.path == "/api/images":
            params = parse_qs(parsed.query)
            card_type = params.get("type", [""])[0]
            directory = params.get("directory", [""])[0]
            try:
                images = list_images(card_type, directory)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, {"images": images})
            return

        if parsed.path == "/api/graph":
            params = parse_qs(parsed.query)
            card_type = params.get("type", [""])[0]
            directory = params.get("directory", [""])[0]
            try:
                payload = graph_payload(card_type, directory)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, payload)
            return

        if parsed.path == "/api/graph-overview":
            try:
                payload = graph_overview_payload()
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return
            self.send_json(HTTPStatus.OK, payload)
            return

        if parsed.path == "/api/navigation-code":
            params = parse_qs(parsed.query)
            source_directory = params.get("from", [""])[0]
            target_directory = params.get("to", [""])[0]
            if not source_directory or not target_directory:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Нужно указать карточки 'from' и 'to'."})
                return
            try:
                payload = navigation_variants(source_directory, target_directory)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, payload)
            return

        if parsed.path == "/api/navigation-resolve":
            params = parse_qs(parsed.query)
            anchor_directory = params.get("anchor", [""])[0]
            code = params.get("code", [""])[0]
            if not anchor_directory:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Нужно указать опорную карточку."})
                return
            try:
                payload = resolve_navigation_segments(anchor_directory, code)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, payload)
            return

        if self.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self) -> None:
        if self.path == "/api/notes-preview":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Тело запроса должно быть JSON."})
                return

            card_type = payload.get("cardType", "").strip() or "person"
            directory = payload.get("directory", "").strip()
            html = render_notes_preview(payload.get("text", ""), card_type, directory)
            self.send_json(HTTPStatus.OK, {"html": html})
            return

        if self.path == "/api/upload-image":
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={
                    "REQUEST_METHOD": "POST",
                    "CONTENT_TYPE": self.headers.get("Content-Type", ""),
                    "CONTENT_LENGTH": self.headers.get("Content-Length", "0"),
                },
            )
            card_type = form.getfirst("cardType", "")
            directory = form.getfirst("directory", "")
            upload = form["file"] if "file" in form else None
            if upload is None or not getattr(upload, "file", None):
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Файл изображения не передан."})
                return
            try:
                image_name = upload_image(card_type, directory, upload.filename or "", upload.file)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, {"filename": image_name})
            return

        if self.path == "/api/cards/preview":
            content_length = int(self.headers.get("Content-Length", "0"))
            raw_body = self.rfile.read(content_length)
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except json.JSONDecodeError:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Тело запроса должно быть JSON."})
                return

            mode = "update" if payload.get("editDirectory", "").strip() else "create"
            try:
                with DOCS_WRITE_LOCK:
                    preview_result = save_card_with_navigation_updates(payload, mode, preview=True)
            except FileExistsError as error:
                self.send_json(HTTPStatus.CONFLICT, {"error": str(error)})
                return
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, preview_result)
            return

        if self.path != "/api/cards":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            with DOCS_WRITE_LOCK:
                result = save_card_with_navigation_updates(payload, "create", preview=False)
            if result.get("navigation_conflicts"):
                self.send_json(HTTPStatus.CONFLICT, result)
                return
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Тело запроса должно быть JSON."})
            return
        except FileExistsError as error:
            self.send_json(HTTPStatus.CONFLICT, {"error": str(error)})
            return
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self.send_json(HTTPStatus.CREATED, result)

    def do_PUT(self) -> None:
        if self.path != "/api/cards":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            with DOCS_WRITE_LOCK:
                result = save_card_with_navigation_updates(payload, "update", preview=False)
            if result.get("navigation_conflicts"):
                self.send_json(HTTPStatus.CONFLICT, result)
                return
        except json.JSONDecodeError:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Тело запроса должно быть JSON."})
            return
        except FileNotFoundError as error:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
            return
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self.send_json(HTTPStatus.OK, result)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/image":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        params = parse_qs(parsed.query)
        card_type = params.get("type", [""])[0]
        directory = params.get("directory", [""])[0]
        filename = params.get("name", [""])[0]
        try:
            delete_image(card_type, directory, filename)
        except FileNotFoundError as error:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
            return
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        self.send_json(HTTPStatus.OK, {"deleted": True})


def main() -> None:
    try:
        app_config = load_app_config()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise SystemExit(f"Config error: {error}") from error
    bootstrap_workspace(app_config.workspace_dir)
    configure_docs_root(app_config.workspace_dir / "docs")
    ensure_structure()
    rebuild_indexes()
    server = ThreadingHTTPServer((app_config.host, app_config.port), GuiHandler)
    print(f"GUI server is running on http://{app_config.host}:{app_config.port}")
    print(f"Docs workspace: {DOCS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


if __name__ == "__main__":
    main()
