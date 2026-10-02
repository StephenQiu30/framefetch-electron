from __future__ import annotations

import json
import os
import signal
import sys
import time
from pathlib import Path

import pytest
from test_integration import Engine


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


@pytest.mark.skipif(
    os.name == "nt", reason="Windows Job Object is validated by the main-process suite"
)
@pytest.mark.parametrize("victim", ["engine", "worker", "cancel", "mainpipe"])
def test_abrupt_parent_or_worker_death_reaps_real_tool_subtree(tmp_path: Path, victim: str) -> None:
    tools = tmp_path / "runtime" / "tools"
    tools.mkdir(parents=True)
    marker = tmp_path / "tool-pids.json"
    fake_probe = tools / "ffprobe"
    fake_probe.write_text(
        f"#!{sys.executable}\n"
        "import json, os, subprocess, sys, time\n"
        "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(120)'])\n"
        f"open({str(marker)!r}, 'w').write(json.dumps({{'tool': os.getpid(), 'child': child.pid, 'worker': os.getppid()}}))\n"
        "time.sleep(120)\n"
    )
    fake_probe.chmod(0o755)
    fake_ffmpeg = tools / "ffmpeg"
    fake_ffmpeg.write_text(f"#!{sys.executable}\n")
    fake_ffmpeg.chmod(0o755)
    source = tmp_path / "input.mp4"
    source.write_bytes(b"controlled-not-media-fixture")
    engine = Engine(tmp_path)
    pids = None
    try:
        engine.call("engine.hello", {"supervised": True})
        task = engine.call(
            "imports.create",
            {"source_path": str(source), "mode": "copy", "operation_id": "subtree-test"},
        )
        deadline = time.monotonic() + 10
        while not marker.exists() and time.monotonic() < deadline:
            time.sleep(0.05)
        assert marker.exists(), engine.call("tasks.get", {"task_id": task["id"]})
        pids = json.loads(marker.read_text())
        assert alive(pids["tool"]) and alive(pids["child"])
        if victim == "engine":
            engine.process.kill()
            engine.process.wait(timeout=5)
        elif victim == "worker":
            os.kill(pids["worker"], signal.SIGKILL)
        elif victim == "cancel":
            engine.call("tasks.cancel", {"task_id": task["id"]})
        else:
            assert engine.process.stdin
            engine.process.stdin.close()
            assert engine.process.wait(timeout=5) == 0
        deadline = time.monotonic() + 5
        while any(alive(pids[name]) for name in ["tool", "child"]) and time.monotonic() < deadline:
            time.sleep(0.05)
        assert not alive(pids["tool"]), "tool leaked after supervisor death"
        assert not alive(pids["child"]), "tool descendant leaked after supervisor death"
        if victim in {"worker", "cancel"}:
            assert engine.call("tasks.get", {"task_id": task["id"]})["status"] == (
                "failed" if victim == "worker" else "cancelled"
            )
            engine.close()
    finally:
        if engine.process.poll() is None:
            engine.process.kill()
            engine.process.wait()
        if pids:
            for pid in pids.values():
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
