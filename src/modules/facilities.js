import { applyLedgerMovement, availableFunds, financialPressure } from './clubFinance.js';
import { clubPhilosophyTraitValue } from './clubPhilosophy.js';
import { stableStringHash } from './tactics.js';

/**
 * modules/facilities.js — P7 WP6 club facilities. Pure/DOM-free: no
 * IndexedDB or UI imports. Three bounded, integer-tiered infrastructure
 * tracks — training, medical, scouting — each with cost, a fixed lead time
 * and a named P3/P5 consumer (trainingEfficiencyMultiplier,
 * medicalRecoveryMultiplier, scoutingCapacityBonus below).
 *
 * The guide's fourth track, academy, is deliberately NOT duplicated here.
 * `team.academyInvestment` (P3/pre-P7) already is a working, tested,
 * instant-buy 0-100 investment mechanic with a real consumer (youth cohort
 * generation) — its own guide route note says facility upgrades belong
 * "only after P5/P9 consumers exist", and academy's deeper consumer is P9,
 * which doesn't exist yet. Rebuilding academy investment as a second,
 * lead-time-gated mechanic alongside the still-working instant one would
 * split one club-facing number into two competing sources of truth for no
 * present benefit — so academy investment is untouched by this module.
 */

export const FACILITIES_VERSION = 1;
export const FACILITY_TRACKS = Object.freeze(['training', 'medical', 'scouting']);
export const FACILITY_MAX_LEVEL = 5;
export const FACILITY_LEAD_TIME_WEEKS = 6;
export const FACILITY_LEVEL_COST = 4_000_000;

const FACILITY_CONSUMER = Object.freeze({
  training:'P3/P5 development-plan efficiency',
  medical:'P3 injury recovery speed',
  scouting:'P5 scouting assignment capacity',
});

export function createFacilities() {
  const tracks = {};
  for (const track of FACILITY_TRACKS) tracks[track] = { level:1, upgrading:null };
  return { version:FACILITIES_VERSION, tracks };
}

function normalizedFacilities(team) {
  if (team?.facilities?.version === FACILITIES_VERSION) return team.facilities;
  return createFacilities();
}

export function facilitiesNeedBackfill(save) {
  return !save || Number(save.facilitiesVersion ?? 0) < FACILITIES_VERSION;
}

/** Every track starts at level 1 (the pre-WP6 baseline — see the multiplier selectors below) since none of the three tracked here have any prior investment to preserve. */
export function buildFacilitiesBackfill(save, teams = []) {
  if (!save) return { save, teamPatches:[] };
  const teamPatches = teams
    .filter(team => !team.facilities || Number(team.facilities.version ?? 0) < FACILITIES_VERSION)
    .map(team => ({ ...team, facilities:createFacilities() }));
  return {
    save:{ ...save, facilitiesVersion:FACILITIES_VERSION },
    teamPatches,
  };
}

/** Cost rises with the level being left, so the top tier is the most expensive step. */
export function facilityUpgradeCost(currentLevel) {
  return Math.max(1, Number(currentLevel) || 1) * FACILITY_LEVEL_COST;
}

export function isValidFacilityTrack(track) {
  return FACILITY_TRACKS.includes(track);
}

/**
 * Starts an upgrade: requires cash (via the same `availableFunds` selector
 * every other affordability check in P7 uses, so this reserves against the
 * club's own committed obligations too), no upgrade already in progress on
 * this track, and room below the max level. Ledgers the cost immediately
 * (category `facility_investment`, already in clubFinance.js's documented
 * category list) — the level itself only changes once the lead time has
 * elapsed, via `completeDueFacilityUpgrades`.
 */
export function beginFacilityUpgrade(team, track, { weekKey, season, currentGameweek, transferMarket = null } = {}) {
  if (!isValidFacilityTrack(track)) throw new Error('INVALID_FACILITY_TRACK');
  const facilities = normalizedFacilities(team);
  const current = facilities.tracks[track];
  if (current.upgrading) throw new Error('UPGRADE_ALREADY_IN_PROGRESS');
  if (current.level >= FACILITY_MAX_LEVEL) throw new Error('FACILITY_AT_MAX_LEVEL');
  const cost = facilityUpgradeCost(current.level);
  if (availableFunds(team, transferMarket) < cost) throw new Error('INSUFFICIENT_FUNDS');

  const debited = applyLedgerMovement(team, {
    category:'facility_investment', amount:-cost,
    description:`Upgrading ${track} facility to level ${current.level + 1}`, weekKey,
  });
  return {
    ...debited,
    facilities:{
      ...facilities,
      tracks:{
        ...facilities.tracks,
        [track]:{ ...current, upgrading:{ targetLevel:current.level + 1, dueSeason:season, dueGameweek:(Number(currentGameweek) || 0) + FACILITY_LEAD_TIME_WEEKS } },
      },
    },
  };
}

/** Same due-date semantics as clubFinance.js's obligations: due once the gameweek is reached in the scheduled season, or once the save has moved past that season entirely (a catch-up safety net against an upgrade started too late to land within its own season). */
export function isFacilityUpgradeDue(upgrading, save) {
  if (!upgrading?.dueSeason) return false;
  if (String(upgrading.dueSeason) !== String(save?.season ?? '')) return true;
  return Number(save?.currentGameweek ?? 0) >= Number(upgrading.dueGameweek ?? 0);
}

/**
 * Completes every due upgrade on this team in one pass. Returns the exact
 * same `team` reference when nothing is due, so a caller can use `!==` to
 * decide whether a write is worth persisting — same contract as
 * clubPhilosophy.js's `evolveClubPhilosophy`.
 */
export function completeDueFacilityUpgrades(team, save) {
  const facilities = normalizedFacilities(team);
  const dueTracks = FACILITY_TRACKS.filter(track => isFacilityUpgradeDue(facilities.tracks[track].upgrading, save));
  if (!dueTracks.length) return team;
  const tracks = { ...facilities.tracks };
  for (const track of dueTracks) {
    tracks[track] = { level:facilities.tracks[track].upgrading.targetLevel, upgrading:null };
  }
  return { ...team, facilities:{ ...facilities, tracks } };
}

function facilityLevel(team, track) {
  const level = team?.facilities?.tracks?.[track]?.level ?? 1;
  return Math.max(1, Math.min(FACILITY_MAX_LEVEL, level));
}

/**
 * Named P3/P5 consumers. Level 1 (the pre-WP6/pre-upgrade baseline) always
 * returns exactly the neutral value — an existing career with no facility
 * investment yet sees zero behaviour change the moment WP6 ships. Every
 * multiplier is a small, capped trade-off, never a hidden universal boost.
 */
export function trainingEfficiencyMultiplier(team) {
  return 1 + (facilityLevel(team, 'training') - 1) * 0.03;
}

export function medicalRecoveryMultiplier(team) {
  return 1 + (facilityLevel(team, 'medical') - 1) * 0.03;
}

/** +1 concurrent scouting assignment for every 2 levels above baseline, capped at +2. */
export function scoutingCapacityBonus(team) {
  return Math.floor((facilityLevel(team, 'scouting') - 1) / 2);
}

export function scoutingConfidenceMultiplier(team) {
  return 1 + (facilityLevel(team, 'scouting') - 1) * 0.02;
}

export function describeFacilityConsumer(track) {
  return FACILITY_CONSUMER[track] ?? null;
}

/**
 * A conservative, deterministic (seeded, never `Math.random()`) once-per-
 * season decision for an AI club: invest in one facility track, or don't.
 * Returns `null` far more often than a track — this is meant to be a slow
 * background trend across a 15-season career, not a club racing to max
 * every track. Requires genuinely healthy finances (`financialPressure`
 * 'stable', and cash left over well beyond the upgrade's own cost after
 * paying for it) and is further damped by the club's own `financialCaution`
 * philosophy trait, so a cautious club invests less often than a bold one
 * at the same cash position. Among affordable, non-upgrading, below-max
 * tracks it always picks the club's own currently lowest level (a
 * deterministic tie-break on club id), so a club diversifies rather than
 * always maxing the same track.
 */
export function decideAIFacilityInvestment(team, { weekKey, season, currentGameweek, transferMarket = null } = {}) {
  if (financialPressure(team) !== 'stable') return null;
  const financialCaution = clubPhilosophyTraitValue(team?.philosophy, 'financialCaution');
  const investChance = Math.max(0.05, 0.30 - financialCaution / 400);
  const roll = (stableStringHash(`${team?.id ?? 'club'}:facility_invest:${season}`) % 1000) / 1000;
  if (roll >= investChance) return null;

  const facilities = normalizedFacilities(team);
  const candidates = FACILITY_TRACKS
    .filter(track => !facilities.tracks[track].upgrading && facilities.tracks[track].level < FACILITY_MAX_LEVEL)
    .filter(track => availableFunds(team, transferMarket) >= facilityUpgradeCost(facilities.tracks[track].level) * 2)
    .sort((a, b) => facilities.tracks[a].level - facilities.tracks[b].level
      || stableStringHash(`${team?.id}:${a}`) - stableStringHash(`${team?.id}:${b}`));
  const track = candidates[0];
  if (!track) return null;

  return beginFacilityUpgrade(team, track, { weekKey, season, currentGameweek, transferMarket });
}
