import { describe, expect, it } from 'vitest';
import { primaryRating } from './matchEngine.js';
import { getPotentialStars } from './potential.js';
import { createScoutingState } from './scouting.js';
import { projectScoutedListKey, projectScoutedPlayerView, scoutingViewContext } from './scoutingView.js';

const POSITIONS = ['GK','CB','RB','LB','CDM','CM','CAM','RW','LW','ST'];
const TRAIT_SETS = [
  [],
  ['finisher'],
  ['creator','ball_winner'],
  ['aerial_presence','wide_runner','sweeper_keeper'],
  ['finisher','finisher','creator','ball_winner','not_a_real_trait'],
];
const REHABS = [
  undefined,
  { matchReadiness:38 },
  { readiness:71 },
  { matchReadiness:100 },
];

/**
 * A spread of players that between them exercise every field the effective
 * level and potential estimate read: traits, rehabilitation and injury,
 * position suitability, form/morale/sharpness/fitness extremes, age and an
 * explicit peak age.
 */
function makePlayers(count = 400) {
  return Array.from({ length:count }, (_, i) => {
    const position = POSITIONS[i % POSITIONS.length];
    return {
      id:`p${i}`,
      name:`Player ${i}`,
      position,
      age:16 + (i % 24),
      peakAge:i % 7 === 0 ? 26 + (i % 5) : undefined,
      attack:35 + (i * 13) % 62,
      midfield:35 + (i * 7) % 62,
      defence:35 + (i * 11) % 62,
      goalkeeping:35 + (i * 17) % 62,
      value:250_000 + i * 137_000,
      wage:1_000 + i * 311,
      teamId:`t${i % 40}`,
      form:i % 101,
      fitness:(i * 3) % 101,
      individualMorale:(i * 5) % 101,
      sharpness:(i * 9) % 101,
      injured:i % 17 === 0,
      rehabilitation:REHABS[i % REHABS.length],
      traits:TRAIT_SETS[i % TRAIT_SETS.length],
      positionSuitability:i % 5 === 0 ? { [position]:0.8, ST:0.4 } : undefined,
      potentialRating:55 + (i * 19) % 45,
      contract:{ expiresSeason:'2027/28' },
    };
  });
}

const CONTEXT = {
  season:'2026/27',
  gameweek:6,
  userTeam:{ id:'user', name:'User FC', reputation:78, league:'Premier League' },
  teamsById:new Map(),
  valueFor:(player) => Math.round(Number(player.value) || 0),
};

function keysAndProjections(players, state) {
  const shared = scoutingViewContext(state, CONTEXT);
  return players.map(player => ({
    player,
    key:projectScoutedListKey(player, state, shared),
    full:projectScoutedPlayerView(player, state, CONTEXT),
  }));
}

describe('recruitment list key', () => {
  it('reports exactly what the full scouting projection would show, for unscouted players', () => {
    const players = makePlayers();
    const state = createScoutingState();

    for (const { key, full } of keysAndProjections(players, state)) {
      expect(key.rating).toBe(primaryRating(full));
      expect(key.value).toBe(Math.round(Number(full.value) || 0));
      expect(key.potentialStars).toBe(getPotentialStars(full));
      expect(key.exact).toBe(false);
    }
  });

  it('agrees with the projection for players a scout has already reported on', () => {
    const players = makePlayers(60);
    const state = createScoutingState();
    state.reports = players.slice(0, 30).map((player, index) => ({
      playerId:player.id,
      observedSeason:'2026/27',
      observedGameweek:index % 2 === 0 ? 6 : 1, // half of them stale enough to widen
      current:{ min:60 + index % 10, max:72 + index % 10 },
      future:{ min:70 + index % 8, max:84 + index % 8 },
      confidence:0.3 + (index % 7) / 10,
      confidenceLabel:'Medium',
      exact:index % 5 === 0,
      financial:{ feeMin:2_000_000 + index * 1_000, feeMax:5_000_000 + index * 1_000, wageMin:9_000, wageMax:21_000 },
      stage:'observed',
    }));

    const rows = keysAndProjections(players, state);
    expect(rows.some(row => row.full.scoutingView)).toBe(true);

    for (const { key, full } of rows) {
      expect(key.rating).toBe(primaryRating(full));
      expect(key.value).toBe(Math.round(Number(full.value) || 0));
      expect(key.potentialStars).toBe(getPotentialStars(full));
      expect(key.exact).toBe(full.fullyScouted === true);
    }
  });

  it('ignores a report from a season the manager has already left behind', () => {
    const [player] = makePlayers(1);
    const state = createScoutingState();
    state.reports = [{
      playerId:player.id,
      observedSeason:'2024/25',
      observedGameweek:6,
      current:{ min:90, max:94 },
      future:{ min:95, max:99 },
      confidence:0.9,
      confidenceLabel:'High',
      financial:{ feeMin:80_000_000, feeMax:90_000_000, wageMin:200_000, wageMax:260_000 },
      stage:'complete',
    }];

    const shared = scoutingViewContext(state, CONTEXT);
    const key = projectScoutedListKey(player, state, shared);
    const full = projectScoutedPlayerView(player, state, CONTEXT);

    expect(key.rating).toBe(primaryRating(full));
    expect(key.value).toBe(Math.round(Number(full.value) || 0));
    expect(key.potentialStars).toBe(getPotentialStars(full));
  });

  it('does not read a player’s true ability into the key', () => {
    // The whole point of the key: it must be derived from the observed band, so
    // a fogged player never sorts on a number the manager cannot see.
    const [player] = makePlayers(1);
    const state = createScoutingState();
    const shared = scoutingViewContext(state, CONTEXT);
    const key = projectScoutedListKey(player, state, shared);
    const truthful = projectScoutedListKey({ ...player, id:`${player.id}-clone` }, state, shared);

    // Same attributes, different id: the seeded observation differs, proving the
    // key is an observation rather than a read of the canonical row.
    expect(key.value).not.toBe(truthful.value);
  });

  it('fogs on the same rounded confidence a stored report would carry', () => {
    // The confidence a report persists is rounded to two decimals, and the fog
    // step changes at .56 and .82. Sweeping the club's baseline knowledge walks
    // the key straight across those boundaries, where an unrounded value used
    // to disagree with the row it sits next to.
    const players = makePlayers(40);
    for (let knowledge = .25; knowledge <= .8; knowledge = Math.round((knowledge + .002) * 1000) / 1000) {
      const state = createScoutingState({ defaultKnowledge:knowledge });
      const shared = scoutingViewContext(state, CONTEXT);
      for (const player of players) {
        const key = projectScoutedListKey(player, state, shared);
        const full = projectScoutedPlayerView(player, state, CONTEXT);
        expect(key.rating).toBe(primaryRating(full));
        expect(key.potentialStars).toBe(getPotentialStars(full));
        expect(key.value).toBe(Math.round(Number(full.value) || 0));
      }
    }
  });

  it('survives a player row with nothing on it', () => {
    const state = createScoutingState();
    const shared = scoutingViewContext(state, CONTEXT);
    expect(projectScoutedListKey(null, state, shared)).toEqual({ rating:0, value:0, potentialStars:0, exact:false });
  });
});
