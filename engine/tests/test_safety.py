from pathlib import Path

import pytest

from framefetch_desktop.files import snapshot
from framefetch_desktop.network import validate_url
from framefetch_desktop.protocol import decode_request
from framefetch_desktop.storage import Store


def test_operation_id_is_idempotent_but_rejects_changed_payload(tmp_path: Path) -> None:
    store = Store(tmp_path / "db")
    first = store.create_task("import_document", {"source_path": "a.txt"}, "operation-one")
    second = store.create_task("import_document", {"source_path": "a.txt"}, "operation-one")
    assert first.id == second.id
    with pytest.raises(ValueError, match="operation_conflict"):
        store.create_task("import_document", {"source_path": "b.txt"}, "operation-one")
    store.close()


def test_cancelled_attempt_cannot_commit_late_success(tmp_path: Path) -> None:
    store = Store(tmp_path / "db")
    task = store.create_task("import_document", {}, "cancel-test")
    active = store.start_task(task.id)
    store.cancel_task(task.id)
    assert not store.has_publish_right(task.id, active.attempt_id)
    assert not store.finish_task(task.id, active.attempt_id, "succeeded")
    store.finish_cancel(task.id)
    assert store.get_task(task.id).status == "cancelled"
    store.close()


def test_started_model_call_recovers_unknown_without_requeue(tmp_path: Path) -> None:
    store = Store(tmp_path / "db")
    task = store.create_task("analysis", {}, "analysis-test")
    active = store.start_task(task.id)
    store.start_model_step(task.id, active.attempt_id)
    store.close()
    resumed = Store(tmp_path / "db")
    resumed.recover()
    assert resumed.get_task(task.id).status == "needs_attention"
    assert resumed.step_status(task.id) == "unknown"
    assert resumed.queued_tasks() == []
    resumed.close()


def test_recovery_includes_active_tasks_older_than_ui_history_limit(tmp_path: Path) -> None:
    store = Store(tmp_path / "db")
    active = store.start_task(store.create_task("analysis", {}, "old-analysis").id)
    store.start_model_step(active.id, active.attempt_id)
    for index in range(1001):
        finished = store.start_task(store.create_task("import_document", {}, f"history-{index}").id)
        store.finish_task(finished.id, finished.attempt_id, "succeeded")
    try:
        assert any(task.id == active.id for task in store.list_tasks())
        store.recover()
        assert store.get_task(active.id).status == "needs_attention"
        assert store.step_status(active.id) == "unknown"
    finally:
        store.close()


def test_input_snapshot_rejects_rewritten_source(tmp_path: Path) -> None:
    import hashlib

    source = tmp_path / "source.txt"
    source.write_text("first")
    original_hash = hashlib.sha256(b"first").hexdigest()
    source.write_text("other")
    with pytest.raises(ValueError, match="source_changed"):
        snapshot(source, tmp_path / "snapshot.txt", original_hash)
    assert not (tmp_path / "snapshot.txt").exists()


def test_snapshot_collision_preserves_preexisting_user_file(tmp_path: Path) -> None:
    source = tmp_path / "source"
    source.write_text("new")
    target = tmp_path / "target"
    target.write_text("existing user file")
    with pytest.raises(FileExistsError):
        snapshot(source, target)
    assert target.read_text() == "existing user file"


@pytest.mark.parametrize(
    "url", ["http://127.0.0.1/a", "https://[::1]/", "file:///a", "https://youtube.com@localhost/a"]
)
def test_ordinary_download_rejects_non_public_destinations(url: str) -> None:
    with pytest.raises(ValueError):
        validate_url(url)


def test_protocol_rejects_extra_fields_and_oversized_frame() -> None:
    with pytest.raises(ValueError):
        decode_request(b'{"jsonrpc":"2.0","id":1,"method":"engine.hello","unexpected":1}')
    with pytest.raises(ValueError, match="message_too_large"):
        decode_request(b" " * (1024 * 1024 + 1))
    with pytest.raises(ValueError):
        decode_request(b'{"jsonrpc":"2.0","id":true,"method":"engine.hello"}')
