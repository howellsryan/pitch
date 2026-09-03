import { generateLeagueFixtures } from './fixtures.js';
import { primaryRating } from './matchEngine.js';
import { normalizePlayerModel } from './playerModel.js';
import { blankStandingRow, sortTable } from './standings.js';
import { calcYouthPeakAge, distributeAttributes, randName } from './youthAcademy.js';
import { buildWorldCompetitionHistory, worldCompetitionRunsForTeam } from './worldCompetitions.js';

/**
 * P1 living-world domain helpers.
 *
 * League fixtures are the canonical match ledger. A P1 fixture is persisted
 * before projections are applied and carries `worldRecordVersion` plus
 * `projectionsApplied`, allowing gameweek.js to recover an interrupted write
 * without inventing or replaying a result.
 */
export const WORLD_RECORD_VERSION = 1;

export function groupTeamsByLeague(teams) {
  const grouped = new Map();
  for (const team of teams) {
    const league = team.league ?? 'Premier League';
    if (!grouped.has(league)) grouped.set(league, []);
    grouped.get(league).push(team);
  }
  return grouped;
}

export function buildWorldLeagueSeason(teams, seasonYear) {
  const fixtures = [];
  const standings = [];
  for (const [league, leagueTeams] of groupTeamsByLeague(teams)) {
    fixtures.push(...generateLeagueFixtures(leagueTeams.map(team => team.id), seasonYear)
      .map(fixture => ({ ...fixture, league, seasonYear })));
    const initialTable = sortTable(leagueTeams.map(team => ({ ...blankStandingRow(team), league })));
    initialTable.forEach((row, index) => { row.position = index + 1; });
    standings.push(...initialTable);
  }
  return { fixtures, standings };
}

export function buildWorldBackfill(teams, fixtures, standings, seasonYear) {
  const teamsByLeague = groupTeamsByLeague(teams);
  const teamLeague = new Map(teams.map(team => [team.id, team.league ?? 'Premier League']));
  const fixtureLeagues = new Set();
  const fixturesToAdd = [];
  const standingsToAdd = [];

  for (const fixture of fixtures) {
    const league = fixture.league ?? teamLeague.get(fixture.homeTeamId) ?? teamLeague.get(fixture.awayTeamId);
    if (!league) continue;
    fixtureLeagues.add(league);
    if (!fixture.league || fixture.seasonYear == null) {
      fixturesToAdd.push({ ...fixture, league, seasonYear:fixture.seasonYear ?? seasonYear });
    }
  }

  const standingById = new Map(standings.map(row => [row.teamId, row]));
  for (const [league, leagueTeams] of teamsByLeague) {
    if (!fixtureLeagues.has(league)) {
      fixturesToAdd.push(...generateLeagueFixtures(leagueTeams.map(team => team.id), seasonYear)
        .map(fixture => ({ ...fixture, league, seasonYear })));
    }
    for (const team of leagueTeams) {
      const existing = standingById.get(team.id);
      if (!existing) standingsToAdd.push({ ...blankStandingRow(team), league });
      else if (!existing.league) standingsToAdd.push({ ...existing, league });
    }
  }
  return { fixturesToAdd, standingsToAdd };
}

export function toCanonicalLeagueRecord(fixture, result, season) {
  return {
    ...fixture,
    played:true,
    season,
    league:fixture.league ?? null,
    worldRecordVersion:WORLD_RECORD_VERSION,
    projectionsApplied:false,
    homeGoals:result.homeGoals,
    awayGoals:result.awayGoals,
    homeScorers:result.homeScorers ?? [],
    awayScorers:result.awayScorers ?? [],
    events:result.events ?? [],
    stats:result.stats ?? null,
    fitnessUpdates:result.fitnessUpdates ?? [],
    homeFormation:result.homeFormation ?? null,
    awayFormation:result.awayFormation ?? null,
    homeMentality:result.homeMentality ?? 'balanced',
    awayMentality:result.awayMentality ?? 'balanced',
  };
}

export function resultFromCanonicalLeagueRecord(fixture) {
  return {
    fixtureId:fixture.id,
    gameweek:fixture.gameweek,
    league:fixture.league ?? null,
    season:fixture.season ?? null,
    homeTeamId:fixture.homeTeamId,
    awayTeamId:fixture.awayTeamId,
    homeGoals:fixture.homeGoals ?? 0,
    awayGoals:fixture.awayGoals ?? 0,
    homeScorers:fixture.homeScorers ?? [],
    awayScorers:fixture.awayScorers ?? [],
    events:fixture.events ?? [],
    stats:fixture.stats ?? null,
    fitnessUpdates:fixture.fitnessUpdates ?? [],
    homeFormation:fixture.homeFormation ?? null,
    awayFormation:fixture.awayFormation ?? null,
    homeMentality:fixture.homeMentality ?? 'balanced',
    awayMentality:fixture.awayMentality ?? 'balanced',
  };
}

function participantsForResult(result) {
  const starters = new Map();
  for (const update of result.fitnessUpdates ?? []) {
    starters.set(update.id, { playerId:update.id, teamId:update.teamId, start:0, end:90, started:true });
  }
  const participants = new Map(starters);
  for (const event of result.events ?? []) {
    if (event.type !== 'sub') continue;
    const minute = Math.max(0, Math.min(90, Number(event.minute) || 0));
    const outgoing = participants.get(event.outId);
    if (outgoing) outgoing.end = Math.min(outgoing.end, minute);
    if (event.inId) {
      participants.set(event.inId, {
        playerId:event.inId,
        teamId:event.teamId,
        start:minute,
        end:90,
        started:false,
      });
    }
  }
  return [...participants.values()].map(entry => ({
    ...entry,
    minutes:Math.max(1, Math.min(90, entry.end - entry.start)),
  }));
}

function resultDeltaForTeam(result, teamId) {
  const gf = teamId === result.homeTeamId ? result.homeGoals : result.awayGoals;
  const ga = teamId === result.homeTeamId ? result.awayGoals : result.homeGoals;
  if (gf > ga) return 0.45;
  if (gf === ga) return 0.1;
  return -0.2;
}

function matchRating(player, result, minutes) {
  const goals = (result.events ?? []).filter(event => event.type === 'goal' && event.playerId === player.id).length;
  const assists = (result.events ?? []).filter(event => event.type === 'goal' && event.assistId === player.id).length;
  const yellows = (result.events ?? []).filter(event => event.type === 'yellow' && event.playerId === player.id).length;
  const conceded = player.teamId === result.homeTeamId ? result.awayGoals : result.homeGoals;
  const cleanSheetBonus = conceded === 0 && player.position === 'GK' && minutes >= 60 ? 0.5 : 0;
  const involvement = minutes >= 60 ? 0.15 : minutes >= 30 ? 0 : -0.1;
  const raw = 6.35 + resultDeltaForTeam(result, player.teamId) + involvement
    + goals * 0.85 + assists * 0.55 + cleanSheetBonus - yellows * 0.3;
  return Math.max(3, Math.min(10, Math.round(raw * 10) / 10));
}

export function tickPlayerSuspensions(players) {
  for (const player of players) {
    const left = Number(player.suspensionGWsLeft ?? 0);
    if (left > 0) {
      player.suspensionGWsLeft = Math.max(0, left - 1);
      player.suspended = player.suspensionGWsLeft > 0;
    } else if (player.suspended && !player.redCardSuspension) {
      player.suspended = false;
    }
  }
  return players;
}

export function applyWorldPlayerStats(cache, results) {
  for (const result of results) {
    const participations = participantsForResult(result);
    const participationById = new Map(participations.map(entry => [entry.playerId, entry]));

    for (const entry of participations) {
      const player = cache.get(entry.playerId);
      if (!player) continue;
      player.appearances = (player.appearances ?? 0) + 1;
      player.starts = (player.starts ?? 0) + (entry.started ? 1 : 0);
      player.minutes = (player.minutes ?? 0) + entry.minutes;
      player._played = true;
      const rating = matchRating(player, result, entry.minutes);
      player.lastMatchRating = rating;
      player.ratingTotal = (player.ratingTotal ?? 0) + rating;
      player.ratingApps = (player.ratingApps ?? 0) + 1;
      player.averageRating = Math.round((player.ratingTotal / Math.max(1, player.ratingApps)) * 100) / 100;
    }

    for (const event of result.events ?? []) {
      if (event.type === 'goal') {
        const scorer = cache.get(event.playerId);
        if (scorer) {
          scorer.goals = (scorer.goals ?? 0) + 1;
          scorer._played = true;
          scorer._scored = true;
        }
        if (event.assistId) {
          const assister = cache.get(event.assistId);
          if (assister) {
            assister.assists = (assister.assists ?? 0) + 1;
            assister._played = true;
            assister._assisted = true;
          }
        }
      } else if (event.type === 'yellow') {
        const player = cache.get(event.playerId);
        if (!player) continue;
        player.yellowCards = (player.yellowCards ?? 0) + 1;
        if ([5, 10, 15].includes(player.yellowCards)) {
          player.suspensionGWsLeft = Math.max(1, player.suspensionGWsLeft ?? 0);
          player.suspended = true;
        }
      } else if (event.type === 'injury') {
        const player = cache.get(event.playerId);
        if (!player || Number(event.injuryGWsLeft ?? 0) < 3) continue;
        player.seasonMajorInjuries = [
          ...(player.seasonMajorInjuries ?? []),
          { name:event.injuryName ?? 'Injury', gameweek:result.gameweek ?? null, weeks:event.injuryGWsLeft },
        ].slice(-6);
      }
    }

    for (const teamId of [result.homeTeamId, result.awayTeamId]) {
      const conceded = teamId === result.homeTeamId ? result.awayGoals : result.homeGoals;
      if (conceded !== 0) continue;
      for (const [playerId, entry] of participationById) {
        const player = cache.get(playerId);
        if (!player || player.teamId !== teamId || player.position !== 'GK' || entry.minutes < 60) continue;
        player.cleanSheets = (player.cleanSheets ?? 0) + 1;
        player._cleanSheet = true;
      }
    }
  }
  return cache;
}

export function resetSeasonPlayerStats(player) {
  return {
    ...player,
    appearances:0,
    starts:0,
    minutes:0,
    goals:0,
    assists:0,
    cleanSheets:0,
    yellowCards:0,
    redCards:0,
    ratingTotal:0,
    ratingApps:0,
    averageRating:null,
    lastMatchRating:null,
    seasonMajorInjuries:[],
    suspensionGWsLeft:0,
    suspended:false,
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function indexTransfers(transfers) {
  const byPlayer = new Map();
  const byTeam = new Map();
  for (const move of transfers) {
    if (!byPlayer.has(move.playerId)) byPlayer.set(move.playerId, []);
    byPlayer.get(move.playerId).push(move);
    for (const teamId of [move.fromTeamId, move.toTeamId]) {
      if (!teamId) continue;
      if (!byTeam.has(teamId)) byTeam.set(teamId, []);
      byTeam.get(teamId).push(move);
    }
  }
  return { byPlayer, byTeam };
}

function worldSpellSeniorStats(player) {
  return {
    appearances:Math.max(0, Number(player?.appearances ?? 0)),
    starts:Math.max(0, Number(player?.starts ?? 0)),
    minutes:Math.max(0, Number(player?.minutes ?? 0)),
    goals:Math.max(0, Number(player?.goals ?? 0)),
    assists:Math.max(0, Number(player?.assists ?? 0)),
    cleanSheets:Math.max(0, Number(player?.cleanSheets ?? 0)),
    ratingTotal:Math.max(0, Number(player?.ratingTotal ?? 0)),
    ratingApps:Math.max(0, Number(player?.ratingApps ?? 0)),
  };
}

function worldSpellAcademyStats(player) {
  const evidence = player?.academyEvidence ?? {};
  return {
    appearances:Math.max(0, Number(evidence.appearances ?? 0)),
    starts:Math.max(0, Number(evidence.starts ?? 0)),
    minutes:Math.max(0, Number(evidence.minutes ?? 0)),
    goals:Math.max(0, Number(evidence.goals ?? 0)),
    assists:Math.max(0, Number(evidence.assists ?? 0)),
    cleanSheets:Math.max(0, Number(evidence.cleanSheets ?? 0)),
    ratingTotal:Math.max(0, Number(evidence.ratingTotal ?? 0)),
    ratingApps:Math.max(0, Number(evidence.ratingApps ?? 0)),
  };
}

function worldSpellDelta(end, start = {}) {
  const out = {};
  for (const key of ['appearances','starts','minutes','goals','assists','cleanSheets','ratingTotal','ratingApps']) {
    out[key] = Math.max(0, Number(end?.[key] ?? 0) - Number(start?.[key] ?? 0));
  }
  out.averageRating = out.ratingApps > 0 ? Math.round((out.ratingTotal / out.ratingApps) * 100) / 100 : null;
  return out;
}

/** P9 season-history projection; existing aggregate fields remain untouched. */
export function compactPlayerRegistrationSpells(player, season) {
  const spells = Array.isArray(player?.registrationSpells) ? player.registrationSpells : [];
  const currentSenior = worldSpellSeniorStats(player);
  const currentAcademy = worldSpellAcademyStats(player);
  return spells.flatMap(spell => {
    const belongsToSeason = String(spell.startSeason ?? '') === String(season)
      || String(spell.endSeason ?? '') === String(season)
      || spell.endSeason == null;
    if (!belongsToSeason) return [];
    const seniorEnd = spell.endSeason != null
      ? (spell.endStats ?? {})
      : currentSenior;
    const academyEnd = spell.endSeason != null
      ? (spell.endAcademyEvidence ?? {})
      : currentAcademy;
    const seniorStart = String(spell.startSeason ?? '') === String(season) ? (spell.startStats ?? {}) : {};
    const academyStart = String(spell.startSeason ?? '') === String(season) ? (spell.startAcademyEvidence ?? {}) : {};
    return [{
      id:spell.id,
      status:spell.status ?? 'first_team',
      contractTeamId:spell.contractTeamId ?? null,
      registeredTeamId:spell.registeredTeamId ?? null,
      startGameweek:String(spell.startSeason ?? '') === String(season) ? spell.startGameweek ?? null : 1,
      endGameweek:String(spell.endSeason ?? '') === String(season) ? spell.endGameweek ?? null : null,
      reason:spell.reason ?? null,
      endReason:spell.endReason ?? null,
      senior:worldSpellDelta(seniorEnd, seniorStart),
      academy:worldSpellDelta(academyEnd, academyStart),
    }];
  });
}

export function buildLivingWorldSeasonSummary({ save, teams, standings, players, transfers = [], leagueChanges = null, awards = [] }) {
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const transfersBy = indexTransfers(transfers);
  const awardsByPlayer = new Map();
  for (const award of awards) {
    if (!awardsByPlayer.has(award.playerId)) awardsByPlayer.set(award.playerId, []);
    awardsByPlayer.get(award.playerId).push(award);
  }
  const playersByLeague = new Map();
  for (const player of players) {
    if (player.inSquad === false) continue;
    const league = teamsById.get(player.teamId)?.league;
    if (!league) continue;
    if (!playersByLeague.has(league)) playersByLeague.set(league, []);
    playersByLeague.get(league).push(player);
  }

  const playerHistory = players.map(player => {
    const moves = transfersBy.byPlayer.get(player.id) ?? [];
    return {
      playerId:player.id,
      name:player.name,
      position:player.position,
      clubs:unique([player.teamId, ...moves.flatMap(move => [move.fromTeamId, move.toTeamId])]),
      appearances:player.appearances ?? 0,
      starts:player.starts ?? 0,
      minutes:player.minutes ?? 0,
      goals:player.goals ?? 0,
      assists:player.assists ?? 0,
      cleanSheets:player.cleanSheets ?? 0,
      averageRating:player.averageRating ?? null,
      yellowCards:player.yellowCards ?? 0,
      redCards:player.redCards ?? 0,
      majorInjuries:player.seasonMajorInjuries ?? [],
      transfers:moves.map(move => ({ fromTeamId:move.fromTeamId, toTeamId:move.toTeamId, fee:move.fee ?? 0, type:move.type, date:move.date })),
      individualAwards:(awardsByPlayer.get(player.id) ?? []).map(award => award.kind),
      spells:compactPlayerRegistrationSpells(player, save.season),
    };
  });

  const clubHistory = teams.map(team => {
    const row = standings.find(standing => standing.teamId === team.id);
    const significant = [...(transfersBy.byTeam.get(team.id) ?? [])]
      .sort((a, b) => (b.fee ?? 0) - (a.fee ?? 0))
      .slice(0, 3);
    const aiCups = worldCompetitionRunsForTeam(save.worldCompetitions, team.id);
    const cupRuns = team.id === save.userTeamId ? { ...aiCups, ...(save.cups ?? {}) } : aiCups;
    const trophies = [];
    if (row?.position === 1) trophies.push(team.league ?? 'Premier League');
    for (const [cupId, state] of Object.entries(cupRuns)) {
      if (state?.status === 'winner' || state?.winner === true) trophies.push(cupId);
    }
    return {
      teamId:team.id,
      league:team.league ?? 'Premier League',
      finish:row?.position ?? null,
      points:row?.points ?? 0,
      form:row?.form ?? [],
      manager:team.id === save.userTeamId ? save.managerName : (team.managerName ?? 'AI Manager'),
      cupRuns,
      trophies,
      budget:team.budget ?? 0,
      reputation:team.reputation ?? 0,
      significantTransfers:significant,
    };
  });

  const competitionHistory = [];
  for (const [league, rows] of groupStandingsByLeague(standings)) {
    const table = sortTable(rows);
    const leaguePlayers = playersByLeague.get(league) ?? [];
    const by = field => [...leaguePlayers].filter(player => Number(player[field] ?? 0) > 0)
      .sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0) || String(a.name).localeCompare(String(b.name)))[0] ?? null;
    competitionHistory.push({
      competition:league,
      champion:table[0]?.teamId ?? null,
      relegated:league === 'League Two' ? [] : table.slice(-Math.min(3, table.length)).map(row => row.teamId),
      topScorer:compactLeader(by('goals'), 'goals'),
      topAssists:compactLeader(by('assists'), 'assists'),
      cleanSheets:compactLeader(by('cleanSheets'), 'cleanSheets'),
      bestRated:compactLeader([...leaguePlayers].filter(player => (player.ratingApps ?? 0) >= 5)
        .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0))[0] ?? null, 'averageRating'),
    });
  }
  competitionHistory.push(...buildWorldCompetitionHistory(
    save.worldCompetitions,
    players,
    save.userTeamId,
    save.cups ?? {},
  ));

  return {
    version:WORLD_RECORD_VERSION,
    season:save.season,
    playerHistory,
    clubHistory,
    competitionHistory,
    awards,
    leagueChanges:leagueChanges ?? null,
  };
}

export function groupStandingsByLeague(standings) {
  const grouped = new Map();
  for (const row of standings) {
    const league = row.league ?? 'Premier League';
    if (!grouped.has(league)) grouped.set(league, []);
    grouped.get(league).push(row);
  }
  return grouped;
}

function compactLeader(player, field) {
  if (!player) return null;
  return { playerId:player.id, name:player.name, teamId:player.teamId, value:player[field] ?? 0 };
}

export function buildSeasonAwards(players, teams) {
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const awards = [];
  const grouped = new Map();
  for (const player of players) {
    if (player.inSquad === false) continue;
    const league = teamsById.get(player.teamId)?.league;
    if (!league) continue;
    if (!grouped.has(league)) grouped.set(league, []);
    grouped.get(league).push(player);
  }
  for (const [league, leaguePlayers] of grouped) {
    const pick = (field, minApps = 0) => [...leaguePlayers]
      .filter(player => (player.appearances ?? 0) >= minApps)
      .sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0))[0] ?? null;
    for (const [kind, field, minApps] of [
      ['golden_boot','goals',0],
      ['top_assists','assists',0],
      ['golden_glove','cleanSheets',0],
      ['player_of_season','averageRating',10],
    ]) {
      const winner = pick(field, minApps);
      if (winner) awards.push({ league, kind, playerId:winner.id, playerName:winner.name, teamId:winner.teamId, value:winner[field] ?? 0 });
    }
  }
  return awards;
}

function newgenRatingForContext(team, retiredPlayer) {
  const retired = Number(primaryRating(retiredPlayer) ?? 60);
  const clubBase = 48 + Math.max(0, Math.min(45, (team?.reputation ?? 60) - 45)) * 0.48;
  const blended = clubBase * .72 + Math.min(retired, 84) * .28;
  return Math.max(45, Math.min(78, Math.round(blended + (Math.random() * 8 - 4))));
}

export function generateReplacementNewgens(retirees, teams, season) {
  const teamsById = new Map(teams.map(team => [team.id, team]));
  const seasonKey = String(season).replace('/', '_');
  return retirees
    .filter(retired => retired.teamId && retired.teamId !== 'free_agents' && teamsById.has(retired.teamId))
    .map((retired, index) => {
      const team = teamsById.get(retired.teamId);
      const league = team.league ?? 'Premier League';
      const position = retired.position ?? 'CM';
      const base = newgenRatingForContext(team, retired);
      const attrs = distributeAttributes(position, base);
      const potential = Math.max(base + 4, Math.min(92, base + 8 + Math.floor(Math.random() * 12)));
      const age = 17 + Math.floor(Math.random() * 4);
      return normalizePlayerModel(resetSeasonPlayerStats({
        id:`newgen_${team.id}_${seasonKey}_${index}_${Math.floor(Math.random() * 1e9).toString(36)}`,
        name:randName(league),
        position,
        age,
        ...attrs,
        potentialRating:potential,
        growthPoints:0,
        peakAge:calcYouthPeakAge(position),
        value:Math.max(500_000, Math.round((base ** 2) * 6500)),
        wage:Math.max(1_000, Math.round((base ** 2) * 8)),
        teamId:team.id,
        fitness:100,
        injured:false,
        inSquad:true,
        form:50,
        transferListed:false,
        signedThisSeason:false,
        generated:true,
        generatedSeason:season,
        generatedLeague:league,
      }));
    });
}

export function worldPopulationReport(players) {
  const academy = players.filter(player => player.teamId && player.teamId !== 'free_agents' && player.inSquad === false);
  const active = players.filter(player => player.teamId && player.teamId !== 'free_agents' && player.inSquad !== false);
  const ratings = active.map(player => Number(primaryRating(player) ?? 0)).filter(Number.isFinite);
  const averageRating = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0;
  return {
    activePlayers:active.length,
    academyPlayers:academy.length,
    generatedPlayers:active.filter(player => player.generated).length,
    averageRating:Math.round(averageRating * 100) / 100,
    under21:active.filter(player => (player.age ?? 99) <= 21).length,
    over32:active.filter(player => (player.age ?? 0) >= 33).length,
  };
}
