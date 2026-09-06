import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildManagedMatchInputs } from '../modules/managerTactics.js';

const here = dirname(fileURLToPath(import.meta.url));
const matchScreenSrc = readFileSync(resolve(here, '../lib/ui/MatchScreen.svelte'), 'utf8');

function sourceOf(functionName, length = 5000) {
  const start = matchScreenSrc.indexOf(`async function ${functionName}`);
  return start === -1 ? '' : matchScreenSrc.slice(start, start + length);
}

function syncSourceOf(functionName, length = 5000) {
  const start = matchScreenSrc.indexOf(`function ${functionName}`);
  return start === -1 ? '' : matchScreenSrc.slice(start, start + length);
}

describe('MatchScreen home/away mapping', () => {
  it('keeps the user squad on the away side for non-league away matches', () => {
    const src = sourceOf('resolveMatchTeams');
    expect(src).toContain('homePlayers = userIsHomeC ? userPlayers : oppPlayers');
    expect(src).toContain('awayPlayers = userIsHomeC ? oppPlayers : userPlayers');
  });

  it('routes both Watch and Play Key Moments through the shared P2 managed-match adapter', () => {
    const sharedInputSrc = syncSourceOf('buildInputs', 1800);
    const startManagedSrc = sourceOf('startManagedMatch', 4200);
    const watchSrc = sourceOf('startWatch', 500);
    const playableSrc = sourceOf('startPlayableKeyMoments', 500);

    expect(sharedInputSrc).toContain('buildManagedMatchInputs({');
    expect(sharedInputSrc).toContain('userIsHome:resolved.userIsHome');
    expect(startManagedSrc).toContain('const inputs = buildInputs(matchCtx, resolved)');
    expect(watchSrc).toContain('startManagedMatch(false)');
    expect(playableSrc).toContain('startManagedMatch(true)');

    const shared = {
      save:{ formation:'4-2-3-1', mentality:'balanced', lineup:['p1'] },
      homeTeam:{ id:'home' },
      awayTeam:{ id:'away' },
      homePlayers:[],
      awayPlayers:[],
      overrideFormation:'3-4-3',
    };

    const managedHome = buildManagedMatchInputs({ ...shared, userIsHome:true });
    expect(managedHome.homeFormation).toBe('3-4-3');
    expect(managedHome.awayFormation).toBeUndefined();
    expect(managedHome.homeLineup).toEqual(['p1']);
    expect(managedHome.awayLineup).toBeNull();

    const managedAway = buildManagedMatchInputs({ ...shared, userIsHome:false });
    expect(managedAway.homeFormation).toBeUndefined();
    expect(managedAway.awayFormation).toBe('3-4-3');
    expect(managedAway.homeLineup).toBeNull();
    expect(managedAway.awayLineup).toEqual(['p1']);
  });

  it('keeps Play Key Moments on the existing MatchScreen/gameweek lifecycle', () => {
    expect(matchScreenSrc).toContain('Play Key Moments');
    expect(matchScreenSrc).toContain('advancePlayableMatchPhase({');
    expect(matchScreenSrc).toContain('advanceOneFixtureWithResult(result, live.matchEvent, live.userIsHome)');
    expect(matchScreenSrc).toContain('clearPlayableMatchAfterClose(playableSession)');
  });
});
