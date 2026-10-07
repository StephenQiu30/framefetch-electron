import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Session } from 'electron';

const UPLOAD_SESSION_PATH = /^\/api\/(?:media-imports|documents)\/[0-9a-f-]{36}\/upload-sessions$/i;
const PAGES = new Set([
  '/',
  '/index.html',
  '/user/login',
  '/user/register',
  '/account',
  '/history',
  '/history/activity',
  '/documents',
  '/documents/detail',
  '/downloads/new',
  '/downloads/detail',
  '/analyses/detail',
  '/providers',
  '/admin/users',
  '/admin/files',
  '/admin/providers',
  '/admin/ai-providers',
  '/admin/analytics',
  '/admin/operation-logs',
  '/about',
  '/guide',
  '/self-hosting',
]);
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

export function safeStorageTarget(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) &&
      url.searchParams.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256' &&
      Boolean(url.searchParams.get('X-Amz-Signature'))
    );
  } catch {
    return false;
  }
}

/** A client transport: local UI files, unchanged server APIs, and issued upload URLs. */
export function createDesktopHandler(browser: Session, backend: string, directory: string) {
  const origin = new URL(backend).origin;
  const root = resolve(directory);
  const issuedUploads = new Map<string, number>();
  const socketOrigin = origin.replace(/^http/, 'ws');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob: https: http://127.0.0.1:* http://localhost:* http://[::1]:*",
    "media-src 'self' blob: https: http://127.0.0.1:* http://localhost:* http://[::1]:*",
    `connect-src 'self' ${socketOrigin}`,
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; ');

  return async (request: Request & { readonly initiatorOrigin?: string }): Promise<Response> => {
    try {
      const url = new URL(request.url);
      if (
        url.username ||
        url.password ||
        (request.initiatorOrigin !== undefined && request.initiatorOrigin !== origin)
      )
        return new Response('Forbidden', { status: 403 });

      if (url.origin !== origin) {
        if (
          !['GET', 'HEAD'].includes(request.method) ||
          (url.protocol !== 'https:' &&
            !(
              url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
            ))
        )
          return new Response('Forbidden', { status: 403 });
        return await browser.fetch(request, {
          bypassCustomProtocolHandlers: true,
          credentials: 'omit',
          redirect: 'error',
        });
      }

      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health/')) {
        const headers = new Headers(request.headers);
        for (const name of ['host', 'forwarded', 'x-forwarded-host', 'x-forwarded-proto'])
          headers.delete(name);
        // Chromium's main-process fetch drops the renderer's Origin. Restore
        // only the already-validated first-party origin for server CSRF checks.
        if (!['GET', 'HEAD'].includes(request.method)) headers.set('Origin', origin);
        const response = await browser.fetch(request, {
          headers,
          bypassCustomProtocolHandlers: true,
          credentials: 'include',
          redirect: 'error',
        });
        if (request.method === 'POST' && UPLOAD_SESSION_PATH.test(url.pathname) && response.ok) {
          // Only targets actually issued by this server can be used by the upload bridge.
          for (const [target, expires] of issuedUploads)
            if (expires <= Date.now()) issuedUploads.delete(target);
          const payload: unknown = await response.clone().json();
          if (
            payload &&
            typeof payload === 'object' &&
            'data' in payload &&
            payload.data &&
            typeof payload.data === 'object'
          ) {
            const data = payload.data;
            if (
              'expires_at' in data &&
              typeof data.expires_at === 'string' &&
              'parts' in data &&
              Array.isArray(data.parts)
            ) {
              const expires = Date.parse(data.expires_at);
              if (Number.isFinite(expires) && expires > Date.now()) {
                for (const part of data.parts) {
                  if (
                    part &&
                    typeof part === 'object' &&
                    'url' in part &&
                    typeof part.url === 'string' &&
                    safeStorageTarget(part.url)
                  ) {
                    if (issuedUploads.size >= 10000)
                      issuedUploads.delete(issuedUploads.keys().next().value ?? '');
                    issuedUploads.set(part.url, expires);
                  }
                }
              }
            }
          }
        }
        return response;
      }

      if (url.pathname === '/storage-upload') {
        const target = request.headers.get('X-Framefetch-Upload-Target') ?? '';
        if (request.method !== 'PUT' || (issuedUploads.get(target) ?? 0) <= Date.now())
          return new Response('Invalid upload target', { status: 400 });
        const headers = new Headers();
        const contentType = request.headers.get('content-type');
        if (contentType) headers.set('content-type', contentType);
        const response = await browser.fetch(target, {
          method: 'PUT',
          body: request.body,
          headers,
          credentials: 'omit',
          redirect: 'error',
          signal: request.signal,
          duplex: 'half',
          bypassCustomProtocolHandlers: true,
        } as RequestInit & { duplex: 'half'; bypassCustomProtocolHandlers: boolean });
        await response.body?.cancel();
        const resultHeaders = new Headers({ 'Cache-Control': 'no-store' });
        const etag = response.headers.get('etag');
        if (etag) resultHeaders.set('ETag', etag);
        return new Response(null, { status: response.status, headers: resultHeaders });
      }

      if (!['GET', 'HEAD'].includes(request.method))
        return new Response('Method not allowed', { status: 405 });
      const path = decodeURIComponent(url.pathname);
      const route = path === '/' ? '/' : path.replace(/\/$/, '');
      let file: string;
      if (PAGES.has(route)) file = resolve(root, 'index.html');
      else if (
        path.startsWith('/assets/') ||
        ['/logo.svg', '/logo.png', '/favicon.ico'].includes(path)
      )
        file = resolve(root, `.${path}`);
      else return new Response('Not found', { status: 404 });
      if (!file.startsWith(`${root}${sep}`) || path.includes('\0'))
        return new Response('Forbidden', { status: 403 });
      const body = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: {
          'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
          'Content-Security-Policy': policy,
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store',
        },
      });
    } catch {
      return new Response('Connection unavailable', { status: 502 });
    }
  };
}
