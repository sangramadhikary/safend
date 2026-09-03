import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // Some suites render the full OneTimeInvoiceForm inside fast-check property
    // loops; under jsdom these legitimately exceed the 5s default. Raise the
    // per-test timeout so they complete instead of timing out mid-run.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      // Vitest 5 / Vite native config loader: prefer import.meta.dirname over
      // the CJS __dirname, which is unsupported by configLoader: 'native'.
      '@': path.resolve(import.meta.dirname, './src'),
      // `server-only` throws at import time by design (it's a React marker
      // package). In tests that import server modules we need the no-op stub
      // so the import chain doesn't blow up. The package ships an empty module
      // at `empty.js`; resolve it by absolute path since the exports map only
      // exposes the throwing `index.js` under the default condition.
      'server-only': path.resolve(import.meta.dirname, 'node_modules/server-only/empty.js'),
    },
  },
});
