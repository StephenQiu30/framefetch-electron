from __future__ import annotations

import os
import sys
from pathlib import Path


class ResourcePaths:
    def __init__(self, directory: Path) -> None:
        self.directory = directory.resolve()

    def tool(self, name: str) -> Path:
        extension = ".exe" if os.name == "nt" else ""
        candidate = self.directory / "tools" / (name + extension)
        if not candidate.is_file() or not candidate.resolve().is_relative_to(self.directory):
            raise ValueError("resource_missing_" + name.replace("-", "_"))
        if os.name != "nt" and not os.access(candidate, os.X_OK):
            raise ValueError("resource_not_executable_" + name.replace("-", "_"))
        return candidate

    def available(self, name: str) -> bool:
        try:
            self.tool(name)
            return True
        except ValueError:
            return False


def worker_command(resource_dir: Path) -> list[str]:
    if getattr(sys, "frozen", False):
        return [sys.executable, "task-worker", "--resource-dir", str(resource_dir)]
    return [
        sys.executable,
        "-m",
        "framefetch_desktop",
        "task-worker",
        "--resource-dir",
        str(resource_dir),
    ]
