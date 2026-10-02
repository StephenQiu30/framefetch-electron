import type { FileHandle } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { FileAuthority } from './files';
import { id, kind } from './validation';

export interface ResolvedMedia {
  path: string;
  mime_type: string;
  size_bytes: number;
}
export async function serveMedia(
  request: Request,
  authority: FileAuthority,
  resolve: (assetId: string, mediaKind: 'original' | 'thumbnail') => Promise<ResolvedMedia>,
): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  let assetId: string;
  let mediaKind: 'original' | 'thumbnail';
  try {
    const url = new URL(request.url);
    const parts = url.pathname.split('/');
    if (
      url.protocol !== 'framefetch-media:' ||
      url.hostname !== 'asset' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 3
    )
      throw new Error();
    assetId = id(decodeURIComponent(parts[1] ?? ''));
    mediaKind = kind(parts[2]);
  } catch {
    return new Response(null, { status: 400 });
  }
  let handle: FileHandle | undefined;
  try {
    const asset = await resolve(assetId, mediaKind);
    handle = await authority.open(asset.path);
    const info = await handle.stat();
    const size = info.size;
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Content-Type': /^[-\w]+\/[-+.\w]+$/.test(asset.mime_type)
        ? asset.mime_type
        : 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
      'Content-Length': String(size),
    });
    const rangeHeader = request.headers.get('Range');
    let start = 0;
    let end = size - 1;
    if (rangeHeader) {
      const range = parseRange(rangeHeader, size);
      if (!range) {
        await handle.close();
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      }
      ({ start, end } = range);
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));
    }
    if (request.method === 'HEAD' || !size) {
      await handle.close();
      return new Response(null, { status: rangeHeader ? 206 : 200, headers });
    }
    const stream = handle.createReadStream({ start, end, autoClose: true });
    request.signal.addEventListener('abort', () => stream.destroy(), { once: true });
    if (request.signal.aborted) stream.destroy();
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: rangeHeader ? 206 : 200,
      headers,
    });
  } catch {
    if (handle) await handle.close().catch(() => {});
    return new Response(null, { status: 403 });
  }
}
export function parseRange(raw: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : null;
}
