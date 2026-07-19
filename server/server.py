from __future__ import annotations

import json
from http.server import ThreadingHTTPServer

from server.storage.cards import rebuild_indexes
from server.web_server import runtime
from server.web_server.runtime import (bootstrap_workspace, configure_docs_root,
                                       ensure_structure, load_app_config)
from server.web_server.server import GuiHandler


def main() -> None:
    try:
        app_config = load_app_config()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise SystemExit(f"Config error: {error}") from error
    bootstrap_workspace(app_config.workspace_dir)
    configure_docs_root(app_config.workspace_dir / "docs")
    ensure_structure()
    rebuild_indexes()
    server = ThreadingHTTPServer((app_config.host, app_config.port), GuiHandler)
    print(f"GUI server is running on http://{app_config.host}:{app_config.port}")
    print(f"Docs workspace: {runtime.DOCS_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == "__main__":
    main()
