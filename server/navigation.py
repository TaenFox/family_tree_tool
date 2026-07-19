from __future__ import annotations

import re
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from server.models.card import CardDetails, CardRecord
from server.storage.cards import (collect_cards, create_card,
                                  read_card_details, rebuild_indexes,
                                  update_card, write_card_details)
from server.storage.relations import (parse_relation_payload,
                                      relation_target_directory)
from server.web import runtime
from server.web.runtime import docs_override, ensure_structure


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
    source_card_dir = runtime.PEOPLE_DIR / source_directory
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
    source_card_dir = runtime.PEOPLE_DIR / source_directory
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
    source_card_dir = runtime.PEOPLE_DIR / current_directory
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
    source_card_dir = runtime.PEOPLE_DIR / current_directory
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
    source_card_dir = runtime.PEOPLE_DIR / current_directory
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
            "variants": [{"code": source_number, "steps": 0, "cards": [navigation_card_payload(records_index[source_directory])]}],
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
            "message": "Маршрут по текущим связям не найден.",
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
            route_cards = [navigation_card_payload(records_index[source_directory])]
            route_cards.extend(navigation_card_payload(records_index[directory]) for directory, _ in path)
            variants.append({"code": code, "steps": len(path), "cards": route_cards})

    variants.sort(key=lambda item: (item["steps"], item["code"]))
    return {
        "status": "resolved",
        "variants": variants[:24],
        "message": "Найденные маршруты построены по текущим связям карточек.",
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
                source_card_dir = runtime.PEOPLE_DIR / current_directory
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
                source_card_dir = runtime.PEOPLE_DIR / current_directory
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
                source_card_dir = runtime.PEOPLE_DIR / current_directory
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
        shutil.copytree(runtime.DOCS_DIR, temp_docs)
        with docs_override(temp_docs):
            ensure_structure()
            return apply_save()

def record_index() -> dict[tuple[str, str], CardRecord]:
    records: dict[tuple[str, str], CardRecord] = {}
    for card_type in ("person", "group", "place", "source", "research"):
        for record in collect_cards(card_type):
            records[(card_type, record.directory)] = record
    return records
