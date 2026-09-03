import { financialPressure } from './clubFinance.js';
import { clubPhilosophyTraitValue } from './clubPhilosophy.js';

/**
 * modules/boardContract.js — P7 WP4 multi-objective board contract. Pure/
 * DOM-free: no IndexedDB or UI imports. Replaces the single finish-position
 * `save.boardObjective` with a small weighted set (sporting, financial,
 * youth). `save.boardObjective` itself is kept — season.js's
 * `generateBoardObjective`/`evaluateBoardObjective` are reused here, not
 * duplicated, so the sporting objective's target/evaluation logic has one
 * source of truth — and every consumer that already reads it (HomeScreen's
 * board card, `liveBoardConfidence`) keeps working unchanged.
 *
 * Scope for this slice: season-close evaluation only (fully idempotent by
 * construction — a season can't roll over twice). A persisted, replayable
 * mid-season checkpoint with its own "can't apply twice after reload"
 * guard is deliberately deferred to WP7, where it belongs next to the
 * Inbox surface the guide assigns warnings/reviews to — building a second,
 * throwaway checkpoint UI now and replacing it in WP7 would be wasted work.
 * `liveBoardContractConfidence` gives an equivalent non-persisted, always-
 * fresh mid-season view in the meantime, exactly like the pre-P7
 * `liveBoardConfidence` already did for the single-objective system.
 */

export const BOARD_CONTRACT_VERSION = 1;
export const OBJECTIVE_STATUS = Object.freeze({ OK:'ok', WARNING:'warning', REVIEW:'review' });

const SPORTING_WEIGHT = 0.5;
const FINANCIAL_WEIGHT = 0.25;
const YOUTH_WEIGHT = 0.25;

/** Migrated from season.js (P7 WP4) — the single sporting-objective generator/evaluator this contract's sporting objective is built from. Moved rather than re-exported: season.js now imports these from here, so the sporting objective has exactly one definition. */
export function generateBoardObjective(team, league) {
  const rep = team?.reputation ?? 65;
  const promotionLeagues = new Set(['Championship', 'League One', 'League Two']);
  if (promotionLeagues.has(league)) {
    if (rep >= 75) return { id:'promotion', label:'Win promotion', kind:'position', target:2 };
    if (rep >= 62) return { id:'playoffs', label:'Push for the play-offs', kind:'position', target:6 };
    if (league === 'League Two') return { id:'consolidate', label:'Finish in mid-table', kind:'position', target:12 };
    return { id:'avoid_relegation', label:'Avoid relegation', kind:'avoid_relegation' };
  }
  if (rep >= 85) return { id:'title', label:'Win the league', kind:'position', target:1 };
  if (rep >= 75) return { id:'europe', label:'Qualify for Europe', kind:'position', target:7 };
  if (rep >= 55) return { id:'top_half', label:'Finish in the top half', kind:'top_half' };
  return { id:'avoid_relegation', label:'Avoid relegation', kind:'avoid_relegation' };
}

export function evaluateBoardObjective(objective, finalPosition, totalTeams, wasRelegated) {
  if (!objective) return { met:true, margin:0 };
  if (objective.kind === 'avoid_relegation') return { met:!wasRelegated, margin:wasRelegated ? -3 : 3 };
  if (objective.kind === 'top_half') {
    const mid = Math.ceil((totalTeams || 20) / 2);
    return { met:finalPosition <= mid, margin:mid - finalPosition };
  }
  return { met:finalPosition <= objective.target, margin:objective.target - finalPosition };
}

/** 4-12 U21 league appearances across the season, scaled by the club's own youthPathway identity — ties WP1's philosophy into the board's own expectations. */
function youthAppearanceTarget(team) {
  const youthPathway = clubPhilosophyTraitValue(team?.philosophy, 'youthPathway');
  return Math.round(4 + (youthPathway / 100) * 8);
}

export function generateBoardContract(team, league) {
  return {
    version:BOARD_CONTRACT_VERSION,
    objectives:[
      { id:'sporting', kind:'sporting', weight:SPORTING_WEIGHT, target:generateBoardObjective(team, league), status:OBJECTIVE_STATUS.OK },
      { id:'financial', kind:'financial', weight:FINANCIAL_WEIGHT, target:'stable', status:OBJECTIVE_STATUS.OK },
      { id:'youth', kind:'youth', weight:YOUTH_WEIGHT, target:youthAppearanceTarget(team), status:OBJECTIVE_STATUS.OK },
    ],
  };
}

function statusFor(met, marginRatio) {
  if (met) return OBJECTIVE_STATUS.OK;
  return marginRatio <= -0.5 ? OBJECTIVE_STATUS.REVIEW : OBJECTIVE_STATUS.WARNING;
}

/**
 * Counts distinct-appearance minutes given to U21 players this season for
 * the managed squad. `players` is every player row; filtered to the club
 * here so callers can pass the same full roster season.js already loads.
 */
export function youthAppearancesFor(team, players) {
  return (players ?? [])
    .filter(player => player?.teamId === team?.id && Number(player?.age ?? 99) <= 21)
    .reduce((sum, player) => sum + Math.max(0, Number(player?.appearances ?? 0)), 0);
}

/**
 * Season-close evaluation. Each objective gets a status; the overall
 * weighted score (0-1, each objective scored 1 if met else a bounded
 * partial credit) decides whether the board recommends dismissal — never
 * applies it. `dismissalRecommended` is the P6 hand-off point: p7Runtime.js/
 * season.js decide what to actually do with it, this module only judges.
 */
export function evaluateBoardContractSeasonClose(contract, { team, players, finalPosition, totalTeams, wasRelegated }) {
  const objectives = (contract?.objectives ?? []).map(objective => {
    if (objective.kind === 'sporting') {
      const { met, margin } = evaluateBoardObjective(objective.target, finalPosition, totalTeams, wasRelegated);
      // evaluateBoardObjective's own `margin` is a fixed +/-3 for
      // avoid_relegation (it only ever asks "relegated or not"), which would
      // read as only mildly severe no matter how badly a club is relegated.
      // Resolve the actual position target the same way
      // liveBoardContractConfidence already does, so a club relegated in
      // dead last reads as more severe than one relegated on the final day.
      const positionTarget = objective.target?.kind === 'avoid_relegation'
        ? Math.max(1, (totalTeams || 20) - 3)
        : objective.target?.kind === 'top_half'
          ? Math.ceil((totalTeams || 20) / 2)
          : Number(objective.target?.target ?? 1);
      const positionMargin = positionTarget - Number(finalPosition);
      // A fixed divisor (not scaled by league size) keeps a given position
      // shortfall equally severe whether the league has 18 or 24 teams.
      const marginRatio = positionMargin / 4;
      return { ...objective, status:statusFor(met, marginRatio), met, margin };
    }
    if (objective.kind === 'financial') {
      const pressure = financialPressure(team);
      const met = pressure === 'stable';
      const marginRatio = pressure === 'critical' ? -1 : pressure === 'strained' ? -0.4 : 0.2;
      return { ...objective, status:statusFor(met, marginRatio), met, pressure };
    }
    if (objective.kind === 'youth') {
      const progress = youthAppearancesFor(team, players);
      const met = progress >= objective.target;
      const marginRatio = objective.target > 0 ? (progress - objective.target) / objective.target : 0;
      return { ...objective, status:statusFor(met, marginRatio), met, progress };
    }
    return objective;
  });

  const weightedScore = objectives.reduce((sum, objective) => {
    const credit = objective.status === OBJECTIVE_STATUS.OK ? 1 : objective.status === OBJECTIVE_STATUS.WARNING ? 0.4 : 0;
    return sum + credit * (objective.weight ?? 0);
  }, 0);

  // Only a genuinely bad season recommends dismissal: the sporting objective
  // must itself be in review (not just one minor objective missed), and the
  // overall weighted score must be poor — a club can miss a soft youth
  // target without costing the manager their job.
  const sportingObjective = objectives.find(objective => objective.kind === 'sporting');
  const dismissalRecommended = sportingObjective?.status === OBJECTIVE_STATUS.REVIEW && weightedScore < 0.45;

  return { objectives, weightedScore, dismissalRecommended };
}

/**
 * Non-persisted, always-fresh mid-season view — the WP4 equivalent of the
 * pre-P7 `liveBoardConfidence`, extended across all three objectives rather
 * than sporting position alone. Never written to `save`; recomputed from
 * whatever the caller has in hand each time it's shown.
 */
export function liveBoardContractConfidence(contract, { team, players, position, totalTeams, form = [], played = null }) {
  const objectives = (contract?.objectives ?? []).map(objective => {
    if (objective.kind === 'sporting' && Number.isFinite(Number(position)) && Number(position) > 0) {
      const target = objective.target?.kind === 'avoid_relegation'
        ? Math.max(1, (totalTeams || 20) - 3)
        : objective.target?.kind === 'top_half'
          ? Math.ceil((totalTeams || 20) / 2)
          : Number(objective.target?.target ?? 1);
      const margin = target - Number(position);
      return { ...objective, status:margin >= 0 ? OBJECTIVE_STATUS.OK : margin >= -2 ? OBJECTIVE_STATUS.WARNING : OBJECTIVE_STATUS.REVIEW, margin };
    }
    if (objective.kind === 'financial') {
      const pressure = financialPressure(team);
      return { ...objective, status:pressure === 'stable' ? OBJECTIVE_STATUS.OK : pressure === 'strained' ? OBJECTIVE_STATUS.WARNING : OBJECTIVE_STATUS.REVIEW, pressure };
    }
    if (objective.kind === 'youth') {
      const progress = youthAppearancesFor(team, players);
      const ratio = objective.target > 0 ? progress / objective.target : 1;
      return { ...objective, status:ratio >= 1 ? OBJECTIVE_STATUS.OK : ratio >= 0.5 ? OBJECTIVE_STATUS.WARNING : OBJECTIVE_STATUS.REVIEW, progress };
    }
    return objective;
  });
  const recentForm = (form ?? []).slice(-5);
  const hasLeagueEvidence = played == null ? recentForm.length > 0 : Number(played) > 0;
  return { objectives, hasLeagueEvidence };
}

export function boardContractNeedsBackfill(save) {
  return !save || Number(save.boardContractVersion ?? 0) < BOARD_CONTRACT_VERSION;
}

/** Idempotent backfill for the user's own board contract, mirroring clubPhilosophy.js/clubFinance.js's pattern. */
export function buildBoardContractBackfill(save, userTeam, userLeague) {
  if (!save) return { save };
  return {
    save:{ ...save, boardContractVersion:BOARD_CONTRACT_VERSION, boardContract:generateBoardContract(userTeam, userLeague ?? save.userLeague) },
  };
}
