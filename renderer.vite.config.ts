import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { bundleLicenses } from './scripts/bundle-licenses';

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react(), tailwindcss(), bundleLicenses()],
  resolve: {
    alias: {
      '@': resolve('src/renderer/frontend'),
      'next/link': resolve('src/renderer/adapters/link.tsx'),
      'next/image': resolve('src/renderer/adapters/image.tsx'),
      'next/navigation': resolve('src/renderer/adapters/navigation.ts'),
    },
  },
  define: { 'process.env.SITE_URL': 'undefined', 'process.env.SITE_INDEXABLE': 'false' },
  build: { outDir: resolve('out/renderer'), emptyOutDir: true, target: 'chrome150' },
});
