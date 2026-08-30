import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOTS = ['src/lib/ui', 'src/ui'];
const EXTRA = ['src/shell.html'];
const EXTENSIONS = new Set(['.svelte', '.js', '.mjs', '.html']);

// Extended pictographs cover normal emoji; regional indicators and tag
// characters cover country/subdivision flags. Variation selectors / ZWJ are
// included so a composed glyph is reported as one offending run.
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\uFE0E\uFE0F\u200D]|[\u{E0020}-\u{E007F}]|\p{Extended_Pictographic}|\p{Regional_Indicator})*/gu;

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else if (EXTENSIONS.has(extname(entry.name))) out.push(path);
  }
  return out;
}

const files = [...(await Promise.all(ROOTS.map(walk))).flat(), ...EXTRA];
const findings = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(EMOJI)) {
    const before = text.slice(0, match.index);
    const line = before.split('\n').length;
    const sourceLine = text.split('\n')[line - 1]?.trim() ?? '';
    findings.push({ file, line, glyph: match[0], sourceLine });
  }
}

if (findings.length) {
  console.error(`UI emoji audit failed: ${findings.length} glyph(s) remain.`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${JSON.stringify(f.glyph)}  ${f.sourceLine}`);
  }
  process.exitCode = 1;
} else {
  console.log(`UI emoji audit passed: ${files.length} source files contain no emoji glyphs.`);
}
