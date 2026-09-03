import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      // Vitest 5 / Vite native config loader: prefer import.meta.dirname over
      // the CJS __dirname, which is unsupported by configLoader: 'native'.
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
