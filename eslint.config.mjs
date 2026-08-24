import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';

/**
 * Wired in during Phase 2, before the first Svelte component exists, so the
 * Svelte 4 → 5 syntax drift described in .claude/rules/svelte5.md is caught by
 * CI rather than by review.
 *
 * The legacy sources (src/modules, src/ui, src/data, src/validate.js) are not
 * linted: they were written against a concatenated-globals build and would
 * produce thousands of findings that nobody is going to action before Phase 4
 * deletes them.
 */
export default [
  {
    ignores: [
      'dist/**', 'web/**', 'node_modules/**', '.build/**',
      'src/modules/**', 'src/ui/**', 'src/data/**', 'src/validate.js',
      'index.html',
    ],
  },
  js.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { document: 'readonly', window: 'readonly', console: 'readonly', getComputedStyle: 'readonly' },
    },
  },
  {
    // tools/ and tests/ run in Node, not the browser.
    files: ['tools/**/*.mjs', 'tests/**/*.mjs', '*.config.mjs', '*.config.ts'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
];
