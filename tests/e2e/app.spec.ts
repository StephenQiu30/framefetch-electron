import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron, type ElectronApplication, expect, type Page, test } from '@playwright/test';

const project = path.resolve(__dirname, '../..');
const executable = process.env.FRAMEFETCH_E2E_EXECUTABLE;
const uploadId = '11111111-1111-4111-8111-111111111111';
const fileBytes = Buffer.from('FrameFetch transport download\n');
const uploadBytes = 'FrameFetch transport upload bytes';
let workspace: string;
let profile: string;
let backend: Server;
let storage: Server;
let backendUrl: string;
let storageUrl: string;
let issuedTarget: string;
let application: ElectronApplication;
let page: Page;
const requests: Array<{
  method: string;
  path: string;
  origin?: string;
  cookie?: string;
  body: string;
}> = [];
const uploads: Array<{ path: string; cookie?: string; authorization?: string; body: string }> = [];
const sockets = new Set<Socket>();
const handshakes: Array<{ origin?: string; cookie?: string }> = [];

async function bodyText(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing probe address');
  return `http://127.0.0.1:${address.port}/`;
}

async function launch(origin = backendUrl, useSavedConnection = false): Promise<void> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
  delete environment.ELECTRON_RUN_AS_NODE;
  delete environment.FRAMEFETCH_BACKEND_URL;
  delete environment.FRAMEFETCH_FRONTEND_URL;
  if (executable) environment.PATH = '';
  const args = [
    `--user-data-dir=${profile}`,
    ...(useSavedConnection ? [] : [`--backend-url=${origin}`]),
  ];
  application = await _electron.launch({
    ...(executable ? { executablePath: executable, args } : { args: [project, ...args] }),
    env: environment,
    timeout: 30000,
  });
  page = await application.firstWindow();
  await expect(page.locator('body')).toHaveAttribute('data-design', 'borderless', {
    timeout: 30000,
  });
  await page.waitForLoadState('domcontentloaded');
}

async function menu(id: string): Promise<void> {
  await application.evaluate(({ Menu }, selected) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(selected);
    if (!item) throw new Error(`Missing native menu: ${selected}`);
    item.click();
  }, id);
}

// These ephemeral servers verify the HTTP transport. They do not implement
// product business behavior, seed records, or stand in for backend acceptance.
test.beforeAll(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'framefetch-transport-e2e-'));
  storage = createServer(async (request, response) => {
    uploads.push({
      path: request.url ?? '/',
      cookie: request.headers.cookie,
      authorization: request.headers.authorization,
      body: await bodyText(request),
    });
    response.writeHead(200, { ETag: '0123456789abcdef0123456789abcdef' });
    response.end();
  });
  storageUrl = await listen(storage);
  issuedTarget = `${storageUrl}bucket/probe?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${'a'.repeat(64)}`;
  backend = createServer(async (request, response) => {
    const selected = new URL(request.url ?? '/', backendUrl);
    const body = await bodyText(request);
    requests.push({
      method: request.method ?? 'GET',
      path: selected.pathname,
      origin: request.headers.origin,
      cookie: request.headers.cookie,
      body,
    });
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    if (selected.pathname === '/api/auth/me') {
      response.writeHead(401);
      response.end(
        JSON.stringify({ code: 'unauthenticated', message: 'Unauthenticated', data: null }),
      );
    } else if (selected.pathname === '/api/_desktop-probe/echo') {
      response.end(
        JSON.stringify({
          method: request.method,
          query: selected.search,
          body,
          origin: request.headers.origin,
          referer: request.headers.referer ?? null,
        }),
      );
    } else if (selected.pathname === '/api/_desktop-probe/session') {
      response.setHeader(
        'Set-Cookie',
        'shell_probe=retained; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
      );
      response.end(JSON.stringify({ stored: true }));
    } else if (selected.pathname === '/api/_desktop-probe/cookie') {
      response.end(JSON.stringify({ cookie: request.headers.cookie ?? '' }));
    } else if (selected.pathname === '/api/_desktop-probe/file') {
      const range = request.headers.range;
      const selectedBytes = range === 'bytes=0-8' ? fileBytes.subarray(0, 9) : fileBytes;
      response.setHeader('Content-Type', 'application/octet-stream');
      response.setHeader('Content-Disposition', 'attachment; filename="probe-download.txt"');
      response.setHeader('Accept-Ranges', 'bytes');
      response.setHeader('Content-Length', selectedBytes.length);
      if (range) response.setHeader('Content-Range', `bytes 0-8/${fileBytes.length}`);
      response.writeHead(range ? 206 : 200);
      response.end(request.method === 'HEAD' ? undefined : selectedBytes);
    } else if (selected.pathname === '/api/_desktop-probe/redirect') {
      response.writeHead(302, { Location: `${storageUrl}untrusted-redirect` });
      response.end();
    } else if (selected.pathname === `/api/media-imports/${uploadId}/upload-sessions`) {
      response.end(
        JSON.stringify({
          code: 'success',
          message: 'OK',
          data: {
            resource_id: uploadId,
            expires_at: new Date(Date.now() + 300000).toISOString(),
            parts: [{ part_number: 1, url: issuedTarget }],
            part_count: 1,
            part_size_bytes: 5242880,
            max_concurrency: 1,
          },
        }),
      );
    } else {
      response.writeHead(404);
      response.end(JSON.stringify({ error: 'Backend root must never provide desktop UI' }));
    }
  });
  backend.on('upgrade', (request, socket) => {
    const peer = socket as Socket;
    sockets.add(peer);
    peer.once('close', () => sockets.delete(peer));
    if (
      request.url !== '/api/ws/tasks' ||
      typeof request.headers['sec-websocket-key'] !== 'string'
    ) {
      peer.destroy();
      return;
    }
    handshakes.push({ origin: request.headers.origin, cookie: request.headers.cookie });
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    peer.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const message = Buffer.from(JSON.stringify({ type: 'transport.probe' }));
    peer.write(Buffer.concat([Buffer.from([0x81, message.length]), message]));
    peer.on('data', () => {});
  });
  backendUrl = await listen(backend);
});

test.beforeEach(async () => {
  profile = await mkdtemp(path.join(workspace, 'profile-'));
  requests.length = 0;
  uploads.length = 0;
  handshakes.length = 0;
  await launch();
});

test.afterEach(async () => {
  if (application) await application.close();
  for (const socket of sockets) socket.destroy();
});

test.afterAll(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    [backend, storage].map(
      (server) => new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  await rm(workspace, { recursive: true, force: true });
});

test('bundled frontend loads at the API origin with no Node, preload or remote page dependency', async () => {
  expect(new URL(page.url()).origin).toBe(new URL(backendUrl).origin);
  await expect(page.locator('body')).not.toContainText(
    'Backend root must never provide desktop UI',
  );
  const renderer = await page.evaluate(() => {
    const globals = window as unknown as {
      require?: unknown;
      process?: unknown;
      desktop?: unknown;
    };
    return {
      require: typeof globals.require,
      process: typeof globals.process,
      desktop: typeof globals.desktop,
      secure: window.isSecureContext,
      locks: !!navigator.locks,
    };
  });
  expect(renderer).toEqual({
    require: 'undefined',
    process: 'undefined',
    desktop: 'undefined',
    secure: true,
    locks: true,
  });
  expect(requests.every((request) => /^\/(api|health)(\/|$)/.test(request.path))).toBe(true);
  await page.goto(`${backendUrl}user/login/`);
  await expect(page.getByRole('heading', { name: '登录帧取', exact: true })).toBeVisible();
  await menu('back');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await page.goto(`${backendUrl}user/login/`);
  await menu('home');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await menu('reconnect');
  await expect(page.locator('body')).toHaveAttribute('data-design', 'borderless');
  expect(requests.every((request) => /^\/(api|health)(\/|$)/.test(request.path))).toBe(true);
});

test('same-origin API preserves method, query, body and response without allowing foreign redirects', async () => {
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/_desktop-probe/echo?query=preserved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"transport":"probe"}',
    });
    return { status: response.status, data: await response.json() };
  });
  expect(result).toEqual({
    status: 200,
    data: {
      method: 'POST',
      query: '?query=preserved',
      body: '{"transport":"probe"}',
      origin: new URL(backendUrl).origin,
      referer: null,
    },
  });
  const redirect = await page.evaluate(async () => {
    try {
      return (await fetch('/api/_desktop-probe/redirect')).status;
    } catch {
      return 0;
    }
  });
  expect(redirect).not.toBe(200);
  expect(uploads).toHaveLength(0);
  const foreign = await page.evaluate(async (target) => {
    try {
      return (await fetch(target)).status;
    } catch {
      return 0;
    }
  }, `${storageUrl}foreign-request`);
  expect(foreign).not.toBe(200);
  expect(uploads).toHaveLength(0);
  await page.evaluate((target) => {
    window.location.href = target;
  }, storageUrl);
  await expect.poll(() => new URL(page.url()).origin).toBe(new URL(backendUrl).origin);
  expect(uploads).toHaveLength(0);
});

test('HttpOnly service cookies persist across restart and WebSocket keeps the service origin', async () => {
  const retained = path.join(profile, 'legacy-data.keep');
  await writeFile(retained, 'Existing user files stay untouched.');
  await page.evaluate(async () => {
    await fetch('/api/_desktop-probe/session', { method: 'POST' });
  });
  expect(await page.evaluate(() => document.cookie)).not.toContain('shell_probe');
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.session.cookies.flushStore(),
  );
  await application.close();
  await launch(backendUrl, true);
  const cookie = await page.evaluate(async () =>
    (await fetch('/api/_desktop-probe/cookie')).json(),
  );
  expect(cookie.cookie).toContain('shell_probe=retained');
  expect(await page.evaluate(() => document.cookie)).not.toContain('shell_probe');
  const config = JSON.parse(await readFile(path.join(profile, 'connection.json'), 'utf8'));
  expect(config).toEqual({ backend_url: backendUrl });
  expect(await readFile(retained, 'utf8')).toBe('Existing user files stay untouched.');
  const message = await page.evaluate(
    async () =>
      new Promise<string>((resolve, reject) => {
        const endpoint = new URL('/api/ws/tasks', window.location.origin);
        endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(endpoint);
        const timer = window.setTimeout(() => {
          socket.close();
          reject(new Error('Probe socket timeout'));
        }, 5000);
        socket.onmessage = (event) => {
          window.clearTimeout(timer);
          socket.close();
          resolve(event.data);
        };
        socket.onerror = () => {
          window.clearTimeout(timer);
          reject(new Error('Probe socket failed'));
        };
      }),
  );
  expect(JSON.parse(message)).toEqual({ type: 'transport.probe' });
  expect(handshakes).toEqual([
    { origin: new URL(backendUrl).origin, cookie: 'shell_probe=retained' },
  ]);
});

test('streamed files preserve HEAD and Range and use the native download save path', async () => {
  const selection = await page.evaluate(async () => {
    const head = await fetch('/api/_desktop-probe/file', { method: 'HEAD' });
    const part = await fetch('/api/_desktop-probe/file', { headers: { Range: 'bytes=0-8' } });
    return {
      head: head.status,
      length: head.headers.get('content-length'),
      range: part.status,
      contentRange: part.headers.get('content-range'),
      bytes: await part.text(),
    };
  });
  expect(selection).toEqual({
    head: 200,
    length: String(fileBytes.length),
    range: 206,
    contentRange: `bytes 0-8/${fileBytes.length}`,
    bytes: fileBytes.subarray(0, 9).toString(),
  });
  const savePath = path.join(profile, 'download-probe.txt');
  await application.evaluate(({ BrowserWindow }, selected) => {
    const probe = globalThis as unknown as {
      downloadProbe?: Promise<{ state: string; title?: string; defaultPath?: string }>;
    };
    probe.downloadProbe = new Promise((resolve) => {
      BrowserWindow.getAllWindows()[0].webContents.session.once('will-download', (_event, item) => {
        const options = item.getSaveDialogOptions();
        item.setSavePath(selected);
        item.once('done', (_event, state) =>
          resolve({ state, title: options.title, defaultPath: options.defaultPath }),
        );
      });
    });
  }, savePath);
  await page.evaluate(() => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = '/api/_desktop-probe/file';
    document.body.append(frame);
  });
  const download = await application.evaluate(
    () =>
      (
        globalThis as unknown as {
          downloadProbe: Promise<{ state: string; title?: string; defaultPath?: string }>;
        }
      ).downloadProbe,
  );
  expect(download.state).toBe('completed');
  expect(download.title).toBe('保存文件');
  expect(path.basename(download.defaultPath ?? '')).toBe('probe-download.txt');
  expect(await readFile(savePath)).toEqual(fileBytes);
});

test('storage upload accepts only a live signed target issued by the API and omits identity', async () => {
  await page.evaluate(async (id) => {
    await fetch('/api/_desktop-probe/session', { method: 'POST' });
    const response = await fetch(`/api/media-imports/${id}/upload-sessions`, { method: 'POST' });
    if (!response.ok) throw new Error('Upload-session transport probe failed');
  }, uploadId);
  const upload = await page.evaluate(
    async ({ target, bytes }) => {
      const response = await fetch('/storage-upload', {
        method: 'PUT',
        headers: {
          'X-FrameFetch-Upload-Target': target,
          'Content-Type': 'application/octet-stream',
        },
        body: bytes,
      });
      return { status: response.status, etag: response.headers.get('etag') };
    },
    { target: issuedTarget, bytes: uploadBytes },
  );
  expect(upload).toEqual({ status: 200, etag: '0123456789abcdef0123456789abcdef' });
  expect(uploads).toEqual([
    { path: new URL(issuedTarget).pathname + new URL(issuedTarget).search, body: uploadBytes },
  ]);
  const rejected = await page.evaluate(
    async (target) =>
      (
        await fetch('/storage-upload', {
          method: 'PUT',
          headers: { 'X-FrameFetch-Upload-Target': target },
          body: 'must not leave the client',
        })
      ).status,
    `${storageUrl}unissued-target?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=${'b'.repeat(64)}`,
  );
  expect(rejected).toBeGreaterThanOrEqual(400);
  expect(uploads).toHaveLength(1);
});

test('external media requests omit service cookies and cannot forward foreign writes', async () => {
  await page.evaluate(async () => {
    await fetch('/api/_desktop-probe/session', { method: 'POST' });
  });
  await page.evaluate(
    async (target) =>
      new Promise<void>((resolve) => {
        const image = document.createElement('img');
        image.onload = image.onerror = () => {
          image.remove();
          resolve();
        };
        image.src = target;
        document.body.append(image);
      }),
    `${storageUrl}external-image`,
  );
  expect(uploads).toHaveLength(1);
  expect(uploads[0].cookie).toBeUndefined();
  expect(uploads[0].authorization).toBeUndefined();
  const denied = await page.evaluate(async (target) => {
    try {
      return (await fetch(target, { method: 'POST', body: 'must stay local' })).status;
    } catch {
      return 0;
    }
  }, `${storageUrl}foreign-write`);
  expect(denied).not.toBe(200);
  expect(uploads).toHaveLength(1);
});

test('ordinary upstream HTTPS links open through the controlled native handler only after a click', async () => {
  await application.evaluate(({ shell }) => {
    const probe = globalThis as unknown as { clickedExternalLinks: string[] };
    probe.clickedExternalLinks = [];
    shell.openExternal = async (url) => {
      probe.clickedExternalLinks.push(url);
    };
  });
  const link = page.getByRole('link', { name: 'MIT 开源', exact: true });
  await expect(link).toBeVisible();
  expect(await link.getAttribute('target')).toBeNull();
  const target = await link.getAttribute('href');
  if (!target) throw new Error('Missing upstream license link');
  await link.click();
  await expect
    .poll(() =>
      application.evaluate(
        () => (globalThis as unknown as { clickedExternalLinks: string[] }).clickedExternalLinks,
      ),
    )
    .toEqual([target]);
  expect(new URL(page.url()).origin).toBe(new URL(backendUrl).origin);
});

test('soft Link navigation and native query History writes update the same renderer document', async () => {
  await page.evaluate(() => {
    (window as unknown as { adapterDocumentProbe: string }).adapterDocumentProbe = 'retained';
  });
  await page.getByRole('link', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录帧取', exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/user/login');
  await page.evaluate(() =>
    window.history.pushState(null, '', '/user/register?redirect=%2Fdocuments'),
  );
  await expect(page.getByRole('heading', { name: '创建帧取账户', exact: true })).toBeVisible();
  const queryLink = page.getByRole('link', { name: '返回登录', exact: true });
  await expect(queryLink).toHaveAttribute('href', '/user/login?redirect=%2Fdocuments');
  expect(
    await page.evaluate(
      () => (window as unknown as { adapterDocumentProbe: string }).adapterDocumentProbe,
    ),
  ).toBe('retained');
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole('heading', { name: '登录帧取', exact: true })).toBeVisible();
});
