from __future__ import annotations

import json
from typing import Any

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from server.constants import GUI_DIR
from server.graph import graph_overview_payload, graph_payload
from server.navigation import (navigation_variants,
                               resolve_navigation_segments,
                               save_card_with_navigation_updates)
from server.storage.cards import collect_cards, delete_card, read_card_details
from server.storage.images import delete_image, list_images, upload_image
from server.storage.places import search_place_suggestions
from server.storage.rendering import render_notes_preview
from server.textutil import safe_image_name
from server.web.runtime import DOCS_WRITE_LOCK, card_root

app = FastAPI(title="Family Tree Tool")


# --- cross-cutting behaviour ------------------------------------------------

@app.middleware("http")
async def no_store_headers(request: Request, call_next: Any) -> Response:
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


@app.exception_handler(FileNotFoundError)
def _handle_not_found(request: Request, exc: FileNotFoundError) -> JSONResponse:
    return _error(404, str(exc))


@app.exception_handler(FileExistsError)
def _handle_exists(request: Request, exc: FileExistsError) -> JSONResponse:
    return _error(409, str(exc))


@app.exception_handler(ValueError)
def _handle_value_error(request: Request, exc: ValueError) -> JSONResponse:
    return _error(400, str(exc))


def _load_json(raw: bytes) -> dict[str, Any]:
    try:
        return json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Тело запроса должно быть JSON.")


# --- read endpoints ---------------------------------------------------------

@app.get("/api/cards")
def api_cards() -> Any:
    cards = {
        "people": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("person")
        ],
        "groups": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("group")
        ],
        "places": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("place")
        ],
        "sources": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("source")
        ],
        "researches": [
            {
                **record.__dict__,
                "display_label": record.display_label,
            }
            for record in collect_cards("research")
        ],
    }
    return cards


@app.get("/api/card")
def api_card(type: str = "", directory: str = "") -> Any:
    return read_card_details(type, directory).__dict__


@app.get("/api/image")
def api_image(type: str = "", directory: str = "", name: str = "") -> Response:
    image_name = safe_image_name(name)
    image_path = card_root(type) / directory / "images" / image_name
    if not image_path.exists() or not image_path.is_file():
        return _error(404, "Изображение не найдено.")
    return FileResponse(image_path)


@app.get("/api/images")
def api_images(type: str = "", directory: str = "") -> Any:
    return {"images": list_images(type, directory)}


@app.get("/api/graph")
def api_graph(type: str = "", directory: str = "") -> Any:
    return graph_payload(type, directory)


@app.get("/api/place-suggest")
def api_place_suggest(q: str = "", limit: str = "8") -> Any:
    try:
        parsed_limit = max(1, min(20, int(limit)))
    except ValueError:
        parsed_limit = 8
    return {"suggestions": search_place_suggestions(q, parsed_limit)}


@app.get("/api/graph-overview")
def api_graph_overview() -> Any:
    return graph_overview_payload()


@app.get("/api/navigation-code")
def api_navigation_code(from_: str = Query("", alias="from"), to: str = Query("", alias="to")) -> Any:
    if not from_ or not to:
        return _error(400, "Нужно указать карточки 'from' и 'to'.")
    return navigation_variants(from_, to)


@app.get("/api/navigation-resolve")
def api_navigation_resolve(anchor: str = "", code: str = "") -> Any:
    if not anchor:
        return _error(400, "Нужно указать опорную карточку.")
    return resolve_navigation_segments(anchor, code)


# --- write endpoints --------------------------------------------------------

@app.post("/api/notes-preview")
async def api_notes_preview(request: Request) -> Any:
    payload = _load_json(await request.body())
    card_type = payload.get("cardType", "").strip() or "person"
    directory = payload.get("directory", "").strip()
    html = await run_in_threadpool(render_notes_preview, payload.get("text", ""), card_type, directory)
    return {"html": html}


@app.post("/api/upload-image")
def api_upload_image(
    file: UploadFile = File(...),
    cardType: str = Form(""),
    directory: str = Form(""),
) -> Any:
    image_name = upload_image(cardType, directory, file.filename or "", file.file)
    return {"filename": image_name}


def _save_card(payload: dict[str, Any], mode: str, preview: bool) -> dict[str, Any]:
    with DOCS_WRITE_LOCK:
        return save_card_with_navigation_updates(payload, mode, preview=preview)


@app.post("/api/cards/preview")
async def api_cards_preview(request: Request) -> Any:
    payload = _load_json(await request.body())
    mode = "update" if payload.get("editDirectory", "").strip() else "create"
    return await run_in_threadpool(_save_card, payload, mode, True)


@app.post("/api/cards")
async def api_cards_create(request: Request) -> Any:
    payload = _load_json(await request.body())
    result = await run_in_threadpool(_save_card, payload, "create", False)
    if result.get("navigation_conflicts"):
        return JSONResponse(result, status_code=409)
    return JSONResponse(result, status_code=201)


@app.put("/api/cards")
async def api_cards_update(request: Request) -> Any:
    payload = _load_json(await request.body())
    result = await run_in_threadpool(_save_card, payload, "update", False)
    if result.get("navigation_conflicts"):
        return JSONResponse(result, status_code=409)
    return result


# --- delete endpoints -------------------------------------------------------

@app.delete("/api/card")
def api_delete_card(type: str = "", directory: str = "") -> Any:
    with DOCS_WRITE_LOCK:
        delete_card(type, directory)
    return {"deleted": True}


@app.delete("/api/image")
def api_delete_image(type: str = "", directory: str = "", name: str = "") -> Any:
    delete_image(type, directory, name)
    return {"deleted": True}


# --- static frontend (must be mounted last so /api/* wins) ------------------

app.mount("/", StaticFiles(directory=str(GUI_DIR), html=True), name="static")
