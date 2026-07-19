from __future__ import annotations

import json
import shutil
import threading
from contextlib import contextmanager
from pathlib import Path

from server.constants import (APP_HOST, APP_PORT, CONFIG_PATH,
                              DEFAULT_WORKSPACE_DIR, LEGACY_DOCS_DIR,
                              TEMPLATE_DOCS_DIR)
from server.models.server_config import AppConfig

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
