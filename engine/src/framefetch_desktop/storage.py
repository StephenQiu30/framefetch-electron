from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

from .models import Asset, Provider, Report, Task, TaskKind, TaskStatus

SCHEMA = """
CREATE TABLE tasks (
 id TEXT PRIMARY KEY, operation_id TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL,
 params TEXT NOT NULL, snapshot TEXT NOT NULL, status TEXT NOT NULL,
 attempt_id TEXT, cancelled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE events (seq INTEGER PRIMARY KEY AUTOINCREMENT, method TEXT NOT NULL, params TEXT NOT NULL);
CREATE TABLE assets (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL, location TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE providers (id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
CREATE TABLE reports (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL REFERENCES assets(id), snapshot TEXT NOT NULL, location TEXT NOT NULL);
CREATE TABLE analysis_runs (task_id TEXT PRIMARY KEY REFERENCES tasks(id), input TEXT NOT NULL);
CREATE TABLE analysis_steps (task_id TEXT PRIMARY KEY REFERENCES tasks(id), attempt_id TEXT NOT NULL, status TEXT NOT NULL, result_hash TEXT);
CREATE TABLE artifacts (task_id TEXT PRIMARY KEY REFERENCES tasks(id), attempt_id TEXT NOT NULL, intent TEXT NOT NULL, phase TEXT NOT NULL);
CREATE TABLE documents (asset_id TEXT PRIMARY KEY REFERENCES assets(id), text_path TEXT NOT NULL, version TEXT NOT NULL);
CREATE TABLE settings (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
"""
TERMINAL = {"cancelled", "succeeded", "failed", "needs_attention", "interrupted"}


def now() -> str:
    return datetime.now(UTC).isoformat()


def json_text(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


class Store:
    """Only coordinator opens this connection; workers receive immutable task descriptions."""

    def __init__(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        self.lock = (directory / "owner.lock").open("a+b")
        try:
            if os.name == "nt":
                import msvcrt

                self.lock.seek(0)
                self.lock.write(b"0")
                self.lock.flush()
                self.lock.seek(0)
                windows_runtime = cast(Any, msvcrt)
                windows_runtime.locking(self.lock.fileno(), windows_runtime.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(self.lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.lock.close()
            raise ValueError("engine_already_running") from exc
        self.connection = sqlite3.connect(directory / "framefetch.sqlite", isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys=ON")
        self.connection.execute("PRAGMA busy_timeout=5000")
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA synchronous=FULL")
        version = int(self.connection.execute("PRAGMA user_version").fetchone()[0])
        if version > 1:
            self.close()
            raise ValueError("schema_newer_than_engine")
        checksum = hashlib.sha256(SCHEMA.encode()).hexdigest()
        if version == 0:
            self.connection.executescript("BEGIN IMMEDIATE;" + SCHEMA)
            self.connection.execute(
                "INSERT INTO schema_migrations VALUES (1,?,?)",
                (checksum, now()),
            )
            self.connection.execute("PRAGMA user_version=1")
            self.connection.execute("COMMIT")
        elif (
            self.connection.execute(
                "SELECT checksum FROM schema_migrations WHERE version=1",
            ).fetchone()[0]
            != checksum
        ):
            self.close()
            raise ValueError("schema_checksum_mismatch")
        self.last_seq = int(
            self.connection.execute("SELECT COALESCE(MAX(seq),0) FROM events").fetchone()[0]
        )

    @contextmanager
    def transaction(self) -> Iterator[None]:
        self.connection.execute("BEGIN IMMEDIATE")
        try:
            yield
            self.connection.execute("COMMIT")
        except BaseException:
            self.connection.execute("ROLLBACK")
            raise

    def close(self) -> None:
        self.connection.close()
        self.lock.close()

    def emit(self, method: str, params: dict[str, Any]) -> None:
        self.connection.execute(
            "INSERT INTO events(method,params) VALUES (?,?)", (method, json_text(params))
        )

    def events(self) -> list[dict[str, Any]]:
        rows = self.connection.execute(
            "SELECT * FROM events WHERE seq>? ORDER BY seq", (self.last_seq,)
        ).fetchall()
        result = []
        for row in rows:
            self.last_seq = row["seq"]
            result.append(
                {
                    "jsonrpc": "2.0",
                    "method": row["method"],
                    "params": {**json.loads(row["params"]), "seq": row["seq"]},
                }
            )
        if self.last_seq > 10000:
            self.connection.execute("DELETE FROM events WHERE seq<?", (self.last_seq - 10000,))
        return result

    def save_task(self, task: Task) -> None:
        self.connection.execute(
            "UPDATE tasks SET snapshot=?,status=?,attempt_id=? WHERE id=?",
            (task.model_dump_json(), task.status, task.attempt_id, task.id),
        )
        self.emit("tasks.changed", {"task_id": task.id, "revision": task.revision})

    def create_task(self, kind: TaskKind, params: dict[str, Any], operation_id: str) -> Task:
        payload_hash = hashlib.sha256(
            json_text({"kind": kind, "params": params}).encode()
        ).hexdigest()
        existing = self.connection.execute(
            "SELECT * FROM tasks WHERE operation_id=?", (operation_id,)
        ).fetchone()
        if existing:
            if existing["payload_hash"] != payload_hash:
                raise ValueError("operation_conflict")
            return Task.model_validate_json(existing["snapshot"])
        if len(self.queued_tasks()) >= 100:
            raise ValueError("queue_full")
        timestamp = now()
        task = Task(
            id=str(uuid.uuid4()),
            kind=kind,
            status="queued",
            stage="queued",
            created_at=timestamp,
            updated_at=timestamp,
            revision=1,
            asset_id=params.get("asset_id"),
        )
        with self.transaction():
            self.connection.execute(
                "INSERT INTO tasks(id,operation_id,payload_hash,params,snapshot,status) VALUES (?,?,?,?,?,?)",
                (
                    task.id,
                    operation_id,
                    payload_hash,
                    json_text(params),
                    task.model_dump_json(),
                    task.status,
                ),
            )
            if kind == "analysis":
                self.connection.execute(
                    "INSERT INTO analysis_runs VALUES (?,?)", (task.id, json_text(params))
                )
            self.emit("tasks.changed", {"task_id": task.id, "revision": task.revision})
        return task

    def get_task(self, task_id: str) -> Task:
        row = self.connection.execute(
            "SELECT snapshot FROM tasks WHERE id=?", (task_id,)
        ).fetchone()
        if not row:
            raise ValueError("task_not_found")
        return Task.model_validate_json(row[0])

    def list_tasks(self) -> list[Task]:
        return [
            Task.model_validate_json(row[0])
            for row in self.connection.execute(
                "SELECT snapshot FROM tasks ORDER BY CASE WHEN status IN ('queued','running','cancelling') THEN 0 WHEN status='needs_attention' THEN 1 WHEN status='interrupted' THEN 2 ELSE 3 END, rowid DESC LIMIT 1000"
            )
        ]

    def queued_tasks(self) -> list[Task]:
        return [
            Task.model_validate_json(row[0])
            for row in self.connection.execute(
                "SELECT snapshot FROM tasks WHERE status='queued' ORDER BY rowid LIMIT 100"
            )
        ]

    def task_params(self, task_id: str) -> dict[str, Any]:
        return cast(
            dict[str, Any],
            json.loads(
                self.connection.execute(
                    "SELECT params FROM tasks WHERE id=?", (task_id,)
                ).fetchone()[0]
            ),
        )

    def update_task(self, task_id: str, **updates: Any) -> Task:
        task = self.get_task(task_id)
        updated = Task.model_validate(
            {**task.model_dump(), **updates, "updated_at": now(), "revision": task.revision + 1}
        )
        self.save_task(updated)
        return updated

    def start_task(self, task_id: str) -> Task:
        with self.transaction():
            task = self.get_task(task_id)
            if task.status != "queued":
                raise ValueError("task_not_queued")
            return self.update_task(
                task_id,
                status="running",
                stage="preparing",
                attempt=task.attempt + 1,
                attempt_id=str(uuid.uuid4()),
                error_code=None,
                message=None,
            )

    def has_publish_right(self, task_id: str, attempt_id: str | None) -> bool:
        row = self.connection.execute(
            "SELECT status,attempt_id,cancelled FROM tasks WHERE id=?", (task_id,)
        ).fetchone()
        return bool(
            row
            and row["status"] == "running"
            and row["attempt_id"] == attempt_id
            and not row["cancelled"]
        )

    def cancel_task(self, task_id: str) -> Task:
        with self.transaction():
            task = self.get_task(task_id)
            if task.status in TERMINAL:
                return task
            self.connection.execute("UPDATE tasks SET cancelled=1 WHERE id=?", (task_id,))
            return self.update_task(
                task_id,
                status="cancelled" if task.status == "queued" else "cancelling",
                stage="cancel_requested",
                message="Cancelling task",
            )

    def finish_cancel(self, task_id: str) -> None:
        with self.transaction():
            if self.get_task(task_id).status == "cancelling":
                self.connection.execute(
                    "UPDATE analysis_steps SET status='unknown' WHERE task_id=? AND status='started'",
                    (task_id,),
                )
                self.update_task(
                    task_id, status="cancelled", stage="cancelled", message="Task cancelled"
                )

    def finish_task(
        self, task_id: str, attempt_id: str | None, status: TaskStatus, **updates: Any
    ) -> bool:
        with self.transaction():
            if not self.has_publish_right(task_id, attempt_id):
                return False
            self.update_task(
                task_id,
                status=status,
                stage=status,
                progress=1 if status == "succeeded" else None,
                **updates,
            )
            return True

    def retry(self, task_id: str) -> Task:
        with self.transaction():
            task = self.get_task(task_id)
            if task.status not in {"failed", "interrupted", "cancelled"}:
                raise ValueError(
                    "retry_requires_explicit_analysis_decision"
                    if task.status == "needs_attention"
                    else "task_not_retryable"
                )
            if task.kind == "analysis":
                raise ValueError("analysis_requires_new_authorized_request")
            self.connection.execute("UPDATE tasks SET cancelled=0 WHERE id=?", (task_id,))
            return self.update_task(
                task_id,
                status="queued",
                stage="queued",
                attempt_id=None,
                error_code=None,
                progress=None,
            )

    def start_model_step(self, task_id: str, attempt_id: str | None) -> None:
        with self.transaction():
            if not self.has_publish_right(task_id, attempt_id):
                raise ValueError("attempt_revoked")
            self.connection.execute(
                "INSERT OR REPLACE INTO analysis_steps VALUES (?,?, 'started',NULL)",
                (task_id, attempt_id),
            )
            self.update_task(task_id, stage="model_started", message="Provider request started")

    def step_status(self, task_id: str) -> str | None:
        row = self.connection.execute(
            "SELECT status FROM analysis_steps WHERE task_id=?", (task_id,)
        ).fetchone()
        return row[0] if row else None

    def recover(self) -> None:
        with self.transaction():
            active = self.connection.execute(
                "SELECT snapshot FROM tasks WHERE status IN ('running','cancelling')"
            ).fetchall()
            for row in active:
                task = Task.model_validate_json(row[0])
                if task.status in {"running", "cancelling"}:
                    if self.step_status(task.id) == "started":
                        self.connection.execute(
                            "UPDATE analysis_steps SET status='unknown' WHERE task_id=?", (task.id,)
                        )
                        self.update_task(
                            task.id,
                            status="cancelled"
                            if task.status == "cancelling"
                            else "needs_attention",
                            stage="model_unknown",
                            error_code="model_result_unknown",
                            message="Provider result unknown; no automatic resend",
                        )
                    elif task.status == "cancelling":
                        self.update_task(task.id, status="cancelled", stage="cancelled")
                    else:
                        self.update_task(
                            task.id,
                            status="interrupted",
                            stage="interrupted",
                            error_code="engine_interrupted",
                            message="Previous task interrupted; retry explicitly",
                        )

    def put_asset(self, asset: Asset, location: str, details: dict[str, Any]) -> None:
        self.connection.execute(
            "INSERT INTO assets VALUES (?,?,?,?)",
            (asset.id, asset.model_dump_json(), location, json_text(details)),
        )
        if details.get("text_path"):
            self.connection.execute(
                "INSERT INTO documents VALUES (?,?,?)", (asset.id, details["text_path"], "1")
            )
        self.emit("assets.changed", {"asset_id": asset.id})

    def list_assets(self) -> list[Asset]:
        return [
            Asset.model_validate_json(row[0])
            for row in self.connection.execute(
                "SELECT snapshot FROM assets ORDER BY rowid DESC LIMIT 1000"
            )
        ]

    def asset_record(self, asset_id: str) -> tuple[Asset, str, dict[str, Any]]:
        row = self.connection.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row:
            raise ValueError("asset_not_found")
        return (
            Asset.model_validate_json(row["snapshot"]),
            row["location"],
            json.loads(row["details"]),
        )

    def asset_availability(self, asset_id: str, availability: str) -> Asset:
        asset, _, _ = self.asset_record(asset_id)
        asset = Asset.model_validate({**asset.model_dump(), "availability": availability})
        self.connection.execute(
            "UPDATE assets SET snapshot=? WHERE id=?", (asset.model_dump_json(), asset_id)
        )
        self.emit("assets.changed", {"asset_id": asset_id})
        return asset

    def upsert_provider(self, provider: Provider) -> Provider:
        provider = provider.model_copy(update={"key_set": False})
        self.connection.execute(
            "INSERT OR REPLACE INTO providers VALUES (?,?)",
            (provider.id, provider.model_dump_json()),
        )
        return provider

    def list_providers(self) -> list[Provider]:
        return [
            Provider.model_validate_json(row[0])
            for row in self.connection.execute("SELECT snapshot FROM providers ORDER BY rowid")
        ]

    def get_provider(self, provider_id: str) -> Provider:
        for provider in self.list_providers():
            if provider.id == provider_id:
                return provider
        raise ValueError("provider_not_found")

    def delete_provider(self, provider_id: str) -> None:
        self.connection.execute("DELETE FROM providers WHERE id=?", (provider_id,))

    def list_reports(self) -> list[Report]:
        return [
            Report.model_validate_json(row[0])
            for row in self.connection.execute(
                "SELECT snapshot FROM reports ORDER BY rowid DESC LIMIT 500"
            )
        ]

    def report_record(self, report_id: str) -> tuple[Report, str]:
        row = self.connection.execute("SELECT * FROM reports WHERE id=?", (report_id,)).fetchone()
        if not row:
            raise ValueError("report_not_found")
        return Report.model_validate_json(row["snapshot"]), row["location"]

    def backup(self, target: Path) -> None:
        with sqlite3.connect(target) as destination:
            self.connection.backup(destination)
