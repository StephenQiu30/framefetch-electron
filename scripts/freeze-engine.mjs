import { copyFile, cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  hashFile,
  projectRoot,
  run,
  runtimeRoot,
  target,
  verifyManifest,
  writeManifest,
} from './runtime-lib.mjs';

const current = target();
const root = runtimeRoot();
const engine = path.join(projectRoot, 'engine');
const { engine_build: engineBuild } = JSON.parse(
  await readFile(path.join(projectRoot, 'resources/runtime-sources.lock.json'), 'utf8'),
);
const staging = path.join(projectRoot, 'resources/staging', current.id, 'freeze');
const metadata = JSON.parse(await readFile(path.join(root, 'runtime-metadata.json'), 'utf8'));
if (metadata.platform !== current.platform || metadata.arch !== current.arch)
  throw new Error('prepare runtime on this native target first');
await mkdir(staging, { recursive: true });
const uvVersion = await run('uv', ['--version'], { capture: true });
if (uvVersion.stdout.trim().split(' ')[1] !== engineBuild.uv)
  throw new Error(`Freeze requires uv ${engineBuild.uv} from the runtime source lock`);
await run('uv', ['sync', '--frozen', '--group', 'dev', '--python', engineBuild.python], {
  cwd: engine,
});
const version = await run(
  'uv',
  [
    'run',
    '--frozen',
    'python',
    '-c',
    `import sys, PyInstaller; assert sys.version.split()[0] == "${engineBuild.python}"; assert PyInstaller.__version__ == "${engineBuild.pyinstaller}"; import importlib.metadata; print(importlib.metadata.version("framefetch-desktop"))`,
  ],
  { cwd: engine, capture: true },
);
metadata.engine_version = version.stdout.trim();
await run(
  'uv',
  [
    'run',
    '--frozen',
    'pyinstaller',
    '--noconfirm',
    '--clean',
    '--onedir',
    '--name',
    'framefetch-engine',
    '--distpath',
    path.join(staging, 'dist'),
    '--workpath',
    path.join(staging, 'build'),
    '--specpath',
    staging,
    '--paths',
    path.join(engine, 'src'),
    '--collect-submodules',
    'framefetch_desktop',
    '--collect-data',
    'certifi',
    '--collect-data',
    'docx',
    path.join(engine, 'src/framefetch_desktop/frozen_entry.py'),
  ],
  { cwd: engine },
);
await rm(path.join(root, 'engine'), { recursive: true, force: true });
await cp(path.join(staging, 'dist/framefetch-engine'), path.join(root, 'engine'), {
  recursive: true,
  dereference: true,
});
await run(
  'uv',
  [
    'run',
    '--frozen',
    'python',
    path.join(projectRoot, 'scripts/collect-python-licenses.py'),
    path.join(root, 'licenses/python'),
  ],
  { cwd: engine },
);
await copyFile(path.join(engine, 'uv.lock'), path.join(root, 'licenses/python/uv.lock'));
await copyFile(
  path.join(engine, 'pyproject.toml'),
  path.join(root, 'licenses/python/pyproject.toml'),
);
await cp(path.join(projectRoot, 'resources/licenses'), path.join(root, 'licenses'), {
  recursive: true,
});
await copyFile(
  path.join(projectRoot, 'resources/THIRD_PARTY_NOTICES.md'),
  path.join(root, 'THIRD_PARTY_NOTICES.md'),
);
metadata.sources = metadata.sources.filter((source) => source.name !== 'framefetch-engine');
metadata.sources.push({
  name: 'framefetch-engine',
  version: metadata.engine_version,
  source: 'engine/',
  lock_sha256: await hashFile(path.join(engine, 'uv.lock')),
  python: engineBuild.python,
  freezer: `PyInstaller ${engineBuild.pyinstaller}`,
  uv: engineBuild.uv,
  mode: 'onedir',
  native_target: current.id,
});
metadata.licenses = metadata.licenses.filter((license) => license.name !== 'python-engine');
metadata.licenses.push({
  name: 'python-engine',
  path: 'licenses/python/inventory.json',
  license: 'PSF-2.0; dependencies as inventoried',
});
if (current.platform === 'win32') {
  await mkdir(path.join(root, 'native'), { recursive: true });
  await copyFile(
    path.join(projectRoot, 'resources/native/build/Release/job.node'),
    path.join(root, 'native/job.node'),
  );
}
await writeManifest(root, metadata);
const manifest = await verifyManifest(root, current);
console.log(
  `Frozen engine ${metadata.engine_version}; ${manifest.files.length} runtime files verified for ${current.id}`,
);
