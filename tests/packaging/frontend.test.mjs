import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { verifyFrontend } from '../../scripts/sync-frontend.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

test('standalone frontend baseline verifies without the sibling service', async () => {
  const manifest = await verifyFrontend(root);
  assert.equal(manifest.authority, 'video-server/design.md');
  assert.ok(manifest.components.some((entry) => entry.path.endsWith('/button.tsx')));
  assert.ok(manifest.components.some((entry) => entry.path.endsWith('/field.tsx')));
});

test('copied product tokens cannot silently drift from the recorded frontend', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'framefetch-design-'));
  try {
    const baseline = JSON.parse(
      await readFile(path.join(root, 'resources/frontend-baseline.json'), 'utf8'),
    );
    const brand = JSON.parse(
      await readFile(path.join(root, 'resources/icons/brand-manifest.json'), 'utf8'),
    );
    const names = [
      'components.json',
      'resources/frontend-baseline.json',
      'resources/icons/brand-manifest.json',
      ...baseline.foundation.map((entry) => entry.path),
      ...baseline.components.map((entry) => entry.path),
      brand.generator.path,
      ...brand.sources.map((entry) => entry.path),
      ...brand.artifacts.map((entry) => entry.path),
    ];
    for (const name of names) {
      const target = path.join(temporary, name);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(root, name), target);
    }
    await verifyFrontend(temporary);
    const css = path.join(temporary, 'src/renderer/frontend.css');
    await writeFile(
      css,
      (await readFile(css, 'utf8')).replace('--radius: 0.625rem;', '--radius: 2rem;'),
    );
    await assert.rejects(verifyFrontend(temporary), /Local frontend baseline drift/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
