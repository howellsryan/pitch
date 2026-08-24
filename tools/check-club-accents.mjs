/**
 * Verifies the design system's quality floor for the club accent:
 * text on the accent clears WCAG AA (4.5:1) and the accent stays visible
 * against the ground, for every club in the game.
 *
 * docs/plan/02-design-system.md calls for exactly this check "against all 186
 * clubs" — several genuinely need the guard, so it runs in CI rather than
 * being spot-checked by hand.
 */
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { resolveAccent, contrastRatio, hexToRgb, GROUND } from '../src/lib/theme.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(ROOT, 'src/data');

const clubs = [];
for (const f of readdirSync(dataDir).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(dataDir, f), 'utf8');
  const re = /\{id:'([^']+)',name:'([^']+)'[^\n]*?primaryColor:'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) clubs.push({ id: m[1], name: m[2], color: m[3], league: f });
}

let fail = 0, adjusted = 0;
const worst = [];
for (const c of clubs) {
  const r = resolveAccent(c.color);
  const text = contrastRatio(hexToRgb(r.hex), hexToRgb(r.on));
  const ground = contrastRatio(hexToRgb(r.hex), hexToRgb(GROUND));
  if (r.adjusted) adjusted++;
  const bad = text < 4.5 || ground < 3;
  if (bad) { fail++; console.log(`  FAIL ${c.name} ${c.color} -> ${r.hex} text ${text.toFixed(2)} ground ${ground.toFixed(2)} (${r.reason})`); }
  worst.push({ ...c, hex: r.hex, on: r.on, text, ground, reason: r.reason });
}

worst.sort((a, b) => a.ground - b.ground);
console.log(`\n  Clubs checked: ${clubs.length}   adjusted: ${adjusted}   failures: ${fail}`);
console.log('\n  Tightest against the ground:');
for (const c of worst.slice(0, 8)) {
  console.log(`    ${c.name.padEnd(24)} ${c.color} -> ${c.hex} on ${c.on}  text ${c.text.toFixed(2)}  ground ${c.ground.toFixed(2)}  ${c.reason}`);
}
if (fail) { console.error(`\n  ${fail} club(s) below the contrast floor.`); process.exit(1); }
console.log('\n  All clubs clear the contrast floor.\n');
