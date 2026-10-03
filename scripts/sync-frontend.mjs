import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'resources/frontend-baseline.json');
const checkUpstream = process.argv.includes('--check-upstream');
const check = process.argv.includes('--check') || checkUpstream;
const sourceArgument = process.argv.find((argument) => argument.startsWith('--source='));
const sourceRoot = resolve(
  sourceArgument?.slice('--source='.length) || join(root, '../video-server/frontend'),
);
const digest = (contents) => createHash('sha256').update(contents).digest('hex');

if (check) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const file of manifest.files) {
    const contents = await readFile(join(root, file.target));
    if (digest(contents) !== file.sha256) throw new Error(`Frontend source drift: ${file.target}`);
    if (checkUpstream && digest(await readFile(join(sourceRoot, file.source))) !== file.sha256)
      throw new Error(
        `Frontend upstream changed: ${file.source}. Run frontend:sync after reviewing the source changes.`,
      );
  }
  const expected = new Set(
    manifest.files
      .filter((file) => file.target.startsWith('src/renderer/frontend/'))
      .map((file) => file.target),
  );
  for (const file of await filesWithin(join(root, 'src/renderer/frontend'))) {
    if (!expected.has(relative(root, file).replaceAll('\\', '/')))
      throw new Error(`Untracked frontend snapshot source: ${file}`);
  }
  console.log(
    `Verified ${manifest.files.length} exact frontend source/assets; no sibling checkout is required.`,
  );
  if (checkUpstream)
    console.log('Verified snapshot hashes against the selected upstream checkout.');
} else {
  const pages = [
    'account',
    'about',
    'guide',
    'self-hosting',
    'providers',
    'documents',
    'history',
    'user/login',
    'user/register',
    'history/activity',
    'documents/detail',
    'downloads/new',
    'downloads/detail',
    'analyses/detail',
    'admin/ai-providers',
    'admin/analytics',
    'admin/files',
    'admin/operation-logs',
    'admin/providers',
    'admin/users',
  ];
  const selected = new Set([
    ...pages.map((page) => `src/app/${page}/page.tsx`),
    'src/app/not-found.tsx',
    'src/app/globals.css',
    'src/components/intake/home-experience.tsx',
    'src/components/intake/public-home.tsx',
    'src/components/auth/auth-provider.tsx',
    'src/components/intake/intake-draft-provider.tsx',
    'src/components/layout/basic-layout.tsx',
    'src/components/layout/query-provider.tsx',
    'src/components/layout/theme-provider.tsx',
    'src/components/layout/route-error-view.tsx',
    'src/components/ui/sonner.tsx',
    'src/components/ui/tooltip.tsx',
    'src/api/typings.d.ts',
  ]);
  for (const file of await filesWithin(join(sourceRoot, 'src/api')))
    selected.add(relative(sourceRoot, file).replaceAll('\\', '/'));
  const queue = [...selected];
  const external = new Set();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const file = queue[cursor];
    const contents = await readFile(join(sourceRoot, file), 'utf8');
    if (
      contents.includes("import 'server-only'") ||
      /from ['"]next\/(?:headers|server)['"]/.test(contents)
    ) {
      throw new Error(`Server-only source entered the renderer dependency closure: ${file}`);
    }
    for (const specifier of importsIn(file, contents)) {
      if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const imported = specifier.startsWith('@/')
          ? resolve(sourceRoot, 'src', specifier.slice(2))
          : resolve(sourceRoot, dirname(file), specifier);
        const within = relative(sourceRoot, imported).replaceAll('\\', '/');
        if (within === '..' || within.startsWith('../'))
          throw new Error(`Import escaped source root: ${file}`);
        const found = await findModule(imported);
        const path = relative(sourceRoot, found).replaceAll('\\', '/');
        if (!selected.has(path)) {
          selected.add(path);
          queue.push(path);
        }
      } else if (specifier !== 'next' && !specifier.startsWith('next/')) {
        external.add(
          specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0],
        );
      }
    }
  }
  await rm(join(root, 'src/renderer/frontend'), { recursive: true, force: true });
  const files = [];
  for (const source of [...selected].sort()) {
    const target = `src/renderer/frontend/${source.slice('src/'.length)}`;
    const contents = await readFile(join(sourceRoot, source));
    await mkdir(dirname(join(root, target)), { recursive: true });
    await writeFile(join(root, target), contents);
    files.push({ source, target, sha256: digest(contents) });
  }
  for (const asset of ['logo.svg', 'logo.png', 'favicon.ico']) {
    const source = `public/${asset}`;
    const target = `src/renderer/public/${asset}`;
    const contents = await readFile(join(sourceRoot, source));
    await mkdir(dirname(join(root, target)), { recursive: true });
    await writeFile(join(root, target), contents);
    files.push({ source, target, sha256: digest(contents) });
  }
  const design = await readFile(join(sourceRoot, '../design.md'));
  await writeFile(join(root, 'design.md'), design);
  files.push({
    source: '../design.md',
    target: 'design.md',
    sha256: digest(design),
  });
  const components = await readFile(join(sourceRoot, 'components.json'));
  await writeFile(join(root, 'resources/shadcn.json'), components);
  files.push({
    source: 'components.json',
    target: 'resources/shadcn.json',
    sha256: digest(components),
  });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: sourceRoot,
    encoding: 'utf8',
  }).trim();
  const manifest = {
    version: 2,
    repository: 'https://github.com/StephenQiu30/video-server',
    commit,
    schemaAuthority: 'backend/sql/schema.sql',
    apiContract: 'FastAPI annotations -> /openapi.json -> frontend/openapi2ts.config.ts -> src/api',
    visualAuthority: 'design.md',
    strategy:
      'Exact browser dependency closure. Desktop framework adapters are outside the source snapshot.',
    externalDependencies: [...external].sort(),
    files,
  };
  await mkdir(dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Synced ${files.length} exact frontend source/assets from ${commit}.`);
  console.log(`Dependencies: ${[...external].sort().join(', ')}`);
}

async function findModule(base) {
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
  throw new Error(`Cannot resolve frontend module: ${base}`);
}

function importsIn(file, contents) {
  if (file.endsWith('.css'))
    return [...contents.matchAll(/^\s*@import\s+["']([^"']+)["']/gm)].map((match) => match[1]);
  // Match module statements, not arbitrary `from` object fields or JSX text.
  const statements =
    /^\s*(?:import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+))?)\s+from\s+)?|export\s+(?:type\s+)?(?:\{[^}]*\}|\*\s*(?:as\s+\w+)?)\s+from\s+)["']([^"']+)["']/gm;
  return [...contents.matchAll(statements)].map((match) => match[1]);
}

async function filesWithin(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await filesWithin(path)));
    else result.push(path);
  }
  return result;
}
