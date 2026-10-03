import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/** Preserve license text for the dependencies actually emitted into the renderer. */
export function bundleLicenses(): Plugin {
  return {
    name: 'framefetch-bundle-licenses',
    generateBundle(_options, bundle) {
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          if (id.startsWith('\0')) continue;
          const marker = '/node_modules/';
          const offset = id.lastIndexOf(marker);
          if (offset < 0) continue;
          const parts = id.slice(offset + marker.length).split('/');
          roots.add(
            id.slice(0, offset + marker.length) +
              parts.slice(0, parts[0]?.startsWith('@') ? 2 : 1).join('/'),
          );
        }
      }
      const missing: string[] = [];
      const notices = [...roots].sort().map((directory) => {
        const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
        const isNotice = (name: string) =>
          /^(?:licen[sc]e|copying|notice)(?:\.[a-z]+)?$/i.test(name);
        const files = readdirSync(directory)
          .filter(isNotice)
          .map((name) => join(directory, name));
        const fallback = join(
          'resources/licenses',
          `${metadata.name.replaceAll('/', '-')}-LICENSE.txt`,
        );
        if (!files.length && existsSync(fallback)) files.push(fallback);
        const vendors = join(directory, 'lib-vendor');
        if (existsSync(vendors)) {
          for (const child of readdirSync(vendors, { withFileTypes: true })) {
            if (!child.isDirectory()) continue;
            const vendor = join(vendors, child.name);
            files.push(
              ...readdirSync(vendor)
                .filter(isNotice)
                .map((name) => join(vendor, name)),
            );
          }
        }
        if (!files.length) missing.push(metadata.name);
        const text = files.map((file) => readFileSync(file, 'utf8')).join('\n');
        return `${metadata.name}@${metadata.version}\n${'='.repeat(60)}\n${text}`;
      });
      if (missing.length) throw new Error(`Missing bundled license text: ${missing.join(', ')}`);
      this.emitFile({
        type: 'asset',
        fileName: 'assets/third-party-licenses.txt',
        source: notices.join('\n\n'),
      });
    },
  };
}
