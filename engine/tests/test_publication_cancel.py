from __future__ import annotations

import asyncio
import threading
from pathlib import Path
from typing import Any

import pytest
from test_model_reports import configured, create_analysis, mock_remote

from framefetch_desktop import coordinator
from framefetch_desktop.protocol import Request


def test_cancel_during_export_copy_waits_for_cleanup_and_never_publishes_late(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = configured(tmp_path)
    mock_remote(monkeypatch, engine)
    analysis_task = create_analysis(engine)
    asyncio.run(engine.execute(analysis_task))
    report = engine.store.list_reports()[0]
    destination = tmp_path / "export.md"
    original_snapshot = coordinator.snapshot
    entered, release = threading.Event(), threading.Event()

    def copy(*args: Any, **kwargs: Any) -> str:
        entered.set()
        assert release.wait(timeout=3)
        return original_snapshot(*args, **kwargs)

    monkeypatch.setattr(coordinator, "snapshot", copy)

    async def exercise() -> None:
        created = await engine.dispatch(
            Request(
                jsonrpc="2.0",
                id=1,
                method="reports.export",
                params={
                    "report_id": report.id,
                    "format": "md",
                    "destination_path": str(destination),
                    "operation_id": "cancel-copy",
                },
            )
        )
        task = engine.store.start_task(created["id"])
        job = asyncio.create_task(engine.execute(task))
        engine.jobs[task.id] = job
        assert await asyncio.to_thread(entered.wait, 3)
        cancellation = await engine.dispatch(
            Request(jsonrpc="2.0", id=2, method="tasks.cancel", params={"task_id": task.id})
        )
        assert cancellation["status"] == "cancelling"
        assert not job.done()
        release.set()
        await job
        assert engine.store.get_task(task.id).status == "cancelled"
        assert not destination.exists()
        assert not list(tmp_path.glob(".framefetch-*.tmp"))

    try:
        asyncio.run(exercise())
    finally:
        release.set()
        engine.store.close()
