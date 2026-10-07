import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Session } from 'electron';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDesktopHandler, safeStorageTarget } from '../../src/main/transport';

const backend = 'https://api.example.com/';
const uploadPath = '/api/media-imports/11111111-1111-4111-8111-111111111111/upload-sessions';
const target = `https://storage.example.com/bucket/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${'a'.repeat(64)}`;
let directory: string;

function client() {
  const fetch = vi.fn<Session['fetch']>();
  const handler = createDesktopHandler({ fetch } as unknown as Session, backend, directory);
  return { fetch, handler };
}

function request(
  pathname: string,
  options?: RequestInit,
  initiatorOrigin = new URL(backend).origin,
) {
  const selected = new Request(new URL(pathname, backend), options);
  return Object.assign(selected, { initiatorOrigin });
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'framefetch-transport-unit-'));
  await mkdir(path.join(directory, 'assets'));
  await writeFile(
    path.join(directory, 'index.html'),
    '<!doctype html><h1>Local packaged frontend</h1>',
  );
  await writeFile(
    path.join(directory, 'assets', 'app.js'),
    'document.documentElement.dataset.bundle = "local";',
  );
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('packaged renderer protocol boundary', () => {
  it('serves local SPA documents, assets and HEAD without contacting the backend root', async () => {
    const { handler, fetch } = client();
    const page = await handler(request('/history?query=kept'));
    expect(page.status).toBe(200);
    expect(await page.text()).toBe(await readFile(path.join(directory, 'index.html'), 'utf8'));
    expect(page.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(await (await handler(request('/assets/app.js'))).text()).toContain('dataset.bundle');
    expect(await (await handler(request('/', { method: 'HEAD' }))).text()).toBe('');
    expect((await handler(request('/content?task=selected'))).status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects initiator spoofing, credentials, unknown file paths and directory traversal', async () => {
    const { handler, fetch } = client();
    expect(
      (await handler(request('/api/anything', undefined, 'https://evil.example'))).status,
    ).toBe(403);
    for (const pathname of [
      '/etc/passwd',
      '/assets/%2e%2e%2f%2e%2e%2fsecret',
      '/assets/file%00.js',
    ])
      expect((await handler(request(pathname))).status).toBeGreaterThanOrEqual(400);
    expect(
      (await handler(request('/history', { method: 'POST', body: 'not a page write' }))).status,
    ).toBe(405);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards only API requests and keeps the original request plus safe redirect/session options', async () => {
    const { handler, fetch } = client();
    const input = request('/api/probe?value=kept', {
      method: 'PATCH',
      body: 'transport bytes',
      headers: {
        Origin: 'https://evil.example',
        Host: 'evil.example',
        Forwarded: 'host=evil.example',
        'X-Forwarded-Host': 'evil.example',
        'X-Forwarded-Proto': 'http',
        'Idempotency-Key': 'probe-key',
      },
    });
    fetch.mockResolvedValueOnce(new Response('upstream response', { status: 201 }));
    const response = await handler(input);
    expect(response.status).toBe(201);
    expect(await response.text()).toBe('upstream response');
    expect(fetch).toHaveBeenCalledWith(
      input,
      expect.objectContaining({
        bypassCustomProtocolHandlers: true,
        credentials: 'include',
        redirect: 'error',
      }),
    );
    const headers = fetch.mock.calls[0][1]?.headers;
    if (!(headers instanceof Headers)) throw new Error('Missing API headers');
    expect(headers.get('origin')).toBe(new URL(backend).origin);
    expect(headers.get('idempotency-key')).toBe('probe-key');
    for (const name of ['host', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto'])
      expect(headers.has(name)).toBe(false);
  });

  it('blocks foreign writes and insecure remote origins before networking', async () => {
    const { handler, fetch } = client();
    expect(
      (
        await handler(
          request('https://foreign.example/api/probe', { method: 'POST', body: 'bytes' }),
        )
      ).status,
    ).toBe(403);
    expect((await handler(request('http://remote.example/image.png'))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves authenticated report bytes and server attachment headers', async () => {
    const { handler, fetch } = client();
    const bytes = new Uint8Array([80, 75, 3, 4, 0, 255]);
    fetch.mockResolvedValueOnce(
      new Response(bytes, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="skill-report.docx"',
        },
      }),
    );
    const input = request('/api/analyses/task/report.docx');
    const response = await handler(input);
    expect(response.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(response.headers.get('content-disposition')).toContain('skill-report.docx');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(
      input,
      expect.objectContaining({ credentials: 'include', redirect: 'error' }),
    );
  });

  it('converts upstream network/redirect failure into a bounded transport error', async () => {
    const { handler, fetch } = client();
    fetch.mockRejectedValueOnce(new TypeError('redirect refused'));
    const response = await handler(request('/api/probe'));
    expect(response.status).toBe(502);
    expect(await response.text()).toBe('Connection unavailable');
  });
});

describe('issued storage upload capability', () => {
  it.each([
    [
      'https://storage.example.com/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=signed',
      true,
    ],
    ['http://127.0.0.1:9000/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=signed', true],
    [
      'http://storage.example.com/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=signed',
      false,
    ],
    [
      'https://user:password@storage.example.com/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=signed',
      false,
    ],
    [
      'https://storage.example.com/part?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=signed#fragment',
      false,
    ],
    ['https://storage.example.com/part?X-Amz-Signature=signed', false],
    ['https://storage.example.com/part?X-Amz-Algorithm=AWS4-HMAC-SHA256', false],
    ['file:///tmp/part', false],
  ])('validates storage scheme and signed shape %s', (value, allowed) => {
    expect(safeStorageTarget(value)).toBe(allowed);
  });

  it('permits only live API-issued exact PUT URLs and strips identity/target headers', async () => {
    const { handler, fetch } = client();
    const headers = {
      'X-Framefetch-Upload-Target': target,
      'Content-Type': 'application/octet-stream',
      Authorization: 'must-not-reach-storage',
      Cookie: 'must-not-reach-storage',
    };
    expect(
      (await handler(request('/storage-upload', { method: 'PUT', headers, body: 'bytes' }))).status,
    ).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            expires_at: new Date(Date.now() + 60000).toISOString(),
            parts: [{ url: target }],
          },
        }),
      ),
    );
    expect((await handler(request(uploadPath, { method: 'POST' }))).status).toBe(200);
    fetch.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { ETag: 'probe-etag' } }),
    );
    const response = await handler(
      request('/storage-upload', { method: 'PUT', headers, body: 'bytes' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe('probe-etag');
    const options = fetch.mock.calls.at(-1)?.[1];
    expect(fetch.mock.calls.at(-1)?.[0]).toBe(target);
    expect(options?.credentials).toBe('omit');
    expect(options?.redirect).toBe('error');
    expect(options?.headers).toBeInstanceOf(Headers);
    const storageHeaders = options?.headers;
    if (!(storageHeaders instanceof Headers)) throw new Error('Missing storage headers');
    expect([...storageHeaders.entries()]).toEqual([['content-type', 'application/octet-stream']]);
    expect((await handler(request('/storage-upload', { method: 'GET', headers }))).status).toBe(
      400,
    );
    expect(
      (
        await handler(
          request('/storage-upload', {
            method: 'PUT',
            headers: { ...headers, 'X-Framefetch-Upload-Target': `${target}changed` },
            body: 'bytes',
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not authorize targets from stale sessions or unrelated API responses', async () => {
    const { handler, fetch } = client();
    const responseBody = {
      data: { expires_at: new Date(Date.now() - 1).toISOString(), parts: [{ url: target }] },
    };
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(responseBody)));
    await handler(request(uploadPath, { method: 'POST' }));
    fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { ...responseBody.data, expires_at: new Date(Date.now() + 60000).toISOString() },
        }),
      ),
    );
    await handler(request('/api/probe', { method: 'POST' }));
    expect(
      (
        await handler(
          request('/storage-upload', {
            method: 'PUT',
            headers: { 'X-Framefetch-Upload-Target': target },
            body: 'bytes',
          }),
        )
      ).status,
    ).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
