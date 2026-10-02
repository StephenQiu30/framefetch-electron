import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { pngDimensions, verifyBrand } from '../../scripts/sync-brand.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'framefetch-brand-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const relative of ['src/renderer/assets', 'resources/icons']) {
    await cp(path.join(root, relative), path.join(directory, relative), { recursive: true });
  }
  await mkdir(path.join(directory, 'scripts'));
  await copyFile(
    path.join(root, 'scripts/generate-icons.py'),
    path.join(directory, 'scripts/generate-icons.py'),
  );
  return directory;
}

test('the checked-in brand verifies offline and preserves the Web originals exactly', async () => {
  const manifest = await verifyBrand();
  assert.equal(manifest.authority, 'video-server/frontend/public');
  const svg = await readFile(path.join(root, 'src/renderer/assets/logo.svg'), 'utf8');
  assert.match(svg, /fill="#1677FF"/);
  assert.match(svg, /下载箭头与播放按钮/);
  assert.doesNotMatch(svg, /filmstrip|336bdf/i);
});

test('macOS and Windows exports contain the required original-mark icon representations', async () => {
  const ico = await readFile(path.join(root, 'resources/icons/icon.ico'));
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  const sizes = [];
  for (let index = 0; index < ico.readUInt16LE(4); index++) {
    const offset = 6 + index * 16;
    const width = ico[offset] || 256;
    const height = ico[offset + 1] || 256;
    const bytes = ico.readUInt32LE(offset + 8);
    const start = ico.readUInt32LE(offset + 12);
    assert.ok(start + bytes <= ico.length, 'ICO representation must be within the file');
    assert.deepEqual(pngDimensions(ico.subarray(start, start + bytes)), [width, height]);
    sizes.push(width);
  }
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);

  const icns = await readFile(path.join(root, 'resources/icons/icon.icns'));
  assert.equal(icns.subarray(0, 4).toString(), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  const representations = new Map();
  for (let offset = 8; offset < icns.length; ) {
    const type = icns.subarray(offset, offset + 4).toString();
    const bytes = icns.readUInt32BE(offset + 4);
    assert.ok(bytes >= 8 && offset + bytes <= icns.length, 'Invalid ICNS representation');
    representations.set(type, icns.subarray(offset + 8, offset + bytes));
    offset += bytes;
  }
  for (const [type, size] of [
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024],
  ]) {
    assert.ok(representations.has(type), `Missing ICNS ${size}px icon`);
    assert.deepEqual(pngDimensions(representations.get(type)), [size, size]);
  }
});

test('source drift, missing formats and modified generated artwork fail the offline check', async (t) => {
  const directory = await fixture(t);
  const source = path.join(directory, 'src/renderer/assets/logo.svg');
  const original = await readFile(source);
  await writeFile(source, Buffer.concat([original, Buffer.from('\nchanged')]));
  await assert.rejects(verifyBrand(directory), /Brand size mismatch|Brand hash mismatch/);
  await writeFile(source, original);

  const manifestFile = path.join(directory, 'resources/icons/brand-manifest.json');
  const manifestText = await readFile(manifestFile, 'utf8');
  const manifest = JSON.parse(manifestText);
  manifest.artifacts.pop();
  await writeFile(manifestFile, JSON.stringify(manifest));
  await assert.rejects(verifyBrand(directory), /Missing generated icon formats/);
  await writeFile(manifestFile, manifestText);

  // Even if a replacement is re-hashed, it cannot substitute another SVG for the brand.
  const replacement = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
  await writeFile(path.join(directory, 'resources/icons/icon.svg'), replacement);
  const changed = JSON.parse(manifestText);
  changed.artifacts[0].bytes = replacement.length;
  changed.artifacts[0].sha256 = createHash('sha256').update(replacement).digest('hex');
  await writeFile(manifestFile, JSON.stringify(changed));
  await assert.rejects(verifyBrand(directory), /Application SVG must match/);
});

test('upstream comparison is explicit and reports frontend logo drift', async (t) => {
  const directory = await fixture(t);
  const frontend = path.join(directory, 'frontend');
  await mkdir(path.join(frontend, 'public'), { recursive: true });
  for (const extension of ['svg', 'png']) {
    await copyFile(
      path.join(directory, `src/renderer/assets/logo.${extension}`),
      path.join(frontend, `public/logo.${extension}`),
    );
  }
  await verifyBrand(directory, { source: frontend });
  await writeFile(path.join(frontend, 'public/logo.svg'), '<svg>different brand</svg>');
  await assert.rejects(verifyBrand(directory, { source: frontend }), /Web brand has changed/);
  await verifyBrand(directory);
});
