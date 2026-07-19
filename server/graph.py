from __future__ import annotations

from typing import Any

from server.models.card import CardRecord
from server.navigation import person_graph_details, record_index
from server.storage.cards import read_card_details
from server.storage.relations import (parse_relation_payload,
                                      relation_target_directory)
from server.web_server import runtime


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
    source_card_dir = (runtime.PEOPLE_DIR if source_type == "person" else runtime.GROUPS_DIR) / source_directory
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
            target_directory = relation_target_directory(entry["value"], runtime.GROUPS_DIR / directory_name, "person")
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
        source_dir_path = runtime.PEOPLE_DIR / directory

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
