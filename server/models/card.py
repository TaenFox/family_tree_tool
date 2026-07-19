from __future__ import annotations

from dataclasses import dataclass


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
    surname: str = ""
    given_name: str = ""
    patronymic: str = ""
    maiden_name: str = ""
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
