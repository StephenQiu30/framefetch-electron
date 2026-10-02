from __future__ import annotations

import json
from pathlib import Path

from .models import EngineContract


def main() -> None:
    # Locate source checkout only for this development command; frozen runtime never calls it.
    target = Path(__file__).resolve().parents[3] / "contracts" / "engine.schema.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(EngineContract.model_json_schema(), indent=2) + "\n")


if __name__ == "__main__":
    main()
