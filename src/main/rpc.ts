import { EventEmitter } from 'node:events';
import type { Readable, Writable } from 'node:stream';
import { TextDecoder } from 'node:util';
import type { DesktopEvent } from '../shared/api';
import { id, record } from './validation';

export const MAX_MESSAGE_BYTES = 1024 * 1024;
interface Transport {
  stdout: Readable;
  stdin: Writable;
  lifecycle: EventEmitter;
  fatal: () => void;
}
interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
export class JsonLineRpc extends EventEmitter {
  private buffer = Buffer.alloc(0);
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private closed = false;
  constructor(private readonly transport: Transport) {
    super();
    transport.stdout.on('data', this.onData);
    transport.lifecycle.once('close', this.onExit);
    transport.lifecycle.once('error', this.onExit);
    transport.stdin.on('error', this.onExit);
  }
  get pendingCount(): number {
    return this.pending.size;
  }
  request<T = unknown>(method: string, params: unknown, timeout = 30000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('引擎已退出，请重新读取任务状态'));
    const requestId = this.nextId++;
    const line = `${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })}\n`;
    if (Buffer.byteLength(line) > MAX_MESSAGE_BYTES)
      return Promise.reject(new Error('请求超过协议大小上限'));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('引擎请求超时，操作是否生效尚未确认；请检查任务列表'));
      }, timeout);
      this.pending.set(requestId, { resolve: (value) => resolve(value as T), reject, timer });
      try {
        this.transport.stdin.write(line, 'utf8', (error) => {
          if (error) this.fail(new Error('引擎输入管道失联'));
        });
      } catch {
        this.fail(new Error('引擎输入管道失联'));
      }
    });
  }
  private onData = (chunk: Buffer): void => {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (!this.closed) {
      const newline = this.buffer.indexOf(10);
      if (newline < 0) {
        if (this.buffer.length > MAX_MESSAGE_BYTES) this.protocolFailure();
        return;
      }
      if (newline + 1 > MAX_MESSAGE_BYTES) {
        this.protocolFailure();
        return;
      }
      const raw = this.buffer.subarray(0, newline);
      this.buffer = this.buffer.subarray(newline + 1);
      try {
        const value = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)));
        if (value.jsonrpc !== '2.0') throw new Error();
        if ('id' in value) {
          if (!Number.isSafeInteger(value.id) || 'result' in value === 'error' in value)
            throw new Error();
          const responseError = 'error' in value ? record(value.error) : null;
          const pending = this.pending.get(value.id as number);
          if (!pending) continue;
          this.pending.delete(value.id as number);
          clearTimeout(pending.timer);
          if (responseError) {
            pending.reject(new Error(errorMessage(responseError.message, responseError.code)));
          } else pending.resolve(value.result);
        } else {
          this.emit('notification', notification(value.method, value.params));
        }
      } catch {
        this.protocolFailure();
      }
    }
  };
  private onExit = (): void => {
    this.fail(new Error('引擎已退出，请重新读取任务状态'));
  };
  private protocolFailure(): void {
    this.fail(new Error('引擎协议无效，已停止执行'));
    this.transport.fatal();
  }
  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.buffer = Buffer.alloc(0);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.emit('disconnected');
  }
  close(): void {
    this.fail(new Error('引擎连接已关闭'));
    this.transport.stdout.off('data', this.onData);
    this.transport.lifecycle.off('close', this.onExit);
    this.transport.lifecycle.off('error', this.onExit);
    this.transport.stdin.off('error', this.onExit);
  }
}
function errorMessage(message: unknown, code: unknown): string {
  const guidance: Record<string, string> = {
    private_destination: '链接指向私网或本机地址，无法访问，请使用受支持平台的公开链接',
    invalid_destination: '链接目标无效，请检查公开链接',
    invalid_url: '链接格式无效，请检查 HTTP(S) 地址',
    https_required: '模型接口需要使用公网 HTTPS 地址',
    provider_requires_public_https: '模型接口需要使用公网 HTTPS 域名',
    unsupported_platform: '此平台尚未支持，请使用受支持平台的公开链接',
    input_format_unsupported: '此文件格式尚未支持，请选择 MP4 视频或受支持文档',
    source_not_found: '源文件不存在，请重新选择文件',
    asset_missing: '源文件已移动或删除，请重新选择文件',
    asset_changed: '源文件内容已变化，请重新导入后再使用',
    source_changed: '源文件在处理期间发生变化，请重新导入',
    provider_not_found: '模型服务已不存在，请重新配置',
    provider_endpoint_changed: '分析创建期间模型接口地址发生变化，请重新确认接口后发起分析',
    provider_vision_required: '视频分析需要支持图像输入的模型',
    document_skill_unsupported: '此分析类型不适用于文档，请选择文档分析',
    analysis_requires_new_authorized_request: '分析需要重新授权，请从资产页面重新发起分析',
    retry_requires_explicit_analysis_decision:
      '模型执行结果尚未确认，请检查任务详情并明确决定是否重新分析',
    task_not_retryable: '此任务当前状态无法重试',
    task_not_found: '此任务已不存在，请刷新任务列表',
    destination_exists: '保存位置已有文件，请选择新的文件名',
    disk_full: '磁盘空间不足，请释放空间后重试',
    input_too_large: '文件超过当前输入大小限制，请选择较小文件',
    document_text_too_large: '文档正文过大，无法直接展示，请在系统中打开原文件',
    thumbnail_not_found: '此资产尚无可用封面',
    media_resources_unavailable: '包内媒体工具不可用，请重新安装应用',
    queue_full: '任务队列已满，请等待当前任务完成',
    request_limit: '请求过于频繁，请稍后再试',
    operation_conflict: '该操作标识已对应其他请求，请刷新后再发起',
  };
  return (
    (typeof message === 'string' && Object.hasOwn(guidance, message)
      ? guidance[message]
      : undefined) ?? `引擎请求失败 (${Number.isInteger(code) ? code : 'unknown'})`
  );
}
function notification(method: unknown, params: unknown): DesktopEvent {
  const input = record(params);
  if (!Number.isSafeInteger(input.seq) || Number(input.seq) < 0) throw new Error();
  if (method === 'tasks.changed') {
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new Error();
    return {
      type: method,
      task_id: id(input.task_id),
      seq: input.seq as number,
      revision: input.revision as number,
    };
  }
  if (method === 'assets.changed')
    return { type: method, asset_id: id(input.asset_id), seq: input.seq as number };
  if (method === 'reports.changed')
    return { type: method, report_id: id(input.report_id), seq: input.seq as number };
  throw new Error();
}
