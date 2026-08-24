import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Svelte 5 runes only — no legacy reactive-statement syntax.
    // See .claude/rules/svelte5.md.
    runes: true,
  },
};
