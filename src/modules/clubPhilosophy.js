import { getAITacticalProfile, stableStringHash } from './tactics.js';

/**
 * modules/clubPhilosophy.js — P7 WP1 club philosophy contract. Pure/DOM-free:
 * no IndexedDB or UI imports. Every club (user and AI) carries a small,
 * versioned, weighted trait set that guides — never hard-locks — P6 manager
 * fit, P4/P5 recruitment priorities and P7's own board/finance decisions.
 * Mirrors managers.js's shape: `save.js` owns store-level backfill
 * orchestration, this module owns the entity/selector layer.
 *
 * WP1 wires two bounded consumers: managerAppointments.js's
 * `scoreCandidateFit` (a manager whose reputation profile matches the club's
 * youth/financial/star-recruitment traits scores higher) and
 * squadPlanning.js's `buildSquadNeeds` (starRecruitment/financialCaution
 * nudge budget-share allocation, youthPathway nudges preferred recruitment
 * age). Both default to the pre-P7 neutral behaviour when `team.philosophy`
 * is absent, so this is inert for any team object that hasn't been through
 * the backfill yet.
 */

export const CLUB_PHILOSOPHY_VERSION = 1;

export const PHILOSOPHY_TRAITS = Object.freeze([
  'youthPathway',
  'buyToSell',
  'financialCaution',
  'starRecruitment',
  'domesticPriority',
  'europeanAmbition',
  'possessionIdentity',
  'directIntensity',
]);

export const PHILOSOPHY_TRAIT_LABELS = Object.freeze({
  youthPathway:'Youth Pathway',
  buyToSell:'Buy-to-Sell Trading',
  financialCaution:'Financial Caution',
  starRecruitment:'Star Recruitment',
  domesticPriority:'Domestic Priority',
  europeanAmbition:'European Ambition',
  possessionIdentity:'Possession Play',
  directIntensity:'Direct Intensity',
});

export function defaultClubPhilosophy() {
  const traits = {};
  for (const trait of PHILOSOPHY_TRAITS) traits[trait] = 50;
  return { version:CLUB_PHILOSOPHY_VERSION, traits };
}

/** Deterministic per-trait roll in [0, 1] from a stable club+trait seed. */
function seededRoll(clubId, trait) {
  return (stableStringHash(`${clubId}:philosophy:${trait}`) % 1000) / 1000;
}

function seededTraitValue(clubId, trait, center, spread) {
  const roll = seededRoll(clubId, trait);
  return Math.max(0, Math.min(100, Math.round(center + (roll - 0.5) * spread)));
}

/**
 * Deterministically seeds a club's philosophy from its reputation, league and
 * existing AI tactical archetype (`tactics.js`'s `getAITacticalProfile`), so
 * possession/directness identity agrees with the formation/instructions the
 * club already plays with rather than drawing a conflicting second identity.
 * Same club + same inputs always produces the same philosophy — no
 * unseeded `Math.random()`.
 */
export function generateClubPhilosophy(team, league) {
  const clubId = team?.id ?? team?.name ?? 'club';
  const rep = Number(team?.reputation ?? 65);
  const bigClub = rep >= 78;
  const smallClub = rep < 55;
  const archetype = getAITacticalProfile({ ...team, league:league ?? team?.league });
  const patientBuildUp = archetype?.instructions?.buildUp !== 'direct';
  const highTempo = archetype?.instructions?.tempo === 'fast';

  const traits = {
    youthPathway:       seededTraitValue(clubId, 'youthPathway', smallClub ? 62 : bigClub ? 44 : 52, 30),
    buyToSell:          seededTraitValue(clubId, 'buyToSell', smallClub ? 60 : bigClub ? 30 : 48, 30),
    financialCaution:   seededTraitValue(clubId, 'financialCaution', smallClub ? 66 : bigClub ? 34 : 50, 28),
    starRecruitment:    seededTraitValue(clubId, 'starRecruitment', bigClub ? 68 : smallClub ? 24 : 45, 30),
    domesticPriority:   seededTraitValue(clubId, 'domesticPriority', 50, 34),
    europeanAmbition:   seededTraitValue(clubId, 'europeanAmbition', bigClub ? 66 : smallClub ? 26 : 46, 30),
    possessionIdentity: seededTraitValue(clubId, 'possessionIdentity', patientBuildUp ? 64 : 36, 24),
    directIntensity:    seededTraitValue(clubId, 'directIntensity', highTempo ? 62 : 40, 24),
  };
  return { version:CLUB_PHILOSOPHY_VERSION, traits };
}

/** Re-seeds only when the stored philosophy is missing or from an older version. */
export function normalizeClubPhilosophy(philosophy, team, league) {
  if (philosophy?.traits && Number(philosophy.version ?? 0) >= CLUB_PHILOSOPHY_VERSION) {
    return { version:CLUB_PHILOSOPHY_VERSION, traits:{ ...defaultClubPhilosophy().traits, ...philosophy.traits } };
  }
  return generateClubPhilosophy(team, league);
}

export function clubPhilosophyTraitValue(philosophy, trait) {
  return philosophy?.traits?.[trait] ?? 50;
}

function describeTrait(trait, value) {
  const label = PHILOSOPHY_TRAIT_LABELS[trait];
  if (value >= 68) return `Strong ${label}`;
  if (value <= 32) return `Low ${label}`;
  return null;
}

/** A short, bounded (max 2 by default) public-facing description of what sets this club apart. */
export function describeClubPhilosophy(philosophy, { max = 2 } = {}) {
  const traits = philosophy?.traits ?? defaultClubPhilosophy().traits;
  const described = PHILOSOPHY_TRAITS
    .map(trait => ({ trait, value:traits[trait] ?? 50, deviation:Math.abs((traits[trait] ?? 50) - 50) }))
    .filter(entry => entry.deviation >= 18)
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, max)
    .map(entry => describeTrait(entry.trait, entry.value))
    .filter(Boolean);
  return described.length ? described.join(', ') : 'Balanced club identity';
}

const IDENTITY_NUDGE_PER_SEASON = 2;

/**
 * P7 WP5: lets a season's sustained board-contract outcome nudge a club's
 * own trait weights by exactly +/-2 per season (never more, whatever the
 * starting value — a plain [0,100] clamp only stops overflow at the same
 * bounds `generateClubPhilosophy` already seeds within, it never widens a
 * single season's move) so identity stays "more stable than manager
 * tenure" — a single good or bad season barely moves it; only years of
 * consistent results under one manager's approach meaningfully shift it.
 * Pure: takes the season's already-computed board-contract result
 * (boardContract.js's `evaluateBoardContractSeasonClose` — its objective
 * `status` strings 'ok'/'warning'/'review' are read directly rather than
 * imported, since boardContract.js already imports from this module and a
 * reverse import would cycle; `clubPhilosophy.test.js` cross-checks the
 * literals against boardContract.js's own `OBJECTIVE_STATUS` so a rename
 * there fails a test instead of silently desyncing). A missing/malformed
 * result, or a season where nothing actually moved, returns the exact same
 * `philosophy` reference — never a same-value copy — so a caller can use
 * `!==` to decide whether a write is worth persisting.
 */
export function evolveClubPhilosophy(philosophy, boardContractResult) {
  if (!philosophy?.traits || !Array.isArray(boardContractResult?.objectives)) return philosophy;
  const clamp = value => Math.max(0, Math.min(100, value));
  let traits = philosophy.traits;
  let changed = false;
  const nudge = (trait, direction) => {
    const next = clamp((traits[trait] ?? 50) + direction * IDENTITY_NUDGE_PER_SEASON);
    if (next === traits[trait]) return;
    if (!changed) traits = { ...traits };
    changed = true;
    traits[trait] = next;
  };
  for (const objective of boardContractResult.objectives) {
    const direction = objective.status === 'ok' ? 1 : objective.status === 'review' ? -1 : 0;
    if (!direction) continue;
    if (objective.kind === 'financial') nudge('financialCaution', direction);
    if (objective.kind === 'youth') nudge('youthPathway', direction);
    // A sustained sporting success (not just an average one) is read as
    // growing ambition — ties the manager's track record to the club's
    // long-term appetite for star recruitment, not just to their own tenure.
    if (objective.kind === 'sporting' && direction > 0) nudge('starRecruitment', 1);
  }
  return changed ? { ...philosophy, traits } : philosophy;
}

export function clubPhilosophiesNeedBackfill(save) {
  return !save || Number(save.clubPhilosophyVersion ?? 0) < CLUB_PHILOSOPHY_VERSION;
}

/**
 * Pure backfill builder — only patches team rows whose philosophy is missing
 * or stale, so a second call (once `save.clubPhilosophyVersion` is current)
 * never re-seeds an already-migrated club and never disturbs a club whose
 * philosophy has since evolved (P7 WP5 nudges trait weights over time).
 */
export function buildClubPhilosophyBackfill(save, teams = []) {
  if (!save) return { save, teamPatches:[] };
  const teamPatches = teams
    .filter(team => !team.philosophy || Number(team.philosophy.version ?? 0) < CLUB_PHILOSOPHY_VERSION)
    .map(team => ({ ...team, philosophy:generateClubPhilosophy(team, team.league) }));
  return {
    save:{ ...save, clubPhilosophyVersion:CLUB_PHILOSOPHY_VERSION },
    teamPatches,
  };
}
