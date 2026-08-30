import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOTS = ['src/lib/ui', 'src/ui'];
const EXTRA = ['src/shell.html'];
const EXTENSIONS = new Set(['.svelte', '.js', '.mjs', '.html']);
const SAMPLE_LIMIT_PER_FILE = 8;

// Extended pictographs cover normal emoji; regional indicators and tag
// characters cover country/subdivision flags. Variation selectors / ZWJ are
// included so a composed glyph is reported as one offending run.
const EMOJI = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:[\uFE0E\uFE0F\u200D]|[\u{E0020}-\u{E007F}]|\p{Extended_Pictographic}|\p{Regional_Indicator})*/gu;

function isCommentOnlyLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('//')
    || trimmed.startsWith('<!--')
    || trimmed.startsWith('/*')
    || trimmed.startsWith('*')
    || trimmed.startsWith('*/');
}

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
  const lines = text.split('\n');
  for (const match of text.matchAll(EMOJI)) {
    const before = text.slice(0, match.index);
    const line = before.split('\n').length;
    const sourceLine = lines[line - 1]?.trim() ?? '';
    if (isCommentOnlyLine(sourceLine)) continue;
    findings.push({ file, line, glyph: match[0], sourceLine });
  }
}

if (findings.length) {
  const grouped = new Map();
  for (const finding of findings) {
    const group = grouped.get(finding.file) ?? [];
    group.push(finding);
    grouped.set(finding.file, group);
  }

  console.error(`UI emoji audit failed: ${findings.length} glyph(s) remain across ${grouped.size} file(s).`);
  console.error('Remaining by file:');
  for (const [file, group] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
    console.error(`  ${String(group.length).padStart(3)}  ${file}`);
  }

  console.error(`\nSamples (up to ${SAMPLE_LIMIT_PER_FILE} per file):`);
  for (const [file, group] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const f of group.slice(0, SAMPLE_LIMIT_PER_FILE)) {
      console.error(`  ${file}:${f.line}  ${JSON.stringify(f.glyph)}  ${f.sourceLine}`);
    }
    if (group.length > SAMPLE_LIMIT_PER_FILE) {
      console.error(`  ${file}  … ${group.length - SAMPLE_LIMIT_PER_FILE} more`);
    }
  }
  process.exitCode = 1;
} else {
  console.log(`UI emoji audit passed: ${files.length} source files contain no emoji glyphs.`);
}