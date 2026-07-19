from __future__ import annotations

import re
from html import escape
from pathlib import PurePosixPath

from server.models.card import CardRecord
from server.parsing import image_value
from server.storage.facts import (render_facts_table,
                                  render_rename_history_table,
                                  render_research_journal_table)
from server.storage.relations import render_relation_table
from server.textutil import compose_person_name, placeholder, safe_image_name


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
    surname = data.get("surname", "").strip()
    given = data.get("givenName", "").strip()
    patronymic = data.get("patronymic", "").strip()
    full_name = compose_person_name(surname, given, patronymic) or data.get("primaryName", "").strip()
    title = placeholder(full_name)
    return f"""{render_card_anchor(directory_name)}
= {number} {title}

[cols="3,1",frame=none,grid=none]
|===
a|
Номер карточки: `{number}`

Имя при рождении: `{placeholder(full_name)}`

Фамилия: `{placeholder(surname)}`

Имя: `{placeholder(given)}`

Отчество: `{placeholder(patronymic)}`

Девичья / вторая фамилия: `{placeholder(data.get("maidenName", ""))}`
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
