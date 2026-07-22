from __future__ import annotations

import json

import uvicorn

from server.storage.cards import rebuild_indexes
from server.web import runtime
from server.web.routes import app
from server.web.runtime import (bootstrap_workspace, configure_docs_root,
                                ensure_structure, load_app_config)


def main() -> None:
    try:
        app_config = load_app_config()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise SystemExit(f"Config error: {error}") from error
    bootstrap_workspace(app_config.workspace_dir)
    configure_docs_root(app_config.workspace_dir / "docs")
    ensure_structure()
    rebuild_indexes()
    print(f"Docs workspace: {runtime.DOCS_DIR}")
    uvicorn.run(app, host=app_config.host, port=app_config.port, log_level="info")
