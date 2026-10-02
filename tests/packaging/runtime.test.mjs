import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { afterPack, afterSign } from '../../scripts/builder-hooks.mjs';
import { binaryArchitectures, verifyManifest, writeManifest } from '../../scripts/runtime-lib.mjs';

const macho = (cpu = 0x0100000c) => {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32LE(0xfeedfacf);
  buffer.writeUInt32LE(cpu, 4);
  return buffer;
};

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'framefetch-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'engine'), { recursive: true });
  await mkdir(path.join(root, 'tools'));
  for (const name of ['engine/framefetch-engine', 'tools/ffmpeg', 'tools/ffprobe']) {
    await writeFile(path.join(root, name), macho(), { mode: 0o755 });
  }
  const metadata = {
    platform: 'darwin',
    arch: 'arm64',
    engine_version: '0.1.0',
    sources: [],
    licenses: [],
  };
  await writeManifest(root, metadata);
  return { root, metadata };
}

test('detects Mach-O, universal and PE architecture without invoking host file tools', () => {
  assert.deepEqual(binaryArchitectures(macho()), ['arm64']);
  assert.deepEqual(binaryArchitectures(macho(0x01000007)), ['x64']);
  const fat = Buffer.alloc(48);
  fat.writeUInt32BE(0xcafebabe);
  fat.writeUInt32BE(2, 4);
  fat.writeUInt32BE(0x0100000c, 8);
  fat.writeUInt32BE(0x01000007, 28);
  assert.deepEqual(binaryArchitectures(fat).sort(), ['arm64', 'x64']);
  const pe = Buffer.alloc(128);
  pe.write('MZ');
  pe.writeUInt32LE(64, 60);
  pe.write('PE\0\0', 64);
  pe.writeUInt16LE(0x8664, 68);
  assert.deepEqual(binaryArchitectures(pe), ['x64']);
});

test('manifest hashes every file and verifies the pinned protocol and architecture', async (t) => {
  const { root } = await fixture(t);
  const manifest = await verifyManifest(root, { platform: 'darwin', arch: 'arm64' });
  assert.equal(manifest.protocol_version, '1');
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.files.length, 3);
  assert.equal(manifest.files[0].sha256, createHash('sha256').update(macho()).digest('hex'));
  await assert.rejects(verifyManifest(root, { platform: 'darwin', arch: 'x64' }), /architecture/);
});

test('tampering, omitted files, missing required resources and wrong binaries are rejected', async (t) => {
  const { root, metadata } = await fixture(t);
  await writeFile(
    path.join(root, 'tools/ffmpeg'),
    Buffer.concat([macho(), Buffer.from('tampered')]),
  );
  await assert.rejects(verifyManifest(root), /hash|size/);
  await writeManifest(root, metadata);
  await writeFile(path.join(root, 'tools/extra'), 'unlisted');
  await assert.rejects(verifyManifest(root), /unlisted/);
  await rm(path.join(root, 'tools/extra'));
  await writeFile(path.join(root, 'tools/ffmpeg'), macho(0x01000007));
  await writeManifest(root, metadata);
  await assert.rejects(verifyManifest(root), /architecture/);
  await rm(path.join(root, 'tools/ffprobe'));
  await assert.rejects(writeManifest(root, metadata), /required resource/);
});

test('traversal, manifest self-reference and symlink escapes are rejected', async (t) => {
  const { root } = await fixture(t);
  const manifest = await verifyManifest(root);
  for (const name of [
    '../outside',
    '/tmp/outside',
    'tools/../../outside',
    'manifest.json',
    'tools\\ffmpeg',
  ]) {
    await writeFile(
      path.join(root, 'manifest.json'),
      JSON.stringify({ ...manifest, files: [{ ...manifest.files[0], path: name }] }),
    );
    await assert.rejects(verifyManifest(root), /unsafe|self/);
  }
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  if (process.platform !== 'win32') {
    await symlink('/etc/hosts', path.join(root, 'tools/escape'));
    await assert.rejects(verifyManifest(root), /symlink/);
  }
});

test('all native dependency files must match the runtime architecture and platform', async (t) => {
  const { root, metadata } = await fixture(t);
  await mkdir(path.join(root, 'engine/_internal'));
  await writeFile(path.join(root, 'engine/_internal/extension.so'), macho(0x01000007));
  await writeManifest(root, metadata);
  await assert.rejects(verifyManifest(root), /architecture/);
  const pe = Buffer.alloc(128);
  pe.write('MZ');
  pe.writeUInt32LE(64, 60);
  pe.write('PE\0\0', 64);
  pe.writeUInt16LE(0xaa64, 68);
  await writeFile(path.join(root, 'engine/_internal/extension.so'), pe);
  await writeManifest(root, metadata);
  await assert.rejects(verifyManifest(root), /platform/);
});

test('packaging writes the final manifest before outer signing and refuses mutation after signing', async (t) => {
  const { root } = await fixture(t);
  const appOutDir = path.join(root, 'packaged');
  const installed = path.join(appOutDir, 'FrameFetch.app/Contents/Resources/runtime');
  await mkdir(installed, { recursive: true });
  for (const name of ['engine', 'tools', 'manifest.json'])
    await cp(path.join(root, name), path.join(installed, name), { recursive: true });
  const context = {
    appOutDir,
    electronPlatformName: 'darwin',
    arch: 3,
    packager: {
      appInfo: { productFilename: 'FrameFetch' },
      platformSpecificBuildOptions: { identity: null },
    },
  };
  await afterPack(context);
  const manifest = await verifyManifest(installed);
  assert.equal(manifest.signing_state, 'unsigned-internal');
  await afterSign(context);
  await writeFile(
    path.join(installed, 'tools/ffmpeg'),
    Buffer.concat([macho(), Buffer.from('signature changed')]),
  );
  await assert.rejects(afterSign(context), /hash|size/);
});
