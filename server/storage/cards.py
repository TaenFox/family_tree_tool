from __future__ import annotations

import shutil

from server.constants import (GROUP_TITLE_PATTERN, NUMBER_LINE_PATTERN,
                              PERSON_GIVEN_PATTERN, PERSON_MAIDEN_PATTERN,
                              PERSON_PATRONYMIC_PATTERN,
                              PERSON_SURNAME_PATTERN, PERSON_TITLE_PATTERN,
                              PHOTO_PATTERN, PLACE_TITLE_PATTERN,
                              RESEARCH_TITLE_PATTERN, SOURCE_TITLE_PATTERN)
from server.models.card import CardDetails, CardRecord
from server.parsing import (image_value, parse_card, section_body,
                            subsection_body, table_values, text_value)
from server.storage.facts import (facts_rows, rename_history_rows,
                                  research_journal_rows)
from server.storage.relations import (append_relation_entry,
                                      parse_relation_payload,
                                      parse_relation_table,
                                      relation_entries_json,
                                      relation_target_directory,
                                      renumber_relation_entries)
from server.storage.rendering import (render_group_card, render_person_card,
                                      render_place_card, render_register,
                                      render_research_card,
                                      render_section_index, render_source_card)
from server.textutil import (clean_field, compose_person_name,
                             expand_inline_items, normalize_card_number)
from server.web_server import runtime
from server.web_server.runtime import card_root


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
        surname_match = PERSON_SURNAME_PATTERN.search(text)
        given_match = PERSON_GIVEN_PATTERN.search(text)
        patronymic_match = PERSON_PATRONYMIC_PATTERN.search(text)
        details.surname = clean_field(surname_match.group(1)) if surname_match else ""
        details.given_name = clean_field(given_match.group(1)) if given_match else ""
        details.patronymic = clean_field(patronymic_match.group(1)) if patronymic_match else ""
        maiden_match = PERSON_MAIDEN_PATTERN.search(text)
        details.maiden_name = clean_field(maiden_match.group(1)) if maiden_match else ""
        if not any((details.surname, details.given_name, details.patronymic)):
            # Обратная совместимость со старыми карточками без разбитого имени:
            # кладём всё имя в «Имя», чтобы ничего не потерять.
            details.given_name = details.primary_name

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
        "surname": details.surname,
        "givenName": details.given_name,
        "patronymic": details.patronymic,
        "maidenName": details.maiden_name,
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
        composed = compose_person_name(
            payload.get("surname", ""),
            payload.get("givenName", ""),
            payload.get("patronymic", ""),
        )
        if composed:
            payload["primaryName"] = composed
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

    current_card_dir = runtime.PEOPLE_DIR / current_directory

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
            target_card_dir = runtime.PEOPLE_DIR / target_dir
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
    current_card_dir = (runtime.PEOPLE_DIR if current_type == "person" else runtime.GROUPS_DIR) / current_directory
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
        target_card_dir = (runtime.PEOPLE_DIR if target_type == "person" else runtime.GROUPS_DIR) / target_dir
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

def rebuild_indexes() -> None:
    people_cards = collect_cards("person")
    group_cards = collect_cards("group")
    place_cards = collect_cards("place")
    source_cards = collect_cards("source")
    research_cards = collect_cards("research")
    runtime.PEOPLE_INDEX.write_text(render_section_index("Карточки людей", people_cards), encoding="utf-8")
    runtime.GROUPS_INDEX.write_text(render_section_index("Карточки групп", group_cards), encoding="utf-8")
    runtime.PLACES_INDEX.write_text(render_section_index("Карточки мест", place_cards), encoding="utf-8")
    runtime.SOURCES_INDEX.write_text(render_section_index("Карточки источников", source_cards), encoding="utf-8")
    runtime.RESEARCH_INDEX.write_text(render_section_index("Карточки исследований", research_cards), encoding="utf-8")
    runtime.REGISTER_INDEX.write_text(render_register(people_cards, group_cards, place_cards, source_cards, research_cards), encoding="utf-8")

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
    return card_path.relative_to(runtime.DOCS_DIR).as_posix()

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
    return card_path.relative_to(runtime.DOCS_DIR).as_posix()

def delete_card(card_type: str, directory_name: str) -> None:
    root = card_root(card_type)
    # Защита от выхода за пределы каталога типа (path traversal).
    card_dir = (root / directory_name).resolve()
    if root.resolve() not in card_dir.parents:
        raise ValueError("Некорректный каталог карточки.")

    card_path = card_dir / "card.adoc"
    if not card_path.exists():
        raise FileNotFoundError("Карточка не найдена.")

    shutil.rmtree(card_dir)
    rebuild_indexes()
