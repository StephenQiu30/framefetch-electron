import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'node24',
    outDir: 'out/main',
    emptyOutDir: true,
    lib: {
      entry: resolve('src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: ['electron', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    },
  },
});
