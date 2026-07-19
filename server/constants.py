from __future__ import annotations

from pathlib import Path
import re
APP_DIR = Path(__file__).resolve().parent.parent

GUI_DIR = APP_DIR / "static"

CONFIG_PATH = APP_DIR / "config.json"

TEMPLATE_DOCS_DIR = APP_DIR / "template-data" / "docs"

LEGACY_DOCS_DIR = APP_DIR.parent / "docs"

DEFAULT_WORKSPACE_DIR = APP_DIR / "workspace"

APP_HOST = "127.0.0.1"

APP_PORT = 8765

CARD_NUMBER_PATTERN = re.compile(r"^\s*([КкKkCСcсГгGgМмMmИиSsВвVv])\s*-\s*(\d{3})\s*$")

NUMBER_LINE_PATTERN = re.compile(r"^Номер карточки:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)

PERSON_TITLE_PATTERN = re.compile(r"^Имя при рождении:\s*`?([^`\n]+)`?\s*$", re.MULTILINE)

PERSON_SURNAME_PATTERN = re.compile(r"^Фамилия:\s*`?([^`\n]*)`?\s*$", re.MULTILINE)

PERSON_GIVEN_PATTERN = re.compile(r"^Имя:\s*`?([^`\n]*)`?\s*$", re.MULTILINE)

PERSON_PATRONYMIC_PATTERN = re.compile(r"^Отчество:\s*`?([^`\n]*)`?\s*$", re.MULTILINE)

PERSON_MAIDEN_PATTERN = re.compile(r"^Девичья / вторая фамилия:\s*`?([^`\n]*)`?\s*$", re.MULTILINE)

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
