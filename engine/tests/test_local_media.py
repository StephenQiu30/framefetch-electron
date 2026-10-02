from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import pytest
from test_integration import Engine

from framefetch_desktop.files import hash_file
from framefetch_desktop.media import full_decode, probe, thumbnail
from framefetch_desktop.resources import ResourcePaths

ROOT = Path(__file__).resolve().parents[2]
RESOURCE_DIR = Path(
    os.environ.get("FRAMEFETCH_TEST_RESOURCE_DIR", ROOT / "resources/runtime/darwin-arm64")
)


@pytest.mark.skipif(
    not (RESOURCE_DIR / "tools/ffmpeg").exists(), reason="Pinned local tools are not prepared"
)
def test_real_bundled_ffmpeg_mp4_import_copy_hash_probe_thumbnail(tmp_path: Path) -> None:
    runtime = ResourcePaths(RESOURCE_DIR)
    source = tmp_path / "本地 视频.mp4"
    subprocess.run(
        [
            str(runtime.tool("ffmpeg")),
            "-nostdin",
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x180:rate=24",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=44100",
            "-t",
            "2",
            "-c:v",
            "mpeg4",
            "-c:a",
            "aac",
            "-pix_fmt",
            "yuv420p",
            str(source),
        ],
        check=True,
        stdin=subprocess.DEVNULL,
    )
    metadata = probe(source, runtime)
    assert metadata["width"] == 320 and metadata["height"] == 180
    full_decode(source, runtime, metadata["duration_seconds"])
    thumbnail(source, tmp_path / "thumbnail.jpg", runtime)
    engine = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "framefetch_desktop",
            "--data-dir",
            str(tmp_path / "data"),
            "--library-dir",
            str(tmp_path / "library"),
            "--resource-dir",
            str(RESOURCE_DIR),
        ],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    client = Engine.__new__(Engine)
    import queue
    import threading

    client.process, client.next_id, client.events = engine, 0, []
    client.messages = queue.Queue()
    threading.Thread(target=client.read, daemon=True).start()
    try:
        client.call("engine.hello", {"supervised": True})
        task = client.call(
            "imports.create",
            {"source_path": str(source), "mode": "copy", "operation_id": "real-media"},
        )
        for _ in range(100):
            current = client.call("tasks.get", {"task_id": task["id"]})
            if current["status"] in {"succeeded", "failed"}:
                break
            time.sleep(0.05)
        assert current["status"] == "succeeded", current
        asset = client.call("assets.list")[0]
        assert asset["sha256"] == hash_file(source)
        original = client.call("assets.resolve", {"asset_id": asset["id"], "kind": "original"})
        assert hash_file(Path(original["path"])) == asset["sha256"]
        preview = client.call("assets.resolve", {"asset_id": asset["id"], "kind": "thumbnail"})
        assert Path(preview["path"]).read_bytes().startswith(b"\xff\xd8")
        client.close()
    finally:
        if engine.poll() is None:
            engine.kill()
            engine.wait()
