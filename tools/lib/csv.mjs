// tools/lib/csv.mjs
// Minimal header-keyed CSV read/write. No quoting support - matches every CSV
// in this repo and in footy-sim's playerdata/ (plain comma-separated, no
// embedded commas/quotes in any field). Header-driven (DictReader-style) so
// column order differences across leagues (some pitch CSVs omit `nationality`)
// don't break parsing.
import fs from 'node:fs';

export function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = lines.slice(1).map((line, i) => {
    const cols = line.split(',');
    const row = {};
    header.forEach((h, idx) => {
      row[h] = (cols[idx] ?? '').trim();
    });
    row.__line = i + 2;
    return row;
  });
  return { header, rows };
}

export function readCsvFile(path) {
  return parseCsv(fs.readFileSync(path, 'utf8'));
}

export function toCsv(header, rows) {
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(header.map((h) => String(row[h] ?? '')).join(','));
  }
  return lines.join('\n') + '\n';
}

export function writeCsvFile(path, header, rows) {
  fs.writeFileSync(path, toCsv(header, rows), 'utf8');
}
