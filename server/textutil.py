from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path

from server.constants import CARD_NUMBER_PATTERN


def placeholder(value: str) -> str:
    return value.strip() or "..."

def clean_field(value: str) -> str:
    """Прочитанное значение поля: убирает плейсхолдер «...»."""
    value = str(value).strip()
    return "" if value == "..." else value

def compose_person_name(surname: str, given: str, patronymic: str) -> str:
    """Полное имя в порядке «Фамилия Имя Отчество» без пустых частей."""
    return " ".join(part for part in (surname.strip(), given.strip(), patronymic.strip()) if part)

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
