import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../live-broadcast-tactical.css'), 'utf8');
const main = readFileSync(resolve(here, '../main.js'), 'utf8');

describe('live broadcast tactical visual language', () => {
  it('loads the tactical presentation after the shared app styles', () => {
    expect(main).toContain("import './live-broadcast-tactical.css';");
    expect(main.indexOf("import './live-broadcast-tactical.css';"))
      .toBeGreaterThan(main.indexOf("import './touchline-ledger-polish.css';"));
  });

  it('renders players as tactical tokens instead of pseudo-human head/leg sprites', () => {
    expect(css).toContain('.broadcast-player .player-head');
    expect(css).toContain('.broadcast-player .player-legs');
    expect(css).toMatch(/\.player-head,[\s\S]*?\.player-legs[\s\S]*?display:\s*none/);
    expect(css).toContain('border-radius: 50%');
    expect(css).toContain('clip-path: none');
  });

  it('keeps readable semantic states for possession, receiving, pressing and keeper identity', () => {
    expect(css).toContain('.broadcast-player.carrying::after');
    expect(css).toContain('.broadcast-player.receiving::after');
    expect(css).toContain('.broadcast-player.pressing::before');
    expect(css).toContain('.broadcast-player.keeper .player-shirt');
  });
});
