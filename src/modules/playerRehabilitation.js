/*
 * modules/playerRehabilitation.js — pure P3 rehabilitation state machine.
 *
 * Medical availability, match readiness and reinjury risk are deliberately
 * separate from the legacy injury duration fields. Ordinary recovery remains
 * automatic; an early-return decision only exists once medically available.
 */

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function round2(value) { return Math.round(value * 100) / 100; }

function severityFromWeeks(totalWeeks) {
  const weeks = Math.max(1, Number(totalWeeks ?? 1));
  if (weeks >= 16) return 'major';
  if (weeks >= 6) return 'moderate';
  return 'minor';
}

function rehabStartReadiness(severity) {
  return severity === 'major' ? 25 : severity === 'moderate' ? 35 : 45;
}

function highRiskReadiness(severity) {
  return severity === 'major' ? 48 : severity === 'moderate' ? 55 : 62;
}

export function createRehabilitationState(player, status = 'rehabilitation') {
  const totalWeeks = Math.max(1, Number(player?.injuryGWsTotal ?? player?.injuryGWsLeft ?? 1));
  const severity = severityFromWeeks(totalWeeks);
  const medical = status !== 'rehabilitation' && status !== 'injured';
  const matchReadiness = status === 'available_high_risk'
    ? highRiskReadiness(severity)
    : status === 'match_fit' ? 100 : rehabStartReadiness(severity);
  return {
    version:1,
    status,
    severity,
    sourceInjuryName:player?.injuryName ?? player?.rehabilitation?.sourceInjuryName ?? null,
    sourceInjuryType:player?.injuryType ?? player?.rehabilitation?.sourceInjuryType ?? null,
    sourceInjuryWeeks:totalWeeks,
    medicallyAvailable:medical,
    matchReadiness,
    reinjuryRisk:status === 'available_high_risk' ? (severity === 'major' ? .28 : severity === 'moderate' ? .20 : .14) : 0,
    earlyReturn:false,
    lastSettledKey:null,
  };
}

export function shouldEnterRehabilitation(player) {
  if (!player?.injured) return false;
  const left = Math.max(0, Number(player.injuryGWsLeft ?? 0));
  const total = Math.max(1, Number(player.injuryGWsTotal ?? left ?? 1));
  return left <= Math.max(1, Math.ceil(total * .35));
}

export function ensureRehabilitation(player) {
  if (!player) return player;
  if (player.rehabilitation) return player;
  if (!shouldEnterRehabilitation(player)) return player;
  return { ...player, rehabilitation:createRehabilitationState(player, 'rehabilitation') };
}

/** Called by the legacy injury ticker on the week medical absence reaches zero. */
export function markMedicallyAvailable(player, injurySnapshot = null) {
  if (!player) return player;
  const source = {
    ...player,
    ...(injurySnapshot ?? {}),
    rehabilitation:player.rehabilitation,
  };
  const existing = player.rehabilitation && typeof player.rehabilitation === 'object'
    ? player.rehabilitation
    : createRehabilitationState(source, 'rehabilitation');
  const availability = createRehabilitationState(source, 'available_high_risk');
  return {
    ...player,
    rehabilitation:{
      ...existing,
      ...availability,
      sourceInjuryName:existing.sourceInjuryName ?? availability.sourceInjuryName,
      sourceInjuryType:existing.sourceInjuryType ?? availability.sourceInjuryType,
      sourceInjuryWeeks:existing.sourceInjuryWeeks ?? availability.sourceInjuryWeeks,
      lastSettledKey:existing.lastSettledKey ?? null,
    },
  };
}

export function setEarlyReturn(player, enabled = true) {
  const rehab = player?.rehabilitation;
  if (!rehab || rehab.status !== 'available_high_risk' || !rehab.medicallyAvailable) return player;
  return { ...player, rehabilitation:{ ...rehab, earlyReturn:Boolean(enabled) } };
}

export function rehabilitationReinjuryMultiplier(player) {
  const rehab = player?.rehabilitation;
  if (!rehab || rehab.status === 'match_fit') return 1;
  const readiness = clamp(Number(rehab.matchReadiness ?? 100), 0, 100);
  const storedRisk = clamp(Number(rehab.reinjuryRisk ?? 0), 0, .6);
  const readinessRisk = ((100 - readiness) / 100) * .6;
  const early = rehab.earlyReturn ? .45 : 0;
  return round2(clamp(1 + storedRisk + readinessRisk + early, 1, 2.2));
}

export function rehabilitationSelectionWarning(player) {
  const rehab = player?.rehabilitation;
  if (!rehab || rehab.status === 'match_fit') return null;
  if (!rehab.medicallyAvailable) return 'Rehabilitation — unavailable';
  if (rehab.earlyReturn) return `Early return — ${Math.round(rehab.matchReadiness ?? 0)}% match ready, elevated reinjury risk`;
  return `Medically available — ${Math.round(rehab.matchReadiness ?? 0)}% match ready`;
}

export function settleRehabilitation(player, gameweek, season = null) {
  if (!player) return player;
  let subject = ensureRehabilitation(player);
  const rehab = subject.rehabilitation;
  if (!rehab) return subject;
  const key = `${String(season ?? 'unknown')}:${Number(gameweek)}`;
  if (!Number.isInteger(Number(gameweek)) || Number(gameweek) < 0 || rehab.lastSettledKey === key) return subject;

  const status = subject.injured ? 'rehabilitation' : rehab.status;
  const severity = rehab.severity ?? severityFromWeeks(rehab.sourceInjuryWeeks);
  let readiness = clamp(Number(rehab.matchReadiness ?? rehabStartReadiness(severity)), 0, 100);
  let reinjuryRisk = clamp(Number(rehab.reinjuryRisk ?? 0), 0, .6);
  let medicallyAvailable = Boolean(rehab.medicallyAvailable);
  let nextStatus = status;

  if (subject.injured) {
    readiness = clamp(readiness + (severity === 'major' ? 6 : severity === 'moderate' ? 8 : 10), 0, 70);
    medicallyAvailable = false;
    reinjuryRisk = 0;
  } else {
    if (!medicallyAvailable || status === 'rehabilitation') {
      nextStatus = 'available_high_risk';
      medicallyAvailable = true;
      readiness = Math.max(readiness, highRiskReadiness(severity));
      reinjuryRisk = severity === 'major' ? .28 : severity === 'moderate' ? .20 : .14;
    } else {
      const exposurePenalty = Number(subject.minutes ?? 0) > Number(subject.rehabilitationMinutes ?? subject.minutes ?? 0) ? 2 : 0;
      readiness = clamp(readiness + (rehab.earlyReturn ? 7 : 11) - exposurePenalty, 0, 100);
      reinjuryRisk = clamp(reinjuryRisk - (rehab.earlyReturn ? .025 : .045), 0, .6);
      if (readiness >= 92 && reinjuryRisk <= .08) {
        nextStatus = 'match_fit';
        readiness = 100;
        reinjuryRisk = 0;
      } else {
        nextStatus = 'available_high_risk';
      }
    }
  }

  return {
    ...subject,
    rehabilitation:{
      ...rehab,
      status:nextStatus,
      medicallyAvailable,
      matchReadiness:Math.round(readiness),
      reinjuryRisk:round2(reinjuryRisk),
      earlyReturn:nextStatus === 'match_fit' ? false : Boolean(rehab.earlyReturn),
      lastSettledKey:key,
    },
    rehabilitationMinutes:Math.max(0, Number(subject.minutes ?? 0)),
  };
}

export function buildRehabilitationPatches(players, gameweek, season = null) {
  const patches = [];
  for (const player of players ?? []) {
    const next = settleRehabilitation(player, gameweek, season);
    if (next !== player) patches.push(next);
  }
  return patches;
}
