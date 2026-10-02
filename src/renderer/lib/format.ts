import type { Asset, Inspection, Report, Task, VideoFormat } from '../../shared/generated';

export function bytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: size >= 100 ? 0 : 1,
  }).format(size)} ${units[index]}`;
}

export function duration(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value < 0) return '—';
  const seconds = Math.floor(value);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? dateFormatter.format(date) : '—';
}

const taskKinds: Record<Task['kind'], string> = {
  import_video: '视频导入',
  import_document: '文档导入',
  download: '视频下载',
  analysis: 'AI 分析',
  export_report: '报告导出',
};

export function taskKind(task: Task | Task['kind']): string {
  return taskKinds[typeof task === 'string' ? task : task.kind] ?? '处理任务';
}

const statuses: Record<Task['status'], string> = {
  queued: '排队中',
  running: '处理中',
  cancelling: '正在取消',
  cancelled: '已取消',
  succeeded: '已完成',
  failed: '失败',
  interrupted: '已中断',
  needs_attention: '结果待确认',
};

export function taskStatus(task: Task): string {
  return statuses[task.status] ?? '状态待确认';
}

const stages: Record<string, string> = {
  queued: '等待处理',
  preparing: '准备输入',
  revalidating: '重新验证',
  downloading: '下载媒体',
  remuxing: '封装媒体',
  verifying: '校验文件',
  publishing: '保存并校验文件',
  model_started: '执行 AI 分析',
  model_unknown: '模型结果尚未确认',
  key_required: '需要重新确认 AI 服务',
  cancel_requested: '正在停止任务',
  cancelled: '任务已取消',
  succeeded: '处理已完成',
  failed: '处理未完成',
  interrupted: '任务已中断',
  needs_attention: '需要核对执行结果',
};

export function taskStage(task: Task): string {
  return Object.hasOwn(stages, task.stage) ? stages[task.stage] : taskStatus(task);
}

export function isActive(task: Task): boolean {
  return ['queued', 'running', 'cancelling'].includes(task.status);
}

const skills: Record<Report['skill'], string> = {
  comprehensive: '综合视频分析',
  'visual-shots': '分镜分析',
  highlights: '高光提取',
  'video-to-article': '视频转文章',
  'screenplay-analysis': '剧本分析',
};

export function skillLabel(skill: Report['skill']): string {
  return skills[skill] ?? '内容分析';
}

export function availabilityLabel(value: Asset['availability']): string {
  if (value === 'available') return '文件可用';
  if (value === 'missing') return '文件缺失';
  if (value === 'changed') return '文件已变更';
  return '文件状态待确认';
}

export function importModeLabel(value: Asset['mode']): string {
  if (value === 'reference') return '引用原文件';
  if (value === 'copy') return '复制到媒体库';
  return '存储方式待确认';
}

export function platformLabel(platform: Inspection['platform']): string {
  if (platform === 'youtube') return 'YouTube';
  if (platform === 'bilibili') return '哔哩哔哩';
  return '尚未支持的平台';
}

export function videoFormatLabel(format: VideoFormat): string {
  const parts = [format.height ? `${format.height}P` : '分辨率未提供', format.ext.toUpperCase()];
  if (format.width && format.height) parts.push(`${format.width}×${format.height}`);
  if (format.video_codec) parts.push(format.video_codec.toUpperCase());
  if (format.audio_codec) parts.push(format.audio_codec.toUpperCase());
  if (format.filesize_bytes != null) parts.push(`预计 ${bytes(format.filesize_bytes)}`);
  return parts.join(' · ');
}

const errors: Record<string, string> = {
  invalid_url: '链接格式无效，请检查公开视频链接。',
  invalid_destination: '链接目标无效，请检查公开视频链接。',
  private_destination: '链接指向私网或本机地址，请使用受支持平台的公开链接。',
  dns_failed: '暂时无法连接目标服务，请检查网络后重试。',
  https_required: 'AI 服务需要使用公网 HTTPS 地址。',
  provider_requires_public_https: 'AI 服务需要使用公网 HTTPS 域名。',
  unsupported_platform: '此平台尚未支持，可以导入已取得的本地文件。',
  protected_content: '该内容受到保护，请导入你已合法取得的非保护文件。',
  content_not_public: '该内容未确认公开可下载，请导入已取得的本地文件。',
  age_restricted_content: '当前不支持需要年龄验证的内容，请导入本地文件。',
  live_content_not_supported: '当前不支持直播或尚未完成的直播内容。',
  selected_format_unavailable: '当前下载版本不可用，请重新解析并选择版本。',
  invalid_platform_metadata: '没有取得有效的媒体信息，请重新解析。',
  download_incomplete: '下载文件不完整，请重新获取并下载。',
  download_duration_mismatch: '下载文件时长校验未通过，请重新获取并下载。',
  download_audio_missing: '下载文件缺少预期音轨，请重新获取并下载。',
  invalid_media: '文件未通过媒体校验，请选择受支持的 MP4 视频。',
  source_not_found: '源文件不存在，请重新选择文件。',
  asset_not_found: '素材已不存在，请刷新后重新选择。',
  asset_missing: '源文件已移动或删除，请重新选择文件。',
  asset_changed: '源文件内容已变化，请重新导入后再使用。',
  source_changed: '源文件在处理期间发生变化，请重新导入。',
  not_regular_file: '请选择普通文件，目录和特殊文件无法导入。',
  input_format_unsupported: '请选择 MP4 视频或受支持的剧本文档。',
  input_too_large: '文件超过当前大小限制，请选择较小文件。',
  disk_full: '磁盘空间不足，请释放空间后重试。',
  destination_exists: '保存位置已有文件，请选择新的文件名。',
  document_format_unsupported: '该文档格式不受支持。',
  document_encoding_unsupported: '文档编码不受支持，请保存为 UTF-8 后重新导入。',
  protected_document: '加密或受保护的文档无法解析。',
  document_has_no_text: '没有提取到可用的剧本文本；扫描文档需要先转换为文字。',
  document_too_large: '文档文件超过当前大小限制，请选择较小文档。',
  document_text_too_large: '文档正文超过当前限制，请减少内容后重新导入。',
  document_too_many_pages: '文档页数超过当前限制，请拆分后重新导入。',
  document_expansion_too_large: '文档未通过安全解析检查，请使用文本格式重新导入。',
  document_skill_unsupported: '此分析类型不适用于文档，请选择剧本分析。',
  provider_not_found: 'AI 服务已不存在，请重新配置。',
  provider_endpoint_changed: 'AI 服务地址已变化，请重新确认接口并保存 API Key。',
  provider_vision_required: '视频分析需要支持图像输入的模型。',
  provider_rejected_request: 'AI 服务拒绝了请求，请核对凭据、模型和服务限制。',
  provider_response_too_large: 'AI 服务返回内容超过限制，请核对服务配置。',
  key_required: '请先保存 AI 服务的 API Key，再重新发起分析。',
  analysis_requires_new_authorized_request: '请查看素材并重新发起分析，确认是否再次调用 AI 服务。',
  retry_requires_explicit_analysis_decision: '模型结果尚未确认，请核对后决定是否重新分析。',
  model_result_unknown:
    '模型执行结果尚未确认，不会自动再次调用；请核对服务记录后决定是否重新分析。',
  model_start_unconfirmed: '分析调用未完成确认，请查看任务记录后重新发起。',
  model_output_invalid: 'AI 返回内容未通过结果校验，没有发布部分报告。',
  model_evidence_missing: 'AI 返回结果缺少视频证据，没有发布部分报告。',
  model_evidence_invalid: 'AI 返回的视频证据未通过校验，没有发布部分报告。',
  document_has_video_evidence: 'AI 返回了不适用于剧本的证据，没有发布部分报告。',
  analysis_text_too_large: '剧本文本超过当前分析限制，请减少内容后重新导入。',
  analysis_video_too_long: '当前分析支持最长 1 小时的视频，请选择较短视频。',
  analysis_images_too_large: '抽帧数据超过当前分析限制，请选择较小的视频。',
  report_not_found: '报告已不存在，请刷新报告列表。',
  report_changed: '报告内容已变化，请重新读取后导出。',
  engine_interrupted: '上次任务被中断，请检查文件和任务状态后重试。',
  engine_not_ready: '本地处理尚未就绪，请重新检查运行状态。',
  engine_already_running: '本地工作区已由另一个应用窗口打开。',
  schema_newer_than_engine: '本地数据由更新版本创建，请使用相应版本的应用。',
  schema_checksum_mismatch: '本地数据结构校验未通过，请检查应用版本。',
  task_preparation_failed: '没有完成任务准备，请检查保存目录和磁盘空间。',
  task_not_found: '此任务已不存在，请刷新任务列表。',
  task_not_retryable: '此任务当前状态无法重试。',
  task_failed: '任务未能完成，请检查输入文件和配置后重试。',
  queue_full: '任务队列已满，请等待当前任务完成。',
  inspection_limit: '正在解析其他链接，请稍后重试。',
  request_limit: '操作过于频繁，请稍后重试。',
  operation_conflict: '操作记录与当前请求不一致，请刷新后重新发起。',
  media_resources_unavailable: '包内媒体工具不可用，请重新安装应用。',
  thumbnail_not_found: '此素材尚无可用封面。',
  thumbnail_invalid: '未生成有效封面，请检查视频文件后重新导入。',
  publication_incomplete: '文件保存校验未通过，请检查保存目录后重试。',
  published_file_changed: '已保存文件发生变化，请重新导入或重新下载。',
  tool_timeout: '媒体处理超时，请检查输入文件后重试。',
  tool_failed: '媒体处理未完成，请检查文件或链接后重试。',
  tool_output_too_large: '媒体处理数据超过当前限制，请选择较小内容。',
  network_budget_exceeded: '下载数据超过当前限制，请选择较小的版本。',
  worker_exited: '处理任务被中断，请核对任务状态后重试。',
};

export function localizedError(code: string | null | undefined): string {
  return code && Object.hasOwn(errors, code)
    ? errors[code]
    : '操作未完成，请检查输入和配置后重试。';
}

export function taskError(task: Task): string | null {
  return task.error_code ? localizedError(task.error_code) : null;
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return localizedError(null);
  const message = error.message
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .trim();
  if (Object.hasOwn(errors, message)) return localizedError(message);
  if (/^引擎请求失败(?:\s|\(|（|$)/u.test(message)) return localizedError(null);
  if (/^(?:\p{Script=Han}|API Key|Windows)/u.test(message)) return message;
  return localizedError(null);
}
