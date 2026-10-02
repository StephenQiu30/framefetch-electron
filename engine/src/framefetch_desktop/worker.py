from __future__ import annotations

import json
import os
import queue
import signal
import sys
import threading
from pathlib import Path
from typing import Any

from .analysis import call_provider, prepare_input
from .documents import export_docx, extract_document
from .files import MAX_DOCUMENT, MAX_VIDEO, fingerprint, hash_file, inside, snapshot
from .media import download, inspect, probe, thumbnail
from .resources import ResourcePaths


def emit(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def watch_parent(messages: queue.Queue[dict[str, Any]]) -> None:
    pending = bytearray()
    while block := os.read(sys.stdin.fileno(), 4096):
        pending.extend(block)
        if len(pending) > 65536:
            break
        while b"\n" in pending:
            line, _, pending = pending.partition(b"\n")
            try:
                messages.put(json.loads(line))
            except ValueError:
                break
    # Tools share the worker's process group on POSIX. Parent coordinator kills the
    # group again after worker exit, including a worker killed before its watchdog runs.
    if os.name != "nt":
        os.killpg(os.getpgrp(), signal.SIGKILL)
    os._exit(70)


def execute(
    payload: dict[str, Any], resources: ResourcePaths, messages: queue.Queue[dict[str, Any]]
) -> dict[str, Any]:
    kind = payload["kind"]
    params = payload["params"]
    if kind == "inspect":
        return inspect(params["url"], resources).model_dump()
    if kind == "check_file":
        path = Path(params["path"])
        if not path.is_file():
            return {"availability": "missing"}
        before = fingerprint(path)
        value = hash_file(path)
        return {
            "availability": "available"
            if value == params["sha256"] and before == fingerprint(path)
            else "changed"
        }
    staging = Path(payload["staging"]).resolve(strict=True)
    if kind in {"import_document", "import_video"}:
        source = Path(params["source_path"]).resolve(strict=True)
        before = fingerprint(source)
        limit = MAX_VIDEO if kind == "import_video" else MAX_DOCUMENT
        if before[2] > limit:
            raise ValueError("input_too_large")
        copied = staging / ("original" + source.suffix.lower())
        sha256 = snapshot(source, copied)
        details: dict[str, Any] = {}
        if kind == "import_video":
            details = probe(copied, resources)
            thumbnail(copied, staging / "thumbnail.jpg", resources)
        else:
            text = extract_document(copied)
            (staging / "text.txt").write_text(text, encoding="utf-8")
            details["text_preview"] = text[:1000]
        if fingerprint(source) != before or hash_file(source) != sha256:
            raise ValueError("source_changed")
        return {
            "title": source.name[:500],
            "source_path": str(source),
            "original_path": str(copied),
            "size_bytes": copied.stat().st_size,
            "sha256": sha256,
            "fingerprint": before,
            **details,
        }
    if kind == "download":
        result = download(params, staging, resources)
        result.update(
            {
                "original_path": result["source_path"],
                "size_bytes": Path(result["source_path"]).stat().st_size,
            }
        )
        return result
    if kind == "analysis":
        content, duration, times = prepare_input(params, staging, resources)
        emit(
            {
                "type": "model_started",
                "task_id": payload["task_id"],
                "attempt_id": payload["attempt_id"],
            }
        )
        try:
            approval = messages.get(timeout=10)
        except queue.Empty as exc:
            raise ValueError("model_start_unconfirmed") from exc
        if approval != {"type": "model_start_ack"}:
            raise ValueError("attempt_revoked")
        api_key = payload.pop("api_key")
        analysis_result = call_provider(params, content, duration, times, api_key)
        del api_key
        report = analysis_result.model_dump()
        (staging / "report.md").write_text(report["markdown"], encoding="utf-8")
        (staging / "result.json").write_text(
            json.dumps(report, ensure_ascii=False), encoding="utf-8"
        )
        return {"report": report, "sha256": hash_file(staging / "report.md")}
    if kind == "export_report":
        source = Path(params["source_path"])
        inside(Path(payload["library_dir"]), source)
        text = source.read_text(encoding="utf-8")
        if hash_file(source) != params["source_sha256"]:
            raise ValueError("report_changed")
        destination = staging / ("export." + params["format"])
        if params["format"] == "docx":
            export_docx(text, destination)
        else:
            destination.write_text(text, encoding="utf-8")
        return {"export_path": str(destination), "sha256": hash_file(destination)}
    raise ValueError("worker_kind_unknown")


def main(resource_dir: Path) -> int:
    line = sys.stdin.buffer.readline(1024 * 1024 + 1)
    if len(line) > 1024 * 1024:
        return 64
    try:
        payload = json.loads(line)
    except ValueError:
        return 64
    messages: queue.Queue[dict[str, Any]] = queue.Queue()
    threading.Thread(target=watch_parent, args=(messages,), daemon=True).start()
    try:
        result = execute(payload, ResourcePaths(resource_dir), messages)
        emit({"type": "result", "result": result})
        return 0
    except Exception as exc:
        # Never serialize parser/http/tool exception text: it can contain credentials,
        # prompts or signed URLs. Only our controlled error names cross the pipe.
        code = str(exc) if isinstance(exc, ValueError) else "worker_failed"
        if (
            not code
            or len(code) > 80
            or not all(c.islower() or c.isdigit() or c == "_" for c in code)
        ):
            code = "worker_failed"
        emit({"type": "error", "code": code})
        return 1
