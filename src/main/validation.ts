import type { AnalysisRequest, DownloadInput, ProviderInput, Skill } from '../shared/api';

export function record(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数无效');
  const result = value as Record<string, unknown>;
  if (keys && Object.keys(result).some((key) => !keys.includes(key)))
    throw new Error('参数字段无效');
  return result;
}
export function text(value: unknown, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || value.includes('\0'))
    throw new Error('文本参数无效');
  return value;
}
export function id(value: unknown): string {
  const result = text(value, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new Error('标识无效');
  return result;
}
export function mode(value: unknown): 'copy' | 'reference' {
  if (value !== 'copy' && value !== 'reference') throw new Error('导入方式无效');
  return value;
}
export function kind(value: unknown): 'original' | 'thumbnail' {
  if (value !== 'original' && value !== 'thumbnail') throw new Error('媒体类型无效');
  return value;
}
export function format(value: unknown): 'md' | 'docx' {
  if (value !== 'md' && value !== 'docx') throw new Error('导出格式无效');
  return value;
}
export function httpUrl(value: unknown): string {
  const raw = text(value, 4096);
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('链接无效');
  return raw;
}
export function validateProvider(value: unknown): ProviderInput {
  const input = record(value, ['id', 'label', 'base_url', 'model', 'vision', 'api_key']);
  const endpoint = canonicalEndpoint(input.base_url);
  if (typeof input.vision !== 'boolean') throw new Error('模型能力无效');
  return {
    ...(input.id === undefined || input.id === null ? {} : { id: id(input.id) }),
    label: text(input.label, 120),
    base_url: endpoint,
    model: text(input.model, 200),
    vision: input.vision,
    ...(input.api_key === undefined ? {} : { api_key: text(input.api_key, 8192) }),
  };
}
export function canonicalEndpoint(value: unknown): string {
  const endpoint = new URL(httpUrl(text(value, 2048)));
  // Local model endpoints are a separate future capability, never a default BYOK permission.
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.hostname === 'localhost' ||
    endpoint.hostname.endsWith('.localhost') ||
    endpoint.hostname.includes(':') ||
    /^\d+\.\d+\.\d+\.\d+$/.test(endpoint.hostname) ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error('模型接口必须使用公网 HTTPS 域名');
  return endpoint.toString().replace(/\/+$/, '');
}
export function validateDownload(value: unknown): DownloadInput {
  const input = record(value, ['url', 'format_id', 'height', 'container', 'operation_id']);
  if (
    input.height !== null &&
    input.height !== undefined &&
    (!Number.isInteger(input.height) || Number(input.height) < 1 || Number(input.height) > 4320)
  )
    throw new Error('分辨率无效');
  return {
    url: httpUrl(input.url),
    format_id:
      input.format_id === null || input.format_id === undefined ? null : text(input.format_id, 64),
    height: input.height === undefined ? null : (input.height as number | null),
    container:
      input.container === null || input.container === undefined
        ? null
        : allowedContainer(input.container),
    operation_id: id(input.operation_id),
  };
}
function allowedContainer(value: unknown): NonNullable<DownloadInput['container']> {
  if (value !== 'mp4' && value !== 'webm' && value !== 'mkv') throw new Error('媒体容器无效');
  return value;
}
export function validateAnalysis(value: unknown): AnalysisRequest {
  const input = record(value, ['asset_id', 'provider_id', 'skill']);
  const skills: readonly string[] = [
    'comprehensive',
    'visual-shots',
    'highlights',
    'video-to-article',
    'screenplay-analysis',
  ];
  if (typeof input.skill !== 'string' || !skills.includes(input.skill))
    throw new Error('分析类型无效');
  return {
    asset_id: id(input.asset_id),
    provider_id: id(input.provider_id),
    skill: input.skill as Skill,
  };
}
export interface SenderEvent {
  sender: unknown;
  senderFrame: unknown;
}
export function assertSender(
  event: SenderEvent,
  expected: { mainFrame: { url: string } },
  allowed: (url: string) => boolean,
): void {
  if (
    event.sender !== expected ||
    event.senderFrame !== expected.mainFrame ||
    !allowed(expected.mainFrame.url)
  )
    throw new Error('IPC 来源未授权');
}
