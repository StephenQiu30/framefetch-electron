import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hashFile, projectRoot } from './runtime-lib.mjs';

const directory = path.join(projectRoot, 'release');
const files = [];
for (const name of (await readdir(directory)).sort()) {
  if (!/\.(dmg|exe)$/.test(name)) continue;
  const filename = path.join(directory, name);
  files.push({
    path: name,
    sha256: await hashFile(filename),
    size_bytes: (await stat(filename)).size,
  });
}
if (!files.length) throw new Error('No installer artifacts found');
await writeFile(
  path.join(directory, 'installer-sha256.json'),
  `${JSON.stringify({ signing_state: 'unsigned-internal', files }, null, 2)}\n`,
);
console.log(`Recorded ${files.length} installer checksums outside the signed application`);
