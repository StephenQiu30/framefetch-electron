/* Generated from the Python engine JSON Schema. Run pnpm contract:generate. */

export type ProtocolVersion = '1';
export type EngineVersion = string;
export type SchemaVersion = string;
export type ImportVideo = boolean;
export type ImportDocument = boolean;
export type Download = boolean;
export type Analysis = boolean;
export type Ffmpeg = boolean;
export type Ffprobe = boolean;
export type YtDlp = boolean;
export type Id = string;
export type Kind = 'video' | 'document';
export type Title = string;
export type SizeBytes = number;
export type Sha256 = string;
export type DurationSeconds = number | null;
export type Width = number | null;
export type Height = number | null;
export type CreatedAt = string;
export type Availability = 'available' | 'missing' | 'changed';
export type TextPreview = string | null;
export type Mode = 'reference' | 'copy';
export type Id1 = string;
export type Kind1 = 'import_video' | 'import_document' | 'download' | 'analysis' | 'export_report';
export type Status =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'cancelled'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'needs_attention';
export type Stage = string;
export type Progress = number | null;
export type Message = string | null;
export type AssetId = string | null;
export type ErrorCode = string | null;
export type CreatedAt1 = string;
export type UpdatedAt = string;
export type Revision = number;
export type Attempt = number;
export type AttemptId = string | null;
export type Url = string;
export type Platform = 'youtube' | 'bilibili' | 'unsupported';
export type Title1 = string;
export type DurationSeconds1 = number | null;
export type Id2 = string;
export type Label = string;
export type Height1 = number | null;
export type Width1 = number | null;
export type VideoCodec = string | null;
export type AudioCodec = string | null;
export type Ext = string;
export type FilesizeBytes = number | null;
export type Formats = VideoFormat[];
export type CanDownload = boolean;
export type Reason = string | null;
export type Id3 = string;
export type Label1 = string;
export type BaseUrl = string;
export type Model = string;
export type Vision = boolean;
export type KeySet = boolean;
export type Id4 = string;
export type AssetId1 = string;
export type Status1 = 'succeeded';
export type ProviderLabel = string;
export type Model1 = string;
export type Skill =
  'comprehensive' | 'visual-shots' | 'highlights' | 'video-to-article' | 'screenplay-analysis';
export type Title2 = string;
export type Summary = string;
export type Markdown = string;
export type CreatedAt2 = string;
export type SourceSha256 = string;
export type SourcePath = string;
export type Mode1 = 'reference' | 'copy';
export type OperationId = string;
export type Url1 = string;
export type FormatId = string | null;
export type Height2 = number | null;
export type Container = ('mp4' | 'webm' | 'mkv') | null;
export type OperationId1 = string;
export type Id5 = string | null;
export type Label2 = string;
export type BaseUrl1 = string;
export type Model2 = string;
export type Vision1 = boolean;
export type AssetId2 = string;
export type ProviderId = string;
export type Skill1 =
  'comprehensive' | 'visual-shots' | 'highlights' | 'video-to-article' | 'screenplay-analysis';
export type ApiKey = string;
export type ExpectedProviderBaseUrl = string;
export type OperationId2 = string | null;

export interface EngineContract {
  hello: EngineHello;
  asset: Asset;
  task: Task;
  inspection: Inspection;
  format: VideoFormat;
  provider: Provider;
  report: Report;
  import_input: ImportInput;
  download_input: DownloadInput;
  provider_input: ProviderInput;
  analysis_input: AnalysisInput;
}
export interface EngineHello {
  protocol_version?: ProtocolVersion;
  engine_version?: EngineVersion;
  schema_version?: SchemaVersion;
  capabilities: Capabilities;
  resources: Resources;
}
export interface Capabilities {
  import_video: ImportVideo;
  import_document: ImportDocument;
  download: Download;
  analysis: Analysis;
}
export interface Resources {
  ffmpeg: Ffmpeg;
  ffprobe: Ffprobe;
  yt_dlp: YtDlp;
}
export interface Asset {
  id: Id;
  kind: Kind;
  title: Title;
  size_bytes: SizeBytes;
  sha256: Sha256;
  duration_seconds?: DurationSeconds;
  width?: Width;
  height?: Height;
  created_at: CreatedAt;
  availability?: Availability;
  text_preview?: TextPreview;
  mode?: Mode;
}
export interface Task {
  id: Id1;
  kind: Kind1;
  status: Status;
  stage: Stage;
  progress?: Progress;
  message?: Message;
  asset_id?: AssetId;
  error_code?: ErrorCode;
  created_at: CreatedAt1;
  updated_at: UpdatedAt;
  revision: Revision;
  attempt?: Attempt;
  attempt_id?: AttemptId;
}
export interface Inspection {
  url: Url;
  platform: Platform;
  title: Title1;
  duration_seconds?: DurationSeconds1;
  formats: Formats;
  can_download: CanDownload;
  reason?: Reason;
}
export interface VideoFormat {
  id: Id2;
  label: Label;
  height?: Height1;
  width?: Width1;
  video_codec?: VideoCodec;
  audio_codec?: AudioCodec;
  ext: Ext;
  filesize_bytes?: FilesizeBytes;
}
export interface Provider {
  id: Id3;
  label: Label1;
  base_url: BaseUrl;
  model: Model;
  vision: Vision;
  key_set?: KeySet;
}
export interface Report {
  id: Id4;
  asset_id: AssetId1;
  status?: Status1;
  provider_label: ProviderLabel;
  model: Model1;
  skill: Skill;
  title: Title2;
  summary: Summary;
  markdown: Markdown;
  created_at: CreatedAt2;
  source_sha256: SourceSha256;
}
export interface ImportInput {
  source_path: SourcePath;
  mode: Mode1;
  operation_id: OperationId;
}
export interface DownloadInput {
  url: Url1;
  format_id?: FormatId;
  height?: Height2;
  container?: Container;
  operation_id: OperationId1;
}
export interface ProviderInput {
  id?: Id5;
  label: Label2;
  base_url: BaseUrl1;
  model: Model2;
  vision: Vision1;
}
export interface AnalysisInput {
  asset_id: AssetId2;
  provider_id: ProviderId;
  skill: Skill1;
  api_key: ApiKey;
  expected_provider_base_url: ExpectedProviderBaseUrl;
  operation_id?: OperationId2;
}
