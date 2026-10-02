from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

TaskKind = Literal["import_video", "import_document", "download", "analysis", "export_report"]
TaskStatus = Literal[
    "queued",
    "running",
    "cancelling",
    "cancelled",
    "succeeded",
    "failed",
    "interrupted",
    "needs_attention",
]
Skill = Literal[
    "comprehensive",
    "visual-shots",
    "highlights",
    "video-to-article",
    "screenplay-analysis",
]


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Capabilities(DTO):
    import_video: bool
    import_document: bool
    download: bool
    analysis: bool


class Resources(DTO):
    ffmpeg: bool
    ffprobe: bool
    yt_dlp: bool


class EngineHello(DTO):
    protocol_version: Literal["1"] = "1"
    engine_version: str = "0.1.0"
    schema_version: str = "1"
    capabilities: Capabilities
    resources: Resources


class Asset(DTO):
    id: str
    kind: Literal["video", "document"]
    title: str
    size_bytes: int
    sha256: str
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    created_at: str
    availability: Literal["available", "missing", "changed"] = "available"
    text_preview: str | None = None
    mode: Literal["reference", "copy"] = "reference"


class Task(DTO):
    id: str
    kind: TaskKind
    status: TaskStatus
    stage: str
    progress: float | None = Field(default=None, ge=0, le=1)
    message: str | None = None
    asset_id: str | None = None
    error_code: str | None = None
    created_at: str
    updated_at: str
    revision: int
    attempt: int = 0
    attempt_id: str | None = None


class VideoFormat(DTO):
    id: str
    label: str
    height: int | None = None
    width: int | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    ext: str
    filesize_bytes: int | None = None


class Inspection(DTO):
    url: str
    platform: Literal["youtube", "bilibili", "unsupported"]
    title: str
    duration_seconds: float | None = None
    formats: list[VideoFormat]
    can_download: bool
    reason: str | None = None


class Provider(DTO):
    id: str
    label: str
    base_url: str
    model: str
    vision: bool
    key_set: bool = False


class Report(DTO):
    id: str
    asset_id: str
    status: Literal["succeeded"] = "succeeded"
    provider_label: str
    model: str
    skill: Skill
    title: str
    summary: str
    markdown: str
    created_at: str
    source_sha256: str


class ImportInput(DTO):
    source_path: str = Field(min_length=1, max_length=32768)
    mode: Literal["reference", "copy"]
    operation_id: str = Field(min_length=1, max_length=128)


class DownloadInput(DTO):
    url: str = Field(min_length=1, max_length=4096)
    format_id: str | None = Field(default=None, max_length=64)
    height: int | None = Field(default=None, ge=1, le=4320)
    container: Literal["mp4", "webm", "mkv"] | None = None
    operation_id: str = Field(min_length=1, max_length=128)


class ProviderInput(DTO):
    id: str | None = Field(default=None, min_length=1, max_length=128)
    label: str = Field(min_length=1, max_length=128)
    base_url: str = Field(min_length=1, max_length=2048)
    model: str = Field(min_length=1, max_length=256)
    vision: bool


class AnalysisInput(DTO):
    asset_id: str
    provider_id: str
    skill: Skill
    api_key: str = Field(min_length=1, max_length=8192, repr=False)
    expected_provider_base_url: str = Field(min_length=1, max_length=2048)
    operation_id: str | None = Field(default=None, max_length=128)


class Evidence(DTO):
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    frame_indices: list[int] = Field(max_length=64)
    description: str = Field(min_length=1, max_length=4000)


class AnalysisResult(DTO):
    title: str = Field(min_length=1, max_length=200)
    summary: str = Field(min_length=1, max_length=8000)
    markdown: str = Field(min_length=1, max_length=100000)
    evidence: list[Evidence] = Field(max_length=256)


class EngineContract(DTO):
    hello: EngineHello
    asset: Asset
    task: Task
    inspection: Inspection
    format: VideoFormat
    provider: Provider
    report: Report
    import_input: ImportInput
    download_input: DownloadInput
    provider_input: ProviderInput
    analysis_input: AnalysisInput
