const ANALYSIS_ROUTES = Object.freeze([
  'circulation',
  'direct_pass',
  'pass_into_space',
  'carry',
  'wide_delivery',
]);

const ROUTE_LABELS = Object.freeze({
  circulation:'Circulation',
  direct_pass:'Direct passing',
  pass_into_space:'Passes into space',
  carry:'Carries',
  wide_delivery:'Wide delivery',
});

const SUCCESS_OUTCOMES = new Set(['retain', 'progress', 'chance_created']);
const FAILURE_OUTCOMES = new Set(['turnover', 'intercepted']);

export const MATCH_TACTICAL_ANALYSIS_VERSION = 1;

function analysisRound(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function routeSummary(records, route) {
  const attempts = records.filter(record => record.route === route);
  const successes = attempts.filter(record => SUCCESS_OUTCOMES.has(record.outcome));
  const chances = attempts.filter(record => record.outcome === 'chance_created');
  const shots = attempts.filter(record => record.shotId != null);
  const goals = shots.filter(record => record.finish === 'goal');
  const xg = analysisRound(shots.reduce((sum, record) => sum + Number(record.xg ?? 0), 0));
  return {
    route,
    label:ROUTE_LABELS[route],
    attempts:attempts.length,
    successes:successes.length,
    successRate:attempts.length ? Math.round((successes.length / attempts.length) * 100) : 0,
    chances:chances.length,
    shots:shots.length,
    goals:goals.length,
    xG:xg,
  };
}

function usedRoutes(routes) {
  return routes.filter(route => route.attempts > 0);
}

function routeImpact(route) {
  if (!route.attempts) return -Infinity;
  return route.chances * 4 + route.goals * 5 + route.successes - (route.attempts - route.successes) * .5;
}

function bestUsedRoute(routes) {
  const used = usedRoutes(routes);
  if (!used.length) return null;
  return [...used].sort((left, right) =>
    routeImpact(right) - routeImpact(left)
    || right.chances - left.chances
    || right.successRate - left.successRate
    || right.attempts - left.attempts
    || left.route.localeCompare(right.route)
  )[0];
}

function leastEffectiveUsedRoute(routes) {
  const used = usedRoutes(routes).filter(route => route.attempts >= 2);
  if (!used.length) return null;
  return [...used].sort((left, right) =>
    left.successRate - right.successRate
    || left.chances - right.chances
    || right.attempts - left.attempts
    || left.route.localeCompare(right.route)
  )[0];
}

function buildTeamAnalysis(ledger, teamId) {
  const records = ledger.filter(record => record?.teamId === teamId);
  const routes = ANALYSIS_ROUTES.map(route => routeSummary(records, route));
  const shots = records.filter(record => record.shotId != null);
  const totalXg = analysisRound(shots.reduce((sum, record) => sum + Number(record.xg ?? 0), 0));
  const bestRoute = bestUsedRoute(routes);
  const weakRoute = leastEffectiveUsedRoute(routes);

  return {
    teamId,
    phases:records.length,
    chances:records.filter(record => record.outcome === 'chance_created').length,
    shots:shots.length,
    onTarget:shots.filter(record => record.onTarget).length,
    goals:shots.filter(record => record.finish === 'goal').length,
    xG:totalXg,
    averageXG:shots.length ? analysisRound(totalXg / shots.length) : 0,
    turnoversLost:records.filter(record => FAILURE_OUTCOMES.has(record.outcome)).length,
    foulsWon:records.filter(record => record.outcome === 'foul_won').length,
    routes,
    bestRoute:bestRoute ? {
      route:bestRoute.route,
      label:bestRoute.label,
      attempts:bestRoute.attempts,
      successes:bestRoute.successes,
      chances:bestRoute.chances,
      goals:bestRoute.goals,
    } : null,
    weakRoute:weakRoute ? {
      route:weakRoute.route,
      label:weakRoute.label,
      attempts:weakRoute.attempts,
      successes:weakRoute.successes,
      successRate:weakRoute.successRate,
    } : null,
  };
}

function observationFor(team) {
  const intoSpace = team.routes.find(route => route.route === 'pass_into_space');
  const carries = team.routes.find(route => route.route === 'carry');
  const wide = team.routes.find(route => route.route === 'wide_delivery');

  const candidates = [];
  if (intoSpace?.attempts >= 2 && intoSpace.chances > 0) {
    candidates.push({
      teamId:team.teamId,
      type:'space_threat',
      route:'pass_into_space',
      priority:intoSpace.chances * 5 + intoSpace.successes,
      text:`Passes into space created ${intoSpace.chances} ${intoSpace.chances === 1 ? 'chance' : 'chances'} from ${intoSpace.attempts} attempts.`,
    });
  }
  if (carries?.attempts >= 2 && carries.successes > 0) {
    candidates.push({
      teamId:team.teamId,
      type:'carry_progress',
      route:'carry',
      priority:carries.chances * 4 + carries.successes,
      text:`Carries progressed ${carries.successes} of ${carries.attempts} attacks.`,
    });
  }
  if (wide?.attempts >= 2 && (wide.chances > 0 || wide.goals > 0)) {
    candidates.push({
      teamId:team.teamId,
      type:'wide_threat',
      route:'wide_delivery',
      priority:wide.goals * 8 + wide.chances * 5 + wide.successes,
      text:`Wide delivery produced ${wide.chances} ${wide.chances === 1 ? 'chance' : 'chances'} from ${wide.attempts} attempts.`,
    });
  }
  if (team.shots >= 2) {
    candidates.push({
      teamId:team.teamId,
      type:'shot_quality',
      route:null,
      priority:team.shots + team.xG * 2,
      text:`Shot quality averaged ${team.averageXG.toFixed(2)} xG across ${team.shots} attempts.`,
    });
  }
  if (team.weakRoute?.attempts >= 3 && team.weakRoute.successRate <= 45) {
    candidates.push({
      teamId:team.teamId,
      type:'route_struggle',
      route:team.weakRoute.route,
      priority:3 + (50 - team.weakRoute.successRate) / 10,
      text:`${team.weakRoute.label} struggled: ${team.weakRoute.successes} of ${team.weakRoute.attempts} attacks progressed.`,
    });
  }

  return candidates.sort((left, right) => right.priority - left.priority || left.type.localeCompare(right.type))[0] ?? null;
}

/**
 * Compact T6 projection over the authoritative action ledger.
 *
 * This function is deliberately presentation/analysis only: it never mutates
 * records, draws RNG, infers missing football events or exposes internal
 * execution/counter scores. The returned object is small enough to attach to
 * the transient match result while the full 120-record ledger remains private
 * to the live match state.
 */
export function buildMatchTacticalAnalysis({ ledger = [], homeTeamId, awayTeamId } = {}) {
  const records = Array.isArray(ledger) ? ledger.filter(record => record && typeof record === 'object') : [];
  const home = buildTeamAnalysis(records, homeTeamId);
  const away = buildTeamAnalysis(records, awayTeamId);
  const observations = [observationFor(home), observationFor(away)].filter(Boolean);
  return {
    version:MATCH_TACTICAL_ANALYSIS_VERSION,
    home,
    away,
    observations,
  };
}
