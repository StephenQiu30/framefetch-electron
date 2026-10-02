import { createWriteStream } from 'node:fs';
import { chmod, copyFile, cp, mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  binaryArchitectures,
  executable,
  hashFile,
  projectRoot,
  run,
  runtimeRoot,
  target,
} from './runtime-lib.mjs';

const current = target();
const root = runtimeRoot();
const staging = path.join(projectRoot, 'resources/staging', current.id);
const downloadRoot = path.join(projectRoot, 'resources/staging/downloads');
const lock = JSON.parse(
  await readFile(path.join(projectRoot, 'resources/runtime-sources.lock.json'), 'utf8'),
);
const minimal = process.argv.includes('--minimal');
await mkdir(path.join(root, 'tools'), { recursive: true });
await mkdir(path.join(root, 'licenses'), { recursive: true });
await mkdir(staging, { recursive: true });
await mkdir(downloadRoot, { recursive: true });

async function download(artifact, name) {
  const destination = path.join(downloadRoot, name);
  try {
    if ((await hashFile(destination)) === artifact.sha256) return destination;
  } catch {
    /* missing cache */
  }
  console.log(`Downloading pinned resource ${name}`);
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok || !response.body)
    throw new Error(`Resource ${name} unavailable (HTTP ${response.status})`);
  const partial = `${destination}.partial`;
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(partial, { flags: 'w' }));
    if ((await hashFile(partial)) !== artifact.sha256)
      throw new Error(`Upstream SHA-256 mismatch for ${name}`);
    await copyFile(partial, destination);
  } finally {
    await rm(partial, { force: true });
  }
  return destination;
}

let bash = '/bin/sh';
let make = '/usr/bin/make';
const buildEnv = { ...process.env };
if (current.platform === 'darwin') buildEnv.MACOSX_DEPLOYMENT_TARGET = '14.0';
if (current.platform === 'win32') {
  const option = process.argv.indexOf('--msys2-root');
  const msys = option >= 0 ? process.argv[option + 1] : 'C:/msys64';
  if (!msys) throw new Error('--msys2-root requires a directory');
  bash = path.join(msys, 'usr/bin/bash.exe');
  make = path.join(msys, 'usr/bin/make.exe');
  buildEnv.PATH = `${path.join(msys, 'mingw64/bin')};${path.join(msys, 'usr/bin')};${process.env.PATH ?? ''}`;
  buildEnv.MSYSTEM = 'MINGW64';
}
const buildOptions = (cwd) => ({ cwd, env: buildEnv });

const ffmpegArchive = await download(lock.ffmpeg, `ffmpeg-${lock.ffmpeg.version}.tar.xz`);
const zlibArchive = await download(lock.zlib, `zlib-${lock.zlib.version}.tar.gz`);
const ffmpegSource = path.join(staging, `ffmpeg-${lock.ffmpeg.version}`);
const zlibSource = path.join(staging, `zlib-${lock.zlib.version}`);
const zlibInstall = path.join(staging, 'zlib-install');
await run('tar', ['-xf', ffmpegArchive, '-C', staging]);
await run('tar', ['-xf', zlibArchive, '-C', staging]);
await mkdir(path.join(zlibInstall, 'include'), { recursive: true });
await mkdir(path.join(zlibInstall, 'lib'), { recursive: true });
if (current.platform === 'darwin') {
  await run(bash, ['./configure', '--static', `--prefix=${zlibInstall}`], {
    ...buildOptions(zlibSource),
    env: { ...buildEnv, CC: '/usr/bin/clang' },
  });
  await run(make, ['clean'], buildOptions(zlibSource));
  await run(make, ['-j4', 'install'], buildOptions(zlibSource));
} else {
  await run(make, ['-f', 'win32/Makefile.gcc', '-j4', 'libz.a'], buildOptions(zlibSource));
  await copyFile(path.join(zlibSource, 'libz.a'), path.join(zlibInstall, 'lib/libz.a'));
  for (const name of ['zlib.h', 'zconf.h'])
    await copyFile(path.join(zlibSource, name), path.join(zlibInstall, 'include', name));
}
const configure = [
  ...lock.ffmpeg.configure,
  '--extra-cflags=-I../zlib-install/include',
  `--extra-ldflags=-L../zlib-install/lib${current.platform === 'win32' ? ' -static' : ''}`,
  ...(current.platform === 'darwin'
    ? [
        '--cc=/usr/bin/clang',
        `--arch=${current.arch === 'arm64' ? 'aarch64' : 'x86_64'}`,
        '--target-os=darwin',
      ]
    : ['--cc=gcc', '--arch=x86_64', '--target-os=mingw32']),
];
console.log(`Building FFmpeg ${lock.ffmpeg.version} for ${current.id} (four compiler jobs)`);
try {
  await run(make, ['distclean'], buildOptions(ffmpegSource));
} catch {
  /* first build has no config */
}
await run(bash, ['./configure', ...configure], buildOptions(ffmpegSource));
await run(make, ['-j4', 'ffmpeg', 'ffprobe'], buildOptions(ffmpegSource));
for (const name of ['ffmpeg', 'ffprobe']) {
  const destination = path.join(root, 'tools', executable(name));
  await copyFile(path.join(ffmpegSource, executable(name)), destination);
  await chmod(destination, 0o755);
  const file = await open(destination, 'r');
  try {
    const header = Buffer.alloc(65536);
    await file.read(header);
    if (!binaryArchitectures(header).includes(current.arch))
      throw new Error(`${name} architecture mismatch`);
  } finally {
    await file.close();
  }
}

await mkdir(path.join(root, 'licenses/ffmpeg'), { recursive: true });
await mkdir(path.join(root, 'licenses/zlib'), { recursive: true });
await copyFile(ffmpegArchive, path.join(root, 'licenses/ffmpeg', path.basename(ffmpegArchive)));
await copyFile(zlibArchive, path.join(root, 'licenses/zlib', path.basename(zlibArchive)));
for (const name of ['COPYING.LGPLv2.1', 'LICENSE.md'])
  await copyFile(path.join(ffmpegSource, name), path.join(root, 'licenses/ffmpeg', name));
await copyFile(path.join(zlibSource, 'LICENSE'), path.join(root, 'licenses/zlib/LICENSE'));
const compiler = await run(
  current.platform === 'darwin'
    ? '/usr/bin/clang'
    : path.join(path.dirname(path.dirname(bash)), '../mingw64/bin/gcc.exe'),
  ['--version'],
  { ...buildOptions(staging), capture: true },
);
await writeFile(
  path.join(root, 'licenses/ffmpeg/BUILD.json'),
  `${JSON.stringify({ version: lock.ffmpeg.version, configure, jobs: 4, source_modified: false, compiler: compiler.stdout.split('\n')[0], zlib: lock.zlib.version, signing: 'internal build; no formal signature or notarization' }, null, 2)}\n`,
);
await cp(path.join(projectRoot, 'resources/licenses'), path.join(root, 'licenses'), {
  recursive: true,
});
await copyFile(
  path.join(projectRoot, 'resources/THIRD_PARTY_NOTICES.md'),
  path.join(root, 'THIRD_PARTY_NOTICES.md'),
);

const sources = [
  { name: 'ffmpeg', ...lock.ffmpeg },
  { name: 'zlib', ...lock.zlib },
];
if (!minimal) {
  const yt = lock['yt-dlp'].artifacts[current.id];
  const ytFile = await download(
    yt,
    `yt-dlp-${lock['yt-dlp'].version}-${current.id}${current.platform === 'win32' ? '.exe' : ''}`,
  );
  await copyFile(ytFile, path.join(root, 'tools', executable('yt-dlp')));
  await chmod(path.join(root, 'tools', executable('yt-dlp')), 0o755);
  const deno = lock.deno.artifacts[current.id];
  const archive = await download(deno, `deno-${lock.deno.version}-${current.id}.zip`);
  await run(
    'uv',
    [
      'run',
      '--no-project',
      '--python',
      lock.engine_build.python,
      path.join(projectRoot, 'scripts/extract-tool.py'),
      archive,
      path.join(root, 'tools'),
      executable('deno'),
    ],
    { cwd: projectRoot },
  );
  await chmod(path.join(root, 'tools', executable('deno')), 0o755);
  sources.push(
    {
      name: 'yt-dlp',
      version: lock['yt-dlp'].version,
      source_url: lock['yt-dlp'].source_url,
      ...yt,
    },
    { name: 'deno', version: lock.deno.version, source_url: lock.deno.source_url, ...deno },
  );
} else {
  for (const name of ['yt-dlp', 'deno'])
    await rm(path.join(root, 'tools', executable(name)), { force: true });
}
const metadata = {
  ...current,
  engine_version: '0.1.0',
  sources,
  licenses: [
    { name: 'ffmpeg', license: lock.ffmpeg.license, path: 'licenses/ffmpeg/COPYING.LGPLv2.1' },
    { name: 'zlib', license: 'Zlib', path: 'licenses/zlib/LICENSE' },
    ...(!minimal
      ? [
          {
            name: 'yt-dlp',
            license: lock['yt-dlp'].license,
            path: 'licenses/YT-DLP-THIRD-PARTY-LICENSES.txt',
          },
          {
            name: 'deno',
            license: lock.deno.license,
            path: 'licenses/DENO-LICENSE.md',
            dependency_lock: 'licenses/DENO-Cargo.lock',
            release_notice_audit: 'pending',
          },
        ]
      : []),
  ],
  capabilities: { local_media: true, downloader_resources: !minimal, youtube_ejs: !minimal },
  signing_state: 'unsigned-internal',
};
delete metadata.id;
await writeFile(path.join(root, 'runtime-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(
  `Runtime tools prepared in resources/runtime/${current.id}; freeze the engine before packaging`,
);
