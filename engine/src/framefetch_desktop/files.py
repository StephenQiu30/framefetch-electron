from __future__ import annotations

import hashlib
import os
import shutil
import threading
from pathlib import Path

CHUNK = 1024 * 1024
MAX_VIDEO = 20 * 1024**3
MAX_DOCUMENT = 50 * 1024**2


def fingerprint(path: Path) -> tuple[int, int, int, int]:
    stat = path.stat()
    if not path.is_file():
        raise ValueError("not_regular_file")
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def hash_file(path: Path, cancel: threading.Event | None = None) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(CHUNK):
            if cancel is not None and cancel.is_set():
                raise ValueError("attempt_revoked")
            digest.update(chunk)
    return digest.hexdigest()


def sync_directory(path: Path) -> None:
    # Windows durable directory flushing requires platform acceptance separately.
    if os.name != "nt":
        descriptor = os.open(path, os.O_RDONLY)
        try:
            os.fsync(descriptor)
        finally:
            os.close(descriptor)


def snapshot(
    source: Path,
    destination: Path,
    expected_hash: str | None = None,
    cancel: threading.Event | None = None,
) -> str:
    before = fingerprint(source)
    if before[2] > MAX_VIDEO:
        raise ValueError("input_too_large")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(destination.parent).free < before[2] + 64 * 1024**2:
        raise ValueError("disk_full")
    digest = hashlib.sha256()
    created = False
    try:
        with source.open("rb") as reader, destination.open("xb") as writer:
            created = True
            while chunk := reader.read(CHUNK):
                if cancel is not None and cancel.is_set():
                    raise ValueError("attempt_revoked")
                digest.update(chunk)
                writer.write(chunk)
            writer.flush()
            os.fsync(writer.fileno())
        value = digest.hexdigest()
        if fingerprint(source) != before or (expected_hash and value != expected_hash):
            raise ValueError("source_changed")
        # Copy plus a second source hash catches writes retaining size/mtime while copying.
        if hash_file(source, cancel) != value or fingerprint(source) != before:
            raise ValueError("source_changed")
        return value
    except BaseException:
        if created:
            destination.unlink(missing_ok=True)
        raise


def inside(root: Path, path: Path) -> Path:
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(root.resolve()) or path.is_symlink():
        raise ValueError("path_outside_library")
    return resolved


def durable_publish(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        raise ValueError("destination_exists")
    with source.open("rb") as handle:
        os.fsync(handle.fileno())
    # Atomically create without replacing a concurrently created destination. Unlike
    # POSIX rename(), link() has no overwrite race. Remove the staging name afterward.
    os.link(source, destination)
    source.unlink()
    sync_directory(destination.parent)
