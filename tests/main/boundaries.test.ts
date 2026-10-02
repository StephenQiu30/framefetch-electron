import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CredentialVault } from '../../src/main/credentials';
import { FileAuthority } from '../../src/main/files';
import { serveMedia } from '../../src/main/media';
import { JsonLineRpc, MAX_MESSAGE_BYTES } from '../../src/main/rpc';
import { profileDirectory } from '../../src/main/startup';
import { assertSender, validateDownload, validateProvider } from '../../src/main/validation';

const cleanup: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'framefetch-main-'));
  cleanup.push(dir);
  return dir;
}
function wire() {
  const stdout = new PassThrough();
  const stdin = new PassThrough();
  const lifecycle = new EventEmitter();
  const fatal = vi.fn();
  const rpc = new JsonLineRpc({ stdout, stdin, lifecycle, fatal });
  return { rpc, stdout, stdin, lifecycle, fatal };
}

describe('stdio boundary', () => {
  it.each([
    ['private_destination', '私网'],
    ['input_format_unsupported', '文件格式'],
    ['analysis_requires_new_authorized_request', '重新授权'],
    ['__proto__', '引擎请求失败'],
  ])('maps only known engine failures to safe guidance: %s', async (message, expected) => {
    const { rpc, stdout, stdin } = wire();
    let sent = '';
    stdin.on('data', (part) => {
      sent += part;
    });
    const response = rpc.request('media.inspect', {});
    const id = JSON.parse(sent).id;
    stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32602, message } })}\n`);
    await expect(response).rejects.toThrow(expected);
    rpc.close();
  });
  it('correlates split UTF-8 lines and forwards only validated notifications', async () => {
    const { rpc, stdout, stdin } = wire();
    let sent = '';
    stdin.on('data', (part) => {
      sent += part;
    });
    const events: unknown[] = [];
    rpc.on('notification', (event) => events.push(event));
    const result = rpc.request('assets.list', {});
    const id = JSON.parse(sent).id;
    const packet = Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id, result: ['中文'] })}\n`);
    stdout.write(packet.subarray(0, packet.length - 4));
    stdout.write(packet.subarray(packet.length - 4));
    await expect(result).resolves.toEqual(['中文']);
    stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: 'tasks.changed',
        params: { task_id: 'id', seq: 2, revision: 1 },
      })}\n`,
    );
    expect(events).toEqual([{ type: 'tasks.changed', task_id: 'id', seq: 2, revision: 1 }]);
    rpc.close();
  });
  it('cleans pending calls on timeout and does not replay them', async () => {
    vi.useFakeTimers();
    const { rpc, stdin } = wire();
    const sent: string[] = [];
    stdin.on('data', (part) => sent.push(String(part)));
    const result = rpc.request('analysis.create', {}, 10);
    const rejection = expect(result).rejects.toThrow('确认');
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
    expect(rpc.pendingCount).toBe(0);
    expect(sent).toHaveLength(1);
    rpc.close();
  });
  it('rejects an overlong unterminated stdout frame and rejects pending calls on engine exit', async () => {
    const { rpc, stdout, fatal } = wire();
    const result = rpc.request('tasks.list', {});
    const rejection = expect(result).rejects.toThrow();
    stdout.write(Buffer.alloc(MAX_MESSAGE_BYTES + 1, 32));
    await rejection;
    expect(fatal).toHaveBeenCalledTimes(1);
    expect(rpc.pendingCount).toBe(0);
    const second = wire();
    const pending = second.rpc.request('tasks.list', {});
    const exited = expect(pending).rejects.toThrow('退出');
    second.lifecycle.emit('close', 1);
    await exited;
    expect(second.rpc.pendingCount).toBe(0);
  });
  it('never exposes engine error text to the renderer', async () => {
    const { rpc, stdout, stdin } = wire();
    let sent = '';
    stdin.on('data', (part) => {
      sent += part;
    });
    const result = rpc.request('analysis.create', {});
    const id = JSON.parse(sent).id;
    stdout.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id,
        error: { code: -1, message: 'credential-and-signed-url' },
      })}\n`,
    );
    await expect(result).rejects.toThrow('引擎请求失败');
    rpc.close();
  });
});

describe('native authority and media', () => {
  it('persists parallel native grants without losing or corrupting either authorization', async () => {
    const dir = await fixture();
    const library = join(dir, 'library');
    await mkdir(library);
    const paths = [join(dir, 'one.mp4'), join(dir, 'two.mp4')];
    await Promise.all(paths.map((path) => writeFile(path, 'media')));
    const authority = new FileAuthority(library, join(dir, 'grants.json'));
    await authority.load();
    await Promise.all(paths.map((path) => authority.grant([path])));
    const reload = new FileAuthority(library, join(dir, 'grants.json'));
    await reload.load();
    for (const path of paths) {
      const handle = await reload.open(path);
      await handle.close();
    }
  });
  it('blocks ungranted paths and symlink escape but permits a persisted native grant', async () => {
    const dir = await fixture();
    const library = join(dir, 'library');
    await mkdir(library);
    const outside = join(dir, 'outside.mp4');
    await writeFile(outside, 'media');
    const authority = new FileAuthority(library, join(dir, 'grants.json'));
    await authority.load();
    await expect(authority.open(outside)).rejects.toThrow('授权');
    const escapedPath = join(library, 'escape.mp4');
    await symlink(outside, escapedPath);
    await expect(authority.open(escapedPath)).rejects.toThrow('授权');
    await authority.grant([outside]);
    const reloaded = new FileAuthority(library, join(dir, 'grants.json'));
    await reloaded.load();
    const handle = await reloaded.open(outside);
    await handle.close();
  });
  it('rejects a replacement file at an old reference grant', async () => {
    const dir = await fixture();
    const library = join(dir, 'library');
    await mkdir(library);
    const source = join(dir, 'source.mp4');
    await writeFile(source, 'original');
    const authority = new FileAuthority(library, join(dir, 'grants.json'));
    await authority.load();
    await authority.grant([source]);
    const replacement = join(dir, 'replacement.mp4');
    await writeFile(replacement, 'replaced');
    await rename(replacement, source);
    await expect(authority.open(source)).rejects.toThrow('失效');
  });
  it('serves actual partial reads, suffix ranges, HEAD and unsatisfiable ranges', async () => {
    const dir = await fixture();
    const path = join(dir, 'video.mp4');
    await writeFile(path, '0123456789');
    const authority = new FileAuthority(dir, join(dir, 'grants.json'));
    await authority.load();
    const resolve = vi.fn(async () => ({ path, mime_type: 'video/mp4', size_bytes: 10 }));
    const read = (range?: string, method = 'GET') =>
      serveMedia(
        new Request('framefetch-media://asset/abc/original', {
          method,
          headers: range ? { Range: range } : {},
        }),
        authority,
        resolve,
      );
    const partial = await read('bytes=2-4');
    expect(partial.status).toBe(206);
    expect(partial.headers.get('Content-Range')).toBe('bytes 2-4/10');
    expect(await partial.text()).toBe('234');
    expect(await (await read('bytes=-3')).text()).toBe('789');
    expect(await (await read(undefined, 'HEAD')).text()).toBe('');
    expect((await read('bytes=10-')).status).toBe(416);
    expect((await read('bytes=1-2,4-5')).status).toBe(416);
    expect(
      (
        await serveMedia(
          new Request('framefetch-media://asset/../../etc/passwd'),
          authority,
          resolve,
        )
      ).status,
    ).toBe(400);
  });
});

describe('IPC and credential boundary', () => {
  it('honors generated request defaults and rejects unknown containers', () => {
    expect(
      validateDownload({
        url: 'https://www.youtube.com/watch?v=example',
        operation_id: 'operation',
      }),
    ).toEqual({
      url: 'https://www.youtube.com/watch?v=example',
      operation_id: 'operation',
      format_id: null,
      height: null,
      container: null,
    });
    expect(
      validateProvider({
        id: null,
        label: 'Provider',
        base_url: 'https://provider.example/v1',
        model: 'example',
        vision: false,
      }).id,
    ).toBeUndefined();
    expect(() =>
      validateDownload({
        url: 'https://www.youtube.com/watch?v=example',
        operation_id: 'operation',
        container: 'shell',
      }),
    ).toThrow('容器');
  });
  it('supports explicit native profile selection and rejects relative or ambiguous directories', () => {
    const path = join(tmpdir(), '帧取 isolated profile');
    expect(profileDirectory([`--user-data-dir=${path}`])).toBe(path);
    expect(profileDirectory([])).toBeNull();
    expect(() => profileDirectory(['--user-data-dir=relative'])).toThrow();
    expect(() =>
      profileDirectory([`--user-data-dir=${path}`, `--user-data-dir=${path}`]),
    ).toThrow();
  });
  it('rejects subframes, foreign webContents and remote navigation', () => {
    const frame = { url: 'file:///app/index.html' };
    const sender = { mainFrame: frame };
    expect(() =>
      assertSender({ sender, senderFrame: frame }, sender, (url) => url === frame.url),
    ).not.toThrow();
    expect(() => assertSender({ sender, senderFrame: { ...frame } }, sender, () => true)).toThrow(
      '来源',
    );
    expect(() =>
      assertSender({ sender, senderFrame: frame }, { mainFrame: frame }, () => true),
    ).toThrow('来源');
    expect(() => assertSender({ sender, senderFrame: frame }, sender, () => false)).toThrow('来源');
    expect(() =>
      validateProvider({ label: 'x', base_url: 'http://127.0.0.1', model: 'x', vision: false }),
    ).toThrow();
    expect(() =>
      validateProvider({
        label: 'x',
        base_url: 'https://api.example.com/v1',
        model: 'x',
        vision: false,
        unexpected: 'x',
      }),
    ).toThrow();
  });
  it('does not write plaintext when OS encryption is unavailable', async () => {
    const dir = await fixture();
    const backend = {
      isAsyncEncryptionAvailable: async () => false,
      encryptStringAsync: vi.fn(),
      decryptStringAsync: vi.fn(),
    };
    const vault = new CredentialVault(join(dir, 'credentials'), backend);
    await vault.store('provider', 'https://provider.example/v1', 'test-key');
    expect(await vault.forAnalysis('provider', 'https://provider.example/v1')).toBe('test-key');
    expect(backend.encryptStringAsync).not.toHaveBeenCalled();
    const restarted = new CredentialVault(join(dir, 'credentials'), backend);
    expect(await restarted.forAnalysis('provider', 'https://provider.example/v1')).toBeNull();
  });
  it('persists only the OS ciphertext and rotates it without exposing any read capability', async () => {
    const dir = await fixture();
    const backend = {
      isAsyncEncryptionAvailable: async () => true,
      encryptStringAsync: vi.fn(async () => Buffer.from([2, 4, 6])),
      decryptStringAsync: vi.fn(async () => ({
        result: JSON.stringify({
          version: 1,
          endpoint: 'https://provider.example/v1',
          key: 'synthetic-test-key',
        }),
        shouldReEncrypt: true,
      })),
    };
    const vault = new CredentialVault(join(dir, 'credentials'), backend);
    await vault.store('provider', 'https://provider.example/v1', 'synthetic-test-key');
    expect(await readFile(join(dir, 'credentials/provider.bin'))).toEqual(Buffer.from([2, 4, 6]));
    const restarted = new CredentialVault(join(dir, 'credentials'), backend);
    expect(await restarted.forAnalysis('provider', 'https://provider.example/v1')).toBe(
      'synthetic-test-key',
    );
    expect(backend.encryptStringAsync).toHaveBeenCalledTimes(2);
    expect(await restarted.has('provider', 'https://provider.example/v1')).toBe(true);
    await restarted.remove('provider');
    expect(await restarted.has('provider', 'https://provider.example/v1')).toBe(false);
  });
});
