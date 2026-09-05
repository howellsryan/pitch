import { simulateMatch } from '../../src/modules/matchEngine.js';
import {
  DEFAULT_TEAM_INSTRUCTIONS,
  createUserTacticalPlan,
  normalizeTeamInstructions,
} from '../../src/modules/tactics.js';
import { WORLD_PERFORMANCE_CEILINGS } from './matchBalance.mjs';

export const T7_CALIBRATION_REPORT_VERSION = 1;
export const DEFAULT_T7_CALIBRATION_CONFIG = Object.freeze({
  matchesPerScenario:100,
  baseRating:77,
});

const ROUTES = Object.freeze([
  'circulation',
  'direct_pass',
  'pass_into_space',
  'carry',
  'wide_delivery',
]);

const SQUAD_POSITIONS = Object.freeze([
  'GK', 'CB', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST',
  'GK', 'CB', 'CM', 'RW', 'ST', 'LB', 'CDM', 'RM', 'LM', 'CF',
]);

const ATTACKERS = new Set(['ST','CF','RW','LW','CAM']);
const MIDFIELDERS = new Set(['CDM','CM','CAM','RM','LM','RW','LW']);
const DEFENDERS = new Set(['CB','RB','LB','CDM']);
const WIDE_PLAYERS = new Set(['RB','LB','RW','LW','RM','LM']);

function clamp(value, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function tactic(overrides = {}) {
  return normalizeTeamInstructions({ ...DEFAULT_TEAM_INSTRUCTIONS, ...overrides });
}

function baselineDetailedProfile(position, rating, index) {
  const variation = (index % 3) - 1;
  const base = clamp(rating + variation);
  if (position === 'GK') {
    return {
      version:1,
      pace:clamp(base - 24),
      shooting:clamp(base - 46),
      passing:clamp(base - 12),
      dribbling:clamp(base - 20),
      defending:clamp(base - 22),
      physical:clamp(base - 6),
    };
  }
  return {
    version:1,
    pace:base,
    shooting:ATTACKERS.has(position) ? base : clamp(base - 8),
    passing:MIDFIELDERS.has(position) ? base : clamp(base - 5),
    dribbling:ATTACKERS.has(position) || WIDE_PLAYERS.has(position) ? base : clamp(base - 5),
    defending:DEFENDERS.has(position) ? base : clamp(base - 10),
    physical:DEFENDERS.has(position) ? base : clamp(base - 3),
  };
}

function specialistApplies(position, specialist) {
  if (!specialist) return false;
  if (specialist === 'pace') return ATTACKERS.has(position) || WIDE_PLAYERS.has(position);
  if (specialist === 'passing') return MIDFIELDERS.has(position) || WIDE_PLAYERS.has(position);
  if (specialist === 'shooting') return ATTACKERS.has(position);
  if (specialist === 'dribbling') return ATTACKERS.has(position) || WIDE_PLAYERS.has(position);
  if (specialist === 'defending') return DEFENDERS.has(position);
  if (specialist === 'physical') return position !== 'GK';
  return false;
}

function detailedProfile(position, rating, index, specialist = null) {
  const profile = baselineDetailedProfile(position, rating, index);
  if (specialistApplies(position, specialist) && Object.hasOwn(profile, specialist)) {
    profile[specialist] = clamp(profile[specialist] + 12);
  }
  return profile;
}

function headlineRatings(position, rating, index) {
  const adjusted = clamp(rating + (index % 3) - 1);
  return {
    attack:ATTACKERS.has(position) ? adjusted : Math.max(35, adjusted - 10),
    midfield:MIDFIELDERS.has(position) ? adjusted : Math.max(35, adjusted - 8),
    defence:DEFENDERS.has(position) ? adjusted : Math.max(25, adjusted - 18),
    goalkeeping:position === 'GK' ? adjusted : 8,
  };
}

function roleFor(position, preset) {
  if (!preset) return null;
  if (preset === 'penetration') {
    if (['ST','CF'].includes(position)) return 'poacher';
    if (['RW','LW','RM','LM'].includes(position)) return 'inside_forward';
  }
  if (preset === 'wide') {
    if (['RW','LW','RM','LM'].includes(position)) return 'winger';
    if (['RB','LB'].includes(position)) return 'overlap';
  }
  if (preset === 'possession') {
    if (['CDM','CM'].includes(position)) return 'deep_playmaker';
    if (position === 'CAM') return 'advanced_playmaker';
    if (['ST','CF'].includes(position)) return 'false_nine';
  }
  if (preset === 'secure') {
    if (position === 'CB') return 'cover';
    if (['CDM','CM'].includes(position)) return 'anchor';
    if (['RB','LB'].includes(position)) return 'full_back';
  }
  return null;
}

export function buildT7CalibrationSquad({ prefix, rating, fitness = 90, specialist = null, rolePreset = null } = {}) {
  return SQUAD_POSITIONS.map((position, index) => {
    const headlines = headlineRatings(position, rating, index);
    const tacticalRole = roleFor(position, rolePreset);
    return {
      id:`${prefix}_${index}`,
      name:`${prefix}_${index}`,
      position,
      age:22 + (index % 10),
      ...headlines,
      attributeProfile:detailedProfile(position, rating, index, specialist),
      fitness:clamp(fitness, 30, 100),
      injured:false,
      suspended:false,
      inSquad:true,
      appearances:4,
      goals:position === 'ST' ? 2 : 0,
      assists:position === 'CAM' ? 2 : 0,
      ...(tacticalRole ? { tacticalRole } : {}),
    };
  });
}

function cloneSquad(players) {
  return players.map(player => ({
    ...player,
    attributeProfile:player.attributeProfile ? { ...player.attributeProfile } : player.attributeProfile,
    traits:Array.isArray(player.traits) ? [...player.traits] : player.traits,
  }));
}

function team(id, instructions, reputation) {
  return {
    id,
    name:id,
    crest:'X',
    reputation,
    tacticalPlan:createUserTacticalPlan(instructions),
  };
}

function scenarioDefaults(baseRating) {
  return {
    subjectSide:'home',
    subjectRating:baseRating,
    opponentRating:baseRating,
    subjectFormation:'4-3-3',
    opponentFormation:'4-3-3',
    subjectMentality:'balanced',
    opponentMentality:'balanced',
    subjectTactics:tactic(),
    opponentTactics:tactic(),
    subjectFitness:90,
    opponentFitness:90,
    subjectSpecialist:null,
    opponentSpecialist:null,
    subjectRolePreset:null,
    opponentRolePreset:null,
  };
}

function materialiseSpec(baseRating, overrides = {}) {
  return { ...scenarioDefaults(baseRating), ...overrides };
}

function fixtureFromSpec(seed, spec) {
  const subjectPlayers = buildT7CalibrationSquad({
    prefix:'calibration_subject',
    rating:spec.subjectRating,
    fitness:spec.subjectFitness,
    specialist:spec.subjectSpecialist,
    rolePreset:spec.subjectRolePreset,
  });
  const opponentPlayers = buildT7CalibrationSquad({
    prefix:'calibration_opponent',
    rating:spec.opponentRating,
    fitness:spec.opponentFitness,
    specialist:spec.opponentSpecialist,
    rolePreset:spec.opponentRolePreset,
  });
  const subjectTeam = team('calibration_subject', spec.subjectTactics, spec.subjectRating);
  const opponentTeam = team('calibration_opponent', spec.opponentTactics, spec.opponentRating);
  const subjectHome = spec.subjectSide !== 'away';
  const homeTeam = subjectHome ? subjectTeam : opponentTeam;
  const awayTeam = subjectHome ? opponentTeam : subjectTeam;
  const homePlayers = subjectHome ? subjectPlayers : opponentPlayers;
  const awayPlayers = subjectHome ? opponentPlayers : subjectPlayers;
  const homeFormation = subjectHome ? spec.subjectFormation : spec.opponentFormation;
  const awayFormation = subjectHome ? spec.opponentFormation : spec.subjectFormation;
  const homeMentality = subjectHome ? spec.subjectMentality : spec.opponentMentality;
  const awayMentality = subjectHome ? spec.opponentMentality : spec.subjectMentality;
  const result = simulateMatch(
    homeTeam,
    awayTeam,
    cloneSquad(homePlayers),
    cloneSquad(awayPlayers),
    homeFormation,
    awayFormation,
    null,
    null,
    homeMentality,
    awayMentality,
    { seed },
  );
  return { result, subjectTeamId:subjectTeam.id };
}

function emptyRouteAggregate() {
  return Object.fromEntries(ROUTES.map(route => [route, { attempts:0, successes:0, chances:0, shots:0, goals:0, xG:0 }]));
}

function createFocusAggregate() {
  return {
    matches:0,
    goalsFor:0,
    goalsAgainst:0,
    points:0,
    wins:0,
    draws:0,
    losses:0,
    possession:0,
    shots:0,
    shotsOnTarget:0,
    xG:0,
    yellowCards:0,
    turnoversLost:0,
    routes:emptyRouteAggregate(),
  };
}

function addFocusResult(aggregate, result, subjectTeamId) {
  const isHome = result.homeTeamId === subjectTeamId;
  const goalsFor = isHome ? result.homeGoals : result.awayGoals;
  const goalsAgainst = isHome ? result.awayGoals : result.homeGoals;
  aggregate.matches += 1;
  aggregate.goalsFor += goalsFor;
  aggregate.goalsAgainst += goalsAgainst;
  if (goalsFor > goalsAgainst) { aggregate.wins += 1; aggregate.points += 3; }
  else if (goalsFor < goalsAgainst) aggregate.losses += 1;
  else { aggregate.draws += 1; aggregate.points += 1; }
  aggregate.possession += isHome ? result.stats.possession.home : result.stats.possession.away;
  aggregate.shots += isHome ? result.stats.shots.home : result.stats.shots.away;
  aggregate.shotsOnTarget += isHome ? result.stats.shotsOnTarget.home : result.stats.shotsOnTarget.away;
  aggregate.xG += isHome ? result.stats.xG.home : result.stats.xG.away;
  aggregate.yellowCards += isHome ? result.stats.yellowCards.home : result.stats.yellowCards.away;
  const side = result.tacticalAnalysis?.home?.teamId === subjectTeamId
    ? result.tacticalAnalysis.home
    : result.tacticalAnalysis?.away?.teamId === subjectTeamId ? result.tacticalAnalysis.away : null;
  if (!side) return;
  aggregate.turnoversLost += Number(side.turnoversLost ?? 0);
  for (const route of side.routes ?? []) {
    const target = aggregate.routes[route.route];
    if (!target) continue;
    target.attempts += Number(route.attempts ?? 0);
    target.successes += Number(route.successes ?? 0);
    target.chances += Number(route.chances ?? 0);
    target.shots += Number(route.shots ?? 0);
    target.goals += Number(route.goals ?? 0);
    target.xG += Number(route.xG ?? 0);
  }
}

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function rate(value, denominator) {
  return round(Number(value) / Math.max(1, Number(denominator)));
}

function summariseFocus(aggregate) {
  const matches = aggregate.matches;
  const routes = Object.fromEntries(Object.entries(aggregate.routes).map(([route, totals]) => [route, {
    attemptsPerMatch:rate(totals.attempts, matches),
    successesPerMatch:rate(totals.successes, matches),
    successRate:totals.attempts ? round((totals.successes / totals.attempts) * 100, 2) : 0,
    chancesPerMatch:rate(totals.chances, matches),
    shotsPerMatch:rate(totals.shots, matches),
    goalsPerMatch:rate(totals.goals, matches),
    xGPerMatch:rate(totals.xG, matches),
  }]));
  return {
    matches,
    goalsForPerMatch:rate(aggregate.goalsFor, matches),
    goalsAgainstPerMatch:rate(aggregate.goalsAgainst, matches),
    pointsPerMatch:rate(aggregate.points, matches),
    winPercent:round((aggregate.wins / Math.max(1, matches)) * 100, 2),
    drawPercent:round((aggregate.draws / Math.max(1, matches)) * 100, 2),
    lossPercent:round((aggregate.losses / Math.max(1, matches)) * 100, 2),
    possessionPercent:rate(aggregate.possession, matches),
    shotsPerMatch:rate(aggregate.shots, matches),
    shotsOnTargetPerMatch:rate(aggregate.shotsOnTarget, matches),
    xGPerMatch:rate(aggregate.xG, matches),
    yellowCardsPerMatch:rate(aggregate.yellowCards, matches),
    turnoversLostPerMatch:rate(aggregate.turnoversLost, matches),
    routes,
  };
}

function deltaSummary(variant, control) {
  const scalarKeys = [
    'goalsForPerMatch','goalsAgainstPerMatch','pointsPerMatch','winPercent','drawPercent','lossPercent',
    'possessionPercent','shotsPerMatch','shotsOnTargetPerMatch','xGPerMatch','yellowCardsPerMatch','turnoversLostPerMatch',
  ];
  const delta = Object.fromEntries(scalarKeys.map(key => [key, round(variant[key] - control[key])]));
  delta.routes = Object.fromEntries(ROUTES.map(route => [route, {
    attemptsPerMatch:round(variant.routes[route].attemptsPerMatch - control.routes[route].attemptsPerMatch),
    successRate:round(variant.routes[route].successRate - control.routes[route].successRate),
    chancesPerMatch:round(variant.routes[route].chancesPerMatch - control.routes[route].chancesPerMatch),
    xGPerMatch:round(variant.routes[route].xGPerMatch - control.routes[route].xGPerMatch),
  }]));
  return delta;
}

const RAW_T7_SCENARIOS = [
  { id:'quality_gap_5', category:'quality', label:'+5 squad quality', variant:{ subjectRating:82 }, rationale:'Measures whether a modest player-quality edge survives neutral tactics.' },
  { id:'quality_gap_10', category:'quality', label:'+10 squad quality', variant:{ subjectRating:87 }, rationale:'Measures the medium player-quality signal.' },
  { id:'quality_gap_20', category:'quality', label:'+20 squad quality', variant:{ subjectRating:97 }, rationale:'Checks that tactics cannot routinely erase a major player-quality gap.' },
  { id:'home_away_reversal', category:'venue', label:'Same subject moved from home to away', variant:{ subjectSide:'away' }, rationale:'Measures the bounded home-context effect with identical squads/tactics.' },
  { id:'formation_4231', category:'formation', label:'4-2-3-1 vs 4-3-3', variant:{ subjectFormation:'4-2-3-1' }, rationale:'Exercises a second common formation without changing player quality.' },
  { id:'formation_442', category:'formation', label:'4-4-2 vs 4-3-3', variant:{ subjectFormation:'4-4-2' }, rationale:'Exercises a two-striker structure.' },
  { id:'formation_532', category:'formation', label:'5-3-2 vs 4-3-3', variant:{ subjectFormation:'5-3-2' }, rationale:'Exercises a five-defender/two-forward structure.' },
  { id:'space_vs_high_line', category:'tactic', label:'Pass into space vs high line', shared:{ opponentTactics:tactic({ defensiveLine:'high', defensiveApproach:'front_foot' }) }, variant:{ subjectTactics:tactic({ useOfSpace:'pass_into_space', onWin:'counter' }) }, rationale:'Tests the intended space-behind counter.' },
  { id:'space_vs_low_line', category:'tactic', label:'Pass into space vs low line', shared:{ opponentTactics:tactic({ defensiveLine:'low', defensiveApproach:'compact' }) }, variant:{ subjectTactics:tactic({ useOfSpace:'pass_into_space', onWin:'counter' }) }, rationale:'Provides the contextual control for space-behind play.' },
  { id:'carry_vs_compact', category:'tactic', label:'Run at defence vs compact block', shared:{ opponentTactics:tactic({ defensiveApproach:'compact', defensiveWidth:'narrow' }) }, variant:{ subjectTactics:tactic({ ballCarrying:'run_at_defence' }) }, rationale:'Measures carry volume/output into a compact defence.' },
  { id:'wide_vs_narrow', category:'tactic', label:'Wide attack vs narrow defence', shared:{ opponentTactics:tactic({ defensiveWidth:'narrow', defensiveApproach:'compact' }) }, variant:{ subjectTactics:tactic({ attackingWidth:'wide', deliveryTiming:'early' }) }, rationale:'Tests the intended wide counter to narrow defending.' },
  { id:'wide_vs_wide', category:'tactic', label:'Wide attack vs wide defence', shared:{ opponentTactics:tactic({ defensiveWidth:'wide' }) }, variant:{ subjectTactics:tactic({ attackingWidth:'wide', deliveryTiming:'early' }) }, rationale:'Provides the contextual control for wide attacking play.' },
  { id:'work_into_box', category:'tactic', label:'Work into box vs balanced', variant:{ subjectTactics:tactic({ shotSelection:'work_into_box', buildUp:'patient' }) }, rationale:'Measures the expected volume/quality trade-off.' },
  { id:'shoot_on_sight', category:'tactic', label:'Shoot on sight vs balanced', variant:{ subjectTactics:tactic({ shotSelection:'shoot_on_sight' }) }, rationale:'Measures the expected shot-volume/quality trade-off.' },
  { id:'counterpress_vs_patient', category:'tactic', label:'Counter-press vs patient build-up', shared:{ opponentTactics:tactic({ buildUp:'patient', tempo:'slow' }) }, variant:{ subjectTactics:tactic({ defensiveTransition:'counter_press', pressing:'aggressive', lineOfEngagement:'high' }) }, rationale:'Measures territory/output alongside intensity costs.' },
  { id:'pace_specialist_into_space', category:'specialist', label:'Pace specialists into a high line', shared:{ subjectTactics:tactic({ useOfSpace:'pass_into_space', onWin:'counter' }), opponentTactics:tactic({ defensiveLine:'high' }) }, variant:{ subjectSpecialist:'pace' }, rationale:'Changes Pace only on relevant outfield profiles while preserving headline quality.' },
  { id:'passing_specialist_direct', category:'specialist', label:'Passing specialists in direct progression', shared:{ subjectTactics:tactic({ buildUp:'direct', useOfSpace:'pass_into_space' }) }, variant:{ subjectSpecialist:'passing' }, rationale:'Changes Passing only on relevant profiles while preserving headline quality.' },
  { id:'dribbling_specialist_carry', category:'specialist', label:'Dribbling specialists running at defence', shared:{ subjectTactics:tactic({ ballCarrying:'run_at_defence' }) }, variant:{ subjectSpecialist:'dribbling' }, rationale:'Changes Dribbling only where carry actions should consume it.' },
  { id:'shooting_specialist_finishing', category:'specialist', label:'Shooting specialists on balanced chance creation', variant:{ subjectSpecialist:'shooting' }, rationale:'Changes Shooting on attacking profiles without changing route instructions.' },
  { id:'defending_specialist_vs_space', category:'specialist', label:'Defending specialists against space attacks', shared:{ opponentTactics:tactic({ useOfSpace:'pass_into_space', onWin:'counter' }) }, variant:{ subjectSpecialist:'defending' }, rationale:'Changes Defending only on relevant defensive profiles while preserving headline quality and role selection.' },
  { id:'physical_specialist_press', category:'specialist', label:'Physical specialists in an aggressive press', shared:{ subjectTactics:tactic({ pressing:'aggressive', defensiveTransition:'counter_press', lineOfEngagement:'high' }) }, variant:{ subjectSpecialist:'physical' }, rationale:'Tests Physical in repeated contest/intensity contexts.' },
  { id:'fatigued_aggressive_press', category:'fitness', label:'Fatigued aggressive press vs fresh aggressive press', shared:{ subjectTactics:tactic({ pressing:'aggressive', defensiveTransition:'counter_press', lineOfEngagement:'high', tempo:'fast' }) }, control:{ subjectFitness:95 }, variant:{ subjectFitness:68 }, rationale:'Measures whether low starting fitness constrains a high-intensity approach.' },
  { id:'penetration_roles', category:'role', label:'Penetration roles vs default roles', shared:{ subjectTactics:tactic({ useOfSpace:'pass_into_space', onWin:'counter' }) }, variant:{ subjectRolePreset:'penetration' }, rationale:'Keeps player quality fixed while changing who participates in penetration actions.' },
  { id:'wide_roles', category:'role', label:'Wide roles vs default roles', shared:{ subjectTactics:tactic({ attackingWidth:'wide', deliveryTiming:'early' }) }, variant:{ subjectRolePreset:'wide' }, rationale:'Keeps player quality fixed while changing wide-action participation.' },
  { id:'possession_roles', category:'role', label:'Possession roles vs default roles', shared:{ subjectTactics:tactic({ buildUp:'patient', useOfSpace:'to_feet', shotSelection:'work_into_box' }) }, variant:{ subjectRolePreset:'possession' }, rationale:'Keeps player quality fixed while changing circulation/progression participation.' },
];

export const T7_CALIBRATION_SCENARIOS = Object.freeze(RAW_T7_SCENARIOS.map(scenario => Object.freeze({ ...scenario })));

function normaliseConfig(overrides = {}) {
  const positiveInt = (value, fallback) => Math.max(1, Math.floor(Number(value) || fallback));
  const requestedIds = Array.isArray(overrides.scenarioIds) ? new Set(overrides.scenarioIds.map(String)) : null;
  const scenarios = requestedIds
    ? T7_CALIBRATION_SCENARIOS.filter(scenario => requestedIds.has(scenario.id))
    : [...T7_CALIBRATION_SCENARIOS];
  return {
    matchesPerScenario:positiveInt(overrides.matchesPerScenario, DEFAULT_T7_CALIBRATION_CONFIG.matchesPerScenario),
    baseRating:positiveInt(overrides.baseRating, DEFAULT_T7_CALIBRATION_CONFIG.baseRating),
    scenarios,
  };
}

function runScenario(definition, matches, baseRating) {
  const shared = definition.shared ?? {};
  const controlSpec = materialiseSpec(baseRating, { ...shared, ...(definition.control ?? {}) });
  const variantSpec = materialiseSpec(baseRating, { ...shared, ...(definition.variant ?? {}) });
  const controlAggregate = createFocusAggregate();
  const variantAggregate = createFocusAggregate();
  const pairedOutcomes = { improved:0, same:0, worse:0 };
  let seedMismatches = 0;

  for (let index = 0; index < matches; index += 1) {
    const seed = `t7:${definition.id}:${index}`;
    const control = fixtureFromSpec(seed, controlSpec);
    const variant = fixtureFromSpec(seed, variantSpec);
    addFocusResult(controlAggregate, control.result, control.subjectTeamId);
    addFocusResult(variantAggregate, variant.result, variant.subjectTeamId);
    if (control.result.seed !== variant.result.seed) seedMismatches += 1;
    const controlPoints = control.result.homeTeamId === control.subjectTeamId
      ? (control.result.homeGoals > control.result.awayGoals ? 3 : control.result.homeGoals === control.result.awayGoals ? 1 : 0)
      : (control.result.awayGoals > control.result.homeGoals ? 3 : control.result.awayGoals === control.result.homeGoals ? 1 : 0);
    const variantPoints = variant.result.homeTeamId === variant.subjectTeamId
      ? (variant.result.homeGoals > variant.result.awayGoals ? 3 : variant.result.homeGoals === variant.result.awayGoals ? 1 : 0)
      : (variant.result.awayGoals > variant.result.homeGoals ? 3 : variant.result.awayGoals === variant.result.homeGoals ? 1 : 0);
    if (variantPoints > controlPoints) pairedOutcomes.improved += 1;
    else if (variantPoints < controlPoints) pairedOutcomes.worse += 1;
    else pairedOutcomes.same += 1;
  }

  const control = summariseFocus(controlAggregate);
  const variant = summariseFocus(variantAggregate);
  return {
    id:definition.id,
    category:definition.category,
    label:definition.label,
    rationale:definition.rationale,
    matches,
    seedMismatches,
    pairedOutcomes,
    controlSpec,
    variantSpec,
    control,
    variant,
    delta:deltaSummary(variant, control),
  };
}

export function createT7CalibrationReport(configOverrides = {}) {
  const config = normaliseConfig(configOverrides);
  const scenarios = config.scenarios.map(definition => runScenario(definition, config.matchesPerScenario, config.baseRating));
  return {
    reportVersion:T7_CALIBRATION_REPORT_VERSION,
    purpose:'T7 deep deterministic calibration diagnostics',
    standardGateUnchanged:true,
    samples:{
      matchesPerScenario:config.matchesPerScenario,
      scenarioCount:scenarios.length,
      totalSimulations:scenarios.length * config.matchesPerScenario * 2,
      baseRating:config.baseRating,
    },
    performanceCeilings:WORLD_PERFORMANCE_CEILINGS,
    scenarios,
  };
}

function signed(value) {
  const numeric = Number(value);
  return `${numeric > 0 ? '+' : ''}${numeric.toFixed(3).replace(/\.000$/, '')}`;
}

export function renderT7CalibrationMarkdown(report) {
  const lines = [
    '# T7 Deep Match Calibration',
    '',
    '> Diagnostic paired-seed matrix over the same authoritative match engine. The standard 3,000-simulation CI balance gate remains unchanged.',
    '',
    `**Report version:** ${report.reportVersion}`,
    '',
    `**Samples:** ${report.samples.scenarioCount} scenarios × ${report.samples.matchesPerScenario} paired seeds = ${report.samples.totalSimulations} simulations`,
    '',
    '| Scenario | Category | Δ pts | Δ GF | Δ GA | Δ poss. | Δ shots | Δ xG | Better / same / worse | Seed mismatches |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const scenario of report.scenarios) {
    lines.push(`| ${scenario.label} | ${scenario.category} | ${signed(scenario.delta.pointsPerMatch)} | ${signed(scenario.delta.goalsForPerMatch)} | ${signed(scenario.delta.goalsAgainstPerMatch)} | ${signed(scenario.delta.possessionPercent)}pp | ${signed(scenario.delta.shotsPerMatch)} | ${signed(scenario.delta.xGPerMatch)} | ${scenario.pairedOutcomes.improved} / ${scenario.pairedOutcomes.same} / ${scenario.pairedOutcomes.worse} | ${scenario.seedMismatches} |`);
  }
  lines.push('', '## Route deltas', '');
  for (const scenario of report.scenarios) {
    const routeChanges = ROUTES
      .map(route => ({ route, ...scenario.delta.routes[route] }))
      .filter(item => Math.abs(item.attemptsPerMatch) >= .01 || Math.abs(item.successRate) >= .01 || Math.abs(item.chancesPerMatch) >= .01)
      .sort((left, right) => Math.abs(right.attemptsPerMatch) - Math.abs(left.attemptsPerMatch))
      .slice(0, 3);
    lines.push(`- **${scenario.label}:** ${routeChanges.length ? routeChanges.map(item => `${item.route} attempts ${signed(item.attemptsPerMatch)}, success ${signed(item.successRate)}pp, chances ${signed(item.chancesPerMatch)}`).join('; ') : 'no material route-frequency change in this sample'}.`);
  }
  lines.push('', 'T7.2 structural guardrails are reviewed and encoded; run this matrix with --check (the CI default) to assert them against the reported distribution.');
  return lines.join('\n');
}
