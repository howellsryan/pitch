import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../ui/renderers.js'), 'utf8');

describe('playable match boot resume routing', () => {
  it('routes an active persisted Play Key Moments session directly to Match after refresh', () => {
    expect(source).toContain('export function initialScreenForSave(save)');
    expect(source).toContain('Boolean(save?.playableMatchSession)');
    expect(source).toContain("return playableMatchActive || shootoutActive ? 'match' : 'home'");
    expect(source).toContain('await enterGame(initialScreenForSave(save))');
  });

  it('keeps ordinary returning careers on Home', () => {
    expect(source).toContain("export async function enterGame(initialScreen = 'home')");
    expect(source).toContain("await navigateTo(initialScreen, { history: 'replace' })");
  });

  it('also resumes a persisted competition shootout through Match', () => {
    expect(source).toContain('save.pendingEvents.some(event => Boolean(event?.shootoutSession))');
  });
});
