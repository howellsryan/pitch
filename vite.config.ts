import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

/**
 * Phase 2 toolchain.
 *
 * `root` is web/, whose index.html is generated from src/shell.html by
 * tools/make-entry.mjs — shell.html stays the single source of markup until
 * Phase 3 replaces it screen by screen.
 *
 * Note: Vite does NOT produce the bundle src/validate.js checks. The validator
 * makes 430 assertions against the bundle's raw source text (exact strings like
 * `function selectEleven(players, formation` and `'GK': 0`), and esbuild
 * rewrites quote style and tree-shakes unreferenced top-level code. The
 * concatenated bundle from src/build.py is kept for that purpose — see
 * docs/plan/04-migration-phases.md.
 */
export default defineConfig({
  root: 'web',
  publicDir: false,
  // root is web/, so the svelte config next to this file needs naming explicitly.
  plugins: [
    tailwindcss(),
    svelte({ configFile: fileURLToPath(new URL('./svelte.config.mjs', import.meta.url)) }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { port: 5173 },
});
