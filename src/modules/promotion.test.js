import { describe, expect, it } from 'vitest';

import { simulateMatch } from './matchEngine.js';
import { buildManagedMatchInputs } from './managerTactics.js';
import { getLeagueOutcome, runPlayoffs, simulatePlayoffFinal, simulatePlayoffTie } from './promotion.js';

function squad(teamId, rating) {
  return ['GK','RB','CB','CB','LB','CM','CM','CAM','RW','LW','ST'].map((position, index) => ({
    id:`${teamId}_${index}`, name:`${teamId} ${index}`, teamId, position,
    age:24, attack:rating, midfield:rating, defence:rating,
    goalkeeping:position === 'GK' ? rating : 10, fitness:100, inSquad:true,
  }));
}

const teams = [
  { id:'a', name:'A', reputation:65 },
  { id:'b', name:'B', reputation:65 },
];

describe('promotion and playoff football', () => {
  it('uses four relegation places in League One and four promotion places in League Two', () => {
    const rows = Array.from({ length:24 }, (_, index) => ({ teamId:`club_${index + 1}` }));

    expect(getLeagueOutcome(rows, 'League One')).toEqual({
      autoPromoted:['club_1','club_2'],
      playoffTeams:['club_3','club_4','club_5','club_6'],
      relegated:['club_21','club_22','club_23','club_24'],
    });
    expect(getLeagueOutcome(rows, 'League Two')).toEqual({
      autoPromoted:['club_1','club_2','club_3'],
      playoffTeams:['club_4','club_5','club_6','club_7'],
      relegated:[],
    });
    expect(getLeagueOutcome(rows, 'Championship')).toEqual({
      autoPromoted:['club_1','club_2'],
      playoffTeams:['club_3','club_4','club_5','club_6'],
      relegated:['club_22','club_23','club_24'],
    });
  });

  it('reports the authoritative scores for both semifinal legs and the final', () => {
    const homePlayers = squad('a', 82);
    const awayPlayers = squad('b', 62);
    homePlayers[10].injured = true;
    homePlayers.push({ ...homePlayers[10], id:'a_replacement', injured:false, attack:68 });
    const players = [...homePlayers, ...awayPlayers];
    const leg1 = simulateMatch(teams[0], teams[1], homePlayers, awayPlayers,
      undefined, undefined, undefined, undefined, undefined, undefined, { seed:601 });
    const leg2 = simulateMatch(teams[1], teams[0], awayPlayers, homePlayers,
      undefined, undefined, undefined, undefined, undefined, undefined, { seed:602 });
    const tie = simulatePlayoffTie('a', 'b', teams, players, { seed:601 });
    const final = simulatePlayoffFinal('a', 'b', teams, players, { seed:601 });

    expect(tie.leg1).toEqual({ home:leg1.homeGoals, away:leg1.awayGoals });
    expect(tie.leg2).toEqual({ home:leg2.homeGoals, away:leg2.awayGoals });
    expect(tie.agg).toEqual({ team1:leg1.homeGoals + leg2.awayGoals, team2:leg1.awayGoals + leg2.homeGoals });
    expect(final.score).toEqual({ team1:leg1.homeGoals, team2:leg1.awayGoals });
    expect(simulatePlayoffTie('a', 'b', teams, players, { seed:601 })).toEqual(tie);
    expect(simulatePlayoffFinal('a', 'b', teams, players, { seed:601 })).toEqual(final);
  });

  it('lets real squad quality decide promotion instead of equal club reputations', () => {
    const strong = [...squad('a', 90), ...squad('b', 48)];
    const weak = [...squad('a', 48), ...squad('b', 90)];
    let strongWins = 0;
    let weakWins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      strongWins += Number(simulatePlayoffFinal('a', 'b', teams, strong, { seed }).winnerId === 'a');
      weakWins += Number(simulatePlayoffFinal('a', 'b', teams, weak, { seed }).winnerId === 'a');
    }
    expect(strongWins - weakWins).toBeGreaterThan(10);
  }, 20_000);

  it('honours the managed lineup, bench and tactical plan in promotion matches', () => {
    const homePlayers = squad('a', 75);
    const awayPlayers = squad('b', 73);
    const save = {
      userTeamId:'a', formation:'4-4-2', mentality:'attacking',
      lineup:homePlayers.map(player => player.id), bench:[],
      tactics:{ instructions:{ pressing:'aggressive', tempo:'fast' } }, playerRoles:{},
    };
    const inputs = buildManagedMatchInputs({ save,
      homeTeam:teams[0], awayTeam:teams[1], homePlayers, awayPlayers, userIsHome:true,
    });
    const expectedScores = [];
    const playoffScores = [];
    for (let seed = 1; seed <= 6; seed++) {
      const expected = simulateMatch(inputs.homeTeam, inputs.awayTeam, inputs.homePlayers, inputs.awayPlayers,
        inputs.homeFormation, inputs.awayFormation, inputs.homeLineup, inputs.awayLineup,
        inputs.homeMentality, inputs.awayMentality, { seed, homeBench:inputs.homeBench, awayBench:inputs.awayBench });
      expectedScores.push({ team1:expected.homeGoals, team2:expected.awayGoals });
      playoffScores.push(simulatePlayoffFinal('a', 'b', teams, [...homePlayers, ...awayPlayers], { seed, save }).score);
    }
    expect(playoffScores).toEqual(expectedScores);
  }, 20_000);

  it('keeps bracket replay deterministic while different match seeds can promote different clubs', () => {
    const playoffTeams = Array.from({ length:4 }, (_, index) => ({ id:`club_${index}`, name:`Club ${index}`, reputation:70 }));
    const players = playoffTeams.flatMap(team => squad(team.id, 70));
    const ids = playoffTeams.map(team => team.id);
    const first = runPlayoffs(ids, playoffTeams, players, { seed:1 });
    expect(runPlayoffs(ids, playoffTeams, players, { seed:1 })).toEqual(first);
    const winners = new Set();
    for (let seed = 1; seed <= 20; seed++) winners.add(runPlayoffs(ids, playoffTeams, players, { seed }).promotedViaPlayoff);
    expect(winners.size).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
