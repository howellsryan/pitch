/**
 * Generates web/index.html — the Vite entry — from src/shell.html.
 *
 * shell.html is a fragment: it ends with an unclosed `<script>` that the
 * legacy build.py fills with the concatenated bundle. Vite needs a complete
 * document that pulls in a module entry instead, so we swap that trailing
 * opener for a module script tag and close the document.
 *
 * shell.html stays the single source of markup/CSS until Phase 3 replaces it
 * screen by screen — generating rather than forking avoids the two copies
 * silently diverging in between.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shell = readFileSync(join(ROOT, 'src/shell.html'), 'utf8');

const marker = shell.lastIndexOf('<script>');
if (marker === -1) throw new Error('src/shell.html: expected a trailing <script> opener');

const html = shell.slice(0, marker)
  + '<script type="module" src="../src/main.js"></script>\n'
  + '</body>\n</html>\n';

mkdirSync(join(ROOT, 'web'), { recursive: true });
writeFileSync(join(ROOT, 'web/index.html'), html);
console.log(`web/index.html  (${html.length.toLocaleString()} bytes)`);
