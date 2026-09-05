import { simulateMatch } from '../../src/modules/matchEngine.js';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  createUserTacticalPlan,
  normalizeTeamInstructions,
} from '../../src/modules/tactics.js';
import {
  LEGACY_MATCH_EVENT_TYPES,
  MATCH_ACTION_DEFINITIONS,
  MATCH_ACTION_VOCABULARY_VERSION,
  MATCH_LEDGER_EVENT_TYPES,
} from '../../src/modules/matchActionVocabulary.js';

export const MATCH_BALANCE_REPORT_VERSION = 1;
export const MATCH_BALANCE_BASELINE_REF = '00b92cf34f9385933fa5b3f8eeca0b76cf2229ef';

export const WORLD_PERFORMANCE_CEILINGS = Object.freeze({
  freshCareerLoadSeconds: 20,
  fullWorldWeekSeconds: 25,
  storageMiB: 50,
});

export const DEFAULT_MATCH_BALANCE_CONFIG = Object.freeze({
  baselineMatches: 600,
  matchupMatches: 300,
  teamRating: 77,
});

function tactic(overrides = {}) {
  return normalizeTeamInstructions({ ...DEFAULT_TEAM_INSTRUCTIONS, ...overrides });
}

export const TACTIC_MATCHUP_DEFINITIONS = Object.freeze([
  {
    id: 'direct_counter_vs_high_line',
    label: 'Direct counter vs high line',
    variant: tactic({ buildUp: 'direct', tempo: 'fast', transition: 'counter' }),
    control: tactic(),
    opponent: tactic({ defensiveLine: 'high', defensiveApproach: 'front_foot' }),
    rationale: 'Captures the current generic space-behind-the-line modifier.',
  },
  {
    id: 'aggressive_press_vs_patient',
    label: 'Aggressive press vs patient build-up',
    variant: tactic({ tempo: 'fast', defensiveLine: 'high', pressing: 'aggressive', defensiveApproach: 'front_foot' }),
    control: tactic(),
    opponent: tactic({ buildUp: 'patient', transition: 'hold_shape', chanceCreation: 'work_ball' }),
    rationale: 'Captures territory gains alongside cards, fitness and late-defence costs.',
  },
  {
    id: 'wide_delivery_vs_narrow_block',
    label: 'Wide delivery vs narrow block',
    variant: tactic({ tempo: 'fast', width: 'wide', chanceCreation: 'early_delivery' }),
    control: tactic(),
    opponent: tactic({ defensiveLine: 'low', width: 'narrow', defensiveApproach: 'compact' }),
    rationale: 'Captures the current wide route counter to a narrow defence.',
  },
  {
    id: 'work_ball_vs_balanced_block',
    label: 'Work ball vs balanced block',
    variant: tactic({ buildUp: 'patient', tempo: 'slow', transition: 'hold_shape', chanceCreation: 'work_ball' }),
    control: tactic(),
    opponent: tactic(),
    rationale: 'Captures the current possession and shot-volume trade-off.',
  },
]);

const SQUAD_POSITIONS = Object.freeze([
  'GK', 'CB', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST',
  'GK', 'CB', 'CM', 'RW', 'ST', 'LB', 'CDM',
]);

function makePlayer(id, position, rating, index) {
  const adjusted = rating + (index % 3) - 1;
  return {
    id,
    name: id,
    position,
    age: 22 + (index % 10),
    attack: ['ST', 'CF', 'RW', 'LW'].includes(position) ? adjusted : Math.max(35, adjusted - 10),
    midfield: ['CM', 'CDM', 'CAM', 'RM', 'LM', 'RW', 'LW'].includes(position) ? adjusted : Math.max(35, adjusted - 8),
    defence: ['CB', 'RB', 'LB', 'CDM'].includes(position) ? adjusted : Math.max(25, adjusted - 18),
    goalkeeping: position === 'GK' ? adjusted : 8,
    fitness: 90,
    injured: false,
    suspended: false,
    inSquad: true,
    appearances: 4,
    goals: position === 'ST' ? 2 : 0,
    assists: position === 'CAM' ? 2 : 0,
  };
}

function makeSquad(prefix, rating) {
  return SQUAD_POSITIONS.map((position, index) => makePlayer(`${prefix}_${index}`, position, rating, index));
}

function makeTeam(id, instructions) {
  return {
    id,
    name: id,
    crest: 'X',
    reputation: 77,
    tacticalPlan: createUserTacticalPlan(instructions),
  };
}

function cloneSquad(players) {
  return players.map((player) => ({ ...player }));
}

function positionGroup(position) {
  if (position === 'GK') return 'goalkeeper';
  if (['CB', 'RB', 'LB'].includes(position)) return 'defender';
  if (['CDM', 'CM', 'CAM', 'RM', 'LM'].includes(position)) return 'midfielder';
  if (['ST', 'CF', 'RW', 'LW'].includes(position)) return 'forward';
  return 'unknown';
}

function simulateFixture(seed, homeInstructions, awayInstructions, rating) {
  const homePlayers = makeSquad('balance_home', rating);
  const awayPlayers = makeSquad('balance_away', rating);
  const playerPositions = new Map(
    [...homePlayers, ...awayPlayers].map((player) => [player.id, player.position]),
  );
  const result = simulateMatch(
    makeTeam('balance_home', homeInstructions),
    makeTeam('balance_away', awayInstructions),
    cloneSquad(homePlayers),
    cloneSquad(awayPlayers),
    '4-3-3',
    '4-3-3',
    null,
    null,
    'balanced',
    'balanced',
    { seed },
  );
  return { result, playerPositions };
}

function createAggregate() {
  return {
    matches: 0,
    homeGoals: 0,
    awayGoals: 0,
    homeWins: 0,
    draws: 0,
    awayWins: 0,
    homePoints: 0,
    homePossession: 0,
    homeShots: 0,
    awayShots: 0,
    homeShotsOnTarget: 0,
    awayShotsOnTarget: 0,
    homeXG: 0,
    awayXG: 0,
    homeYellowCards: 0,
    awayYellowCards: 0,
    scorerGroups: { forward: 0, midfielder: 0, defender: 0, goalkeeper: 0, unknown: 0 },
  };
}

function addResult(aggregate, result, playerPositions) {
  aggregate.matches += 1;
  aggregate.homeGoals += result.homeGoals;
  aggregate.awayGoals += result.awayGoals;
  if (result.homeGoals > result.awayGoals) {
    aggregate.homeWins += 1;
    aggregate.homePoints += 3;
  } else if (result.homeGoals < result.awayGoals) {
    aggregate.awayWins += 1;
  } else {
    aggregate.draws += 1;
    aggregate.homePoints += 1;
  }
  aggregate.homePossession += result.stats.possession.home;
  aggregate.homeShots += result.stats.shots.home;
  aggregate.awayShots += result.stats.shots.away;
  aggregate.homeShotsOnTarget += result.stats.shotsOnTarget.home;
  aggregate.awayShotsOnTarget += result.stats.shotsOnTarget.away;
  aggregate.homeXG += result.stats.xG.home;
  aggregate.awayXG += result.stats.xG.away;
  aggregate.homeYellowCards += result.stats.yellowCards.home;
  aggregate.awayYellowCards += result.stats.yellowCards.away;
  for (const event of result.events) {
    if (event.type !== 'goal') continue;
    const group = positionGroup(playerPositions.get(event.playerId));
    aggregate.scorerGroups[group] += 1;
  }
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function perMatch(value, matches) {
  return round(value / Math.max(1, matches));
}

function percent(value, total) {
  return round((value / Math.max(1, total)) * 100, 2);
}

function summariseAggregate(aggregate) {
  const matches = aggregate.matches;
  const totalGoals = aggregate.homeGoals + aggregate.awayGoals;
  return {
    matches,
    totalGoals,
    goalsPerMatch: perMatch(totalGoals, matches),
    homeGoalsPerMatch: perMatch(aggregate.homeGoals, matches),
    awayGoalsPerMatch: perMatch(aggregate.awayGoals, matches),
    homeGoalEdge: perMatch(aggregate.homeGoals - aggregate.awayGoals, matches),
    homePointsPerMatch: perMatch(aggregate.homePoints, matches),
    resultPercent: {
      homeWin: percent(aggregate.homeWins, matches),
      draw: percent(aggregate.draws, matches),
      awayWin: percent(aggregate.awayWins, matches),
    },
    possessionPercent: {
      home: perMatch(aggregate.homePossession, matches),
      away: round(100 - perMatch(aggregate.homePossession, matches)),
    },
    shotsPerMatch: {
      home: perMatch(aggregate.homeShots, matches),
      away: perMatch(aggregate.awayShots, matches),
      total: perMatch(aggregate.homeShots + aggregate.awayShots, matches),
    },
    shotsOnTargetPerMatch: {
      home: perMatch(aggregate.homeShotsOnTarget, matches),
      away: perMatch(aggregate.awayShotsOnTarget, matches),
      total: perMatch(aggregate.homeShotsOnTarget + aggregate.awayShotsOnTarget, matches),
    },
    xGPerMatch: {
      home: perMatch(aggregate.homeXG, matches),
      away: perMatch(aggregate.awayXG, matches),
      total: perMatch(aggregate.homeXG + aggregate.awayXG, matches),
    },
    yellowCardsPerMatch: perMatch(aggregate.homeYellowCards + aggregate.awayYellowCards, matches),
    homeYellowCardsPerMatch: perMatch(aggregate.homeYellowCards, matches),
    awayYellowCardsPerMatch: perMatch(aggregate.awayYellowCards, matches),
    scorerSharePercent: Object.fromEntries(
      Object.entries(aggregate.scorerGroups).map(([group, goals]) => [group, percent(goals, totalGoals)]),
    ),
  };
}

function homeSideSummary(summary) {
  return {
    goalsForPerMatch: summary.homeGoalsPerMatch,
    goalsAgainstPerMatch: summary.awayGoalsPerMatch,
    pointsPerMatch: summary.homePointsPerMatch,
    winPercent: summary.resultPercent.homeWin,
    drawPercent: summary.resultPercent.draw,
    possessionPercent: summary.possessionPercent.home,
    shotsPerMatch: summary.shotsPerMatch.home,
    shotsOnTargetPerMatch: summary.shotsOnTargetPerMatch.home,
    xGPerMatch: summary.xGPerMatch.home,
    yellowCardsPerMatch: summary.homeYellowCardsPerMatch,
  };
}

function metricDelta(variant, control) {
  const keys = [
    'goalsForPerMatch',
    'goalsAgainstPerMatch',
    'pointsPerMatch',
    'winPercent',
    'drawPercent',
    'possessionPercent',
    'shotsPerMatch',
    'shotsOnTargetPerMatch',
    'xGPerMatch',
    'yellowCardsPerMatch',
  ];
  return Object.fromEntries(keys.map((key) => [key, round(variant[key] - control[key])]));
}

function pointsFor(result) {
  if (result.homeGoals > result.awayGoals) return 3;
  if (result.homeGoals < result.awayGoals) return 0;
  return 1;
}

function runNeutralBaseline(matches, rating) {
  const aggregate = createAggregate();
  for (let index = 0; index < matches; index += 1) {
    const fixture = simulateFixture(`t0-neutral-${index}`, tactic(), tactic(), rating);
    addResult(aggregate, fixture.result, fixture.playerPositions);
  }
  return summariseAggregate(aggregate);
}

function runPairedMatchup(definition, matches, rating) {
  const controlAggregate = createAggregate();
  const variantAggregate = createAggregate();
  const pairedOutcomes = { improved: 0, same: 0, worse: 0 };
  let seedMismatches = 0;

  for (let index = 0; index < matches; index += 1) {
    const seed = `t0-${definition.id}-${index}`;
    const control = simulateFixture(seed, definition.control, definition.opponent, rating);
    const variant = simulateFixture(seed, definition.variant, definition.opponent, rating);
    addResult(controlAggregate, control.result, control.playerPositions);
    addResult(variantAggregate, variant.result, variant.playerPositions);
    if (control.result.seed !== variant.result.seed) seedMismatches += 1;
    const pointDelta = pointsFor(variant.result) - pointsFor(control.result);
    if (pointDelta > 0) pairedOutcomes.improved += 1;
    else if (pointDelta < 0) pairedOutcomes.worse += 1;
    else pairedOutcomes.same += 1;
  }

  const control = homeSideSummary(summariseAggregate(controlAggregate));
  const variant = homeSideSummary(summariseAggregate(variantAggregate));
  return {
    id: definition.id,
    label: definition.label,
    rationale: definition.rationale,
    matches,
    seedMismatches,
    variantInstructions: definition.variant,
    controlInstructions: definition.control,
    opponentInstructions: definition.opponent,
    pairedOutcomes,
    control,
    variant,
    delta: metricDelta(variant, control),
  };
}

function normaliseConfig(overrides = {}) {
  const count = (value, fallback) => Math.max(1, Math.floor(Number(value) || fallback));
  return {
    baselineMatches: count(overrides.baselineMatches, DEFAULT_MATCH_BALANCE_CONFIG.baselineMatches),
    matchupMatches: count(overrides.matchupMatches, DEFAULT_MATCH_BALANCE_CONFIG.matchupMatches),
    teamRating: count(overrides.teamRating, DEFAULT_MATCH_BALANCE_CONFIG.teamRating),
  };
}

export function createMatchBalanceReport(configOverrides = {}) {
  const config = normaliseConfig(configOverrides);
  return {
    reportVersion: MATCH_BALANCE_REPORT_VERSION,
    baselineRef: MATCH_BALANCE_BASELINE_REF,
    simulationContract: 'P2 aggregate-phase engine before Attribute-to-Tactics Causality 2.0',
    actionVocabularyVersion: MATCH_ACTION_VOCABULARY_VERSION,
    samples: {
      baselineMatches: config.baselineMatches,
      matchupPairs: config.matchupMatches,
      totalSimulations: config.baselineMatches + (config.matchupMatches * TACTIC_MATCHUP_DEFINITIONS.length * 2),
      equalTeamRating: config.teamRating,
    },
    performanceCeilings: WORLD_PERFORMANCE_CEILINGS,
    currentEventTypes: [...LEGACY_MATCH_EVENT_TYPES],
    plannedLedgerEventTypes: [...MATCH_LEDGER_EVENT_TYPES],
    plannedActionTypes: MATCH_ACTION_DEFINITIONS.map((definition) => definition.id),
    neutralBaseline: runNeutralBaseline(config.baselineMatches, config.teamRating),
    tacticMatchups: TACTIC_MATCHUP_DEFINITIONS.map((definition) => (
      runPairedMatchup(definition, config.matchupMatches, config.teamRating)
    )),
  };
}

function display(value, suffix = '') {
  return `${Number(value).toFixed(3).replace(/\.000$/, '')}${suffix}`;
}

function signed(value, suffix = '') {
  const number = Number(value);
  return `${number > 0 ? '+' : ''}${display(number, suffix)}`;
}

function changedInstructions(instructions) {
  const changes = Object.entries(instructions)
    .filter(([key, value]) => DEFAULT_TEAM_INSTRUCTIONS[key] !== value)
    .map(([key, value]) => `${key}=${value}`);
  return changes.length ? changes.join(', ') : 'balanced defaults';
}

export function renderMatchBalanceMarkdown(report) {
  const baseline = report.neutralBaseline;
  const lines = [
    '# Pitch Match Engine v1 Baseline',
    '',
    '> Reproducible T0 snapshot generated by `npm run balance:match`. This report is diagnostic only and is not imported by the live game.',
    '',
    `**Baseline commit:** \`${report.baselineRef}\``,
    '',
    `**Report version:** ${report.reportVersion}`,
    '',
    `**Simulation contract:** ${report.simulationContract}`,
    '',
    `**Samples:** ${report.samples.baselineMatches} neutral matches + ${report.samples.matchupPairs} paired seeds per matchup (${report.samples.totalSimulations} simulations total)`,
    '',
    `**Equal-team rating:** ${report.samples.equalTeamRating}`,
    '',
    '## Reproduce',
    '',
    '- Print the report: `npm run balance:match`',
    '- Verify the committed snapshot: `npm run balance:match:check`',
    '- Intentionally refresh it after an approved engine change: `npm run balance:match:update`',
    '',
    'The same explicit seed starts each control/variant pair. The current engine consumes extra random values after some branch outcomes (for example a goal choosing a scorer and possible assist), so T0 pairs the initial stream rather than claiming a fixed per-action RNG packet. T3 owns that stronger contract.',
    '',
    '## Existing performance ceilings',
    '',
    '| Guardrail | Ceiling | T0 enforcement |',
    '|---|---:|---|',
    `| Fresh-career load | <${report.performanceCeilings.freshCareerLoadSeconds}s | Existing hands-on 4× CPU check |`,
    `| Full world week | <${report.performanceCeilings.fullWorldWeekSeconds}s | Existing hands-on 4× CPU check |`,
    `| Browser storage | <${report.performanceCeilings.storageMiB} MiB | Existing hands-on check |`,
    '',
    'T0 adds no runtime import and does not touch the world-week loop. The repository intentionally has no browser/E2E benchmark suite; these remain explicit manual ceilings.',
    '',
    '## Neutral equal-team distribution',
    '',
    '| Metric | Value |',
    '|---|---:|',
    `| Goals / match | ${display(baseline.goalsPerMatch)} |`,
    `| Home goals / match | ${display(baseline.homeGoalsPerMatch)} |`,
    `| Away goals / match | ${display(baseline.awayGoalsPerMatch)} |`,
    `| Home goal edge | ${signed(baseline.homeGoalEdge)} |`,
    `| Home points / match | ${display(baseline.homePointsPerMatch)} |`,
    `| Home / draw / away | ${display(baseline.resultPercent.homeWin, '%')} / ${display(baseline.resultPercent.draw, '%')} / ${display(baseline.resultPercent.awayWin, '%')} |`,
    `| Home / away possession | ${display(baseline.possessionPercent.home, '%')} / ${display(baseline.possessionPercent.away, '%')} |`,
    `| Total shots / match | ${display(baseline.shotsPerMatch.total)} |`,
    `| Total shots on target / match | ${display(baseline.shotsOnTargetPerMatch.total)} |`,
    `| Total xG / match | ${display(baseline.xGPerMatch.total)} |`,
    `| Yellow cards / match | ${display(baseline.yellowCardsPerMatch)} |`,
    '',
    '### Scorer distribution',
    '',
    '| Registered position group | Share of goals |',
    '|---|---:|',
    `| Forwards | ${display(baseline.scorerSharePercent.forward, '%')} |`,
    `| Midfielders | ${display(baseline.scorerSharePercent.midfielder, '%')} |`,
    `| Defenders | ${display(baseline.scorerSharePercent.defender, '%')} |`,
    `| Goalkeepers | ${display(baseline.scorerSharePercent.goalkeeper, '%')} |`,
    `| Unknown | ${display(baseline.scorerSharePercent.unknown, '%')} |`,
    '',
    '## Paired tactic matchups',
    '',
    'All deltas are variant minus the balanced-control home side against the same opponent setup.',
    '',
    '| Matchup | Δ GF | Δ GA | Δ pts | Δ poss. | Δ shots | Δ xG | Δ yellows | Better / same / worse | Seed mismatches |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const matchup of report.tacticMatchups) {
    lines.push(
      `| ${matchup.label} | ${signed(matchup.delta.goalsForPerMatch)} | ${signed(matchup.delta.goalsAgainstPerMatch)} | ${signed(matchup.delta.pointsPerMatch)} | ${signed(matchup.delta.possessionPercent, 'pp')} | ${signed(matchup.delta.shotsPerMatch)} | ${signed(matchup.delta.xGPerMatch)} | ${signed(matchup.delta.yellowCardsPerMatch)} | ${matchup.pairedOutcomes.improved} / ${matchup.pairedOutcomes.same} / ${matchup.pairedOutcomes.worse} | ${matchup.seedMismatches} |`,
    );
  }

  lines.push('', '### Matchup definitions', '');
  for (const matchup of report.tacticMatchups) {
    lines.push(
      `- **${matchup.label}:** variant (${changedInstructions(matchup.variantInstructions)}); opponent (${changedInstructions(matchup.opponentInstructions)}). ${matchup.rationale}`,
    );
  }

  lines.push(
    '',
    '## Frozen action/event vocabulary',
    '',
    `**Vocabulary version:** ${report.actionVocabularyVersion}`,
    '',
    `- Current authoritative event types: ${report.currentEventTypes.map((type) => `\`${type}\``).join(', ')}`,
    `- Planned ledger record types: ${report.plannedLedgerEventTypes.map((type) => `\`${type}\``).join(', ')}`,
    `- Planned action types: ${report.plannedActionTypes.map((type) => `\`${type}\``).join(', ')}`,
    '',
    'The planned vocabulary is a contract for T2/T3 design and tests. T0 does not emit these new records or alter any score, statistic, injury, card, substitution, or Broadcast event.',
    '',
    '## Interpretation',
    '',
    'This file freezes what the aggregate P2 engine does before player-level Pace/Shooting/Passing/Dribbling/Defending/Physical causality is introduced. Future balance changes should compare against it, explain intentional movement, and update the snapshot only with reviewed evidence.',
    '',
  );
  return lines.join('\n');
}
