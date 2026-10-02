from __future__ import annotations

import asyncio
import hashlib
import json
import queue
from pathlib import Path
from typing import Any

import httpx
import pytest
from docx import Document

from framefetch_desktop import analysis, worker
from framefetch_desktop.coordinator import Coordinator
from framefetch_desktop.files import fingerprint
from framefetch_desktop.models import Asset, Provider
from framefetch_desktop.protocol import Request
from framefetch_desktop.resources import ResourcePaths
from framefetch_desktop.storage import now


def configured(root: Path) -> Coordinator:
    engine = Coordinator(root / "data", root / "library", root / "runtime")
    source = root / "source.txt"
    source.write_text("Alice enters the room. Bob leaves.")
    asset = Asset(
        id="asset",
        kind="document",
        title="Scene",
        size_bytes=source.stat().st_size,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        created_at=now(),
    )
    engine.store.put_asset(asset, str(source), {"fingerprint": fingerprint(source)})
    engine.store.upsert_provider(
        Provider(
            id="provider",
            label="Mock provider",
            model="mock-model",
            base_url="https://example.com/v1",
            vision=False,
        )
    )
    engine.ready = True
    return engine


def mock_remote(
    monkeypatch: pytest.MonkeyPatch, engine: Coordinator, *, timeout: bool = False
) -> list[str]:
    calls: list[str] = []
    original_client = httpx.Client
    active: dict[str, str] = {}
    acknowledgement: queue.Queue[dict[str, Any]] = queue.Queue()

    def start(message: dict[str, Any]) -> None:
        assert message["type"] == "model_started"
        engine.store.start_model_step(message["task_id"], message["attempt_id"])
        active["task_id"] = message["task_id"]
        acknowledgement.put({"type": "model_start_ack"})

    def remote(request: httpx.Request) -> httpx.Response:
        assert engine.store.step_status(active["task_id"]) == "started"
        assert request.headers["Authorization"] == "Bearer TEST_KEY_MEMORY_ONLY"
        calls.append(active["task_id"])
        if timeout:
            raise httpx.ReadTimeout("controlled mock timeout", request=request)
        report = {
            "title": "A scene analysis",
            "summary": "Two characters move in opposite directions.",
            "markdown": "# Scene analysis\n\nAlice enters; Bob leaves.",
            "evidence": [],
        }
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(report)}}]})

    monkeypatch.setattr(analysis, "validate_url", lambda url: None)
    monkeypatch.setattr(
        analysis.httpx,
        "Client",
        lambda **kwargs: original_client(transport=httpx.MockTransport(remote), trust_env=False),
    )
    monkeypatch.setattr(worker, "emit", start)

    async def local(job_id: str, payload: dict[str, Any], task: Any = None) -> dict[str, Any]:
        return worker.execute(payload, ResourcePaths(engine.resources.directory), acknowledgement)

    monkeypatch.setattr(engine, "run_worker", local)

    async def silent() -> None:
        pass

    monkeypatch.setattr(engine, "notify", silent)
    return calls


def create_analysis(engine: Coordinator) -> Any:
    # Asset validation happened during native request authorization in the product.
    asset, location, _ = engine.store.asset_record("asset")
    provider = engine.store.get_provider("provider")
    task = engine.store.create_task(
        "analysis",
        {
            "asset_id": asset.id,
            "source_path": location,
            "source_sha256": asset.sha256,
            "asset_kind": "document",
            "provider": provider.model_dump(),
            "skill": "screenplay-analysis",
        },
        "mock-analysis",
    )
    engine.secrets[task.id] = "TEST_KEY_MEMORY_ONLY"
    return engine.store.start_task(task.id)


def test_mock_model_report_persists_and_exports_markdown_and_docx(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = configured(tmp_path)
    calls = mock_remote(monkeypatch, engine)
    task = create_analysis(engine)
    try:
        asyncio.run(engine.execute(task))
        assert engine.store.get_task(task.id).status == "succeeded"
        assert engine.store.step_status(task.id) == "succeeded"
        assert calls == [task.id]
        report = engine.store.list_reports()[0]
        assert report.source_sha256 == engine.store.asset_record("asset")[0].sha256
        assert report.markdown.startswith("# Scene analysis")
        summary = asyncio.run(engine.dispatch(Request(jsonrpc="2.0", id=1, method="reports.list")))[
            0
        ]
        assert summary["markdown"] == ""
        full = asyncio.run(
            engine.dispatch(
                Request(jsonrpc="2.0", id=2, method="reports.get", params={"report_id": report.id})
            )
        )
        assert full["markdown"] == report.markdown
        for extension in ["md", "docx"]:
            destination = tmp_path / ("导出 " + extension + "." + extension)
            created = asyncio.run(
                engine.dispatch(
                    Request(
                        jsonrpc="2.0",
                        id=3,
                        method="reports.export",
                        params={
                            "report_id": report.id,
                            "format": extension,
                            "destination_path": str(destination),
                            "operation_id": "export-" + extension,
                        },
                    )
                )
            )
            export_task = engine.store.start_task(created["id"])
            asyncio.run(engine.execute(export_task))
            assert engine.store.get_task(export_task.id).status == "succeeded"
            assert destination.is_file()
            if extension == "md":
                assert destination.read_text() == report.markdown
            else:
                text = "\n".join(item.text for item in Document(str(destination)).paragraphs)
                assert "Alice enters; Bob leaves." in text
        for row in engine.store.connection.iterdump():
            assert "TEST_KEY_MEMORY_ONLY" not in row
    finally:
        engine.store.close()


def test_mock_model_timeout_remains_unknown_and_recovery_never_resends(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = configured(tmp_path)
    calls = mock_remote(monkeypatch, engine, timeout=True)
    task = create_analysis(engine)
    try:
        asyncio.run(engine.execute(task))
        assert engine.store.get_task(task.id).status == "needs_attention"
        assert engine.store.step_status(task.id) == "unknown"
        asyncio.run(engine.recover())
        assert engine.store.queued_tasks() == []
        assert calls == [task.id]
        with pytest.raises(ValueError, match="retry_requires_explicit_analysis_decision"):
            engine.store.retry(task.id)
    finally:
        engine.store.close()
