from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from server.constants import APP_HOST, APP_PORT


@dataclass
class AppConfig:
    workspace_dir: Path
    host: str = APP_HOST
    port: int = APP_PORT
