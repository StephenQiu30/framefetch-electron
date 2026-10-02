import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const target = (platform = process.platform, arch = process.arch) => {
  if (!['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(`${platform}-${arch}`)) {
    throw new Error(
      `Unsupported runtime target ${platform}-${arch}; build on its native OS/architecture`,
    );
  }
  return { platform, arch, id: `${platform}-${arch}` };
};
export const runtimeRoot = () => path.join(projectRoot, 'resources', 'runtime', target().id);
export const executable = (name, platform = process.platform) =>
  platform === 'win32' ? `${name}.exe` : name;

export async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function binaryHeader(file) {
  const descriptor = await open(file, 'r');
  try {
    const buffer = Buffer.alloc(65536);
    const { bytesRead } = await descriptor.read(buffer);
    return buffer.subarray(0, bytesRead);
  } finally {
    await descriptor.close();
  }
}

export function safeRelative(file) {
  if (
    typeof file !== 'string' ||
    !file ||
    file.includes('\\') ||
    file.includes('\0') ||
    file.includes(':') ||
    path.posix.isAbsolute(file) ||
    file.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`unsafe runtime path: ${String(file)}`);
  }
  if (file === 'manifest.json') throw new Error('manifest self-reference is forbidden');
  return file;
}

export async function walkFiles(root, prefix = '') {
  const found = [];
  for (const name of (await readdir(path.join(root, prefix))).sort()) {
    const file = prefix ? `${prefix}/${name}` : name;
    if (file === 'manifest.json') continue;
    safeRelative(file);
    const info = await lstat(path.join(root, file));
    if (info.isSymbolicLink())
      throw new Error(`runtime symlink is forbidden: ${file}; freeze with dereference`);
    if (info.isDirectory()) found.push(...(await walkFiles(root, file)));
    else if (info.isFile()) found.push(file);
    else throw new Error(`unsupported runtime filesystem entry: ${file}`);
  }
  return found;
}

function cpuArchitecture(cpu) {
  return { 16777228: 'arm64', 16777223: 'x64', 34404: 'x64', 43620: 'arm64' }[cpu];
}

export function binaryArchitectures(buffer) {
  if (buffer.length < 8) return [];
  const magic = buffer.readUInt32BE(0);
  if (magic === 0xcffaedfe) return [cpuArchitecture(buffer.readUInt32LE(4))].filter(Boolean);
  if (magic === 0xfeedfacf) return [cpuArchitecture(buffer.readUInt32BE(4))].filter(Boolean);
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = buffer.readUInt32BE(4);
    const stride = magic === 0xcafebabf ? 32 : 20;
    if (count > 16 || buffer.length < 8 + count * stride)
      throw new Error('invalid Mach-O fat header');
    return [
      ...new Set(
        Array.from({ length: count }, (_, i) =>
          cpuArchitecture(buffer.readUInt32BE(8 + i * stride)),
        ).filter(Boolean),
      ),
    ];
  }
  if (buffer.length >= 64 && buffer.toString('ascii', 0, 2) === 'MZ') {
    const offset = buffer.readUInt32LE(60);
    if (offset + 6 <= buffer.length && buffer.toString('ascii', offset, offset + 4) === 'PE\0\0') {
      return [cpuArchitecture(buffer.readUInt16LE(offset + 4))].filter(Boolean);
    }
  }
  return [];
}

export function binaryPlatform(buffer) {
  if (buffer.length < 4) return undefined;
  if ([0xcffaedfe, 0xfeedfacf, 0xcafebabe, 0xcafebabf].includes(buffer.readUInt32BE(0)))
    return 'darwin';
  if (buffer.toString('ascii', 0, 2) === 'MZ') return 'win32';
  return undefined;
}

export function roleFor(file) {
  if (/^engine\/framefetch-engine(?:\.exe)?$/.test(file)) return 'engine';
  if (/^tools\/(ffmpeg|ffprobe|yt-dlp|deno)(?:\.exe)?$/.test(file))
    return path.posix.basename(file).replace(/\.exe$/, '');
  if (file === 'native/job.node') return 'native-job';
  if (file.startsWith('engine/')) return 'engine-dependency';
  if (file.startsWith('licenses/')) return 'license';
  return 'metadata';
}

function requiredPaths(platform) {
  const required = ['engine/framefetch-engine', 'tools/ffmpeg', 'tools/ffprobe'].map((p) =>
    executable(p, platform),
  );
  if (platform === 'win32') required.push('native/job.node');
  return required;
}

export async function writeManifest(root, metadata) {
  target(metadata.platform, metadata.arch);
  const paths = await walkFiles(root);
  for (const file of requiredPaths(metadata.platform)) {
    if (!paths.includes(file)) throw new Error(`required resource missing: ${file}`);
  }
  const files = [];
  for (const file of paths) {
    const info = await stat(path.join(root, file));
    files.push({
      path: file,
      sha256: await hashFile(path.join(root, file)),
      size_bytes: info.size,
      role: roleFor(file),
    });
  }
  const manifest = { schema_version: 1, protocol_version: '1', ...metadata, files };
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyManifest(root, expected = {}) {
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.schema_version !== 1 || manifest.protocol_version !== '1')
    throw new Error('unsupported runtime protocol/schema');
  target(manifest.platform, manifest.arch);
  if (expected.platform && expected.platform !== manifest.platform)
    throw new Error('runtime platform mismatch');
  if (expected.arch && expected.arch !== manifest.arch)
    throw new Error('runtime architecture mismatch');
  if (
    typeof manifest.engine_version !== 'string' ||
    !manifest.engine_version ||
    !Array.isArray(manifest.files)
  )
    throw new Error('invalid runtime manifest');
  const listed = new Set();
  for (const file of manifest.files) {
    safeRelative(file.path);
    if (listed.has(file.path)) throw new Error(`duplicate runtime file: ${file.path}`);
    listed.add(file.path);
    if (
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      !Number.isSafeInteger(file.size_bytes) ||
      file.size_bytes < 0 ||
      file.role !== roleFor(file.path)
    )
      throw new Error(`invalid runtime entry: ${file.path}`);
    const absolute = path.join(root, file.path);
    const info = await lstat(absolute);
    if (info.isSymbolicLink() || !info.isFile())
      throw new Error(`runtime symlink/non-file: ${file.path}`);
    if (info.size !== file.size_bytes) throw new Error(`runtime size mismatch: ${file.path}`);
    if ((await hashFile(absolute)) !== file.sha256)
      throw new Error(`runtime hash mismatch: ${file.path}`);
    const header = await binaryHeader(absolute);
    const platform = binaryPlatform(header);
    if (platform && platform !== manifest.platform)
      throw new Error(`binary platform mismatch: ${file.path}`);
    if (
      platform ||
      ['engine', 'ffmpeg', 'ffprobe', 'yt-dlp', 'deno', 'native-job'].includes(file.role)
    ) {
      if (!binaryArchitectures(header).includes(manifest.arch))
        throw new Error(`binary architecture mismatch: ${file.path}`);
      if (
        manifest.platform === 'darwin' &&
        ['engine', 'ffmpeg', 'ffprobe', 'yt-dlp', 'deno'].includes(file.role) &&
        (info.mode & 0o111) === 0
      )
        throw new Error(`resource is not executable: ${file.path}`);
    }
  }
  for (const file of requiredPaths(manifest.platform))
    if (!listed.has(file)) throw new Error(`required resource missing: ${file}`);
  for (const file of await walkFiles(root))
    if (!listed.has(file)) throw new Error(`unlisted runtime file: ${file}`);
  return manifest;
}

export async function run(command, args, options = {}) {
  const { capture = false, input, allowedExitCodes = [0], ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: capture ? [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] : 'inherit',
      ...spawnOptions,
    });
    if (input !== undefined) child.stdin.end(input);
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (data) => {
        stdout += data;
      });
      child.stderr.on('data', (data) => {
        stderr += data;
      });
    }
    child.on('error', reject);
    child.on('close', (code) =>
      allowedExitCodes.includes(code)
        ? resolve({ stdout, stderr, code })
        : reject(new Error(`${path.basename(command)} exited ${code}: ${stderr.slice(-2000)}`)),
    );
  });
}
