import { defineConfig } from 'vitest/config';

/**
 * Separate from vite.config.ts on purpose — that one's `root: 'web'` is for
 * building the app (docs/plan/04-migration-phases.md, Phase 2 toolchain) and
 * has nothing to do with running tests against src/game/*.test.js.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
  },
});
