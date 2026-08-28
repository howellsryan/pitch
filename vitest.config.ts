import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts on purpose — that one's `root: 'web'` is for
 * building the app (docs/plan/04-migration-phases.md, Phase 2 toolchain) and
 * has nothing to do with running tests against src/game/*.test.js.
 *
 * functions/**\/*.test.js (ROADMAP.md item 7) joined the include list
 * alongside src/ — functions/ is the Workers-runtime server code, not part
 * of the Vite app, but Node's built-in Web Crypto makes it runnable under
 * Vitest same as everything else here.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.js', 'functions/**/*.test.js'],
  },
});
