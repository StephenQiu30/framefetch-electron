import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { DesktopEvent, RuntimeState } from '../shared/api';
import type { EngineHello } from '../shared/generated';
import { within } from './files';
import { JsonLineRpc } from './rpc';
import { record, text } from './validation';

export interface WindowsJob {
  create(pid: number): unknown;
  close(handle: unknown): void;
}
interface Options {
  command: string;
  args: string[];
  dataDir: string;
  libraryDir: string;
  resourceDir: string;
  dev?: boolean;
  packaged?: boolean;
  job?: WindowsJob;
  loadJob?: () => WindowsJob;
  handshakeMs?: number;
  restartDelay?: number;
  autoRestart?: boolean;
}
export async function verifyRuntime(root: string): Promise<void> {
  const canonical = await realpath(root);
  const manifest = record(JSON.parse(await readFile(join(canonical, 'manifest.json'), 'utf8')));
  if (
    manifest.schema_version !== 1 ||
    manifest.protocol_version !== '1' ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    !Array.isArray(manifest.files)
  )
    throw new Error('安装资源版本或架构不兼容');
  const names = new Set<string>();
  let engine = false;
  for (const raw of manifest.files) {
    const file = record(raw);
    const name = text(file.path, 2048);
    if (
      isAbsolute(name) ||
      name.includes('\\') ||
      name.includes(':') ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      names.has(name)
    )
      throw new Error('安装资源路径无效');
    names.add(name);
    const path = await realpath(resolve(canonical, name));
    if (!within(canonical, path)) throw new Error('安装资源路径越界');
    const info = await stat(path);
    if (
      !info.isFile() ||
      info.size !== file.size_bytes ||
      typeof file.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    )
      throw new Error('安装资源大小无效');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    if (hash.digest('hex') !== file.sha256) throw new Error('安装资源校验失败，请重新安装');
    if (
      file.role === 'engine' &&
      name === `engine/framefetch-engine${process.platform === 'win32' ? '.exe' : ''}`
    )
      engine = true;
  }
  if (!engine) throw new Error('安装资源缺少引擎');
  for (const tool of ['ffmpeg', 'ffprobe'])
    if (!names.has(`tools/${tool}${process.platform === 'win32' ? '.exe' : ''}`))
      throw new Error('安装资源缺少必要媒体工具');
  if (process.platform === 'win32' && !names.has('native/job.node'))
    throw new Error('安装资源缺少 Windows 进程监督模块');
  for (const path of await inventory(canonical))
    if (!names.has(path)) throw new Error('安装资源包含未登记文件');
}
async function inventory(root: string, prefix = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, prefix))) {
    const name = prefix ? `${prefix}/${entry}` : entry;
    if (name === 'manifest.json') continue;
    const info = await lstat(join(root, name));
    if (info.isSymbolicLink()) throw new Error('安装资源路径不能包含符号链接');
    if (info.isDirectory()) found.push(...(await inventory(root, name)));
    else if (info.isFile()) found.push(name);
    else throw new Error('安装资源文件类型无效');
  }
  return found;
}
export class EngineSupervisor extends EventEmitter {
  state: RuntimeState = { state: 'stopped', message: null, hello: null };
  private child: ChildProcessWithoutNullStreams | null = null;
  private rpc: JsonLineRpc | null = null;
  private jobHandle: unknown = null;
  private stopping = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private restarts = 0;
  private job: WindowsJob | undefined;
  constructor(private readonly options: Options) {
    super();
  }
  private update(state: RuntimeState): void {
    this.state = state;
    this.emit('state', state);
  }
  async start(): Promise<void> {
    if (this.child) throw new Error('引擎已启动');
    this.stopping = false;
    this.update({ state: 'starting', message: '正在启动本地引擎', hello: null });
    try {
      if (this.options.packaged) await verifyRuntime(this.options.resourceDir);
      this.job = this.options.job ?? this.options.loadJob?.();
      const env: NodeJS.ProcessEnv = { PYTHONUNBUFFERED: '1', PYTHONUTF8: '1' };
      for (const name of [
        'HOME',
        'USERPROFILE',
        'SYSTEMROOT',
        'WINDIR',
        'TMP',
        'TEMP',
        'TMPDIR',
        'LANG',
      ])
        if (process.env[name]) env[name] = process.env[name];
      if (this.options.dev) env.PATH = process.env.PATH;
      const child = spawn(
        this.options.command,
        [
          ...this.options.args,
          '--data-dir',
          this.options.dataDir,
          '--library-dir',
          this.options.libraryDir,
          '--resource-dir',
          this.options.resourceDir,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
          windowsHide: true,
          env,
        },
      );
      this.child = child;
      child.once('error', () => {});
      let wasReady = false;
      const rpc = new JsonLineRpc({
        stdin: child.stdin,
        stdout: child.stdout,
        lifecycle: child,
        fatal: () => this.terminate('SIGKILL', child),
      });
      this.rpc = rpc;
      rpc.on('notification', (event: DesktopEvent) => this.emit('notification', event));
      // Never retain or forward stderr: downloader/provider output may contain credentials or signed URLs.
      child.stderr.on('data', () => {});
      child.once('close', () => {
        if (this.child !== child) return;
        this.terminate('SIGKILL', child);
        this.closeJob();
        rpc.close();
        this.child = null;
        this.rpc = null;
        if (!this.stopping) {
          this.update({
            state: 'error',
            message: '本地引擎意外退出；正在重新读取持久任务状态',
            hello: null,
          });
          if (wasReady && this.options.autoRestart !== false && this.restarts++ < 3)
            this.restartTimer = setTimeout(() => {
              this.restartTimer = null;
              void this.start().catch(() => {});
            }, this.options.restartDelay ?? 800);
        }
      });
      if (process.platform === 'win32') {
        if (!this.job || !child.pid) throw new Error('Windows 进程监督资源不可用');
        this.jobHandle = this.job.create(child.pid);
      }
      const hello = await rpc.request<EngineHello>(
        'engine.hello',
        { supervised: true },
        this.options.handshakeMs ?? 5000,
      );
      if (hello.protocol_version !== '1' || hello.schema_version !== '1')
        throw new Error('引擎协议版本不兼容');
      wasReady = true;
      this.update({ state: 'ready', message: null, hello });
    } catch (error) {
      this.terminate('SIGKILL');
      this.update({
        state: 'error',
        message:
          error instanceof Error && error.message.includes('确认')
            ? error.message
            : '本地引擎无法启动，请检查安装资源与版本',
        hello: null,
      });
      throw error;
    }
  }
  request<T = unknown>(method: string, params: unknown, timeout?: number): Promise<T> {
    if (this.state.state !== 'ready' || !this.rpc)
      return Promise.reject(new Error('本地引擎尚未就绪'));
    return this.rpc.request<T>(method, params, timeout);
  }
  private closeJob(): void {
    if (this.jobHandle !== null) {
      this.job?.close(this.jobHandle);
      this.jobHandle = null;
    }
  }
  private terminate(signal: NodeJS.Signals, child = this.child): void {
    if (!child?.pid || this.child !== child) return;
    if (process.platform === 'win32') {
      if (signal === 'SIGKILL') this.closeJob();
      try {
        child.kill(signal);
      } catch {}
    } else {
      try {
        process.kill(-child.pid, signal);
      } catch {}
    }
  }
  async stop(budget = 4000): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const child = this.child;
    if (child) {
      const exited = new Promise<void>((resolveExit) => {
        if (child.exitCode !== null || child.signalCode !== null) resolveExit();
        else child.once('close', () => resolveExit());
      });
      if (this.rpc)
        void this.rpc.request('engine.shutdown', {}, Math.max(1, budget / 2)).catch(() => {});
      await Promise.race([exited, delay(Math.max(1, budget / 2))]);
      if (child.exitCode === null && child.signalCode === null) this.terminate('SIGTERM', child);
      await Promise.race([exited, delay(Math.max(1, budget / 2))]);
      this.terminate('SIGKILL', child);
      await Promise.race([exited, delay(500)]);
      this.rpc?.close();
      this.child = null;
      this.rpc = null;
    }
    this.closeJob();
    this.update({ state: 'stopped', message: null, hello: null });
  }
}
function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    const timer = setTimeout(resolveDelay, ms);
    timer.unref();
  });
}
