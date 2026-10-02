"""Retain distribution licenses without importing or executing their code."""
import importlib.metadata
import json
from pathlib import Path
import shutil
import sys
import sysconfig

destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
inventory = []
for distribution in sorted(importlib.metadata.distributions(), key=lambda item: item.metadata["Name"].lower()):
    name = distribution.metadata["Name"]
    directory = destination / name
    copied = []
    for file in distribution.files or []:
        if not any(word in str(file).lower() for word in ("license", "copying", "notice")):
            continue
        source = Path(distribution.locate_file(file))
        if not source.is_file() or source.stat().st_size > 2 * 1024 * 1024:
            continue
        directory.mkdir(parents=True, exist_ok=True)
        output = directory / str(file).replace("/", "_").replace("\\", "_")
        shutil.copyfile(source, output)
        copied.append(str(output.relative_to(destination)))
    inventory.append({"name": name, "version": distribution.version, "license": distribution.metadata.get("License-Expression") or distribution.metadata.get("License"), "license_files": copied})

python_license = next((candidate for candidate in [Path(sysconfig.get_path("stdlib")) / "LICENSE.txt", Path(sys.base_prefix) / "LICENSE.txt", Path(sys.base_prefix) / "share/doc/python3.12/LICENSE.txt"] if candidate.is_file()), None)
if python_license is None:
    python_license = next(Path(sys.base_prefix).glob("**/LICENSE.txt"), None)
if python_license is None:
    raise SystemExit("Python runtime license missing; packaging cannot proceed")
shutil.copyfile(python_license, destination / "PYTHON-LICENSE.txt")
(destination / "inventory.json").write_text(json.dumps({"python": sys.version.split()[0], "python_license": "PYTHON-LICENSE.txt", "distributions": inventory}, indent=2) + "\n")
