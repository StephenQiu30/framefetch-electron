import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const sourcePaths = ['src/renderer/assets/logo.svg', 'src/renderer/assets/logo.png'];
const artifactPaths = [
  'resources/icons/icon.svg',
  'resources/icons/icon-512.png',
  'resources/icons/icon-1024.png',
  'resources/icons/icon.icns',
  'resources/icons/icon.ico',
];
const sha256 = (content) => createHash('sha256').update(content).digest('hex');

export function pngDimensions(content) {
  assert.equal(content.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'Invalid PNG');
  assert.equal(content.subarray(12, 16).toString(), 'IHDR', 'PNG is missing IHDR');
  assert.equal(content[24], 8, 'Brand PNG must use 8-bit channels');
  assert.equal(content[25], 6, 'Brand PNG must preserve RGBA transparency');
  return [content.readUInt32BE(16), content.readUInt32BE(20)];
}

/** Verify local assets offline. An explicit frontend source optionally checks upstream drift. */
export async function verifyBrand(root = projectRoot, { source } = {}) {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'resources/icons/brand-manifest.json')),
  );
  assert.equal(manifest.version, 1, 'Unknown brand manifest version');
  assert.equal(manifest.authority, 'video-server/frontend/public', 'Wrong brand authority');
  assert.equal(manifest.generator.path, 'scripts/generate-icons.py', 'Wrong icon generator');
  assert.equal(manifest.generator.pillow, '12.3.0', 'Wrong Pillow version');
  assert.equal(manifest.generator.scaling, 'contain-lanczos', 'Logo must scale without distortion');
  assert.deepEqual(
    manifest.sources.map((entry) => entry.path),
    sourcePaths,
    'Missing brand sources',
  );
  assert.deepEqual(
    manifest.artifacts.map((entry) => entry.path),
    artifactPaths,
    'Missing generated icon formats',
  );
  for (const entry of [manifest.generator, ...manifest.sources, ...manifest.artifacts]) {
    const content = await readFile(path.join(root, entry.path));
    assert.equal(content.length, entry.bytes, `Brand size mismatch: ${entry.path}`);
    assert.equal(sha256(content), entry.sha256, `Brand hash mismatch: ${entry.path}`);
  }
  for (const [index, extension] of ['svg', 'png'].entries()) {
    const entry = manifest.sources[index];
    assert.equal(entry.origin, `public/logo.${extension}`, 'Wrong upstream logo path');
    if (source) {
      const content = await readFile(path.join(source, entry.origin));
      assert.equal(sha256(content), entry.sha256, `Web brand has changed: ${entry.origin}`);
    }
  }
  const [svg, iconSvg, png, icon512, icon1024] = await Promise.all([
    readFile(path.join(root, sourcePaths[0])),
    readFile(path.join(root, artifactPaths[0])),
    readFile(path.join(root, sourcePaths[1])),
    readFile(path.join(root, artifactPaths[1])),
    readFile(path.join(root, artifactPaths[2])),
  ]);
  assert.deepEqual(iconSvg, svg, 'Application SVG must match the original brand exactly');
  assert.match(svg.toString('utf8'), /<svg\b/, 'The source logo must be an SVG');
  const dimensions = pngDimensions(png);
  assert.deepEqual(pngDimensions(icon512), [512, 512], 'Wrong 512px icon dimensions');
  assert.deepEqual(pngDimensions(icon1024), [1024, 1024], 'Wrong 1024px icon dimensions');
  if (dimensions[0] === 1024 && dimensions[1] === 1024) {
    assert.deepEqual(icon1024, png, 'The full-size PNG must preserve the canonical source bytes');
  }
  return manifest;
}

async function main(args) {
  const check = args.includes('--check');
  const sourceIndex = args.indexOf('--source');
  const source = sourceIndex < 0 ? undefined : args[sourceIndex + 1];
  const expected = [...(check ? ['--check'] : []), ...(source ? ['--source', source] : [])];
  assert.equal(
    args.length,
    expected.length,
    'Usage: sync-brand.mjs [--check] [--source <frontend>]',
  );
  assert.ok(
    args.every((arg) => expected.includes(arg)),
    'Unknown brand command argument',
  );
  if (sourceIndex >= 0) assert.ok(source && !source.startsWith('--'), '--source requires a path');
  if (source && !check) {
    const frontend = path.resolve(source);
    const inputs = await Promise.all(
      ['svg', 'png'].map((extension) => readFile(path.join(frontend, `public/logo.${extension}`))),
    );
    assert.match(inputs[0].toString('utf8'), /<svg\b/, 'The source logo must be an SVG');
    pngDimensions(inputs[1]);
    await mkdir(path.join(projectRoot, 'src/renderer/assets'), { recursive: true });
    for (const extension of ['svg', 'png']) {
      await copyFile(
        path.join(frontend, `public/logo.${extension}`),
        path.join(projectRoot, `src/renderer/assets/logo.${extension}`),
      );
    }
    const result = spawnSync(
      'uv',
      ['run', '--no-project', '--with', 'pillow==12.3.0', 'python', 'scripts/generate-icons.py'],
      { cwd: projectRoot, stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    assert.equal(result.status, 0, 'Icon generation failed');
  }
  const manifest = await verifyBrand(projectRoot, { source: source && path.resolve(source) });
  console.log(
    `Brand verified: ${manifest.sources.length} sources and ${manifest.artifacts.length} icons`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
