from __future__ import annotations

import asyncio
import hashlib
import json
import mimetypes
import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Literal, cast
from urllib.parse import urlsplit

from pydantic import ValidationError

from .analysis import SKILL_VERSION, skill_hash
from .files import durable_publish, fingerprint, hash_file, inside, snapshot
from .models import (
    AnalysisInput,
    Asset,
    Capabilities,
    DownloadInput,
    EngineHello,
    ImportInput,
    Provider,
    ProviderInput,
    Report,
    Resources,
    Task,
    TaskKind,
)
from .network import validate_url
from .protocol import MAX_MESSAGE, Request, decode_request, encode, error, response
from .resources import ResourcePaths, worker_command
from .storage import Store, json_text, now
from .windows_jobs import WindowsJob


def parameters(params: dict[str, Any], allowed: set[str], required: set[str] | None = None) -> None:
    if params.keys() - allowed or (required or allowed) - params.keys():
        raise ValueError("invalid_parameters")
    for value in params.values():
        if not isinstance(value, str) or not value or len(value) > 32768:
            raise ValueError("invalid_parameters")


def bounded_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    size = 0
    for item in items:
        size += len(json_text(item).encode("utf-8")) + 1
        if size > MAX_MESSAGE - 1024:
            break
        result.append(item)
    return result


class Coordinator:
    def __init__(self, data_dir: Path, library_dir: Path, resource_dir: Path) -> None:
        self.store = Store(data_dir / "db")
        self.library = library_dir.resolve()
        self.library.mkdir(parents=True, exist_ok=True)
        self.resources = ResourcePaths(resource_dir)
        self.jobs: dict[str, asyncio.Task[None]] = {}
        self.processes: dict[str, asyncio.subprocess.Process] = {}
        self.secrets: dict[str, str] = {}
        self.ready = False
        self.stopping = asyncio.Event()
        self.output_lock = asyncio.Lock()
        self.worker_slots = asyncio.Semaphore(4)
        self.inspection_slots = asyncio.Semaphore(2)
        self.cancel_events: dict[str, threading.Event] = {}
        self.publishing: set[str] = set()
        self.windows_jobs: dict[int, WindowsJob] = {}

    async def send(self, message: dict[str, Any]) -> None:
        frame = encode(message)
        async with self.output_lock:
            sys.stdout.buffer.write(frame)
            sys.stdout.buffer.flush()

    async def notify(self) -> None:
        for message in self.store.events():
            await self.send(message)

    async def terminate(self, process: asyncio.subprocess.Process) -> None:
        job = self.windows_jobs.get(process.pid)
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
        elif job is not None:
            job.terminate()
        elif process.returncode is None:
            process.terminate()
        try:
            await asyncio.wait_for(process.wait(), 2)
        except TimeoutError:
            pass
        # Kill remaining descendants even if task-worker itself already exited.
        if os.name != "nt":
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        elif process.returncode is None:
            process.kill()
        await process.wait()
        if job is not None:
            deadline = time.monotonic() + 3
            while job.active_processes() and time.monotonic() < deadline:
                await asyncio.sleep(0.05)
            if job.active_processes():
                job.close()
                self.windows_jobs.pop(process.pid, None)
                raise ValueError("windows_tree_not_quiet")
            job.close()
            self.windows_jobs.pop(process.pid, None)

    async def run_worker(
        self, job_id: str, payload: dict[str, Any], task: Task | None = None
    ) -> dict[str, Any]:
        if payload["kind"] == "inspect":
            async with self.inspection_slots, self.worker_slots:
                return await self._run_worker(job_id, payload, task)
        async with self.worker_slots:
            return await self._run_worker(job_id, payload, task)

    async def _run_worker(
        self, job_id: str, payload: dict[str, Any], task: Task | None = None
    ) -> dict[str, Any]:
        environment = {
            key: value
            for key, value in os.environ.items()
            if key in {"SYSTEMROOT", "WINDIR", "TMP", "TEMP", "LANG", "LC_ALL"}
        }
        options: dict[str, Any] = (
            {"start_new_session": True}
            if os.name != "nt"
            else {"creationflags": cast(Any, subprocess).CREATE_NEW_PROCESS_GROUP}
        )
        process = await asyncio.create_subprocess_exec(
            *worker_command(self.resources.directory),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            env=environment,
            limit=MAX_MESSAGE + 2,
            **options,
        )
        self.processes[job_id] = process
        try:
            if os.name == "nt":
                # Worker waits for the initial task frame. Assign the nested job before
                # sending it, so every subsequently spawned tool inherits the job.
                self.windows_jobs[process.pid] = WindowsJob(process.pid)
            assert process.stdin is not None and process.stdout is not None
            encoded = json_text(payload).encode() + b"\n"
            if len(encoded) > MAX_MESSAGE:
                raise ValueError("worker_input_too_large")
            process.stdin.write(encoded)
            await process.stdin.drain()
            del encoded
            payload.pop("api_key", None)
            result = None
            while line := await asyncio.wait_for(process.stdout.readline(), 7300):
                if len(line) > MAX_MESSAGE:
                    raise ValueError("worker_result_too_large")
                message = json.loads(line)
                if message["type"] == "model_started":
                    if (
                        task is None
                        or message.get("task_id") != task.id
                        or message.get("attempt_id") != task.attempt_id
                    ):
                        raise ValueError("worker_attempt_mismatch")
                    self.store.start_model_step(task.id, task.attempt_id)
                    await self.notify()
                    # The transaction above is FULL-synchronous and committed before ack.
                    process.stdin.write(b'{"type":"model_start_ack"}\n')
                    await process.stdin.drain()
                elif message["type"] == "error":
                    code = message.get("code", "worker_failed")
                    if (
                        not isinstance(code, str)
                        or len(code) > 80
                        or not all(
                            character.islower() or character.isdigit() or character == "_"
                            for character in code
                        )
                    ):
                        code = "worker_failed"
                    raise ValueError(code)
                elif message["type"] == "result":
                    result = message["result"]
                    break
                else:
                    raise ValueError("worker_protocol_error")
            if result is None:
                raise ValueError("worker_exited")
            await asyncio.wait_for(process.wait(), 3)
            if process.returncode:
                raise ValueError("worker_exited")
            return cast(dict[str, Any], result)
        finally:
            await self.terminate(process)
            if process.stdin:
                process.stdin.close()
            self.processes.pop(job_id, None)

    async def available_asset(
        self, asset_id: str, *, verify_hash: bool = False
    ) -> tuple[Asset, Path, dict[str, Any]]:
        asset, location, details = self.store.asset_record(asset_id)
        path = Path(location)
        # A stat-only refresh cannot undo a previous content-hash mismatch.
        availability = (
            "changed" if asset.availability == "changed" and not verify_hash else "available"
        )
        try:
            if not path.is_file():
                availability = "missing"
            elif asset.mode == "copy":
                inside(self.library, path)
            elif list(fingerprint(path)) != details["fingerprint"]:
                availability = "changed"
            if availability == "available" and verify_hash:
                result = await self.run_worker(
                    "check-" + str(uuid.uuid4()),
                    {"kind": "check_file", "params": {"path": str(path), "sha256": asset.sha256}},
                )
                availability = result["availability"]
        except (OSError, ValueError):
            availability = "missing" if not path.is_file() else "changed"
        if asset.availability != availability:
            asset = self.store.asset_availability(asset.id, availability)
        return asset, path, details

    async def publish_files(self, intent: dict[str, Any]) -> None:
        cancel = self.cancel_events.get(intent.get("task_id", ""))
        for file in intent["files"]:
            if cancel is not None and cancel.is_set():
                raise ValueError("attempt_revoked")
            source, destination = Path(file["source"]), Path(file["destination"])
            if intent["kind"] != "export":
                destination.parent.mkdir(parents=True, exist_ok=True)
                inside(self.library, destination.parent)
            if destination.exists():
                if (
                    not destination.is_file()
                    or list(fingerprint(destination)) != file.get("source_identity")
                    or await asyncio.to_thread(hash_file, destination, cancel) != file["sha256"]
                ):
                    raise ValueError("published_file_changed")
            else:
                if (
                    not source.exists()
                    or await asyncio.to_thread(hash_file, source, cancel) != file["sha256"]
                ):
                    raise ValueError("publication_incomplete")
                await asyncio.to_thread(durable_publish, source, destination)

    def commit_intent(self, task: Task, intent: dict[str, Any]) -> bool:
        with self.store.transaction():
            if not self.store.has_publish_right(task.id, task.attempt_id):
                return False
            if intent["kind"] == "asset":
                asset = Asset.model_validate(intent["asset"])
                self.store.put_asset(asset, intent["location"], intent["details"])
                self.store.update_task(
                    task.id,
                    asset_id=asset.id,
                    status="succeeded",
                    stage="succeeded",
                    progress=1,
                    message="Imported successfully",
                )
            elif intent["kind"] == "report":
                report = Report.model_validate(intent["report"])
                self.store.connection.execute(
                    "INSERT INTO reports VALUES (?,?,?,?)",
                    (report.id, report.asset_id, report.model_dump_json(), intent["location"]),
                )
                self.store.connection.execute(
                    "UPDATE analysis_steps SET status='succeeded',result_hash=? WHERE task_id=? AND attempt_id=? AND status='started'",
                    (intent["result_hash"], task.id, task.attempt_id),
                )
                self.store.emit("reports.changed", {"report_id": report.id})
                self.store.update_task(
                    task.id,
                    status="succeeded",
                    stage="succeeded",
                    progress=1,
                    message="Report created",
                )
            else:
                self.store.update_task(
                    task.id,
                    status="succeeded",
                    stage="succeeded",
                    progress=1,
                    message="Report exported",
                )
            self.store.connection.execute(
                "UPDATE artifacts SET phase='committed' WHERE task_id=?", (task.id,)
            )
        return True

    async def make_intent(
        self, task: Task, staging: Path, result: dict[str, Any]
    ) -> dict[str, Any]:
        params = self.store.task_params(task.id)
        intent: dict[str, Any] = {"files": [], "task_id": task.id, "attempt_id": task.attempt_id}
        if task.kind in {"import_video", "import_document", "download"}:
            asset_id = str(uuid.uuid4())
            kind: Literal["document", "video"] = (
                "document" if task.kind == "import_document" else "video"
            )
            mode = params.get("mode", "copy")
            directory = self.library / ("documents" if kind == "document" else "media") / asset_id
            asset = Asset(
                id=asset_id,
                kind=kind,
                title=result["title"],
                size_bytes=result["size_bytes"],
                sha256=result["sha256"],
                duration_seconds=result.get("duration_seconds"),
                width=result.get("width"),
                height=result.get("height"),
                created_at=now(),
                text_preview=result.get("text_preview"),
                mode=mode,
            )
            details = {"fingerprint": result["fingerprint"]}
            original = inside(staging, Path(result["original_path"]))
            location = str(directory / original.name) if mode == "copy" else result["source_path"]
            if mode == "copy":
                intent["files"].append(
                    {"source": str(original), "destination": location, "sha256": result["sha256"]}
                )
            for name, key in [("thumbnail.jpg", "thumbnail_path"), ("text.txt", "text_path")]:
                source = staging / name
                if source.exists():
                    destination = directory / name
                    details[key] = str(destination)
                    intent["files"].append(
                        {
                            "source": str(source),
                            "destination": str(destination),
                            "sha256": await asyncio.to_thread(hash_file, source),
                        }
                    )
            intent.update(
                {
                    "kind": "asset",
                    "asset": asset.model_dump(),
                    "details": details,
                    "location": location,
                }
            )
        elif task.kind == "analysis":
            report_id = str(uuid.uuid4())
            report_data = result["report"]
            report = Report(
                id=report_id,
                asset_id=params["asset_id"],
                provider_label=params["provider"]["label"],
                model=params["provider"]["model"],
                skill=params["skill"],
                title=report_data["title"],
                summary=report_data["summary"],
                markdown=report_data["markdown"],
                created_at=now(),
                source_sha256=params["source_sha256"],
            )
            directory = self.library / "reports" / report_id
            for name in ["report.md", "result.json"]:
                source = staging / name
                intent["files"].append(
                    {
                        "source": str(source),
                        "destination": str(directory / name),
                        "sha256": await asyncio.to_thread(hash_file, source),
                    }
                )
            intent.update(
                {
                    "kind": "report",
                    "report": report.model_dump(),
                    "location": str(directory / "report.md"),
                    "result_hash": intent["files"][1]["sha256"],
                }
            )
        else:
            # Cross-volume export uses a private temporary file on the destination volume.
            destination = Path(params["destination_path"])
            if destination.exists():
                raise ValueError("destination_exists")
            if not destination.is_absolute() or not destination.parent.is_dir():
                raise ValueError("invalid_export_path")
            temporary = destination.parent / (
                ".framefetch-" + task.id + "-" + str(task.attempt_id) + ".tmp"
            )
            await asyncio.to_thread(
                snapshot,
                inside(staging, Path(result["export_path"])),
                temporary,
                result["sha256"],
                self.cancel_events.get(task.id),
            )
            intent.update(
                {
                    "kind": "export",
                    "files": [
                        {
                            "source": str(temporary),
                            "destination": str(destination),
                            "sha256": result["sha256"],
                        }
                    ],
                }
            )
        for file in intent["files"]:
            file["source_identity"] = list(fingerprint(Path(file["source"])))
        return intent

    async def publish(self, task: Task, staging: Path, result: dict[str, Any]) -> None:
        if not self.store.has_publish_right(task.id, task.attempt_id):
            return
        self.publishing.add(task.id)
        self.store.update_task(task.id, stage="publishing", message="Verifying publication")
        intent = await self.make_intent(task, staging, result)
        if not self.store.has_publish_right(task.id, task.attempt_id):
            await self.clean_intent(intent)
            return
        with self.store.transaction():
            if not self.store.has_publish_right(task.id, task.attempt_id):
                return
            self.store.connection.execute(
                "INSERT OR REPLACE INTO artifacts VALUES (?,?,?, 'prepared')",
                (task.id, task.attempt_id, json_text(intent)),
            )
        await self.publish_files(intent)
        if not self.commit_intent(task, intent):
            await self.clean_intent(intent)

    async def clean_intent(self, intent: dict[str, Any]) -> None:
        for file in intent["files"]:
            for field in ("source", "destination"):
                path = Path(file[field])
                if (
                    path.is_file()
                    and list(fingerprint(path)) == file.get("source_identity")
                    and await asyncio.to_thread(hash_file, path) == file["sha256"]
                ):
                    path.unlink(missing_ok=True)

    async def retire_intent(
        self, task_id: str, attempt_id: str | None, intent: dict[str, Any]
    ) -> None:
        await self.clean_intent(intent)
        with self.store.transaction():
            self.store.connection.execute(
                "UPDATE artifacts SET phase='retired' WHERE task_id=? AND attempt_id=? AND phase='prepared'",
                (task_id, attempt_id),
            )

    async def recover(self) -> None:
        rows = self.store.connection.execute(
            "SELECT * FROM artifacts WHERE phase='prepared'"
        ).fetchall()
        for row in rows:
            task = self.store.get_task(row["task_id"])
            intent = json.loads(row["intent"])
            if self.store.has_publish_right(task.id, row["attempt_id"]):
                try:
                    await self.publish_files(intent)
                    self.commit_intent(task, intent)
                except (ValueError, OSError):
                    await self.retire_intent(task.id, row["attempt_id"], intent)
            else:
                await self.retire_intent(task.id, row["attempt_id"], intent)
        self.store.recover()
        # Analysis queued before shutdown lost its ephemeral key; never recover by billing.
        for task in self.store.queued_tasks():
            if task.kind == "analysis" and task.id not in self.secrets:
                self.store.update_task(
                    task.id,
                    status="needs_attention",
                    stage="key_required",
                    error_code="analysis_requires_new_authorized_request",
                    message="Start a new analysis to authorize a Provider request",
                )
        staging_root = self.library / ".staging"
        if not staging_root.exists():
            return
        inside(self.library, staging_root)
        for directory in staging_root.iterdir():
            if not directory.is_dir() or directory.is_symlink():
                continue
            try:
                task = self.store.get_task(directory.name)
            except ValueError:
                continue
            if task.status in {
                "cancelled",
                "failed",
                "interrupted",
                "needs_attention",
                "succeeded",
            }:
                await self.remove_staging(directory)

    async def remove_staging(self, path: Path) -> None:
        try:
            verified = inside(self.library, path)
        except (ValueError, FileNotFoundError):
            return
        if verified.is_dir():
            await asyncio.to_thread(shutil.rmtree, verified)

    async def execute(self, task: Task) -> None:
        try:
            await self._execute(task)
        except Exception:
            self.store.finish_task(
                task.id,
                task.attempt_id,
                "failed",
                error_code="task_preparation_failed",
                message="Could not prepare task storage",
            )
        finally:
            staging = self.library / ".staging" / task.id / str(task.attempt_id)
            await self.remove_staging(staging)
            self.jobs.pop(task.id, None)
            self.secrets.pop(task.id, None)
            self.cancel_events.pop(task.id, None)
            self.publishing.discard(task.id)
            await self.notify()

    async def _execute(self, task: Task) -> None:
        staging_root = self.library / ".staging"
        staging_root.mkdir(exist_ok=True, mode=0o700)
        inside(self.library, staging_root)
        staging = self.library / ".staging" / task.id / str(task.attempt_id)
        staging.mkdir(parents=True, exist_ok=True, mode=0o700)
        inside(self.library, staging)
        self.cancel_events[task.id] = threading.Event()
        params = self.store.task_params(task.id)
        payload = {
            "kind": task.kind,
            "task_id": task.id,
            "attempt_id": task.attempt_id,
            "params": params,
            "staging": str(staging),
            "library_dir": str(self.library),
        }
        if task.kind == "analysis":
            secret = self.secrets.pop(task.id, None)
            if secret is None:
                self.store.finish_task(
                    task.id,
                    task.attempt_id,
                    "needs_attention",
                    error_code="key_required",
                    message="Start a new analysis to provide credentials",
                )
                return
            payload["api_key"] = secret
            del secret
        try:
            result = await self.run_worker(task.id, payload, task)
            await self.publish(task, staging, result)
            self.store.finish_cancel(task.id)
        except asyncio.CancelledError:
            process = self.processes.get(task.id)
            if process:
                await self.terminate(process)
            self.store.finish_cancel(task.id)
        except Exception as exc:
            code = str(exc) if isinstance(exc, ValueError) else "task_failed"
            if len(code) > 80 or not all(c.islower() or c.isdigit() or c == "_" for c in code):
                code = "task_failed"
            if code == "source_changed" and params.get("asset_id"):
                self.store.asset_availability(params["asset_id"], "changed")
            unknown = self.store.step_status(task.id) == "started"
            if unknown:
                self.store.connection.execute(
                    "UPDATE analysis_steps SET status='unknown' WHERE task_id=? AND status='started'",
                    (task.id,),
                )
            self.store.finish_task(
                task.id,
                task.attempt_id,
                "needs_attention" if unknown else "failed",
                error_code="model_result_unknown" if unknown else code,
                message="Provider result unknown; start a new analysis only after reviewing"
                if unknown
                else code.replace("_", " "),
            )
            self.store.finish_cancel(task.id)
        finally:
            self.secrets.pop(task.id, None)
            pending = self.store.connection.execute(
                "SELECT intent FROM artifacts WHERE task_id=? AND phase='prepared'", (task.id,)
            ).fetchone()
            if pending and not self.store.has_publish_right(task.id, task.attempt_id):
                await self.retire_intent(task.id, task.attempt_id, json.loads(pending["intent"]))
            await self.remove_staging(staging)
            self.jobs.pop(task.id, None)
            await self.notify()

    async def schedule(self) -> None:
        while not self.stopping.is_set():
            if self.ready:
                active = [self.store.get_task(task_id) for task_id in self.jobs]
                for task in self.store.queued_tasks():
                    if len(self.jobs) >= 2:
                        break
                    heavy = {"import_video", "download", "analysis"}
                    if task.kind in heavy and any(item.kind in heavy for item in active):
                        continue
                    started = self.store.start_task(task.id)
                    self.jobs[started.id] = asyncio.create_task(self.execute(started))
                    active.append(started)
                await self.notify()
            await asyncio.sleep(0.1)

    async def shutdown(self) -> None:
        self.ready = False
        for task_id, job in list(self.jobs.items()):
            self.store.cancel_task(task_id)
            if task_id in self.cancel_events:
                self.cancel_events[task_id].set()
            if task_id not in self.publishing:
                job.cancel()
        if self.jobs:
            await asyncio.gather(*list(self.jobs.values()), return_exceptions=True)
        for process in list(self.processes.values()):
            await self.terminate(process)
        self.secrets.clear()
        await self.notify()

    async def dispatch(self, request: Request) -> Any:
        method, params = request.method, request.params
        if method == "engine.hello":
            if params not in ({}, {"supervised": True}):
                raise ValueError("invalid_parameters")
            if os.name == "nt" and params != {"supervised": True}:
                raise ValueError("windows_supervision_required")
            if not self.ready:
                await self.recover()
                self.ready = True
            ffmpeg, ffprobe, ytdlp = (
                self.resources.available(name) for name in ["ffmpeg", "ffprobe", "yt-dlp"]
            )
            return EngineHello(
                capabilities=Capabilities(
                    import_video=ffmpeg and ffprobe,
                    import_document=True,
                    download=ffmpeg and ffprobe and ytdlp and self.resources.available("deno"),
                    analysis=True,
                ),
                resources=Resources(ffmpeg=ffmpeg, ffprobe=ffprobe, yt_dlp=ytdlp),
            ).model_dump()
        if not self.ready:
            raise ValueError("engine_not_ready")
        if method == "engine.shutdown":
            parameters(params, set())
            await self.shutdown()
            self.stopping.set()
            return {"stopped": True}
        if method == "imports.create":
            value = ImportInput.model_validate(params)
            source = Path(value.source_path)
            if not source.is_absolute() or not source.is_file():
                raise ValueError("source_not_found")
            source = source.resolve(strict=True)
            extension = source.suffix.lower()
            import_kind: TaskKind = "import_video" if extension == ".mp4" else "import_document"
            if import_kind == "import_video" and not (
                self.resources.available("ffmpeg") and self.resources.available("ffprobe")
            ):
                raise ValueError("media_resources_unavailable")
            if extension not in {".mp4", ".pdf", ".docx", ".txt", ".md", ".fountain"}:
                raise ValueError("input_format_unsupported")
            return self.store.create_task(
                import_kind, {"source_path": str(source), "mode": value.mode}, value.operation_id
            ).model_dump()
        if method == "tasks.list":
            parameters(params, set())
            return bounded_items([task.model_dump() for task in self.store.list_tasks()])
        if method in {"tasks.get", "tasks.cancel", "tasks.retry"}:
            parameters(params, {"task_id"})
            if method == "tasks.get":
                return self.store.get_task(params["task_id"]).model_dump()
            if method == "tasks.retry":
                return self.store.retry(params["task_id"]).model_dump()
            task = self.store.cancel_task(params["task_id"])
            self.secrets.pop(task.id, None)
            if task.id in self.cancel_events:
                self.cancel_events[task.id].set()
            if task.id in self.jobs and task.id not in self.publishing:
                self.jobs[task.id].cancel()
            return task.model_dump()
        if method == "assets.list":
            parameters(params, set())
            result = []
            for item in self.store.list_assets():
                asset, _, _ = await self.available_asset(item.id)
                result.append(asset.model_dump())
            return bounded_items(result)
        if method in {"assets.get", "assets.resolve", "assets.text"}:
            parameters(params, {"asset_id", "kind"} if method == "assets.resolve" else {"asset_id"})
            asset, path, details = await self.available_asset(
                params["asset_id"],
                verify_hash=method == "assets.text"
                or (method == "assets.resolve" and params["kind"] == "original"),
            )
            if method == "assets.get":
                return asset.model_dump()
            if asset.availability != "available":
                raise ValueError("asset_" + asset.availability)
            if method == "assets.text":
                if asset.kind != "document" or not details.get("text_path"):
                    raise ValueError("asset_not_document")
                text_path = inside(self.library, Path(details["text_path"]))
                if text_path.stat().st_size > 750000:
                    raise ValueError("document_text_too_large")
                return await asyncio.to_thread(text_path.read_text, encoding="utf-8")
            if params["kind"] == "thumbnail":
                if not details.get("thumbnail_path"):
                    raise ValueError("thumbnail_not_found")
                path = inside(self.library, Path(details["thumbnail_path"]))
            elif params["kind"] != "original":
                raise ValueError("invalid_parameters")
            return {
                "path": str(path),
                "mime_type": mimetypes.guess_type(path.name)[0] or "application/octet-stream",
                "size_bytes": path.stat().st_size,
            }
        if method == "media.inspect":
            parameters(params, {"url"})
            if sum(key.startswith("inspect-") for key in self.processes) >= 2:
                raise ValueError("inspection_limit")
            return await self.run_worker(
                "inspect-" + str(uuid.uuid4()), {"kind": "inspect", "params": params}
            )
        if method == "downloads.create":
            download_input = DownloadInput.model_validate(params)
            from .network import platform_url

            await asyncio.to_thread(platform_url, download_input.url)
            payload = download_input.model_dump(exclude={"operation_id"})
            return self.store.create_task(
                "download", payload, download_input.operation_id
            ).model_dump()
        if method == "providers.list":
            parameters(params, set())
            return bounded_items(
                [provider.model_dump() for provider in self.store.list_providers()]
            )
        if method == "providers.upsert":
            provider_input = ProviderInput.model_validate(params)
            parsed = urlsplit(provider_input.base_url)
            if parsed.scheme != "https" or parsed.query or parsed.fragment or parsed.username:
                raise ValueError("provider_requires_public_https")
            await asyncio.to_thread(validate_url, provider_input.base_url)
            provider = Provider(
                id=provider_input.id or str(uuid.uuid4()),
                label=provider_input.label,
                base_url=provider_input.base_url.rstrip("/"),
                model=provider_input.model,
                vision=provider_input.vision,
            )
            return self.store.upsert_provider(provider).model_dump()
        if method == "providers.delete":
            parameters(params, {"provider_id"})
            self.store.delete_provider(params["provider_id"])
            return {"deleted": True}
        if method == "analysis.create":
            analysis_input = AnalysisInput.model_validate(params)
            asset, path, _ = await self.available_asset(analysis_input.asset_id, verify_hash=True)
            if asset.availability != "available":
                raise ValueError("asset_" + asset.availability)
            provider = self.store.get_provider(analysis_input.provider_id)
            # Main binds this non-secret endpoint to the key it supplied. A request
            # can remain pending after its caller times out, so recheck after every
            # awaited source validation and before persisting or retaining its key.
            if provider.base_url != analysis_input.expected_provider_base_url:
                raise ValueError("provider_endpoint_changed")
            if asset.kind == "video" and not provider.vision:
                raise ValueError("provider_vision_required")
            if asset.kind == "document" and analysis_input.skill != "screenplay-analysis":
                raise ValueError("document_skill_unsupported")
            payload = {
                "asset_id": asset.id,
                "source_path": str(path),
                "source_sha256": asset.sha256,
                "asset_kind": asset.kind,
                "provider": provider.model_dump(exclude={"key_set"}),
                "skill": analysis_input.skill,
                "skill_version": SKILL_VERSION,
                "skill_sha256": skill_hash(analysis_input.skill),
            }
            task = self.store.create_task(
                "analysis", payload, analysis_input.operation_id or str(uuid.uuid4())
            )
            if task.status == "queued":
                self.secrets[task.id] = analysis_input.api_key
            return task.model_dump()
        if method == "reports.list":
            parameters(params, set())
            # Bound the response; full historical report pagination is a later UI slice.
            reports = []
            size = 0
            for report in self.store.list_reports():
                report_item = report.model_dump()
                report_item["markdown"] = ""
                report_item["summary"] = report_item["summary"][:1000]
                size += len(json_text(report_item).encode())
                if size > MAX_MESSAGE - 1024:
                    break
                reports.append(report_item)
            return reports
        if method == "reports.get":
            parameters(params, {"report_id"})
            report, _ = self.store.report_record(params["report_id"])
            return report.model_dump()
        if method == "reports.resolve":
            parameters(params, {"report_id"})
            report, location = self.store.report_record(params["report_id"])
            path = inside(self.library, Path(location))
            return {
                "path": str(path),
                "mime_type": "text/markdown",
                "size_bytes": path.stat().st_size,
                "report_id": report.id,
            }
        if method == "reports.export":
            parameters(params, {"report_id", "format", "destination_path", "operation_id"})
            if params["format"] not in {"md", "docx"}:
                raise ValueError("invalid_parameters")
            report, location = self.store.report_record(params["report_id"])
            source = inside(self.library, Path(location))
            payload = {
                **params,
                "source_path": str(source),
                "source_sha256": hashlib.sha256(report.markdown.encode()).hexdigest(),
            }
            payload.pop("operation_id")
            return self.store.create_task(
                "export_report", payload, params["operation_id"]
            ).model_dump()
        raise ValueError("method_not_found")

    async def handle(self, data: bytes) -> None:
        request: Request | None = None
        try:
            request = decode_request(data)
            result = await self.dispatch(request)
            await self.send(response(request.id, result))
        except (ValueError, ValidationError) as exc:
            message = str(exc) if type(exc) is ValueError else "invalid_parameters"
            if (
                not message
                or len(message) > 80
                or not all(c.islower() or c.isdigit() or c == "_" for c in message)
            ):
                message = "invalid_parameters"
            await self.send(
                error(
                    request.id if request else None,
                    -32601 if message == "method_not_found" else -32602,
                    message,
                )
            )
        except Exception:
            await self.send(error(request.id if request else None, -32603, "engine_error"))
        await self.notify()

    async def serve(self) -> None:
        loop = asyncio.get_running_loop()
        incoming: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=100)

        def read_input() -> None:
            buffer = bytearray()
            while not self.stopping.is_set():
                block = os.read(sys.stdin.fileno(), 65536)
                buffer.extend(block)
                lines: list[bytes | None] = []
                while b"\n" in buffer:
                    line, _, remaining = buffer.partition(b"\n")
                    lines.append(bytes(line))
                    buffer = bytearray(remaining)
                if len(buffer) > MAX_MESSAGE:
                    lines.append(bytes(buffer))
                    buffer.clear()
                if not block:
                    if buffer:
                        lines.append(bytes(buffer))
                    lines.append(None)
                for data in lines:
                    try:
                        future = asyncio.run_coroutine_threadsafe(incoming.put(data), loop)
                        future.result(timeout=10)
                    except Exception:
                        return
                    if data is None or len(data) > MAX_MESSAGE:
                        return
                if not block:
                    return

        threading.Thread(target=read_input, daemon=True).start()
        scheduler = asyncio.create_task(self.schedule())
        requests: set[asyncio.Task[None]] = set()
        try:
            while not self.stopping.is_set():
                get = asyncio.create_task(incoming.get())
                stop = asyncio.create_task(self.stopping.wait())
                done, pending = await asyncio.wait({get, stop}, return_when=asyncio.FIRST_COMPLETED)
                for item in pending:
                    item.cancel()
                if stop in done:
                    break
                data = get.result()
                if data is None:
                    break
                if len(data) > MAX_MESSAGE:
                    await self.send(error(None, -32600, "message_too_large"))
                    break
                if len(requests) >= 32:
                    try:
                        limited = decode_request(data)
                        await self.send(error(limited.id, -32000, "request_limit"))
                    except ValueError:
                        await self.send(error(None, -32600, "invalid_request"))
                    continue
                task = asyncio.create_task(self.handle(data))
                requests.add(task)
                task.add_done_callback(requests.discard)
        finally:
            self.stopping.set()
            scheduler.cancel()
            for request_task in requests:
                request_task.cancel()
            await asyncio.gather(scheduler, *requests, return_exceptions=True)
            await self.shutdown()
            self.store.close()
