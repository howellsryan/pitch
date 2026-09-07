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
    expect(source).toContain('pendingResumeScreen=initialScreenForSave(save)');
    expect(source).toContain("if(initialScreen==='match') await navigateTo('match'");
  });

  it('keeps the legacy argument-free enterGame handoff and ordinary careers on Home', () => {
    expect(source).toContain('export async function enterGame()');
    expect(source).toContain('await enterGame();');
    expect(source).toContain("else await navigateTo('home'");
    expect(source).toContain('pendingResumeScreen=null');
  });

  it('themes the career before consuming the staged resume destination', () => {
    const boot = source.slice(source.indexOf('export async function boot()'));
    const stage = boot.indexOf('pendingResumeScreen=initialScreenForSave(save)');
    const theme = boot.indexOf('await themeForTeam(save.userTeamId)');
    const enter = boot.indexOf('await enterGame()');
    expect(stage).toBeGreaterThan(-1);
    expect(theme).toBeGreaterThan(stage);
    expect(enter).toBeGreaterThan(theme);
  });

  it('also resumes a persisted competition shootout through Match', () => {
    expect(source).toContain('save.pendingEvents.some(event => Boolean(event?.shootoutSession))');
  });
});