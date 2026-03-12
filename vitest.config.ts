import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    silent: 'passed-only',
    testTimeout: 15_000,
    hookTimeout: 15_000,
    include: ['tests/**/*.test.ts'],
    exclude: ['.memphis-intake/**', 'reference/**', 'node_modules/**', 'dist/**'],
  },
});
