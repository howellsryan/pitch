import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

function sourceOf(functionName, length = 5000) {
  const start = matchScreenSrc.indexOf(`async function ${functionName}`);
  return start === -1 ? '' : matchScreenSrc.slice(start, start + length);
}

describe('MatchScreen home/away mapping', () => {
  it('keeps the user squad on the away side for non-league away matches', () => {
    const src = sourceOf('resolveMatchTeams');
    expect(src).toContain('homePlayers = userIsHomeC ? userPlayers : oppPlayers');
    expect(src).toContain('awayPlayers = userIsHomeC ? oppPlayers : userPlayers');
  });

  it('applies the user formation to the correct venue side', () => {
    const src = sourceOf('startWatch', 3000);
    expect(src).toContain('homeFormation = resolved.userIsHome ? formation : aiFormation');
    expect(src).toContain('awayFormation = resolved.userIsHome ? aiFormation : formation');
    expect(src).toContain('homeFormation, awayFormation, homeLineup, awayLineup');
  });
});
