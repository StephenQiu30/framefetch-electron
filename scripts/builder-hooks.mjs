import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  binaryArchitectures,
  binaryHeader,
  projectRoot,
  run,
  verifyManifest,
  walkFiles,
  writeManifest,
} from './runtime-lib.mjs';

export function buildTarget(context) {
  const arch =
    typeof context.arch === 'string' ? context.arch : { 1: 'x64', 3: 'arm64' }[context.arch];
  if (!arch) throw new Error('Universal and unsupported package architectures are disabled');
  return { platform: context.electronPlatformName, arch };
}

export function installedRuntime(context) {
  return context.electronPlatformName === 'darwin'
    ? path.join(
        context.appOutDir,
        `${context.packager.appInfo.productFilename}.app`,
        'Contents/Resources/runtime',
      )
    : path.join(context.appOutDir, 'resources/runtime');
}

export async function beforePack(context) {
  const current = buildTarget(context);
  await verifyManifest(
    path.join(projectRoot, 'resources/runtime', `${current.platform}-${current.arch}`),
    current,
  );
}

export async function afterPack(context) {
  const current = buildTarget(context);
  const root = installedRuntime(context);
  // Windows builder may already have signed extraResource executables while
  // copying them. Their original hashes were checked in beforePack; read the
  // metadata here, then regenerate hashes from the final installed bytes.
  const previous = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  if (
    previous.protocol_version !== '1' ||
    previous.schema_version !== 1 ||
    previous.platform !== current.platform ||
    previous.arch !== current.arch
  )
    throw new Error('packaged runtime metadata mismatch');
  const files = await walkFiles(root);
  let signingState = 'unsigned-internal';
  if (current.platform === 'darwin') {
    // Only an explicitly configured identity enables signing. No credential is
    // read here. Builder signs the outer app after this hook, ignoring runtime.
    const identity = context.packager.platformSpecificBuildOptions.identity;
    if (typeof identity === 'string' && identity && identity !== '-') {
      for (const file of files.sort((a, b) => b.split('/').length - a.split('/').length)) {
        const absolute = path.join(root, file);
        if (!binaryArchitectures(await binaryHeader(absolute)).length) continue;
        const entitlements =
          file === 'tools/deno'
            ? ['--entitlements', path.join(projectRoot, 'resources/entitlements.deno.plist')]
            : [];
        await run('/usr/bin/codesign', [
          '--force',
          '--sign',
          identity,
          '--timestamp',
          '--options',
          'runtime',
          ...entitlements,
          absolute,
        ]);
      }
      signingState = 'nested-signed-awaiting-outer-app';
    }
  } else {
    const options = context.packager.platformSpecificBuildOptions;
    if (options.signExecutable !== false && (options.signtoolOptions || options.azureSignOptions)) {
      for (const file of files) {
        if (binaryArchitectures(await binaryHeader(path.join(root, file))).length)
          await context.packager.sign(path.join(root, file));
      }
      signingState = 'nested-signed-awaiting-outer-app';
    }
  }
  const { files: _files, ...metadata } = previous;
  await writeManifest(root, { ...metadata, signing_state: signingState });
  await verifyManifest(root, current);
  console.log(
    'Final runtime hashes written after nested signing and before outer application signing',
  );
}

export async function afterSign(context) {
  // Never write to the app after its outer signature. A later signing step
  // accidentally touching runtime fails the build instead of shipping bad hashes.
  await verifyManifest(installedRuntime(context), buildTarget(context));
}
