import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { executable, run, runtimeRoot, target, verifyManifest } from './runtime-lib.mjs';

const index = process.argv.indexOf('--root');
const root = index >= 0 ? path.resolve(process.argv[index + 1]) : runtimeRoot();
const current = target();
const manifest = await verifyManifest(root, current);
if (!process.argv.includes('--hash-only')) {
  const tool = (name) => path.join(root, 'tools', executable(name));
  const environment = {
    PATH: '',
    LANG: 'en_US.UTF-8',
    DENO_NO_UPDATE_CHECK: '1',
    ...(current.platform === 'win32'
      ? { SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir() }
      : {}),
  };
  if (current.platform === 'darwin') {
    const directory = await mkdtemp(path.join(tmpdir(), 'framefetch-frozen-'));
    try {
      const replies = await run(
        path.join(root, 'engine', executable('framefetch-engine')),
        [
          '--data-dir',
          path.join(directory, 'data'),
          '--library-dir',
          path.join(directory, 'library'),
          '--resource-dir',
          root,
        ],
        {
          capture: true,
          input: [
            JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'engine.hello', params: {} }),
            JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'engine.shutdown', params: {} }),
            '',
          ].join('\n'),
          env: environment,
          timeout: 15000,
        },
      );
      const messages = replies.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const hello = messages.find((message) => message.id === 1)?.result;
      if (
        hello?.protocol_version !== '1' ||
        hello.engine_version !== manifest.engine_version ||
        !hello.resources?.ffmpeg ||
        !hello.resources?.ffprobe
      )
        throw new Error('Frozen engine handshake/resource diagnostics failed');
      if (!messages.find((message) => message.id === 2)?.result?.stopped)
        throw new Error('Frozen engine shutdown failed');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  } else {
    console.log(
      'Windows engine execution requires the Electron-owned Job Object; covered by packaged application E2E',
    );
  }
  const ffmpeg = await run(tool('ffmpeg'), ['-version'], { capture: true, env: environment });
  const ffprobe = await run(tool('ffprobe'), ['-version'], { capture: true, env: environment });
  const version = manifest.sources.find((source) => source.name === 'ffmpeg')?.version;
  if (
    !version ||
    !ffmpeg.stdout.startsWith(`ffmpeg version ${version}`) ||
    !ffprobe.stdout.startsWith(`ffprobe version ${version}`)
  )
    throw new Error('FFmpeg/ffprobe version mismatch');
  if (/--enable-(gpl|nonfree|version3)/.test(ffmpeg.stdout))
    throw new Error('Unexpected FFmpeg license configuration');
  if (current.platform === 'darwin') {
    for (const name of ['ffmpeg', 'ffprobe']) {
      const linked = await run('/usr/bin/otool', ['-L', tool(name)], { capture: true });
      const dependencies = linked.stdout
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => line.trim().split(' ')[0]);
      if (
        dependencies.some(
          (dependency) =>
            !dependency.startsWith('/usr/lib/') && !dependency.startsWith('/System/Library/'),
        )
      )
        throw new Error(`${name} requires a non-system dynamic library`);
    }
  }
  const decoders = await run(tool('ffmpeg'), ['-hide_banner', '-decoders'], {
    capture: true,
    env: environment,
  });
  const encoders = await run(tool('ffmpeg'), ['-hide_banner', '-encoders'], {
    capture: true,
    env: environment,
  });
  if (
    !/\bh264\s/.test(decoders.stdout) ||
    !/\baac\s/.test(decoders.stdout) ||
    !/\bpng\s/.test(encoders.stdout)
  )
    throw new Error('Required H264/AAC decoders or PNG encoder missing');
  const directory = await mkdtemp(path.join(tmpdir(), 'framefetch-resource-'));
  try {
    const media = path.join(directory, '中文 空格.mp4');
    const cover = path.join(directory, 'cover.png');
    await run(
      tool('ffmpeg'),
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=64x64:d=1',
        '-c:v',
        'mpeg4',
        '-y',
        media,
      ],
      { env: environment },
    );
    const probe = await run(
      tool('ffprobe'),
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', media],
      { capture: true, env: environment },
    );
    if (JSON.parse(probe.stdout).streams[0].codec_name !== 'mpeg4')
      throw new Error('Real FFprobe local file check failed');
    await run(
      tool('ffmpeg'),
      ['-hide_banner', '-loglevel', 'error', '-i', media, '-frames:v', '1', '-y', cover],
      { env: environment },
    );
    if (
      !(await readFile(cover)).subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw new Error('Real PNG extraction failed');
    await run(
      tool('ffmpeg'),
      ['-hide_banner', '-loglevel', 'error', '-i', media, '-f', 'null', '-'],
      { env: environment },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  for (const name of ['yt-dlp', 'deno']) {
    if (!manifest.files.some((file) => file.role === name)) {
      console.log(`${name}: not included (download resources unavailable)`);
      continue;
    }
    await access(tool(name));
    const result = await run(
      tool(name),
      name === 'yt-dlp' ? ['--ignore-config', '--no-update', '--version'] : ['--version'],
      { capture: true, env: environment },
    );
    const expected = manifest.sources.find((source) => source.name === name)?.version;
    if (!expected || !result.stdout.includes(expected)) throw new Error(`${name} version mismatch`);
    if (name === 'yt-dlp') {
      const verbose = await run(
        tool(name),
        [
          '--ignore-config',
          '--no-update',
          '--no-plugin-dirs',
          '--no-remote-components',
          '--downloader',
          'native',
          '--ffmpeg-location',
          path.join(root, 'tools'),
          '--no-js-runtimes',
          '--js-runtimes',
          `deno:${tool('deno')}`,
          '--verbose',
          '--batch-file',
          '-',
        ],
        { capture: true, env: environment, allowedExitCodes: [2], timeout: 30000 },
      );
      if (!/yt_dlp_ejs[-= ]/.test(verbose.stderr)) throw new Error('Bundled yt-dlp EJS missing');
    }
  }
}
console.log(
  `Runtime verified: ${manifest.platform}-${manifest.arch}; protocol ${manifest.protocol_version}; ${manifest.files.length} files; ${manifest.signing_state}`,
);
