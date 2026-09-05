import { describe, expect, it } from 'vitest';
import { buildLeagueJs } from './generate.mjs';

async function loadGenerated(players) {
  const js = buildLeagueJs({
    teams:[{
      team_id:'club', name:'Test Club', short_name:'TST', crest:'test', league:'Test League',
      stadium:'Test Ground', stadium_capacity:20000, budget_millions:20, reputation:70, primary_color:'#123456',
    }],
    playersByTeam:new Map([['club', players]]),
    arrayName:'TEST_TEAMS',
    helperName:'t1p',
    sourceLabel:'Test League',
    hasNationality:false,
  });
  const url = `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
  return import(url);
}

function row(overrides = {}) {
  return {
    team_id:'club', player_id:'p1', name:'Player One', position:'ST', age:23,
    attack:81, midfield:72, defence:38, goalkeeping:10,
    value_millions:25, wage_thousands:55, potential:86, is_wonderkid:false,
    pace:88, shooting:82, passing:74, dribbling:84, defending:37, physical:79,
    ...overrides,
  };
}

describe('T1 CSV-to-generated detailed attributes', () => {
  it('persists all six source values as the versioned runtime profile', async () => {
    const module = await loadGenerated([row()]);
    expect(module.TEST_TEAMS[0].players[0].attributeProfile).toEqual({
      version:1,
      pace:88,
      shooting:82,
      passing:74,
      dribbling:84,
      defending:37,
      physical:79,
    });
  });

  it('keeps legacy/goalkeeper rows valid when detailed source values are unavailable', async () => {
    const module = await loadGenerated([row({
      player_id:'gk', position:'GK', attack:10, midfield:18, defence:22, goalkeeping:80,
      pace:null, shooting:null, passing:null, dribbling:null, defending:null, physical:null,
    })]);
    const player = module.TEST_TEAMS[0].players[0];
    expect(player.goalkeeping).toBe(80);
    expect(player).not.toHaveProperty('attributeProfile');
  });
});
