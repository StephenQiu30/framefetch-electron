import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'tests/main/**/*.test.ts',
      'tests/packaging/**/*.test.ts',
      'tests/renderer/**/*.test.ts',
    ],
    testTimeout: 15000,
    maxWorkers: 4,
  },
});
