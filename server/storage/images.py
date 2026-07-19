from __future__ import annotations

import shutil
from typing import Any

from server.storage.cards import (read_card_details, rebuild_indexes,
                                  write_card_details)
from server.textutil import safe_image_name, unique_image_name
from server.web.runtime import card_root


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
