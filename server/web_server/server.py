from __future__ import annotations

import cgi
import json
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler
from typing import Any
from urllib.parse import parse_qs, urlparse

from server.constants import GUI_DIR
from server.graph import graph_overview_payload, graph_payload
from server.navigation import (navigation_variants,
                               resolve_navigation_segments,
                               save_card_with_navigation_updates)
from server.storage.cards import delete_card, read_card_details
from server.storage.images import delete_image, list_images, upload_image
from server.storage.places import search_place_suggestions
from server.storage.rendering import render_notes_preview
from server.textutil import safe_image_name
from server.web_server.runtime import DOCS_WRITE_LOCK, card_root
from server.web_server.state import state_payload


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

        if parsed.path == "/api/place-suggest":
            params = parse_qs(parsed.query)
            query = params.get("q", [""])[0]
            try:
                limit = max(1, min(20, int(params.get("limit", ["8"])[0])))
            except ValueError:
                limit = 8
            self.send_json(HTTPStatus.OK, {"suggestions": search_place_suggestions(query, limit)})
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
        if parsed.path == "/api/card":
            params = parse_qs(parsed.query)
            card_type = params.get("type", [""])[0]
            directory = params.get("directory", [""])[0]
            try:
                with DOCS_WRITE_LOCK:
                    delete_card(card_type, directory)
            except FileNotFoundError as error:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": str(error)})
                return
            except ValueError as error:
                self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
                return

            self.send_json(HTTPStatus.OK, {"deleted": True})
            return

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
