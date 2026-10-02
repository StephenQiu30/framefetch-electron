from __future__ import annotations

import asyncio
import hashlib
import json
import queue
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import pytest

from framefetch_desktop.coordinator import Coordinator
from framefetch_desktop.files import durable_publish, fingerprint
from framefetch_desktop.models import Asset, Provider
from framefetch_desktop.network import guarded_proxy
from framefetch_desktop.protocol import Request
from framefetch_desktop.storage import Store, json_text, now


class Engine:
    def __init__(self, root: Path) -> None:
        self.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "framefetch_desktop",
                "--data-dir",
                str(root / "data"),
                "--library-dir",
                str(root / "library"),
                "--resource-dir",
                str(root / "runtime"),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        self.messages: queue.Queue[dict[str, Any]] = queue.Queue()
        self.next_id = 0
        self.events: list[dict[str, Any]] = []
        threading.Thread(target=self.read, daemon=True).start()

    def read(self) -> None:
        assert self.process.stdout
        for line in self.process.stdout:
            self.messages.put(json.loads(line))

    def call(self, method: str, params: dict[str, Any] | None = None) -> Any:
        self.next_id += 1
        assert self.process.stdin
        self.process.stdin.write(
            json.dumps(
                {"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params or {}}
            ).encode()
            + b"\n"
        )
        self.process.stdin.flush()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            message = self.messages.get(timeout=10)
            if "method" in message:
                self.events.append(message)
            elif message["id"] == self.next_id:
                if "error" in message:
                    raise ValueError(message["error"]["message"])
                return message["result"]
        raise AssertionError("response timed out")

    def close(self) -> None:
        self.call("engine.shutdown")
        assert self.process.wait(timeout=5) == 0
        assert self.process.stderr
        assert self.process.stderr.read() == b""


@pytest.mark.parametrize("extension", [".txt", ".fountain"])
def test_real_stdio_document_import_reconnect_and_changed_hash(
    tmp_path: Path, extension: str
) -> None:
    source = tmp_path / ("中文 剧本" + extension)
    source.write_text("第一幕\n角色登场。", encoding="utf-8")
    engine = Engine(tmp_path)
    try:
        hello = engine.call("engine.hello", {"supervised": True})
        assert hello["protocol_version"] == "1"
        task = engine.call(
            "imports.create",
            {"source_path": str(source), "mode": "reference", "operation_id": "stdio-import"},
        )
        for _ in range(100):
            current = engine.call("tasks.get", {"task_id": task["id"]})
            if current["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        assert current["status"] == "succeeded", current
        assets = engine.call("assets.list")
        assert len(assets) == 1
        asset_id = assets[0]["id"]
        assert engine.call("assets.text", {"asset_id": asset_id}) == source.read_text()
        duplicate = engine.call(
            "imports.create",
            {"source_path": str(source), "mode": "reference", "operation_id": "stdio-import"},
        )
        assert duplicate["id"] == task["id"]
        engine.close()
        engine = Engine(tmp_path)
        engine.call("engine.hello", {"supervised": True})
        assert len(engine.call("assets.list")) == 1
        original_stat = source.stat()
        source.write_text("第二幕\n角色离场。", encoding="utf-8")
        import os

        os.utime(source, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
        with pytest.raises(ValueError, match="asset_changed"):
            engine.call("assets.resolve", {"asset_id": asset_id, "kind": "original"})
        assert engine.call("assets.get", {"asset_id": asset_id})["availability"] == "changed"
        engine.close()
    finally:
        if engine.process.poll() is None:
            engine.process.kill()
            engine.process.wait()


def prepared_asset(coordinator: Coordinator, root: Path) -> tuple[Any, dict[str, Any]]:
    source = root / "source.txt"
    source.write_text("durable document")
    task = coordinator.store.create_task(
        "import_document", {"source_path": str(source), "mode": "copy"}, "publication"
    )
    active = coordinator.store.start_task(task.id)
    staging = coordinator.library / ".staging" / active.id / str(active.attempt_id)
    staging.mkdir(parents=True)
    original = staging / "original.txt"
    original.write_text(source.read_text())
    (staging / "text.txt").write_text(source.read_text())
    result = {
        "title": source.name,
        "size_bytes": original.stat().st_size,
        "sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
        "fingerprint": fingerprint(source),
        "source_path": str(source),
        "original_path": str(original),
        "text_preview": source.read_text(),
    }
    intent = asyncio.run(coordinator.make_intent(active, staging, result))
    coordinator.store.connection.execute(
        "INSERT INTO artifacts VALUES (?,?,?,'prepared')",
        (active.id, active.attempt_id, json_text(intent)),
    )
    return active, intent


def test_publication_crash_after_move_reconciles_current_attempt(tmp_path: Path) -> None:
    first = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    task, intent = prepared_asset(first, tmp_path)
    asyncio.run(first.publish_files(intent))
    first.store.close()
    restarted = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    try:
        asyncio.run(restarted.recover())
        assert restarted.store.get_task(task.id).status == "succeeded"
        assert len(restarted.store.list_assets()) == 1
    finally:
        restarted.store.close()


def test_cancelled_publication_never_recovered_as_success(tmp_path: Path) -> None:
    first = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    task, intent = prepared_asset(first, tmp_path)
    asyncio.run(first.publish_files(intent))
    first.store.cancel_task(task.id)
    assert not first.commit_intent(task, intent)
    first.store.close()
    restarted = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    try:
        asyncio.run(restarted.recover())
        assert restarted.store.get_task(task.id).status == "cancelled"
        assert restarted.store.list_assets() == []
        assert not Path(intent["files"][0]["destination"]).exists()
    finally:
        restarted.store.close()


def test_atomic_publish_never_overwrites_existing_destination(tmp_path: Path) -> None:
    source, destination = tmp_path / "new", tmp_path / "existing"
    source.write_text("new result")
    destination.write_text("user file")
    with pytest.raises(ValueError, match="destination_exists"):
        durable_publish(source, destination)
    assert destination.read_text() == "user file"
    assert source.read_text() == "new result"


def test_retired_cancelled_export_cannot_delete_later_same_content_export(tmp_path: Path) -> None:
    engine = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    source = tmp_path / "temporary.md"
    source.write_text("same report")
    destination = tmp_path / "report.md"
    task = engine.store.create_task("export_report", {}, "old-export")
    active = engine.store.start_task(task.id)
    intent = {
        "kind": "export",
        "files": [
            {
                "source": str(source),
                "destination": str(destination),
                "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "source_identity": list(fingerprint(source)),
            }
        ],
    }
    engine.store.connection.execute(
        "INSERT INTO artifacts VALUES (?,?,?,'prepared')",
        (active.id, active.attempt_id, json_text(intent)),
    )
    durable_publish(source, destination)
    engine.store.cancel_task(task.id)
    try:
        asyncio.run(engine.recover())
        assert not destination.exists()
        destination.write_text("same report")
        asyncio.run(engine.recover())
        assert destination.read_text() == "same report"
        assert (
            engine.store.connection.execute(
                "SELECT phase FROM artifacts WHERE task_id=?", (task.id,)
            ).fetchone()[0]
            == "retired"
        )
    finally:
        engine.store.close()


def test_single_database_owner(tmp_path: Path) -> None:
    store = Store(tmp_path)
    try:
        with pytest.raises(ValueError, match="engine_already_running"):
            Store(tmp_path)
    finally:
        store.close()


def test_analysis_key_is_ephemeral_and_cancel_discards_it(tmp_path: Path) -> None:
    engine = Coordinator(tmp_path / "data", tmp_path / "library", tmp_path / "runtime")
    source = tmp_path / "source.txt"
    source.write_text("a script")
    asset = Asset(
        id="asset",
        kind="document",
        title="script",
        size_bytes=source.stat().st_size,
        sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        created_at=now(),
    )
    engine.store.put_asset(asset, str(source), {"fingerprint": fingerprint(source)})
    engine.store.upsert_provider(
        Provider(
            id="provider",
            label="Test provider",
            model="test-model",
            base_url="https://example.com/v1",
            vision=False,
        )
    )
    engine.ready = True
    try:
        task = asyncio.run(
            engine.dispatch(
                Request(
                    jsonrpc="2.0",
                    id=1,
                    method="analysis.create",
                    params={
                        "asset_id": "asset",
                        "provider_id": "provider",
                        "skill": "screenplay-analysis",
                        "api_key": "TEST_SENTINEL_KEY_DO_NOT_PERSIST",
                        "expected_provider_base_url": "https://example.com/v1",
                        "operation_id": "analysis-secret",
                    },
                )
            )
        )
        assert "api_key" not in engine.store.task_params(task["id"])
        for row in engine.store.connection.iterdump():
            assert "TEST_SENTINEL_KEY_DO_NOT_PERSIST" not in row
        assert engine.secrets[task["id"]] == "TEST_SENTINEL_KEY_DO_NOT_PERSIST"
        asyncio.run(
            engine.dispatch(
                Request(jsonrpc="2.0", id=2, method="tasks.cancel", params={"task_id": task["id"]})
            )
        )
        assert engine.secrets == {}
    finally:
        engine.store.close()


def test_proxy_denies_private_connect_and_redirect_destination() -> None:
    import httpx

    with guarded_proxy() as proxy, httpx.Client(proxy=proxy, trust_env=False, timeout=3) as client:
        with pytest.raises(httpx.ProxyError):
            client.get("https://127.0.0.1/private")


def test_request_throttling_preserves_valid_request_ids_and_keeps_engine_alive(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.txt"
    source.write_text("a small authorized file")
    engine = Engine(tmp_path)
    try:
        engine.call("engine.hello", {"supervised": True})
        imported = engine.call(
            "imports.create",
            {"source_path": str(source), "mode": "reference", "operation_id": "burst-import"},
        )
        for _ in range(100):
            current = engine.call("tasks.get", {"task_id": imported["id"]})
            if current["status"] == "succeeded":
                break
            time.sleep(0.02)
        assert current["status"] == "succeeded"
        asset_id = current["asset_id"]
        batch = []
        ids = set()
        for _ in range(40):
            engine.next_id += 1
            ids.add(engine.next_id)
            batch.append(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": engine.next_id,
                        "method": "assets.resolve",
                        "params": {"asset_id": asset_id, "kind": "original"},
                    }
                ).encode()
                + b"\n"
            )
        assert engine.process.stdin
        engine.process.stdin.write(b"".join(batch))
        engine.process.stdin.flush()
        replies = []
        while len(replies) < 40:
            item = engine.messages.get(timeout=20)
            if "id" in item:
                assert item["id"] in ids
                replies.append(item)
        assert any(item.get("error", {}).get("message") == "request_limit" for item in replies)
        assert len(engine.call("assets.list")) == 1
        engine.close()
    finally:
        if engine.process.poll() is None:
            engine.process.kill()
            engine.process.wait()
