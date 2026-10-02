from __future__ import annotations

import json
import math
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any, cast

from .files import MAX_VIDEO, fingerprint, hash_file
from .models import Inspection, VideoFormat
from .network import guarded_proxy, platform_url
from .resources import ResourcePaths


def run_tool(command: list[str], *, timeout: float = 120, output_limit: int = 8 * 1024**2) -> bytes:
    # Never pass inherited credential/proxy settings to tools or permit stdin reads.
    environment = {
        key: value
        for key, value in os.environ.items()
        if key in {"SYSTEMROOT", "WINDIR", "TMP", "TEMP", "LANG", "LC_ALL"}
    }
    environment.update({"LC_ALL": "C", "PYTHONNOUSERSITE": "1"})
    with tempfile.TemporaryFile() as output:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=output,
            stderr=subprocess.DEVNULL,
            env=environment,
        )
        deadline = time.monotonic() + timeout
        try:
            while process.poll() is None:
                if time.monotonic() > deadline:
                    raise ValueError("tool_timeout")
                if output.seek(0, os.SEEK_END) > output_limit:
                    raise ValueError("tool_output_too_large")
                time.sleep(0.05)
            if process.returncode:
                raise ValueError("tool_failed")
            output.seek(0)
            value = output.read(output_limit + 1)
            if len(value) > output_limit:
                raise ValueError("tool_output_too_large")
            return value
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()


def probe(path: Path, resources: ResourcePaths) -> dict[str, Any]:
    payload = run_tool(
        [
            str(resources.tool("ffprobe")),
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ],
        timeout=60,
    )
    try:
        metadata = json.loads(payload)
        video = next(
            stream for stream in metadata["streams"] if stream.get("codec_type") == "video"
        )
        duration = float(metadata["format"]["duration"])
        width, height = int(video["width"]), int(video["height"])
        if not math.isfinite(duration) or duration <= 0 or width <= 0 or height <= 0:
            raise ValueError("invalid_media")
        return {
            "duration_seconds": duration,
            "width": width,
            "height": height,
            "has_audio": any(stream.get("codec_type") == "audio" for stream in metadata["streams"]),
        }
    except (KeyError, StopIteration, TypeError, ValueError) as exc:
        raise ValueError("invalid_media") from exc


def thumbnail(path: Path, destination: Path, resources: ResourcePaths) -> None:
    run_tool(
        [
            str(resources.tool("ffmpeg")),
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist",
            "file",
            "-i",
            str(path),
            "-frames:v",
            "1",
            "-vf",
            "scale=640:-2",
            "-y",
            str(destination),
        ]
    )
    if not destination.is_file() or destination.stat().st_size > 4 * 1024**2:
        raise ValueError("thumbnail_invalid")


def full_decode(path: Path, resources: ResourcePaths, duration: float) -> None:
    run_tool(
        [
            str(resources.tool("ffmpeg")),
            "-nostdin",
            "-v",
            "error",
            "-xerror",
            "-err_detect",
            "explode",
            "-protocol_whitelist",
            "file",
            "-i",
            str(path),
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-f",
            "null",
            "-",
        ],
        timeout=min(7200, max(120, duration * 2)),
    )


def yt_base(resources: ResourcePaths, proxy: str) -> list[str]:
    return [
        str(resources.tool("yt-dlp")),
        "--ignore-config",
        "--no-update",
        "--no-plugin-dirs",
        "--no-cache-dir",
        "--no-playlist",
        "--no-warnings",
        "--no-progress",
        "--socket-timeout",
        "30",
        "--retries",
        "1",
        "--fragment-retries",
        "1",
        "--proxy",
        proxy,
        "--ffmpeg-location",
        str(resources.tool("ffmpeg").parent),
        "--no-js-runtimes",
        "--js-runtimes",
        "deno:" + str(resources.tool("deno")),
        "--no-remote-components",
        "--downloader",
        "native",
    ]


def inspect_metadata(url: str, resources: ResourcePaths, proxy: str) -> dict[str, Any]:
    platform_url(url)
    payload = run_tool(
        yt_base(resources, proxy) + ["--skip-download", "--dump-single-json", "--", url],
        timeout=120,
    )
    try:
        result = json.loads(payload)
        if not isinstance(result, dict):
            raise ValueError("invalid_platform_metadata")
        return cast(dict[str, Any], result)
    except (ValueError, TypeError) as exc:
        raise ValueError("invalid_platform_metadata") from exc


def protected_reason(metadata: dict[str, Any]) -> str | None:
    if metadata.get("has_drm"):
        return "protected_content"
    if metadata.get("availability") not in {None, "public"}:
        return "content_not_public"
    if metadata.get("age_limit", 0) > 0:
        return "age_restricted_content"
    if metadata.get("is_live") or metadata.get("live_status") in {
        "is_live",
        "is_upcoming",
        "post_live",
    }:
        return "live_content_not_supported"
    return None


def formats(metadata: dict[str, Any]) -> list[VideoFormat]:
    choices = []
    for item in metadata.get("formats", []):
        identifier = str(item.get("format_id", ""))
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", identifier):
            continue
        if item.get("has_drm") or item.get("vcodec") in {None, "none"}:
            continue
        if item.get("ext") not in {"mp4", "webm", "mkv"}:
            continue
        height = item.get("height")
        choices.append(
            VideoFormat(
                id=identifier,
                label=f"{height or '?'}p · {item.get('ext', 'mp4')}",
                height=height,
                width=item.get("width"),
                video_codec=item.get("vcodec"),
                audio_codec=None if item.get("acodec") == "none" else item.get("acodec"),
                ext=item["ext"],
                filesize_bytes=item.get("filesize") or item.get("filesize_approx"),
            )
        )
    return choices[:200]


def inspect(url: str, resources: ResourcePaths) -> Inspection:
    platform = platform_url(url)
    with guarded_proxy() as proxy:
        metadata = inspect_metadata(url, resources, proxy)
    reason = protected_reason(metadata)
    choices = formats(metadata)
    return Inspection(
        url=url,
        platform=platform,
        title=str(metadata.get("title") or "Untitled")[:500],
        duration_seconds=metadata.get("duration"),
        formats=choices,
        can_download=not reason and bool(choices),
        reason=reason or (None if choices else "no_clear_video_format"),
    )


def download(params: dict[str, Any], staging: Path, resources: ResourcePaths) -> dict[str, Any]:
    with guarded_proxy() as proxy:
        metadata = inspect_metadata(params["url"], resources, proxy)
        reason = protected_reason(metadata)
        if reason:
            raise ValueError(reason)
        choices = formats(metadata)
        chosen = next((item for item in choices if item.id == params.get("format_id")), None)
        if params.get("format_id") and not chosen:
            raise ValueError("selected_format_unavailable")
        if chosen:
            specification = chosen.id if chosen.audio_codec else chosen.id + "+bestaudio"
        else:
            height = params.get("height") or 1080
            specification = f"bestvideo[height<={height}]+bestaudio/best[height<={height}]"
        if chosen and chosen.filesize_bytes and chosen.filesize_bytes > MAX_VIDEO:
            raise ValueError("input_too_large")
        container = params.get("container") or "mp4"
        run_tool(
            yt_base(resources, proxy)
            + [
                "--format",
                specification,
                "--merge-output-format",
                container,
                "--max-filesize",
                str(MAX_VIDEO),
                "--restrict-filenames",
                "--no-part",
                "--paths",
                str(staging),
                "--output",
                "original.%(ext)s",
                "--",
                params["url"],
            ],
            timeout=7200,
        )
    outputs = list(staging.glob("original.*"))
    outputs = [item for item in outputs if item.suffix in {".mp4", ".webm", ".mkv"}]
    if len(outputs) != 1:
        raise ValueError("download_incomplete")
    path = outputs[0]
    if path.is_symlink() or not 0 < path.stat().st_size <= MAX_VIDEO:
        raise ValueError("download_incomplete")
    details = probe(path, resources)
    expected = metadata.get("duration")
    if not expected or abs(details["duration_seconds"] - float(expected)) > max(
        2, float(expected) * 0.01
    ):
        raise ValueError("download_duration_mismatch")
    if not details["has_audio"]:
        raise ValueError("download_audio_missing")
    full_decode(path, resources, details["duration_seconds"])
    thumbnail(path, staging / "thumbnail.jpg", resources)
    return {
        "title": str(metadata.get("title") or "Downloaded video")[:500],
        "source_path": str(path),
        "sha256": hash_file(path),
        "fingerprint": fingerprint(path),
        **details,
    }
