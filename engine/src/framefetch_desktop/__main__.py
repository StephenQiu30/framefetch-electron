from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="FrameFetch independent local engine")
    parser.add_argument("command", nargs="?", choices=["task-worker"])
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--library-dir", type=Path)
    parser.add_argument("--resource-dir", type=Path)
    args = parser.parse_args()
    resource = args.resource_dir
    if resource is None and not getattr(sys, "frozen", False):
        value = os.environ.get("FRAMEFETCH_RESOURCE_DIR")
        resource = Path(value) if value else None
    if resource is None:
        parser.error("--resource-dir is required")
    if args.command == "task-worker":
        from .worker import main as worker_main

        raise SystemExit(worker_main(resource))
    if args.data_dir is None or args.library_dir is None:
        parser.error("--data-dir and --library-dir are required")
    from .coordinator import Coordinator

    try:
        coordinator = Coordinator(args.data_dir, args.library_dir, resource)
        asyncio.run(coordinator.serve())
    except (ValueError, OSError):
        # No exception text or paths: diagnostics may contain user material.
        print("engine_start_failed", file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
