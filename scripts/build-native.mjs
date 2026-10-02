import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { projectRoot, run, target } from './runtime-lib.mjs';

if (target().id !== 'win32-x64')
  throw new Error('The Job Object addon must be built on native Windows x64');
const config = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
const electronVersion = config.devDependencies.electron;
if (!/^\d+\.\d+\.\d+$/.test(electronVersion))
  throw new Error('Electron must be pinned to build the native addon');
await run(
  process.execPath,
  [
    createRequire(import.meta.url).resolve('node-gyp/bin/node-gyp.js'),
    'rebuild',
    '--directory',
    'resources/native',
    '--target',
    electronVersion,
    '--arch',
    'x64',
    '--dist-url',
    'https://electronjs.org/headers',
  ],
  { cwd: projectRoot },
);
