import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyBrand } from './sync-brand.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = 'resources/frontend-baseline.json';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copies = [
  { source: 'design.md', path: 'design.md' },
  { source: 'frontend/src/app/globals.css', path: 'src/renderer/frontend.css' },
];
const adaptation = {
  'dialog.tsx': 'The accessible close label is translated to Chinese.',
  'sonner.tsx':
    'The desktop passes its local theme explicitly; no Next.js theme runtime is imported.',
};

export async function verifyFrontend(directory = root, source) {
  const manifest = JSON.parse(await readFile(path.join(directory, manifestPath), 'utf8'));
  assert.equal(manifest.version, 1);
  assert.equal(manifest.authority, 'video-server/design.md');
  const config = JSON.parse(await readFile(path.join(directory, 'components.json'), 'utf8'));
  assert.equal(config.style, 'radix-nova');
  assert.equal(config.iconLibrary, 'phosphor');
  assert.equal(config.tailwind.baseColor, 'neutral');
  assert.equal(config.rsc, false, 'The desktop is an independent Electron renderer');
  assert.deepEqual(
    manifest.foundation.map(({ source, path: local }) => ({ source, path: local })),
    copies,
  );
  for (const entry of [...manifest.foundation, ...manifest.components]) {
    const bytes = await readFile(path.join(directory, entry.path));
    assert.equal(sha256(bytes), entry.sha256, `Local frontend baseline drift: ${entry.path}`);
    if (source) {
      const upstream = await readFile(path.join(source, entry.source));
      assert.equal(
        sha256(upstream),
        entry.sourceSha256,
        `Upstream frontend changed: ${entry.source}`,
      );
    }
  }
  await verifyBrand(directory, { source: source ? path.join(source, 'frontend') : undefined });
  return manifest;
}

async function main(args) {
  if (!args.length || (args.length === 1 && args[0] === '--check')) {
    const manifest = await verifyFrontend();
    console.log(
      'Frontend baseline verified offline: ' +
        manifest.components.length +
        ' shared components, design, tokens and brand',
    );
    return;
  }
  const check = args[0] === '--check';
  const sourceIndex = args.indexOf('--source');
  assert.ok(
    sourceIndex >= 0 && args.length === (check ? 3 : 2),
    'Usage: sync-frontend.mjs [--check] [--source <video-server>]',
  );
  const source = path.resolve(args[sourceIndex + 1]);
  if (check) {
    await verifyFrontend(root, source);
    console.log('Frontend and upstream baseline match');
    return;
  }
  // Refresh only the canonical design and stylesheet. Component API changes require deliberate integration.
  for (const entry of copies)
    await copyFile(path.join(source, entry.source), path.join(root, entry.path));
  const entries = async (entry) => ({
    ...entry,
    sourceSha256: sha256(await readFile(path.join(source, entry.source))),
    sha256: sha256(await readFile(path.join(root, entry.path))),
  });
  const components = [];
  for (const name of (await readdir(path.join(root, 'src/renderer/components/ui'))).sort()) {
    if (!name.endsWith('.tsx')) continue;
    components.push(
      await entries({
        source: `frontend/src/components/ui/${name}`,
        path: `src/renderer/components/ui/${name}`,
        adaptation:
          adaptation[name] ?? 'Formatting only; the existing frontend component is reused.',
      }),
    );
  }
  await writeFile(
    path.join(root, manifestPath),
    `${JSON.stringify(
      {
        version: 1,
        authority: 'video-server/design.md',
        foundation: await Promise.all(copies.map(entries)),
        components,
      },
      null,
      2,
    )}\n`,
  );
  await verifyFrontend(root, source);
  console.log('Canonical design and stylesheet synchronized; shared component snapshot recorded');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
